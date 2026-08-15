# yasmin-admin-frontend

Prototype admin front end for the Yasmin Beauty backend. It covers exactly two
endpoints — sign in and sign out — plus a protected "hello world" page used to
verify that the `admin_token` HttpOnly cookie round-trips correctly.

No build step, no dependencies: plain HTML, CSS and JavaScript.

## Running it

1. Start the backend on `http://localhost:8080`.

2. Allow the page's origin, since the backend sets `allowCredentials(true)` and
   so cannot use the `*` wildcard. For Live Server's default port:

   ```
   APP.CORS.ALLOWED.ORIGINS=http://localhost:5500
   ```

3. Serve this folder — Live Server, `python3 -m http.server 5500`, anything.
   Do not open the files directly: a `file://` page has the origin `null` and
   every request fails CORS.

4. Open **`http://localhost:5500/index.html`**.

The front end fetches `http://localhost:8080` directly; change `apiBase` in
`js/config.js` if the backend moves.

## Open it on localhost, not a machine name

`http://chris-fedora:5500` and `http://192.168.x.y:5500` will *not* work, even
though they reach the same server. Two rules govern the session cookie, and both
are worth knowing because neither produces a visible error:

**The page hostname must match the API hostname.** `admin_token` is
`SameSite=Lax`, so a browser only stores and sends it when the page and the API
are on the same site. Ports are irrelevant — `localhost:5500` and
`localhost:8080` are the same site — but hostnames are not interchangeable:
`localhost`, `127.0.0.1` and `chris-fedora` are three different sites on one
machine.

**The API origin must be trustworthy.** `admin_token` is also `Secure`, and a
browser only keeps a Secure cookie when the response carrying it came from
`https://` or from `localhost` / `127.0.0.1` / `[::1]`. This is about the API's
origin, not the page's — an `http://localhost:5500` page talking to
`http://localhost:8080` is fine.

Measured in Chromium against the same cookie attributes the backend sends:

| Page origin        | API origin         | Login | Next request |
| ------------------ | ------------------ | ----- | ------------ |
| `localhost:5500`   | `localhost:8080`   | `204` | `200`        |
| `127.0.0.1:5500`   | `localhost:8080`   | `204` | **`401`**    |
| `chris-fedora:5500`| `localhost:8080`   | `204` | **`401`**    |
| `127.0.0.1:5500`   | `127.0.0.1:8080`   | `204` | `200`        |

Login returns `204` in every row and the backend logs a clean authentication —
the cookie is simply discarded by the browser before it is ever stored. The app
detects both conditions and says so before you type a password, then explains
what happened after a login attempt instead of bouncing off the dashboard in
silence.

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

`?api=http://localhost:9090` overrides the API base for the session and survives
the hop to the dashboard; `?api=` clears it.

## Testing from a second device

Not currently possible without changes, and worth knowing why before trying.
`http://localhost:8080` on a phone or laptop means *that device's* localhost,
where no backend is listening — so the API would have to move to
`http://chris-fedora:8080` for the request to arrive at all.

That fixes the hostname match, but then the cookie comes from `chris-fedora`
over plain HTTP, which is not a trustworthy origin, so the `Secure` flag causes
it to be dropped. Making it work needs HTTPS on the backend — on a tailnet,
`tailscale cert` issues a real certificate — or a dev-only profile that relaxes
the cookie. Weakening the cookie is not recommended: it makes local behaviour
diverge from production, which is exactly where this class of bug hides.

## Before deploying

The same rules apply in production. If the admin page and the API end up on
different domains, `SameSite=Lax` will drop the session there exactly as it does
locally. Either put both behind one domain (a reverse proxy, with the API under
a path such as `/api`), or change the backend to issue the cookie as
`SameSite=None; Secure`, which requires HTTPS on both sides.
