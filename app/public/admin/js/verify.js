(function () {
  'use strict';

  const els = {
    result: document.getElementById('verifyResult'),
    confirmBtn: document.getElementById('confirmCheckIn'),
    logoutBtn: document.getElementById('logoutBtn'),
  };

  const code = new URLSearchParams(location.search).get('code') || '';

  function nextParam() {
    return encodeURIComponent('./verify.html' + location.search);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function render(state, name, statusText, showConfirm) {
    els.result.classList.remove('is-success', 'is-error', 'is-warn');
    if (state) els.result.classList.add(state);
    els.result.innerHTML = name
      ? `<div class="scan-result-name">${escapeHtml(name)}</div><div class="scan-result-status">${escapeHtml(statusText)}</div>`
      : `<div class="scan-result-status">${escapeHtml(statusText)}</div>`;
    els.confirmBtn.style.display = showConfirm ? 'inline-block' : 'none';
  }

  async function lookup() {
    if (!code) { render('is-error', null, 'No ticket code provided', false); return; }
    try {
      const res = await fetch(`/api/admin/lookup/${encodeURIComponent(code)}`);
      if (res.status === 401) { location.href = `./login.html?next=${nextParam()}`; return; }
      const data = await res.json();
      if (data.status === 'ready') {
        render(null, data.name, 'Valid ticket — not yet checked in', true);
      } else if (data.status === 'already_checked_in') {
        render('is-warn', data.name, 'Already checked in at ' + fmtTime(data.checkedInAt), false);
      } else if (data.status === 'not_attending') {
        render('is-warn', data.name, 'Not marked as attending', false);
      } else {
        render('is-error', null, 'Code not recognized', false);
      }
    } catch (e) {
      render('is-error', null, 'Something went wrong — please try again', false);
    }
  }

  els.confirmBtn.addEventListener('click', async () => {
    els.confirmBtn.disabled = true;
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.status === 401) { location.href = `./login.html?next=${nextParam()}`; return; }
      const data = await res.json();
      if (data.status === 'success') {
        render('is-success', data.name, 'Checked in just now ✓', false);
      } else if (data.status === 'already_checked_in') {
        render('is-warn', data.name, 'Already checked in at ' + fmtTime(data.checkedInAt), false);
      } else if (data.status === 'not_attending') {
        render('is-warn', data.name, 'Not marked as attending', false);
      } else {
        render('is-error', null, 'Code not recognized', false);
      }
    } catch (e) {
      render('is-error', null, 'Something went wrong — please try again', false);
    } finally {
      els.confirmBtn.disabled = false;
    }
  });

  els.logoutBtn.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    location.href = './login.html';
  });

  fetch('/api/admin/session')
    .then((res) => res.json())
    .then((data) => {
      if (!data.isAdmin) { location.href = `./login.html?next=${nextParam()}`; return; }
      lookup();
    })
    .catch(() => render('is-error', null, 'Something went wrong — please try again', false));
})();
