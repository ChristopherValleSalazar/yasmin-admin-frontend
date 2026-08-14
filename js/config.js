/*
 * Environment configuration for the admin prototype.
 *
 * apiBase must be an origin listed in the backend's APP.CORS.ALLOWED.ORIGINS,
 * and this page must be served from an allowed origin too — the backend sets
 * allowCredentials(true), so the cookie only survives a matching CORS config.
 */
window.APP_CONFIG = {
  apiBase: 'http://localhost:8080',

  loginPath: '/api/v1/admin/login',
  logoutPath: '/api/v1/admin/logout',

  // Any ROLE_ADMIN route works as a session probe; this is the cheapest one.
  // A 200 means the browser sent admin_token and AdminJwtFilter accepted it.
  sessionProbePath: '/api/v1/admin/appointments/day?size=1',
};
