# yasmin-admin-frontend

Prototype admin front end for the Yasmin Beauty backend. It covers exactly two
endpoints — sign in and sign out — plus a protected "hello world" page used to
verify that the `admin_token` HttpOnly cookie round-trips correctly.

No build step, no dependencies: plain HTML, CSS and JavaScript.

## Pages

| File             | Purpose                                                             |
| ---------------- | ------------------------------------------------------------------- |
| `index.html`     | Login form → `POST /api/v1/admin/login`                              |
| `dashboard.html` | Hello world, gated on the cookie; sign out → `POST /api/v1/admin/logout` |

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

Because the cookie is HttpOnly, JavaScript can never read it. Both pages
therefore treat the server's answer as the source of truth and send every
request with `credentials: 'include'`.

## Running it

1. Start the backend on `http://localhost:8080`.

2. Add the front end's origin to the backend's allowed origins, otherwise the
   browser drops the response (the backend sets `allowCredentials(true)`, which
   forbids the `*` wildcard):

   ```
   APP.CORS.ALLOWED.ORIGINS=http://localhost:5173
   ```

3. Serve this folder over HTTP — **not** by opening the file directly. A
   `file://` page has the origin `null` and every request will fail CORS:

   ```bash
   python3 -m http.server 5173
   ```

4. Open <http://localhost:5173>.

If the backend runs somewhere else, change `apiBase` in `js/config.js`.

## Testing the cookie

1. Sign in with an admin account. On success you land on `dashboard.html`.
2. The **Cookie check** panel shows the two facts that together prove the flag
   is working: the protected request returned `200` (so the browser attached
   `admin_token` on its own), and `document.cookie` cannot see the token.
3. Reload the page, or close the tab and reopen <http://localhost:5173> — you go
   straight to the dashboard, because the cookie survived and the login page's
   own probe says the session is still good.
4. Press **Sign out**, then confirm the login page reports that the cookie is no
   longer accepted. Reaching `dashboard.html` directly should now bounce you
   back to the login page.
5. In DevTools → Application → Cookies, `admin_token` should be listed with
   `HttpOnly` ✓ and `Secure` ✓.

## Notes on the environment

- `Secure` cookies are accepted over `http://localhost` by Chrome and Firefox,
  so local testing works without TLS. On any other host the front end must be
  served over HTTPS or the browser will discard the cookie silently.
- `SameSite=Lax` is fine while both sides share a host — `localhost:5173` and
  `localhost:8080` are the same site, as ports are not part of a site. Once the
  front end is deployed to a different domain than the API, the cookie becomes
  cross-site and the backend must issue it as `SameSite=None; Secure`.
- The backend only allows the `Content-Type` request header through CORS, so
  the login request sends nothing else.
