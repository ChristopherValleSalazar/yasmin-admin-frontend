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
   * The two ways this environment can stop admin_token from ever being stored.
   * Both are decidable before a login is attempted, and a setup can hit both at
   * once, so they are reported as a list rather than a single guess.
   */
  function detectCookieBlockers() {
    const problems = [];

    if (!cfg.apiOriginIsTrustworthy) {
      problems.push({
        title: 'The API is not on a trustworthy origin.',
        detail:
          'admin_token carries the Secure flag, and a browser only keeps a Secure cookie ' +
          `when the response carrying it came from https:// or from localhost. ${cfg.apiOrigin} ` +
          'is neither, so the cookie is discarded the moment it arrives. Point the API at ' +
          'http://localhost:8080, or serve the backend over HTTPS.',
      });
    }

    if (cfg.isCrossSite) {
      problems.push({
        title: 'The page and the API are on different sites.',
        detail:
          `This page is on ${window.location.hostname} and the API is on ${apiHostname()}. ` +
          'Different hostnames are different sites — localhost, 127.0.0.1 and a machine or ' +
          'tailnet name all count as different, even on one computer. admin_token is ' +
          'SameSite=Lax, so the browser refuses to store it when it arrives from another ' +
          `site. Open this page on ${apiHostname()} instead, keeping whatever port your ` +
          'static server uses — the port does not matter, only the hostname.',
      });
    }

    return problems;
  }

  function apiHostname() {
    return new URL(cfg.apiBase).hostname;
  }

  /*
   * Reached when the backend accepted the credentials but the follow-up request
   * came back unauthenticated. Name the causes rather than bouncing in silence.
   */
  function explainMissingCookie() {
    const heading = document.createElement('strong');
    heading.textContent = 'Signed in, but the browser did not keep the session cookie.';

    const list = document.createElement('dl');
    list.className = 'diagnostics';
    for (const [term, value] of [
      ['This page', window.location.origin],
      ['The API', cfg.apiOrigin],
      ['API origin trusted', String(cfg.apiOriginIsTrustworthy)],
    ]) {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      const code = document.createElement('code');
      code.textContent = value;
      dd.appendChild(code);
      list.append(dt, dd);
    }

    diagnosis.className = 'alert alert--error';
    diagnosis.replaceChildren(heading, list);

    const problems = detectCookieBlockers();
    if (problems.length === 0) {
      const fallback = document.createElement('p');
      fallback.className = 'small';
      fallback.textContent =
        'Nothing in this page\'s setup explains it. Check the login response in ' +
        'DevTools → Network: a warning triangle next to Set-Cookie says why the browser ' +
        'rejected the cookie.';
      diagnosis.appendChild(fallback);
    } else {
      for (const problem of problems) {
        const para = document.createElement('p');
        para.className = 'small';
        const label = document.createElement('strong');
        label.textContent = `${problem.title} `;
        para.append(label, document.createTextNode(problem.detail));
        diagnosis.appendChild(para);
      }
    }

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

    // Both blockers are knowable now, so say so before credentials are typed.
    const problems = detectCookieBlockers();
    if (problems.length > 0) {
      showBanner(
        `Sign-in will not work from here. ${problems.map((p) => p.title).join(' ')} ` +
          'Details appear after you try.',
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
      // Do not paint over a blocker warning with a routine prompt.
      if (problems.length === 0) showBanner('Please sign in to continue.', 'info');
      return;
    }

    const session = await window.adminApi.probeSession();
    if (session.authenticated) window.location.replace('dashboard.html');
  })();
})();
