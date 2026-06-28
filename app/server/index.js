const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const session = require('express-session');

const db = require('./db');
const { generateInviteCode, generatePublicToken } = require('./ids');

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

// No master guest list to query against — guests type their name freely and
// we match-or-create by exact (case-insensitive) name. Identity is verified
// by the couple offline against their physical guest list, not by this site.
app.post('/api/rsvp', (req, res) => {
  const { attending } = req.body || {};
  const name = String((req.body && req.body.name) || '').trim().replace(/\s+/g, ' ');
  if (!name) return res.status(400).json({ error: 'invalid_name' });
  if (attending !== 'yes' && attending !== 'no') {
    return res.status(400).json({ error: 'invalid_attending' });
  }

  const searchName = name.toLowerCase();
  const guest = db.prepare('SELECT * FROM guests WHERE search_name = ?').get(searchName);
  const respondedAt = nowIso();

  let inviteCode = guest ? guest.invite_code : null;
  if (attending === 'yes' && !inviteCode) {
    do {
      inviteCode = generateInviteCode();
    } while (db.prepare('SELECT 1 FROM guests WHERE invite_code = ?').get(inviteCode));
  }

  if (guest) {
    db.prepare(
      `UPDATE guests SET attending = ?, invite_code = ?, responded_at = ? WHERE public_token = ?`
    ).run(attending, inviteCode, respondedAt, guest.public_token);
    return res.json({ token: guest.public_token, name: guest.name, attending, inviteCode, respondedAt });
  }

  let token = generatePublicToken();
  while (db.prepare('SELECT 1 FROM guests WHERE public_token = ?').get(token)) {
    token = generatePublicToken();
  }
  db.prepare(
    `INSERT INTO guests (public_token, name, search_name, attending, invite_code, responded_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(token, name, searchName, attending, inviteCode, respondedAt);
  res.json({ token, name, attending, inviteCode, respondedAt });
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
