(function () {
  'use strict';

  const form = document.getElementById('loginForm');
  const passwordInput = document.getElementById('passwordInput');
  const loginBtn = document.getElementById('loginBtn');
  const loginError = document.getElementById('loginError');

  function nextUrl() {
    const params = new URLSearchParams(location.search);
    return params.get('next') || './dashboard.html';
  }

  fetch('/api/admin/session')
    .then((res) => res.json())
    .then((data) => { if (data.isAdmin) location.replace(nextUrl()); })
    .catch(() => {});

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';
    loginBtn.disabled = true;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput.value }),
      });
      if (!res.ok) {
        loginError.textContent = 'Incorrect password — please try again.';
        loginError.style.display = 'block';
        return;
      }
      location.href = nextUrl();
    } catch (e) {
      loginError.textContent = 'Something went wrong — please try again.';
      loginError.style.display = 'block';
    } finally {
      loginBtn.disabled = false;
    }
  });
})();
