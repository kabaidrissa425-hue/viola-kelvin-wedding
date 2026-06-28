(function () {
  'use strict';

  const els = {
    statTotal: document.getElementById('statTotal'),
    statAttending: document.getElementById('statAttending'),
    statDeclined: document.getElementById('statDeclined'),
    statNoResponse: document.getElementById('statNoResponse'),
    statCheckedIn: document.getElementById('statCheckedIn'),
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

  function rsvpBadge(attending) {
    if (attending === 'yes') return '<span class="badge badge-yes">Attending</span>';
    if (attending === 'no') return '<span class="badge badge-no">Declined</span>';
    return '<span class="badge badge-pending">No Response</span>';
  }

  function checkinBadge(checkedIn) {
    return checkedIn ? '<span class="badge badge-checked">Checked In</span>' : '—';
  }

  function applyAndRender() {
    let rows = guests;
    if (filter === 'yes' || filter === 'no') {
      rows = rows.filter((g) => g.attending === filter);
    } else if (filter === 'pending') {
      rows = rows.filter((g) => !g.attending);
    } else if (filter === 'checked') {
      rows = rows.filter((g) => g.checkedIn);
    }
    if (query) {
      rows = rows.filter((g) => g.name.toLowerCase().includes(query));
    }
    if (!rows.length) {
      els.tableBody.innerHTML = '<tr><td colspan="5" class="empty-row">No guests match.</td></tr>';
      return;
    }
    els.tableBody.innerHTML = rows
      .map(
        (g) => `<tr>
          <td>${escapeHtml(g.name)}</td>
          <td>${rsvpBadge(g.attending)}</td>
          <td>${g.inviteCode ? escapeHtml(g.inviteCode) : '—'}</td>
          <td>${fmtDate(g.respondedAt)}</td>
          <td>${checkinBadge(g.checkedIn)}</td>
        </tr>`
      )
      .join('');
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
    els.statCheckedIn.textContent = data.counts.checkedIn;
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
