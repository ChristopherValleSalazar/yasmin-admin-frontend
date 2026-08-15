/*
 * Login page.
 *
 * Because admin_token is HttpOnly, the page cannot read the cookie to decide
 * whether anyone is signed in — it asks the server. It also re-asks straight
 * after a successful login, because "the server issued a cookie" and "the
 * browser kept it" are different facts, and only the second one gets you in.
 */
(function () {
  'use strict';

  const cfg = window.APP_CONFIG;

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const submitButton = document.getElementById('submit');
  const errorBox = document.getElementById('error');
  const banner = document.getElementById('banner');
  const diagnosis = document.getElementById('diagnosis');

  document.getElementById('api-base').textContent = cfg.apiBase || `${window.location.origin} (same origin)`;

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function showBanner(message, variant) {
    banner.textContent = message;
    banner.className = `banner banner--${variant}`;
    banner.hidden = false;
  }

  function clearMessages() {
    errorBox.hidden = true;
    diagnosis.hidden = true;
    diagnosis.replaceChildren();
  }

  function setBusy(busy) {
    submitButton.disabled = busy;
    submitButton.textContent = busy ? 'Signing in…' : 'Sign in';
  }

  /*
   * Reached when the backend accepted the credentials but the follow-up request
   * came back unauthenticated: the cookie never made it into the jar, or is not
   * being attached. Name the likely cause rather than bouncing in silence.
   */
  function explainMissingCookie() {
    const lines = [
      ['This page', window.location.origin],
      ['The API', cfg.apiOrigin],
    ];

    const heading = document.createElement('strong');
    heading.textContent = 'Signed in, but the browser did not send the session cookie back.';

    const list = document.createElement('dl');
    list.className = 'diagnostics';
    for (const [term, value] of lines) {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      const code = document.createElement('code');
      code.textContent = value;
      dd.appendChild(code);
      list.append(dt, dd);
    }

    const advice = document.createElement('p');
    advice.className = 'small';
    if (cfg.isCrossSite) {
      advice.textContent =
        'Those two hostnames are different sites, and localhost and 127.0.0.1 count as ' +
        'different even on one machine. admin_token is SameSite=Lax, so the browser ' +
        'refuses to store it when it arrives from another site. Serve the page and the ' +
        'API from one origin — run "node dev-server.js" and open the port it prints.';
    } else {
      advice.textContent =
        'The page and the API share an origin, so SameSite is not the problem. Check the ' +
        'login response in DevTools → Network: if Set-Cookie has a warning triangle, the ' +
        'cookie was rejected. Over plain HTTP the Secure flag only works on localhost and ' +
        '127.0.0.1; on any other hostname the page must be served over HTTPS.';
    }

    diagnosis.className = 'alert alert--error';
    diagnosis.append(heading, list, advice);
    diagnosis.hidden = false;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessages();
    setBusy(true);

    try {
      await window.adminApi.login(emailInput.value.trim(), passwordInput.value);
    } catch (error) {
      showError(error.message);
      passwordInput.value = '';
      passwordInput.focus();
      setBusy(false);
      return;
    }

    // Credentials were accepted. Confirm the cookie actually round-trips
    // before navigating, so a dropped cookie surfaces here with an
    // explanation instead of as a silent bounce off the dashboard.
    const session = await window.adminApi.probeSession();
    if (session.authenticated) {
      window.location.replace('dashboard.html');
      return;
    }

    explainMissingCookie();
    setBusy(false);
  });

  (async function onLoad() {
    const params = new URLSearchParams(window.location.search);

    if (cfg.isCrossSite) {
      showBanner(
        `The API is on ${cfg.apiOrigin} but this page is on ${window.location.origin}. ` +
          'Different hostnames are different sites, so the browser will drop the ' +
          'SameSite=Lax session cookie. Run dev-server.js to serve both from one origin.',
        'warning',
      );
    }

    if (params.has('signedOut')) {
      const session = await window.adminApi.probeSession();
      showBanner(
        session.authenticated
          ? 'Signed out, but the server still accepts the session cookie — it was not cleared.'
          : 'Signed out. The session cookie is no longer accepted.',
        session.authenticated ? 'warning' : 'success',
      );
      return;
    }

    if (params.has('needsAuth')) {
      if (!cfg.isCrossSite) showBanner('Please sign in to continue.', 'info');
      return;
    }

    const session = await window.adminApi.probeSession();
    if (session.authenticated) window.location.replace('dashboard.html');
  })();
})();
