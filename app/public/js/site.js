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

    nameInput: document.getElementById('rsvpNameInput'),

    btnYes: document.getElementById('btnYes'),
    btnNo: document.getElementById('btnNo'),
    formError: document.getElementById('formError'),
    submitRsvp: document.getElementById('submitRsvp'),

    ticketGuestName: document.getElementById('ticketGuestName'),
    ticketCode: document.getElementById('ticketCode'),
    ticketQr: document.getElementById('ticketQr'),
    downloadImage: document.getElementById('downloadImage'),
    downloadPdf: document.getElementById('downloadPdf'),
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

  // QR encodes a real link (not the bare code) so scanning with a normal
  // phone camera opens the verify page directly instead of a web search.
  function verifyUrl(code) {
    return `${location.origin}/verify.html?code=${encodeURIComponent(code)}`;
  }

  function drawTicketQr() {
    if (!window.QRious || !state.inviteCode) return;
    if (drawnForCode === state.inviteCode) return;
    new window.QRious({
      element: els.ticketQr,
      value: verifyUrl(state.inviteCode),
      size: 220,
      level: 'H',
      background: '#ffffff',
      foreground: '#17181d',
    });
    drawnForCode = state.inviteCode;
  }

  els.nameInput.addEventListener('input', clearError);

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
    const name = els.nameInput.value.trim();
    if (!name) { showError('Please enter your full name.'); return; }
    if (!state.attending) { showError('Please let us know if you can make it.'); return; }
    els.submitRsvp.disabled = true;
    try {
      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, attending: state.attending }),
      });
      if (!res.ok) throw new Error('rsvp_failed');
      const data = await res.json();
      state.token = data.token;
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
    els.nameInput.value = state.name;
    setAttending(state.attending);
    goToStep('form');
  }
  els.editRsvpFromTicket.addEventListener('click', editResponse);
  els.editRsvpFromDeclined.addEventListener('click', editResponse);

  // ── Build ticket canvas (1080 × 1860) ────────────────────────────────────
  async function buildTicketCanvas() {
    try { await document.fonts.ready; } catch (_) {}
    const W = 1080, H = 1860, cx = W / 2;
    const c = document.createElement(‘canvas’); c.width = W; c.height = H;
    const g = c.getContext(‘2d’);

    function rr(x, y, w, h, r) {
      g.beginPath(); g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    function txt(str, y, font, color, ls) {
      g.fillStyle = color; g.font = font; g.textBaseline = ‘alphabetic’;
      if (ls) {
        g.textAlign = ‘left’;
        const tw = [...str].reduce((s, ch) => s + g.measureText(ch).width + ls, -ls);
        let sx = cx - tw / 2;
        for (const ch of str) { g.fillText(ch, sx, y); sx += g.measureText(ch).width + ls; }
      } else { g.textAlign = ‘center’; g.fillText(str, cx, y); }
    }

    // Background
    g.fillStyle = ‘#FBF8F4’; g.fillRect(0, 0, W, H);

    // Warm stub zone
    g.fillStyle = ‘#F0E8DF’; g.fillRect(0, 756, W, H - 756);

    // Borders
    g.strokeStyle = ‘#B89A87’; g.lineWidth = 2.5; g.strokeRect(32, 32, W - 64, H - 64);
    g.strokeStyle = ‘rgba(184,154,135,.35)’; g.lineWidth = 1; g.strokeRect(48, 48, W - 96, H - 96);

    // Top triple lines with dot
    [[98, .65], [106, .38], [114, .2]].forEach(([y, o]) => {
      g.strokeStyle = `rgba(184,154,135,${o})`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(80, y); g.lineTo(W - 80, y); g.stroke();
    });
    g.fillStyle = ‘#B89A87’; g.beginPath(); g.arc(cx, 106, 5, 0, Math.PI * 2); g.fill();

    // Corner accent dots
    [[66, 66], [W - 66, 66], [66, H - 66], [W - 66, H - 66]].forEach(([x, y]) => {
      g.fillStyle = ‘rgba(184,154,135,.45)’; g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    });

    // Eyebrow
    txt(‘WEDDING INVITATION’, 184, ‘500 25px "Jost", sans-serif’, ‘#B89A87’, 8);

    // Couple names
    txt(‘Viola & Kelvin’, 305, ‘500 102px "Cormorant Garamond", serif’, ‘#1B1C20’);

    // Tagline
    txt(‘Wrapped in Love’, 368, ‘italic 500 44px "Cormorant Garamond", serif’, ‘#B89A87’);

    // Ornamental divider
    g.strokeStyle = ‘#B89A87’; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(cx - 150, 424); g.lineTo(cx - 24, 424); g.stroke();
    g.beginPath(); g.moveTo(cx + 24, 424); g.lineTo(cx + 150, 424); g.stroke();
    [cx, cx - 15, cx + 15].forEach((x, i) => {
      g.fillStyle = ‘#B89A87’; g.beginPath(); g.arc(x, 424, i === 0 ? 5 : 2.5, 0, Math.PI * 2); g.fill();
    });

    // Date & time
    txt(‘FRIDAY · DECEMBER 18, 2026’, 506, ‘400 25px "Jost", sans-serif’, ‘#1B1C20’, 2);
    txt(‘5:00 PM’, 556, ‘300 24px "Jost", sans-serif’, ‘#5B6472’, 2);

    // Venue
    txt("Dani’s Garden  →  Zaicha Lagoon D’or", 622, ‘italic 500 34px "Cormorant Garamond", serif’, ‘#5B6472’);
    txt(‘ELWA, Liberia  ·  Paynesville, Liberia’, 672, ‘400 21px "Jost", sans-serif’, ‘#8A8378’, 1);

    // Perforation
    g.setLineDash([14, 12]); g.strokeStyle = ‘rgba(27,28,32,.18)’; g.lineWidth = 2;
    g.beginPath(); g.moveTo(70, 756); g.lineTo(W - 70, 756); g.stroke(); g.setLineDash([]);
    [32, W - 32].forEach(x => {
      g.fillStyle = ‘rgba(27,28,32,.1)’; g.beginPath(); g.arc(x, 756, 22, 0, Math.PI * 2); g.fill();
    });

    // This pass admits
    txt(‘THIS PASS ADMITS’, 840, ‘500 22px "Jost", sans-serif’, ‘#8A8378’, 7);

    // Guest name
    txt(state.name, 924, ‘500 72px "Cormorant Garamond", serif’, ‘#1B1C20’);
    g.font = ‘500 72px "Cormorant Garamond", serif’;
    const nw = Math.min(g.measureText(state.name).width, 680);
    g.strokeStyle = ‘rgba(184,154,135,.4)’; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx - nw / 2, 944); g.lineTo(cx + nw / 2, 944); g.stroke();

    // QR card
    const qs = 440, qPad = 32, cardW = qs + qPad * 2, cardH = qs + qPad * 2;
    const cardX = cx - cardW / 2, cardY = 1004;
    g.shadowColor = ‘rgba(27,28,32,.12)’; g.shadowBlur = 24; g.shadowOffsetY = 8;
    g.fillStyle = ‘#ffffff’; rr(cardX, cardY, cardW, cardH, 22); g.fill();
    g.shadowBlur = 0; g.shadowOffsetY = 0;
    g.strokeStyle = ‘rgba(184,154,135,.3)’; g.lineWidth = 1; rr(cardX, cardY, cardW, cardH, 22); g.stroke();

    const qc = document.createElement(‘canvas’);
    new window.QRious({ element: qc, value: verifyUrl(state.inviteCode), size: qs, level: ‘H’, background: ‘#ffffff’, foreground: ‘#17181d’ });
    g.drawImage(qc, cx - qs / 2, cardY + qPad);

    // Invitation code
    const afterCard = cardY + cardH;
    txt(‘INVITATION CODE’, afterCard + 64, ‘500 22px "Jost", sans-serif’, ‘#8A8378’, 6);
    txt(state.inviteCode, afterCard + 112, ‘500 40px "Jost", sans-serif’, ‘#1B1C20’, 4);

    // Bottom decoration
    g.strokeStyle = ‘rgba(184,154,135,.4)’; g.lineWidth = 1;
    g.beginPath(); g.moveTo(80, H - 132); g.lineTo(W - 80, H - 132); g.stroke();
    g.beginPath(); g.moveTo(80, H - 124); g.lineTo(W - 80, H - 124); g.stroke();
    g.fillStyle = ‘#B89A87’; g.beginPath(); g.arc(cx, H - 128, 4, 0, Math.PI * 2); g.fill();

    txt(‘Please present this code at the entrance’, H - 78, ‘italic 400 28px "Cormorant Garamond", serif’, ‘#8A8378’);

    return c;
  }

  // ── iOS detection ─────────────────────────────────────────────────────────
  function isIOS() {
    return /iP(ad|hone|od)/i.test(navigator.userAgent) ||
      (navigator.platform === ‘MacIntel’ && navigator.maxTouchPoints > 1);
  }

  // ── Save as Image ─────────────────────────────────────────────────────────
  async function downloadAsImage() {
    if (!window.QRious || !state.inviteCode) return;
    const btn = els.downloadImage;
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = ‘Preparing…’;
    try {
      const canvas = await buildTicketCanvas();
      const filename = `VK-Wedding-Pass-${state.inviteCode}.png`;

      // Web Share API — native Save to Photos on iOS 15+ / Android
      if (navigator.canShare) {
        try {
          const shareBlob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), ‘image/png’));
          const file = new File([shareBlob], filename, { type: ‘image/png’ });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: ‘My Wedding Pass’ });
            return;
          }
        } catch (e) { if (e.name === ‘AbortError’) return; }
      }

      // Blob URL download (reliable across desktop browsers)
      const blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), ‘image/png’));
      const url = URL.createObjectURL(blob);
      if (isIOS()) {
        // iOS Safari: open image in new tab → long-press to Save to Photos
        window.open(url, ‘_blank’);
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      } else {
        const a = document.createElement(‘a’);
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  // ── Load jsPDF on demand (keeps it off the critical page-load path) ────────
  function loadJsPDF() {
    if (window.jspdf) return Promise.resolve(window.jspdf);
    return new Promise((resolve, reject) => {
      const s = document.createElement(‘script’);
      s.src = ‘https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js’;
      s.onload = () => resolve(window.jspdf);
      s.onerror = () => reject(new Error(‘jsPDF load failed’));
      document.head.appendChild(s);
    });
  }

  // ── Save as PDF ───────────────────────────────────────────────────────────
  async function downloadAsPDF() {
    if (!window.QRious || !state.inviteCode) return;
    const btn = els.downloadPdf;
    const orig = btn.textContent;
    btn.disabled = true; btn.textContent = ‘Preparing…’;
    try {
      const jspdfModule = await loadJsPDF().catch(() => null);
      if (!jspdfModule) { await downloadAsImage(); return; }
      const canvas = await buildTicketCanvas();
      const imgData = canvas.toDataURL(‘image/jpeg’, 0.92);
      const { jsPDF } = jspdfModule;
      // 108 × 186mm preserves the canvas aspect ratio (1080:1860)
      const pdf = new jsPDF({ orientation: ‘portrait’, unit: ‘mm’, format: [108, 186] });
      pdf.addImage(imgData, ‘JPEG’, 0, 0, 108, 186);
      if (isIOS()) {
        const pdfUrl = URL.createObjectURL(pdf.output(‘blob’));
        window.open(pdfUrl, ‘_blank’);
        setTimeout(() => URL.revokeObjectURL(pdfUrl), 30000);
      } else {
        pdf.save(`VK-Wedding-Pass-${state.inviteCode}.pdf`);
      }
    } finally {
      btn.disabled = false; btn.textContent = orig;
    }
  }

  els.downloadImage.addEventListener(‘click’, downloadAsImage);
  els.downloadPdf.addEventListener(‘click’, downloadAsPDF);

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
