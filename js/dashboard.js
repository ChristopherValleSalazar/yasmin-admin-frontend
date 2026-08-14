/*
 * Protected "hello world" page.
 *
 * The guard is a real request to a ROLE_ADMIN endpoint, which is the only
 * honest way to check an HttpOnly session: if the browser attached a valid
 * admin_token the server answers 200, otherwise 401 and we go back to login.
 */
(function () {
  'use strict';

  const cfg = window.APP_CONFIG;

  const checking = document.getElementById('checking');
  const content = document.getElementById('content');
  const statusPill = document.getElementById('diag-status');
  const cookiePill = document.getElementById('diag-jscookie');
  const verdict = document.getElementById('diag-verdict');
  const recheckButton = document.getElementById('recheck');
  const logoutButton = document.getElementById('logout');

  document.getElementById('diag-endpoint').textContent =
    `GET ${cfg.apiBase}${cfg.sessionProbePath}`;

  function setPill(element, text, variant) {
    element.textContent = text;
    element.className = `pill pill--${variant}`;
  }

  function toLogin(query) {
    window.location.replace(`index.html${query || ''}`);
  }

  /*
   * A cookie marked HttpOnly is absent from document.cookie by definition, so
   * "the request succeeded but the token is invisible here" is the pair of
   * facts that together prove the flag is doing its job.
   */
  function describeReadableCookies() {
    const readable = document.cookie;
    const tokenIsExposed = /(?:^|;\s*)admin_token=/.test(readable);

    if (tokenIsExposed) {
      setPill(cookiePill, 'admin_token is readable — HttpOnly is NOT set', 'bad');
      return false;
    }

    setPill(
      cookiePill,
      readable ? 'admin_token hidden (other cookies present)' : 'admin_token hidden (none readable)',
      'good',
    );
    return true;
  }

  function renderVerdict(hidden) {
    if (hidden) {
      verdict.className = 'alert alert--success';
      verdict.textContent =
        'The HttpOnly cookie is working: the browser sent admin_token with the request ' +
        'above, and JavaScript on this page cannot read it.';
    } else {
      verdict.className = 'alert alert--error';
      verdict.textContent =
        'The session token is exposed to JavaScript. Check that the login cookie is ' +
        'still built with httpOnly(true).';
    }
  }

  async function check({ firstRun }) {
    const session = await window.adminApi.probeSession();

    if (session.authenticated) {
      setPill(statusPill, `${session.status} OK — cookie accepted`, 'good');
      renderVerdict(describeReadableCookies());

      checking.hidden = true;
      content.hidden = false;
      return;
    }

    // A failed first check means we were never signed in; a failure on a later
    // re-check means the session ended while the page was open.
    if (firstRun) {
      toLogin();
      return;
    }

    if (session.status === 401) {
      setPill(statusPill, `401 — ${session.error || 'cookie rejected'}`, 'bad');
      verdict.className = 'alert alert--error';
      verdict.textContent = 'The session is no longer valid. Returning to sign in…';
      window.setTimeout(() => toLogin(), 1500);
      return;
    }

    setPill(statusPill, session.status ? `${session.status}` : 'no response', 'bad');
    verdict.className = 'alert alert--error';
    verdict.textContent = session.error || 'The session could not be verified.';
  }

  recheckButton.addEventListener('click', async () => {
    recheckButton.disabled = true;
    setPill(statusPill, 'checking…', 'neutral');
    try {
      await check({ firstRun: false });
    } finally {
      recheckButton.disabled = false;
    }
  });

  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = 'Signing out…';

    try {
      await window.adminApi.logout();
      toLogin('?signedOut');
    } catch (error) {
      verdict.className = 'alert alert--error';
      verdict.textContent = error.message;
      logoutButton.disabled = false;
      logoutButton.textContent = 'Sign out';
    }
  });

  check({ firstRun: true });
})();
