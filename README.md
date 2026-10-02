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
| `config.js` | `API_BASE_URL`, same switch as the public site. |
| `mock.js`, `mock-images/` | **Prototype only.** Fake API and reference photos. Remove the `mock.js` `<script>` tag from both pages (and these files) to use the real backend. |

## Running it

Serve the folder with any static server and open `login.html`:

```sh
python3 -m http.server 8080
```

With mocks on, log in with `admin@yasminbeauty.salon` / `admin123` (anything else shows the error toast).

- Today has 10 appointments (two pages), tomorrow 3, yesterday 4, every other day is empty.
- Today's first page has every row state: an overlapping pair (Ana, Luis), a rescheduled (Valeria) and a deleted (Daniela) appointment.
- Only *Confirmada* appointments accept Completada / No asistió (others return 409).
- Camila Reyes' availability check fails twice, then succeeds: edit her and pick a time to see the auto-retry and the *Reintentar* button.
- A new appointment whose name contains `error` fails. `panel-view.html?mock401` simulates an expired session.

## Endpoints

From `AdminController` in the backend, under `/api/v1/admin`:

| Used for | Request |
|---|---|
| Login | `POST /login` `{ email, password }` |
| Day view | `GET /appointments/day?date=YYYY-MM-DD&page=0&size=7` (Spring `Page`) |
| Detail | `GET /appointments/{id}` |
| Completada / No asistió | `PATCH /appointments/{id}/status?action=COMPLETED\|NO_SHOW` |
| Edit (reschedule) | `PATCH /appointments/{id}` `{ date, startTime, services }` |
| Delete | `DELETE /appointments/{id}` |
| Create | `/api/(placeholder)` `{ name, date, startTime, services }`: no admin create endpoint yet |
| Availability check | `/api/(placeholder)` `{ date, startTime, services, appointmentId }` → `{ overlaps, conflicts: [{ appointmentId, services }] }` |

Backend changes the panel expects: `AppointmentRow` needs an `overlapping` flag, `AppointmentFullDetailsResponse` needs
`hairImages`, and the edit endpoint needs `@RequestBody` plus date/start time/services support.
