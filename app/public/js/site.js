(function () {
  'use strict';

  const WEDDING_TARGET = new Date('2026-12-18T17:00:00').getTime();
  const STORAGE_KEY = 'vk_guest_token';

  const els = {
    cdDays: document.getElementById('cdDays'),
    cdHours: document.getElementById('cdHours'),
    cdMins: document.getElementById('cdMins'),
    cdSecs: document.getElementById('cdSecs'),

    stepForm: document.getElementById('stepForm'),
    stepTicket: document.getElementById('stepTicket'),
    stepDeclined: document.getElementById('stepDeclined'),

    nameInputWrap: document.getElementById('nameInputWrap'),
    nameInput: document.getElementById('rsvpNameInput'),
    autocompleteList: document.getElementById('autocompleteList'),
    selectedChip: document.getElementById('selectedChip'),
    selectedChipName: document.getElementById('selectedChipName'),
    changeNameBtn: document.getElementById('changeNameBtn'),

    btnYes: document.getElementById('btnYes'),
    btnNo: document.getElementById('btnNo'),
    formError: document.getElementById('formError'),
    submitRsvp: document.getElementById('submitRsvp'),

    ticketGuestName: document.getElementById('ticketGuestName'),
    ticketCode: document.getElementById('ticketCode'),
    ticketQr: document.getElementById('ticketQr'),
    downloadPass: document.getElementById('downloadPass'),
    editRsvpFromTicket: document.getElementById('editRsvpFromTicket'),

    declinedGuestName: document.getElementById('declinedGuestName'),
    editRsvpFromDeclined: document.getElementById('editRsvpFromDeclined'),
  };

  const state = {
    token: null,
    name: '',
    attending: null,
    inviteCode: null,
  };
  let activeIndex = -1;
  let drawnForCode = null;

  // ── Countdown ──────────────────────────────────────────────────────────
  function pad(n) { return String(n).padStart(2, '0'); }
  function tickCountdown() {
    let diff = Math.max(0, WEDDING_TARGET - Date.now());
    const day = Math.floor(diff / 86400000); diff -= day * 86400000;
    const hr = Math.floor(diff / 3600000); diff -= hr * 3600000;
    const mn = Math.floor(diff / 60000); diff -= mn * 60000;
    const sc = Math.floor(diff / 1000);
    els.cdDays.textContent = pad(day);
    els.cdHours.textContent = pad(hr);
    els.cdMins.textContent = pad(mn);
    els.cdSecs.textContent = pad(sc);
  }
  tickCountdown();
  setInterval(tickCountdown, 1000);

  // ── Step switching ───────────────────────────────────────────────────────
  function goToStep(step) {
    els.stepForm.classList.toggle('is-active', step === 'form');
    els.stepTicket.classList.toggle('is-active', step === 'ticket');
    els.stepDeclined.classList.toggle('is-active', step === 'declined');
    if (step === 'ticket') renderTicket();
    if (step === 'declined') els.declinedGuestName.textContent = state.name;
  }

  function renderTicket() {
    els.ticketGuestName.textContent = state.name;
    els.ticketCode.textContent = state.inviteCode;
    drawTicketQr();
  }

  function drawTicketQr() {
    if (!window.QRious || !state.inviteCode) return;
    if (drawnForCode === state.inviteCode) return;
    new window.QRious({
      element: els.ticketQr,
      value: state.inviteCode,
      size: 220,
      level: 'H',
      background: '#ffffff',
      foreground: '#17181d',
    });
    drawnForCode = state.inviteCode;
  }

  // ── Name autocomplete ────────────────────────────────────────────────────
  function debounce(fn, delay) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  }

  function closeList() {
    els.autocompleteList.classList.remove('is-open');
    els.autocompleteList.innerHTML = '';
    activeIndex = -1;
  }

  function renderResults(results) {
    activeIndex = -1;
    if (!results.length) {
      els.autocompleteList.innerHTML = '<li class="autocomplete-empty">No match yet — keep typing your name as invited.</li>';
      els.autocompleteList.classList.add('is-open');
      return;
    }
    els.autocompleteList.innerHTML = results
      .map((r, i) => `<li class="autocomplete-item" data-index="${i}" data-token="${r.token}">${escapeHtml(r.name)}</li>`)
      .join('');
    els.autocompleteList.classList.add('is-open');
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let lastResults = [];
  const runSearch = debounce(async (query) => {
    if (query.length < 2) { closeList(); return; }
    try {
      const res = await fetch(`/api/guests/search?q=${encodeURIComponent(query)}`);
      lastResults = await res.json();
      renderResults(lastResults);
    } catch (e) {
      closeList();
    }
  }, 150);

  els.nameInput.addEventListener('input', (e) => {
    clearError();
    runSearch(e.target.value.trim());
  });

  els.nameInput.addEventListener('keydown', (e) => {
    const items = els.autocompleteList.querySelectorAll('.autocomplete-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      highlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      highlight(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && lastResults[activeIndex]) selectGuest(lastResults[activeIndex]);
    } else if (e.key === 'Escape') {
      closeList();
    }
  });

  function highlight(items) {
    items.forEach((el, i) => el.classList.toggle('is-active', i === activeIndex));
  }

  els.autocompleteList.addEventListener('click', (e) => {
    const li = e.target.closest('.autocomplete-item[data-token]');
    if (!li) return;
    const idx = Number(li.dataset.index);
    if (lastResults[idx]) selectGuest(lastResults[idx]);
  });

  document.addEventListener('click', (e) => {
    if (!els.nameInputWrap.contains(e.target)) closeList();
  });

  function selectGuest(guest) {
    state.token = guest.token;
    state.name = guest.name;
    els.selectedChipName.textContent = guest.name;
    els.selectedChip.classList.add('is-visible');
    els.nameInputWrap.style.display = 'none';
    closeList();
    els.nameInput.value = '';
    clearError();
  }

  function clearSelection() {
    state.token = null;
    state.name = '';
    els.selectedChip.classList.remove('is-visible');
    els.nameInputWrap.style.display = '';
    els.nameInput.value = '';
    els.nameInput.focus();
  }

  els.changeNameBtn.addEventListener('click', clearSelection);

  // ── Attending choice ─────────────────────────────────────────────────────
  function setAttending(val) {
    state.attending = val;
    els.btnYes.classList.toggle('is-active', val === 'yes');
    els.btnNo.classList.toggle('is-active', val === 'no');
    clearError();
  }
  els.btnYes.addEventListener('click', () => setAttending('yes'));
  els.btnNo.addEventListener('click', () => setAttending('no'));

  function showError(msg) {
    els.formError.textContent = msg;
    els.formError.style.display = 'block';
  }
  function clearError() {
    els.formError.style.display = 'none';
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  els.submitRsvp.addEventListener('click', async () => {
    if (!state.token) { showError('Please select your name from the guest list.'); return; }
    if (!state.attending) { showError('Please let us know if you can make it.'); return; }
    els.submitRsvp.disabled = true;
    try {
      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: state.token, attending: state.attending }),
      });
      if (!res.ok) throw new Error('rsvp_failed');
      const data = await res.json();
      state.name = data.name;
      state.inviteCode = data.inviteCode;
      localStorage.setItem(STORAGE_KEY, state.token);
      goToStep(data.attending === 'yes' ? 'ticket' : 'declined');
    } catch (e) {
      showError('Something went wrong sending your RSVP — please try again.');
    } finally {
      els.submitRsvp.disabled = false;
    }
  });

  // ── Edit response ─────────────────────────────────────────────────────────
  function editResponse() {
    if (state.token && state.name) {
      els.selectedChipName.textContent = state.name;
      els.selectedChip.classList.add('is-visible');
      els.nameInputWrap.style.display = 'none';
    }
    setAttending(state.attending);
    goToStep('form');
  }
  els.editRsvpFromTicket.addEventListener('click', editResponse);
  els.editRsvpFromDeclined.addEventListener('click', editResponse);

  // ── Download printable pass ──────────────────────────────────────────────
  async function downloadPass() {
    if (!window.QRious || !state.inviteCode) return;
    try { await document.fonts.ready; } catch (e) {}
    const W = 1080, H = 1600, cx = W / 2;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const rr = (X, Y, w, h, r) => {
      x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r);
      x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
    };
    const ctr = (t, y, font, color, ls) => {
      x.fillStyle = color; x.font = font; x.textBaseline = 'alphabetic';
      if (ls) {
        x.textAlign = 'left';
        let total = 0; for (const ch of t) total += x.measureText(ch).width + ls; total -= ls;
        let sx = cx - total / 2;
        for (const ch of t) { x.fillText(ch, sx, y); sx += x.measureText(ch).width + ls; }
      } else { x.textAlign = 'center'; x.fillText(t, cx, y); }
    };
    x.fillStyle = '#FBF8F4'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#C2A093'; x.lineWidth = 2; x.strokeRect(46, 46, W - 92, H - 92);
    x.strokeStyle = 'rgba(194,160,147,.45)'; x.lineWidth = 1; x.strokeRect(60, 60, W - 120, H - 120);
    ctr('WEDDING INVITATION', 150, '500 26px "Jost", sans-serif', '#5B6472', 8);
    ctr('Viola & Kelvin', 268, '500 92px "Cormorant Garamond", serif', '#1B1C20');
    ctr('Wrapped in Love', 330, 'italic 500 40px "Cormorant Garamond", serif', '#BE9483');
    x.strokeStyle = '#C2A093'; x.lineWidth = 1; x.beginPath(); x.moveTo(cx - 110, 380); x.lineTo(cx + 110, 380); x.stroke();
    ctr('FRIDAY · DECEMBER 18, 2026 · 5:00 PM', 442, '400 23px "Jost", sans-serif', '#1B1C20', 2);
    ctr('Zaicha Lagoon D’or', 502, 'italic 500 38px "Cormorant Garamond", serif', '#5B6472');
    ctr('THIS PASS ADMITS', 612, '500 22px "Jost", sans-serif', '#5B6472', 6);
    ctr(state.name, 682, '500 56px "Cormorant Garamond", serif', '#1B1C20');
    x.setLineDash([11, 11]); x.strokeStyle = 'rgba(27,28,32,.28)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(78, 770); x.lineTo(W - 78, 770); x.stroke(); x.setLineDash([]);
    x.fillStyle = '#FBF8F4'; x.beginPath(); x.arc(46, 770, 22, 0, 7); x.fill(); x.beginPath(); x.arc(W - 46, 770, 22, 0, 7); x.fill();
    const qs = 460, qy = 856, cardW = qs + 56;
    const qc = document.createElement('canvas');
    new window.QRious({ element: qc, value: state.inviteCode, size: qs, level: 'H', background: '#ffffff', foreground: '#17181d' });
    x.fillStyle = '#ffffff'; x.strokeStyle = 'rgba(27,28,32,.12)'; x.lineWidth = 1;
    rr(cx - cardW / 2, qy, cardW, cardW, 18); x.fill(); x.stroke();
    x.drawImage(qc, cx - qs / 2, qy + 28);
    ctr('INVITATION CODE', qy + cardW + 66, '500 22px "Jost", sans-serif', '#5B6472', 6);
    ctr(state.inviteCode, qy + cardW + 108, '500 34px "Jost", sans-serif', '#1B1C20', 4);
    ctr('Please present this code at the entrance', H - 96, 'italic 400 30px "Cormorant Garamond", serif', '#8A8378');
    const a = document.createElement('a');
    a.download = 'VK-Wedding-Pass-' + state.inviteCode + '.png';
    a.href = c.toDataURL('image/png'); a.click();
  }
  els.downloadPass.addEventListener('click', downloadPass);

  // ── Restore session ───────────────────────────────────────────────────────
  (async function restore() {
    const token = localStorage.getItem(STORAGE_KEY);
    if (!token) return;
    try {
      const res = await fetch(`/api/rsvp/${encodeURIComponent(token)}`);
      if (!res.ok) { localStorage.removeItem(STORAGE_KEY); return; }
      const data = await res.json();
      if (!data.attending) return;
      state.token = token;
      state.name = data.name;
      state.attending = data.attending;
      state.inviteCode = data.inviteCode;
      goToStep(data.attending === 'yes' ? 'ticket' : 'declined');
    } catch (e) {
      // Network hiccup on load — leave the guest on the form; they can retry.
    }
  })();
})();
