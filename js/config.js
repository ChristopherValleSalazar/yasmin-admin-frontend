/*
 * Environment configuration.
 *
 * The backend listens on 8080 (server.port in application.properties), so that
 * is where requests go. Serve this folder with any static server and open the
 * page on the SAME hostname the API uses — http://localhost:5500, not a LAN or
 * tailnet name. See the README for why the hostname has to match.
 *
 * ?api=http://localhost:9090 overrides the base for the session and survives
 * the hop to the dashboard; ?api= clears it.
 */
(function () {
  'use strict';

  const DEFAULT_API_BASE = 'http://localhost:8080';

  const OVERRIDE_KEY = 'adminApiBaseOverride';
  const requested = new URLSearchParams(window.location.search).get('api');

  if (requested !== null) {
    if (requested) sessionStorage.setItem(OVERRIDE_KEY, requested.replace(/\/$/, ''));
    else sessionStorage.removeItem(OVERRIDE_KEY);
  }

  const apiBase = sessionStorage.getItem(OVERRIDE_KEY) || DEFAULT_API_BASE;
  const apiUrl = new URL(apiBase);

  window.APP_CONFIG = {
    apiBase,
    apiOrigin: apiUrl.origin,

    loginPath: '/api/v1/admin/login',
    logoutPath: '/api/v1/admin/logout',

    // Any ROLE_ADMIN route works as a session probe; this is the cheapest one.
    // A 200 means the browser sent admin_token and AdminJwtFilter accepted it.
    sessionProbePath: '/api/v1/admin/appointments/day?size=1',

    /*
     * Whether admin_token survives comes down to two independent rules, and
     * both are decided by the API origin — the origin that issues the cookie.
     */

    // SameSite=Lax: the cookie is only stored and sent when the page and the
    // API share a hostname. Ports and schemes are irrelevant here, which is why
    // localhost:5500 and localhost:8080 are the same site, while localhost and
    // 127.0.0.1 are not.
    get isCrossSite() {
      return apiUrl.hostname !== window.location.hostname;
    },

    // Secure: the cookie is only stored when the response carrying it came from
    // a trustworthy origin. This is about the API, not about this page — an
    // http:// page talking to http://localhost is fine.
    get apiOriginIsTrustworthy() {
      if (apiUrl.protocol === 'https:') return true;
      const host = apiUrl.hostname;
      return host === 'localhost'
        || host.endsWith('.localhost')
        || host === '127.0.0.1'
        || host === '::1'
        || host === '[::1]';
    },
  };
})();
