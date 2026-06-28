const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');

const db = require('./db');
const { generateInviteCode } = require('./ids');
const { seedGuests } = require('./seed');

const guestCount = db.prepare('SELECT COUNT(*) AS n FROM guests').get().n;
if (guestCount === 0) {
  console.log('[startup] Guest list is empty — seeding 250 placeholder guests.');
  seedGuests();
}

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'wrapped-in-love';
if (!process.env.ADMIN_PASSWORD) {
  console.warn(
    `[admin] ADMIN_PASSWORD is not set — using the default password "${ADMIN_PASSWORD}". ` +
    'Set ADMIN_PASSWORD before this goes anywhere guests or staff can reach it.'
  );
}

const app = express();
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 12 * 60 * 60 * 1000,
    },
  })
);

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  res.status(401).json({ error: 'unauthorized' });
}

function nowIso() {
  return new Date().toISOString();
}

// ── Guest-facing API ───────────────────────────────────────────────────────

// Name search for the RSVP autocomplete. Requires 2+ characters and caps
// results so the full guest list can't be scraped by an outsider with the link.
app.get('/api/guests/search', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json([]);
  const rows = db
    .prepare(
      `SELECT public_token AS token, name FROM guests
       WHERE search_name LIKE ? ORDER BY name LIMIT 8`
    )
    .all(`%${q}%`);
  res.json(rows);
});

app.get('/api/rsvp/:token', (req, res) => {
  const guest = db
    .prepare(
      `SELECT name, attending, invite_code AS inviteCode, responded_at AS respondedAt
       FROM guests WHERE public_token = ?`
    )
    .get(req.params.token);
  if (!guest) return res.status(404).json({ error: 'not_found' });
  res.json(guest);
});

app.post('/api/rsvp', (req, res) => {
  const { token, attending } = req.body || {};
  if (attending !== 'yes' && attending !== 'no') {
    return res.status(400).json({ error: 'invalid_attending' });
  }
  const guest = db.prepare('SELECT * FROM guests WHERE public_token = ?').get(token);
  if (!guest) return res.status(404).json({ error: 'not_found' });

  let inviteCode = guest.invite_code;
  if (attending === 'yes' && !inviteCode) {
    do {
      inviteCode = generateInviteCode();
    } while (db.prepare('SELECT 1 FROM guests WHERE invite_code = ?').get(inviteCode));
  }

  db.prepare(
    `UPDATE guests SET attending = ?, invite_code = ?, responded_at = ? WHERE public_token = ?`
  ).run(attending, inviteCode, nowIso(), token);

  res.json({ name: guest.name, attending, inviteCode, respondedAt: nowIso() });
});

// ── Admin auth ──────────────────────────────────────────────────────────────

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'invalid_password' });
  }
  req.session.isAdmin = true;
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/session', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// ── Admin: guest list / export ─────────────────────────────────────────────

app.get('/api/admin/guests', requireAdmin, (req, res) => {
  const guests = db
    .prepare(
      `SELECT name, attending, invite_code AS inviteCode, responded_at AS respondedAt,
              checked_in AS checkedIn, checked_in_at AS checkedInAt
       FROM guests ORDER BY name`
    )
    .all();
  const counts = {
    total: guests.length,
    attending: guests.filter((g) => g.attending === 'yes').length,
    declined: guests.filter((g) => g.attending === 'no').length,
    noResponse: guests.filter((g) => !g.attending).length,
    checkedIn: guests.filter((g) => g.checkedIn).length,
  };
  res.json({ guests, counts });
});

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
  const guests = db
    .prepare(
      `SELECT name, attending, invite_code AS inviteCode, responded_at AS respondedAt,
              checked_in AS checkedIn, checked_in_at AS checkedInAt
       FROM guests ORDER BY name`
    )
    .all();
  const header = ['Name', 'Attending', 'Invite Code', 'Responded At', 'Checked In', 'Checked In At'];
  const lines = [header.join(',')];
  for (const g of guests) {
    lines.push(
      [
        csvEscape(g.name),
        csvEscape(g.attending || ''),
        csvEscape(g.inviteCode || ''),
        csvEscape(g.respondedAt || ''),
        csvEscape(g.checkedIn ? 'yes' : 'no'),
        csvEscape(g.checkedInAt || ''),
      ].join(',')
    );
  }
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="guest-list.csv"');
  res.send(lines.join('\n'));
});

// ── Admin: scan-to-verify check-in ──────────────────────────────────────────

app.post('/api/checkin', requireAdmin, (req, res) => {
  const code = String((req.body && req.body.code) || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ status: 'not_found' });

  const guest = db.prepare('SELECT * FROM guests WHERE invite_code = ?').get(code);
  if (!guest) return res.json({ status: 'not_found' });

  if (guest.attending !== 'yes') {
    return res.json({ status: 'not_attending', name: guest.name });
  }
  if (guest.checked_in) {
    return res.json({ status: 'already_checked_in', name: guest.name, checkedInAt: guest.checked_in_at });
  }

  const checkedInAt = nowIso();
  db.prepare('UPDATE guests SET checked_in = 1, checked_in_at = ? WHERE invite_code = ?').run(
    checkedInAt,
    code
  );
  res.json({ status: 'success', name: guest.name, checkedInAt });
});

// ── Static frontend ─────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Viola & Kelvin wedding site listening on http://localhost:${PORT}`);
});
