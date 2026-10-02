# yasmin-admin-frontend

Admin panel prototype for Yasmin Beauty Salon. Vanilla HTML, CSS and JavaScript: no framework, no build step.
Private: it is not linked from the public site and every page carries `noindex, nofollow`.

| File | Purpose |
|---|---|
| `login.html` / `.css` / `.js` | Admin login. The backend sets an HttpOnly cookie; no token is handled in JS. |
| `panel-view.html` / `.css` / `.js` | Daily appointments (calendar + paged table), detail/edit modal, image lightbox, new appointment modal. |
| `config.js` | `API_BASE_URL`, same switch as the public site. |
| `mock.js` | **Prototype only.** Fakes every API call. Remove its `<script>` tag from both pages (and the file) to use the real backend. |

## Running it

Serve the folder with any static server and open `login.html`:

```sh
python3 -m http.server 8080
```

With mocks on: password `admin` logs in (any valid email). Today has 10 appointments (two pages), tomorrow 3,
yesterday 4, every other day is empty. Only *Confirmed* appointments accept Completed / No show (others return 409).
A name containing `error` makes edit or create fail. `panel-view.html?mock401` simulates an expired session.

## Endpoints

From `AdminController` in the backend, under `/api/v1/admin`:

| Used for | Request |
|---|---|
| Login | `POST /login` `{ email, password }` |
| Day view | `GET /appointments/day?date=YYYY-MM-DD&page=0&size=7` (Spring `Page`) |
| Detail | `GET /appointments/{id}` |
| Completed / No show | `PATCH /appointments/{id}/status?action=COMPLETED\|NO_SHOW` |
| Edit | `PATCH /appointments/{id}` |
| Delete | `DELETE /appointments/{id}` |
| Create | `/api/(placeholder)`: no admin create endpoint exists yet (`// TODO: endpoint` in `panel-view.js`) |
