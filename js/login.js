/*
 * Login page. Because admin_token is HttpOnly, the page cannot inspect the
 * cookie to decide whether someone is already signed in — it asks the server.
 */
(function () {
  'use strict';

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const submitButton = document.getElementById('submit');
  const errorBox = document.getElementById('error');
  const banner = document.getElementById('banner');

  document.getElementById('api-base').textContent = window.APP_CONFIG.apiBase;

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    errorBox.hidden = true;
    errorBox.textContent = '';
  }

  function showBanner(message, variant) {
    banner.textContent = message;
    banner.className = `banner banner--${variant}`;
    banner.hidden = false;
  }

  function setBusy(busy) {
    submitButton.disabled = busy;
    submitButton.textContent = busy ? 'Signing in…' : 'Sign in';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    setBusy(true);

    try {
      await window.adminApi.login(emailInput.value.trim(), passwordInput.value);
      // The session now lives in the cookie the browser just stored.
      window.location.replace('dashboard.html');
    } catch (error) {
      showError(error.message);
      passwordInput.value = '';
      passwordInput.focus();
      setBusy(false);
    }
  });

  /*
   * On arrival, ask the server what it thinks of whatever cookie we hold.
   *
   * After a sign-out we deliberately stay put and report the answer instead of
   * bouncing to the dashboard: if the server still accepts the session, logout
   * did not really clear the cookie, and that is worth seeing rather than
   * silently looping.
   */
  (async function reportExistingSession() {
    const signedOut = new URLSearchParams(window.location.search).has('signedOut');
    const session = await window.adminApi.probeSession();

    if (signedOut) {
      if (session.authenticated) {
        showBanner(
          'Signed out, but the server still accepts the session cookie — it was not cleared.',
          'warning',
        );
      } else {
        showBanner('Signed out. The session cookie is no longer accepted.', 'success');
      }
      return;
    }

    if (session.authenticated) {
      window.location.replace('dashboard.html');
    }
  })();
})();
