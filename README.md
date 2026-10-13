# yasmin-admin-frontend

Admin panel prototype for Yasmin Beauty Salon, in Spanish. Vanilla HTML, CSS and JavaScript: no framework, no build step.
Private: it is not linked from the public site and every page carries `noindex, nofollow`.

| File | Purpose |
|---|---|
| `login.html` / `.css` / `.js` | Admin login. The backend sets an HttpOnly cookie; no token is handled in JS. |
| `panel-view.html` / `.css` / `.js` | Daily appointments (calendar + paged table with row states), detail/edit modal, image lightbox, new appointment modal. |
| `booking.js` | Shared by the new appointment modal and edit mode: calendar setup, services list, start time, availability check. |
| `palette.css` | The public site's `:root` colors, copied verbatim from `global-layout.css`. Update both together. |
| `images/` | Logos and favicon copied from the public site. |
| `config.js` | `API_BASE_URL`: on localhost / 127.0.0.1 it is the same host on port 8080, anywhere else production. |
| `mock.js`, `mock-images/` | Fake API and reference photos for UI work without a backend. Off by default. |

## Running it against the local backend

The panel talks to the backend's `dev/build/mac` branch on port 8080 of **the same host the page is on**
(`config.js`), so `http://localhost:5500` uses `http://localhost:8080` and `http://127.0.0.1:5500` uses
`http://127.0.0.1:8080`. That keeps the `SameSite=Lax` login cookie same-site; nothing needs editing.

1. Start the backend on port 8080.
2. Serve this folder and open `login.html`, e.g. `python3 -m http.server 5500` or VS Code Live Server.
3. Add the page's exact origin to the backend's `APP.CORS.ALLOWED.ORIGINS`, e.g. `http://localhost:5500`
   (and `http://127.0.0.1:5500` if you also open it that way).
4. Use Chrome or Firefox. The login cookie is `Secure`; those browsers accept it on `http://localhost`, Safari does not.

The session lasts 20 minutes; after that any request returns 401 and the panel sends you back to the login page.

### Logged out right after logging in?

That means the session cookie did not reach the API. The login page now checks `GET /me` before leaving and says so
instead of bouncing you around.

- Hard-reload once (Cmd+Shift+R), or tick "Disable cache" in DevTools → Network. Script URLs carry `?v=`, so bump
  that version in both HTML files on every release.
- In the console, the `[admin] API:` line shows which backend the page uses; it must be the same host as the page.
- In DevTools → Network, open the `login` request: a yellow warning next to `Set-Cookie` says why Chrome dropped it.
- Make sure the mocks are off on **both** pages (see below): a mocked login never sets a real cookie.

## Working on the UI without a backend

Uncomment the `mock.js` `<script>` tag in **both** `login.html` and `panel-view.html`, and set
`const USE_MOCKS = true;` at the top of `mock.js`. It then answers every call with the same routes and shapes as the
backend. Log in with `admin@yasminbeauty.salon` / `admin123` (anything else shows the error toast).

Layout is phone first: a day bar (previous day / tap for the calendar / next day) and a time, name, status list
that fits a whole day on one phone screen. Tablets get the same layout with more room; desktop (1024px+) keeps
the calendar open beside the list.

- Today has 10 appointments, tomorrow 3, yesterday 4, every other day is empty.
- Today has every row state: an overlapping pair (Ana, Luis), a rescheduled (Valeria) and a deleted (Daniela) appointment.
- Only *Reservada* and *Confirmada* appointments accept Completada / No asistió (others return 409).
- Editing or creating on a Monday, or past closing time, returns the backend's business-hours errors.
- Camila Reyes' availability check fails twice, then succeeds: edit her and pick a time to see the auto-retry and the *Reintentar* button.
- A new appointment whose name contains `error` fails. `panel-view.html?mock401` simulates an expired session.

## Endpoints

From `AdminController` on the backend's `dev/build/mac` branch, under `/api/v1/admin`:

| Used for | Request |
|---|---|
| Login | `POST /login` `{ email, password }`, then `GET /me` to confirm the cookie stuck |
| Day view | `GET /appointments/day?date=YYYY-MM-DD` → every appointment of the day as a full record |
| Completada / No asistió | `PATCH /appointments/status/{id}?action=COMPLETED\|NO_SHOW` |
| Overlap check | `POST /appointments/overlaps` `{ date, startTime, serviceTypes, excludeId }` → `[{ id, name, serviceTypeList }]` |
| Edit (reschedule) | `PATCH /appointments/edit/{id}` `{ services, date, startTime }` |
| Create | `POST /appointments/create` `{ appointmentSource, name, services, date, startTime }` → 201 |
| Delete | `DELETE /appointments/delete/{id}` |

The detail modal reads from the day list, since there is no single-appointment endpoint. Row overlap colors are
worked out from that list with the backend's own rule (`NON_BLOCKING_STATUSES`).

After a change the panel fetches the selected day again whenever that day is affected: status changes, deletes and
edits always (the appointment came from that day), and new appointments only when they are for that day. An edit that
moves an appointment to another day closes it and says where it went; a new appointment for another day shows a note
instead of a fetch.

Reference photos come from the day list's `imageUrl` field (`List<String>` of public URLs, backend commit
`2b55013`). Cloudinary URLs are resized from the URL itself: 160px thumbnails in the appointment, up to 1600px in the photo viewer, which cycles through the
appointment's photos with the side arrows, the arrow keys or a swipe.
