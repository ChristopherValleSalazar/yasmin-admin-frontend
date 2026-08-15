/*
 * Environment configuration.
 *
 * apiBase is empty by default, meaning "same origin as this page". Run
 * dev-server.js and it proxies /api/* to the backend, which keeps admin_token
 * a first-party cookie — the only arrangement a SameSite=Lax cookie survives.
 *
 * ?api=http://localhost:8080 overrides it for a one-off test against a backend
 * on another origin. That is deliberately a debugging escape hatch: the browser
 * will drop the session cookie unless that origin has the same hostname as this
 * page, so the app warns when it is in use.
 */
(function () {
  'use strict';

  const OVERRIDE_KEY = 'adminApiBaseOverride';
  const requested = new URLSearchParams(window.location.search).get('api');

  // Persist the override so it survives the hop to dashboard.html.
  if (requested !== null) {
    if (requested) sessionStorage.setItem(OVERRIDE_KEY, requested.replace(/\/$/, ''));
    else sessionStorage.removeItem(OVERRIDE_KEY);
  }

  const apiBase = sessionStorage.getItem(OVERRIDE_KEY) || '';

  window.APP_CONFIG = {
    apiBase,

    loginPath: '/api/v1/admin/login',
    logoutPath: '/api/v1/admin/logout',

    // Any ROLE_ADMIN route works as a session probe; this is the cheapest one.
    // A 200 means the browser sent admin_token and AdminJwtFilter accepted it.
    sessionProbePath: '/api/v1/admin/appointments/day?size=1',

    // Where requests actually land, for display.
    apiOrigin: apiBase ? new URL(apiBase).origin : window.location.origin,

    /*
     * True when the API is on a different hostname than this page. Ports and
     * schemes do not matter to SameSite; the hostname does, which is why
     * localhost and 127.0.0.1 are a broken pairing even on one machine.
     */
    get isCrossSite() {
      return Boolean(apiBase) && new URL(apiBase).hostname !== window.location.hostname;
    },
  };
})();
