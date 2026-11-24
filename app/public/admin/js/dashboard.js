(function () {
  'use strict';

  const els = {
    statTotal: document.getElementById('statTotal'),
    statAttending: document.getElementById('statAttending'),
    statDeclined: document.getElementById('statDeclined'),
    statNoResponse: document.getElementById('statNoResponse'),
    statCeremony: document.getElementById('statCeremony'),
    statReception: document.getElementById('statReception'),
    guestSearch: document.getElementById('guestSearch'),
    tableBody: document.getElementById('guestTableBody'),
    logoutBtn: document.getElementById('logoutBtn'),
    pills: document.querySelectorAll('.filter-pill'),
  };

  let guests = [];
  let filter = 'all';
  let query = '';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function fmtTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    } catch (_) { return ''; }
  }

  function rsvpBadge(attending) {
    if (attending === 'yes') return '<span class="badge badge-yes">Attending</span>';
    if (attending === 'no') return '<span class="badge badge-no">Declined</span>';
    return '<span class="badge badge-pending">No Response</span>';
  }

  function venueBadge(checkedIn, checkedInAt) {
    if (!checkedIn) return '—';
    const t = fmtTime(checkedInAt);
    return `<span class="badge badge-checked">✓${t ? ' · ' + t : ''}</span>`;
  }

  function actionCell(g) {
    const btns = [];
    if (g.inviteCode && g.ceremonyCheckedIn) {
      btns.push(`<button class="btn-undo-checkin" data-code="${escapeHtml(g.inviteCode)}" data-venue="ceremony">Undo Ceremony</button>`);
    }
    if (g.inviteCode && g.receptionCheckedIn) {
      btns.push(`<button class="btn-undo-checkin" data-code="${escapeHtml(g.inviteCode)}" data-venue="reception">Undo Reception</button>`);
    }
    if (g.token && g.status !== 'revoked') {
      btns.push(`<button class="btn-revoke-guest" data-token="${escapeHtml(g.token)}">Revoke</button>`);
    }
    if (g.token && g.status === 'revoked') {
      btns.push(`<button class="btn-reinstate-guest" data-token="${escapeHtml(g.token)}">Reinstate</button>`);
    }
    if (g.token) {
      btns.push(`<button class="btn-delete-guest" data-token="${escapeHtml(g.token)}">Delete</button>`);
    }
    return btns.length ? `<td style="vertical-align:middle"><div style="display:flex;flex-wrap:wrap;gap:4px">${btns.join('')}</div></td>` : '<td></td>';
  }

  function applyAndRender() {
    let rows = guests;
    if (filter === 'yes' || filter === 'no') {
      rows = rows.filter((g) => g.attending === filter);
    } else if (filter === 'pending') {
      rows = rows.filter((g) => !g.attending);
    } else if (filter === 'checked') {
      rows = rows.filter((g) => g.ceremonyCheckedIn || g.receptionCheckedIn);
    }
    if (query) {
      rows = rows.filter((g) => g.name.toLowerCase().includes(query));
    }
    if (!rows.length) {
      els.tableBody.innerHTML = '<tr><td colspan="7" class="empty-row">No guests match.</td></tr>';
      return;
    }
    els.tableBody.innerHTML = rows
      .map(
        (g) => `<tr>
          <td>${escapeHtml(g.name)}${g.status === 'revoked' ? ' <span class="badge badge-revoked">Revoked</span>' : ''}</td>
          <td>${rsvpBadge(g.attending)}</td>
          <td>${g.inviteCode ? escapeHtml(g.inviteCode) : '—'}</td>
          <td>${fmtDate(g.respondedAt)}</td>
          <td>${venueBadge(g.ceremonyCheckedIn, g.ceremonyCheckedInAt)}</td>
          <td>${venueBadge(g.receptionCheckedIn, g.receptionCheckedInAt)}</td>
          ${actionCell(g)}
        </tr>`
      )
      .join('');

    els.tableBody.querySelectorAll('.btn-undo-checkin').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const venue = btn.dataset.venue;
        const name = btn.closest('tr').querySelector('td').textContent;
        if (!confirm(`Undo ${venue} check-in for ${name}?`)) return;
        btn.disabled = true;
        const res = await fetch('/api/admin/uncheckin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: btn.dataset.code, venue }),
        });
        if (res.status === 401) { location.href = './login.html?next=./dashboard.html'; return; }
        await load();
      });
    });

    els.tableBody.querySelectorAll('.btn-revoke-guest').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const name = btn.closest('tr').querySelector('td').textContent.replace('Revoked', '').trim();
        if (!confirm(`Revoke pass for "${name}"? They will be blocked at check-in.`)) return;
        btn.disabled = true;
        const res = await fetch('/api/admin/guests/' + encodeURIComponent(btn.dataset.token) + '/revoke', { method: 'POST' });
        if (res.status === 401) { location.href = './login.html?next=./dashboard.html'; return; }
        await load();
      });
    });

    els.tableBody.querySelectorAll('.btn-reinstate-guest').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const name = btn.closest('tr').querySelector('td').textContent.replace('Revoked', '').trim();
        if (!confirm(`Reinstate pass for "${name}"?`)) return;
        btn.disabled = true;
        const res = await fetch('/api/admin/guests/' + encodeURIComponent(btn.dataset.token) + '/reinstate', { method: 'POST' });
        if (res.status === 401) { location.href = './login.html?next=./dashboard.html'; return; }
        await load();
      });
    });

    els.tableBody.querySelectorAll('.btn-delete-guest').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const name = btn.closest('tr').querySelector('td').textContent;
        if (!confirm(`Permanently delete "${name}" from the guest list? This cannot be undone.`)) return;
        btn.disabled = true;
        const res = await fetch('/api/admin/guests/' + encodeURIComponent(btn.dataset.token), {
          method: 'DELETE',
        });
        if (res.status === 401) { location.href = './login.html?next=./dashboard.html'; return; }
        await load();
      });
    });
  }

  async function load() {
    const res = await fetch('/api/admin/guests');
    if (res.status === 401) { location.href = './login.html?next=./dashboard.html'; return; }
    const data = await res.json();
    guests = data.guests;
    els.statTotal.textContent = data.counts.total;
    els.statAttending.textContent = data.counts.attending;
    els.statDeclined.textContent = data.counts.declined;
    els.statNoResponse.textContent = data.counts.noResponse;
    els.statCeremony.textContent = data.counts.ceremonyCheckedIn;
    els.statReception.textContent = data.counts.receptionCheckedIn;
    applyAndRender();
  }

  els.guestSearch.addEventListener('input', (e) => {
    query = e.target.value.trim().toLowerCase();
    applyAndRender();
  });

  els.pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      els.pills.forEach((p) => p.classList.remove('is-active'));
      pill.classList.add('is-active');
      filter = pill.dataset.filter;
      applyAndRender();
    });
  });

  els.logoutBtn.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    location.href = './login.html';
  });

  load();
  setInterval(load, 15000);
})();
