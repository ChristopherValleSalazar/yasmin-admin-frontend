# yasmin-admin-frontend

Prototype admin front end for the Yasmin Beauty backend. It covers exactly two
endpoints — sign in and sign out — plus a protected "hello world" page used to
verify that the `admin_token` HttpOnly cookie round-trips correctly.

No build step, no dependencies: plain HTML, CSS and JavaScript.

## Running it

```bash
# 1. start the backend on :8080, then
node dev-server.js          # http://localhost:5173
```

`dev-server.js` serves this folder and proxies `/api/*` to the backend, so the
page and the API share one origin. **This is not just convenience — it is what
makes the session cookie work.** See below.

Point it somewhere else with environment variables:

```bash
PORT=3000 API_TARGET=http://localhost:9090 node dev-server.js
```

Because everything is same-origin, the backend needs no CORS configuration for
local development at all.

## Why the same origin matters

`admin_token` is issued as `SameSite=Lax`. A browser refuses to *store* a Lax
cookie that arrives from a cross-site response, and refuses to *send* one on a
cross-site request. Two hostnames are different sites even when they are the
same machine — `127.0.0.1` and `localhost` included.

Serving the page on one host and calling the API on another produces a failure
that looks like a backend bug but is not:

| Page origin        | API origin         | Login | Next request |
| ------------------ | ------------------ | ----- | ------------ |
| `localhost:5173`   | `localhost:8080`   | `204` | `200`        |
| `127.0.0.1:5173`   | `localhost:8080`   | `204` | **`401`**    |
| `localhost:5173`   | `127.0.0.1:8080`   | `204` | **`401`**    |
| `127.0.0.1:5173`   | `127.0.0.1:8080`   | `204` | `200`        |

Login returns `204` and the backend logs a clean, successful authentication —
the cookie is simply discarded by the browser before it is ever stored. The
proxy removes the whole class of problem. Serving these files with VS Code Live
Server (`127.0.0.1:5500`) or any other static server while `apiBase` points at
`localhost:8080` reproduces row two.

If the app is ever loaded with a cross-site API on purpose, it says so in a
banner up front, and explains the dropped cookie after a login attempt rather
than silently bouncing off the dashboard.

## Pages

| File             | Purpose                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| `index.html`     | Login form → `POST /api/v1/admin/login`                                   |
| `dashboard.html` | Hello world, gated on the cookie; sign out → `POST /api/v1/admin/logout`  |

## Endpoints used

Taken from `AdminController` in `salon-website-backend`:

- `POST /api/v1/admin/login` — body `{ "email", "password" }`. Responds `204`
  and sets `admin_token` (HttpOnly, Secure, SameSite=Lax, 12 h). Errors come
  back as `{ "type", "error" }`: `401` for bad credentials, `400` for a
  malformed email or blank field, `500` if authentication is unavailable.
- `POST /api/v1/admin/logout` — no body, responds `204` and expires the cookie.
- `GET /api/v1/admin/appointments/day?size=1` — not rendered anywhere; used
  purely as a session probe, since a `ROLE_ADMIN` route is the only way to ask
  the server whether the cookie it holds is still valid.

Because the cookie is HttpOnly, JavaScript can never read it. Both pages treat
the server's answer as the source of truth and send every request with
`credentials: 'include'`. After a successful login the page re-probes before
navigating, so "the server issued a cookie" and "the browser kept it" are
checked separately.

## Testing the cookie

1. Sign in with an admin account. On success you land on `dashboard.html`.
2. The **Cookie check** panel shows the two facts that together prove the flag
   is working: the protected request returned `200` (so the browser attached
   `admin_token` on its own), and `document.cookie` cannot see the token.
3. Reload, or close the tab and reopen — you go straight to the dashboard,
   because the cookie survived.
4. Press **Sign out**, then confirm the login page reports the cookie is no
   longer accepted. Reaching `dashboard.html` directly should bounce you back.
5. In DevTools → Application → Cookies, `admin_token` should be listed with
   `HttpOnly` ✓ and `Secure` ✓.

### Debugging against another origin

`?api=http://localhost:8080` overrides the API base for the session and
survives the hop to the dashboard; `?api=` clears it. It is an escape hatch for
inspecting a remote backend, not a working configuration — the cookie will be
dropped unless that origin shares this page's hostname.

## Before deploying

The same rule applies in production. If the admin page and the API end up on
different domains, `SameSite=Lax` will drop the session there exactly as it does
locally. Either put both behind one domain (a reverse proxy, with the API under
a path such as `/api`), or change the backend to issue the cookie as
`SameSite=None; Secure`, which requires HTTPS on both sides.

`Secure` cookies are accepted over plain HTTP only on `localhost` and
`127.0.0.1`. On any other hostname the page must be served over HTTPS or the
browser will discard the cookie without a visible error.
