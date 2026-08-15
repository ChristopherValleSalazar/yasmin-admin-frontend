/*
 * Thin wrapper over the admin endpoints in AdminController.
 *
 * The session lives in the admin_token cookie, which is HttpOnly — JavaScript
 * can never read it. Every call therefore uses credentials: 'include' and lets
 * the browser attach the cookie itself, and "am I logged in?" is a question
 * only the server can answer (see probeSession).
 */
(function () {
  'use strict';

  const cfg = window.APP_CONFIG;

  class ApiError extends Error {
    constructor(message, status, options) {
      super(message, options);
      this.name = 'ApiError';
      this.status = status;
    }
  }

  const url = (path) => `${cfg.apiBase}${path}`;

  /*
   * GlobalExceptionHandler answers with { type, error }, but Spring Security's
   * HttpStatusEntryPoint answers 401 with an empty body, so a missing body is
   * expected rather than exceptional.
   */
  async function readErrorMessage(response) {
    try {
      const body = await response.json();
      if (body && typeof body.error === 'string') return body.error;
    } catch (ignored) {
      // Empty or non-JSON body.
    }
    return null;
  }

  function fallbackMessage(status) {
    if (status === 401) return 'Invalid email or password.';
    if (status === 400) return 'Please check the email and password you entered.';
    if (status >= 500) return 'The server is not available right now. Please try again.';
    return `Unexpected response from the server (${status}).`;
  }

  /*
   * fetch only rejects on transport failures, which in practice means the
   * backend is down or the CORS preflight was refused. Both look identical to
   * the browser, so the message names both.
   */
  function transportError(cause) {
    return new ApiError(
      `Could not reach the API at ${cfg.apiBase}. Check that the backend is running ` +
        'and that this page\'s origin is allowed by APP.CORS.ALLOWED.ORIGINS.',
      0,
      { cause },
    );
  }

  async function login(email, password) {
    let response;
    try {
      response = await fetch(url(cfg.loginPath), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch (cause) {
      throw transportError(cause);
    }

    // 204 No Content, with the session delivered as a Set-Cookie header.
    if (response.status === 204) return;

    const message = await readErrorMessage(response);
    throw new ApiError(message || fallbackMessage(response.status), response.status);
  }

  async function logout() {
    let response;
    try {
      response = await fetch(url(cfg.logoutPath), {
        method: 'POST',
        credentials: 'include',
      });
    } catch (cause) {
      throw transportError(cause);
    }

    if (response.status === 204) return;

    const message = await readErrorMessage(response);
    throw new ApiError(message || fallbackMessage(response.status), response.status);
  }

  /*
   * Asks the server whether the cookie it holds is still a valid admin session.
   * Never throws for an ordinary 401 — "not logged in" is an answer, not a
   * failure — so callers can branch on the returned shape.
   */
  async function probeSession() {
    let response;
    try {
      response = await fetch(url(cfg.sessionProbePath), {
        method: 'GET',
        credentials: 'include',
      });
    } catch (cause) {
      return { authenticated: false, status: 0, error: transportError(cause).message };
    }

    if (response.ok) {
      return { authenticated: true, status: response.status };
    }

    if (response.status === 401) {
      // AdminJwtFilter reports TokenExpired / InvalidToken here; a missing
      // cookie falls through to the entry point's empty-bodied 401 instead.
      const message = await readErrorMessage(response);
      return { authenticated: false, status: 401, error: message };
    }

    return {
      authenticated: false,
      status: response.status,
      error: (await readErrorMessage(response)) || fallbackMessage(response.status),
    };
  }

  /*
   * Sends one arbitrary admin request and reports what came back. Unlike the
   * helpers above it never throws and never interprets a status as failure —
   * the caller is checking whether the request was authorized, and a 409 or a
   * 405 answers that just as well as a 204.
   *
   * A rejected fetch is reported as `blocked` rather than as an error: from
   * script, an error response that arrived without CORS headers is
   * indistinguishable from the network being down.
   */
  async function callEndpoint(method, path) {
    const target = url(path);
    const startedAt = performance.now();

    let response;
    try {
      response = await fetch(target, { method, credentials: 'include' });
    } catch (cause) {
      return {
        method,
        url: target,
        blocked: true,
        durationMs: Math.round(performance.now() - startedAt),
        bodyText: transportError(cause).message,
      };
    }

    const bodyText = await response.text();
    let bodyJson = null;
    if (bodyText) {
      try {
        bodyJson = JSON.parse(bodyText);
      } catch (ignored) {
        // Not JSON; bodyText is what we show.
      }
    }

    return {
      method,
      url: target,
      blocked: false,
      status: response.status,
      statusText: response.statusText,
      durationMs: Math.round(performance.now() - startedAt),
      bodyText,
      bodyJson,
    };
  }

  window.adminApi = { login, logout, probeSession, callEndpoint, ApiError };
})();
