(function () {
  'use strict';

  const els = {
    reader: document.getElementById('qrReader'),
    readerWrap: document.getElementById('qrReaderWrap'),
    manualForm: document.getElementById('manualForm'),
    manualCode: document.getElementById('manualCode'),
    result: document.getElementById('scanResult'),
    cameraToggle: document.getElementById('cameraToggle'),
    logoutBtn: document.getElementById('logoutBtn'),
  };

  let scanner = null;
  let cameraRunning = false;
  let busy = false;
  let lastCode = null;
  let lastCodeAt = 0;

  fetch('/api/admin/session')
    .then((res) => res.json())
    .then((data) => { if (!data.isAdmin) location.href = './login.html?next=./scan.html'; })
    .catch(() => {});

  function setResult(state, name, statusText) {
    els.result.classList.remove('is-success', 'is-error', 'is-warn');
    if (state) els.result.classList.add(state);
    els.result.innerHTML = name
      ? `<div class="scan-result-name">${escapeHtml(name)}</div><div class="scan-result-status">${escapeHtml(statusText)}</div>`
      : `<div class="scan-result-status">${escapeHtml(statusText)}</div>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  async function checkIn(code) {
    if (busy || !code) return;
    busy = true;
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.status === 401) { location.href = './login.html?next=./scan.html'; return; }
      const data = await res.json();
      if (data.status === 'success') {
        setResult('is-success', data.name, 'Checked in just now ✓');
      } else if (data.status === 'already_checked_in') {
        setResult('is-warn', data.name, 'Already checked in at ' + fmtTime(data.checkedInAt));
      } else if (data.status === 'not_attending') {
        setResult('is-warn', data.name, 'Not marked as attending');
      } else {
        setResult('is-error', null, 'Code not recognized — try again');
      }
    } catch (e) {
      setResult('is-error', null, 'Something went wrong — please try again');
    } finally {
      busy = false;
    }
  }

  els.manualForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = els.manualCode.value.trim().toUpperCase();
    if (!code) return;
    checkIn(code);
    els.manualCode.value = '';
  });

  function onScanSuccess(decodedText) {
    const code = String(decodedText).trim().toUpperCase();
    const now = Date.now();
    if (code === lastCode && now - lastCodeAt < 4000) return;
    lastCode = code;
    lastCodeAt = now;
    checkIn(code);
  }

  async function startCamera() {
    if (typeof Html5Qrcode === 'undefined') {
      els.readerWrap.innerHTML = '<div class="scan-result-status" style="color:#fff;padding:20px;text-align:center">Camera library failed to load. Use manual entry below.</div>';
      els.cameraToggle.style.display = 'none';
      return;
    }
    scanner = new Html5Qrcode('qrReader');
    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 240 },
        onScanSuccess,
        () => {}
      );
      cameraRunning = true;
      els.cameraToggle.textContent = 'Pause Camera';
    } catch (err) {
      els.readerWrap.innerHTML = '<div class="scan-result-status" style="color:#fff;padding:20px;text-align:center">Camera unavailable — use manual entry below.</div>';
      els.cameraToggle.style.display = 'none';
    }
  }

  async function stopCamera() {
    if (scanner && cameraRunning) {
      await scanner.stop().catch(() => {});
      cameraRunning = false;
    }
  }

  els.cameraToggle.addEventListener('click', async () => {
    if (cameraRunning) {
      await stopCamera();
      els.cameraToggle.textContent = 'Resume Camera';
    } else {
      await startCamera();
    }
  });

  els.logoutBtn.addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    location.href = './login.html';
  });

  startCamera();
})();
