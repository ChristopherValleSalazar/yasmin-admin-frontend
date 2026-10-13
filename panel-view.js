// Admin panel: daily appointment table, detail/edit modal, image lightbox and the
// front desk "new appointment" form. Every request goes through api() below.
// Calendar, services, start time and the availability check live in booking.js.

// AdminController routes (backend dev/build/mac)
const ADMIN_APPOINTMENTS = `${API_BASE_URL}/api/v1/admin/appointments`;
const DAY_URL = `${ADMIN_APPOINTMENTS}/day`;
const CREATE_URL = `${ADMIN_APPOINTMENTS}/create`;
const statusUrl = (id, action) => `${ADMIN_APPOINTMENTS}/status/${encodeURIComponent(id)}?action=${action}`;
const editUrl = id => `${ADMIN_APPOINTMENTS}/edit/${encodeURIComponent(id)}`;
const deleteUrl = id => `${ADMIN_APPOINTMENTS}/delete/${encodeURIComponent(id)}`;
const NAME_SUFFIX = { PHONE: "Phone", WALK_IN: "Walk-in" };

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

const toast = document.getElementById("toast");
const toastText = document.getElementById("toast-text");
let toastTimer;

// kind "error" (default) or "success" for confirmations such as a moved appointment.
function showToast(message, kind = "error") {
    clearTimeout(toastTimer);
    toastText.textContent = message;
    toast.classList.toggle("is-success", kind === "success");
    // Re-showing moves it to the top of the top layer, above whichever dialog is open.
    if (toast.matches(":popover-open")) toast.hidePopover();
    toast.showPopover();
    toastTimer = setTimeout(() => toast.hidePopover(), 5000);
}

// ---------------------------------------------------------------------------
// Fetch helper: every panel request uses it, so the 401 rule lives in one place.
// After logging back in, login.js always lands on this page again.
// ---------------------------------------------------------------------------

class SessionExpiredError extends Error {
    name = "SessionExpiredError";
}

let loggingOut = false;

async function api(url, { json, ...options } = {}) {
    const init = { credentials: "include", ...options };
    if (json !== undefined) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(json);
    }

    const res = await fetch(url, init);
    if (res.status === 401) {
        if (!loggingOut) {
            loggingOut = true;
            showToast("Tu sesión expiró y se cerró. Vuelve a iniciar sesión.");
            setTimeout(() => { window.location.href = "login.html"; }, 1800);
        }
        throw new SessionExpiredError();
    }
    return res;
}

// The backend's `error` text is English developer text, so the Spanish message is
// picked by its `type`, using the public site's wording where it has one.
const ERROR_MESSAGES = {
    SlotIsMondayException: "El salón cierra los lunes. Por favor, elige otro día.",
    OutsideServiceHoursException: "Ese horario está fuera de nuestro horario de atención. Por favor, elige otro.",
    EndsAfterClosingException: "Esa cita terminaría después de la hora de cierre. Por favor, elige un horario más temprano.",
    PastDateException: "Ese horario ya pasó. Por favor, elige uno posterior.",
    InvalidAppointmentException: "Elige al menos un servicio.",
    InvalidServiceDurationException: "Elige al menos un servicio.",
    AppointmentNotFoundException: "No pudimos encontrar esta cita. Actualiza la página."
};

async function errorText(res) {
    try { return ERROR_MESSAGES[(await res.json()).type] ?? ""; } catch { return ""; }
}

const NETWORK_ERROR = "No pudimos conectar con el servidor. Inténtalo de nuevo.";

// ---------------------------------------------------------------------------
// Display text. Enum values stay in English (the backend expects them);
// only what is shown is translated.
// ---------------------------------------------------------------------------

const STATUS_LABELS = {
    BOOKED: "Reservada",
    CONFIRMED: "Confirmada",
    CANCELED: "Cancelada",
    RESCHEDULED: "Reprogramada",
    COMPLETED: "Completada",
    NO_SHOW: "No asistió",
    DELETED: "Eliminada"
};

const LANGUAGE_LABELS = { EN: "Inglés", ES: "Español" };

function formatDateTime(value) {
    if (!value) return "No enviado";
    const [date, time] = value.split("T");
    return `${formatShortDate(date)}, ${formatTime(time)}`;
}

function statusPill(status) {
    const pill = document.createElement("span");
    pill.className = `status-pill status-${status.toLowerCase()}`;
    pill.textContent = STATUS_LABELS[status] ?? status;
    return pill;
}

const SOURCE_LABELS = { ONLINE: "En línea", PHONE: "Por teléfono", WALK_IN: "Sin cita" };

const formatPrice = value => value == null ? "" :
    Number(value).toLocaleString(LOCALE, { style: "currency", currency: "USD" });

// Same rule as AppointmentService.overlapCheck: these statuses no longer hold a slot.
const NON_BLOCKING = new Set(["CANCELED", "RESCHEDULED", "COMPLETED", "NO_SHOW", "DELETED"]);

const minutesOf = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

// The day endpoint has no overlap flag, so it is worked out here from the same list.
function markOverlaps(rows) {
    const active = rows.filter(r => !NON_BLOCKING.has(r.status));
    for (const row of rows) {
        row.overlapping = !NON_BLOCKING.has(row.status) && active.some(o => o !== row
            && minutesOf(o.startTime) < minutesOf(row.endTime)
            && minutesOf(row.startTime) < minutesOf(o.endTime));
    }
}

// Row colour: deleted and rescheduled come from the status, overlapping from markOverlaps.
function rowState(row) {
    if (row.status === "DELETED") return "deleted";
    if (row.status === "RESCHEDULED") return "rescheduled";
    if (row.overlapping) return "overlapping";
    return "normal";
}

// ---------------------------------------------------------------------------
// Day list. GET /appointments/day returns every appointment of the day as a full
// record (no paging), so the list keeps them and the detail modal reads from it.
// ---------------------------------------------------------------------------

const rowsBody = document.getElementById("apt-rows");
const tableArea = document.getElementById("table-area");
const table = document.getElementById("apt-table");
const emptyState = document.getElementById("empty-state");
const tableDay = document.getElementById("table-day");
const dayLabel = document.getElementById("day-label");
const prevDayBtn = document.getElementById("prev-day");
const nextDayBtn = document.getElementById("next-day");
const dayCol = document.getElementById("day-col");
const dayToggle = document.getElementById("day-toggle");

const state = {
    date: toIso(today),
    rows: []
};

// Only the newest request may render, so fast date clicks cannot show a stale day.
let loadSeq = 0;

async function loadDay() {
    const seq = ++loadSeq;
    renderDayHeading();
    tableArea.setAttribute("aria-busy", "true");

    try {
        const res = await api(`${DAY_URL}?${new URLSearchParams({ date: state.date })}`);
        if (seq !== loadSeq) return;
        if (!res.ok) {
            showToast("No se pudieron cargar las citas. Actualiza la página e inténtalo de nuevo.");
            return;
        }
        const rows = await res.json();
        if (seq !== loadSeq) return;

        // findByDate has no ORDER BY, so sort by start time here.
        rows.sort((a, b) => a.startTime.localeCompare(b.startTime));
        markOverlaps(rows);
        state.rows = rows;
        renderRows();
    } catch (err) {
        if (err instanceof SessionExpiredError || seq !== loadSeq) return;
        showToast(NETWORK_ERROR);
    } finally {
        if (seq === loadSeq) tableArea.setAttribute("aria-busy", "false");
    }
}

// "martes 14 de octubre"
const dayName = iso => isoToLocalDate(iso)
    .toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" });

function renderDayHeading() {
    dayLabel.textContent = capitalize(isoToLocalDate(state.date)
        .toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" }));
    tableDay.textContent = "Cargando…";
    const d = isoToLocalDate(state.date);
    nextDayBtn.disabled = shiftDay(d, 1) === null;
}

function renderRows() {
    const rows = state.rows;
    rowsBody.replaceChildren();
    const empty = rows.length === 0;
    emptyState.hidden = !empty;
    table.classList.toggle("is-empty", empty);

    const overlapCount = rows.filter(r => r.overlapping).length;
    tableDay.textContent = `${rows.length} ${rows.length === 1 ? "cita" : "citas"}`
        + (overlapCount ? ` · ${overlapCount} se cruzan` : "");

    for (const row of rows) {
        const tr = document.createElement("tr");
        const rs = rowState(row);
        tr.tabIndex = 0;
        tr.dataset.id = row.appointmentId;
        tr.className = `row-${rs}`;
        // Overlap has no status word, so screen readers get it in the row label.
        const overlapNote = rs === "overlapping" ? ", se cruza con otra cita" : "";
        tr.setAttribute("aria-label",
            `${formatTime(row.startTime)}, ${row.name}, ${STATUS_LABELS[row.status] ?? row.status}${overlapNote}. Abrir detalles`);

        // "12:15 p.m." -> hour and a.m./p.m. in separate spans, stacked on phones
        const time = document.createElement("td");
        time.className = "col-time";
        const [hm, ...suffix] = formatTime(row.startTime).split(/\s+/);
        const hmSpan = document.createElement("span");
        hmSpan.className = "t-hm";
        hmSpan.textContent = hm;
        const suffixSpan = document.createElement("span");
        suffixSpan.className = "t-suffix";
        suffixSpan.textContent = suffix.join(" ");
        time.append(hmSpan, " ", suffixSpan);

        const name = document.createElement("td");
        name.className = "col-name";
        name.textContent = row.name;

        const date = document.createElement("td");
        date.className = "col-date";
        date.textContent = formatShortDate(row.date ?? state.date);

        const status = document.createElement("td");
        status.className = "col-status";
        status.appendChild(statusPill(row.status));

        tr.append(time, name, date, status);
        rowsBody.appendChild(tr);
    }
}

rowsBody.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr) openDetail(tr.dataset.id);
});

rowsBody.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    e.preventDefault();
    openDetail(tr.dataset.id);
});

function selectDay(iso) {
    state.date = iso;
    loadDay();
}

const panelPicker = createDatePicker(document.getElementById("panel-date"), {
    inline: true,
    defaultDate: today,
    onChange(iso) {
        selectDay(iso);
        closeCalendar();
    }
});

// Previous / next day, skipping closed Mondays and stopping at the booking horizon.
function shiftDay(date, step) {
    const d = new Date(date);
    do { d.setDate(d.getDate() + step); } while (d.getDay() === 1);
    return d > salonMaxDate ? null : d;
}

function stepDay(step) {
    const next = shiftDay(isoToLocalDate(state.date), step);
    if (!next) return;
    const iso = toIso(next);
    panelPicker.set(iso);
    selectDay(iso);
}

prevDayBtn.addEventListener("click", () => stepDay(-1));
nextDayBtn.addEventListener("click", () => stepDay(1));

// Phone and tablet keep the calendar folded under the day bar; desktop always shows it.
const desktop = window.matchMedia("(min-width: 1024px)");

function closeCalendar() {
    dayCol.classList.remove("is-open");
    dayToggle.setAttribute("aria-expanded", "false");
}

dayToggle.addEventListener("click", () => {
    if (desktop.matches) return;
    const open = dayCol.classList.toggle("is-open");
    dayToggle.setAttribute("aria-expanded", String(open));
});

// ---------------------------------------------------------------------------
// Shared dialog behaviour: X button, backdrop click, Escape (native).
// ---------------------------------------------------------------------------

document.querySelectorAll("dialog.modal").forEach(dialog => {
    dialog.querySelector("[data-close]")?.addEventListener("click", () => dialog.close());
    // The dialog box itself is only hit outside its content, i.e. on the backdrop.
    dialog.addEventListener("click", (e) => {
        if (e.target === dialog) dialog.close();
    });
});

// ---------------------------------------------------------------------------
// Appointment detail modal
// The day endpoint returns slim rows (AppointmentRow), so the full record is
// fetched by id when a row is opened.
// ---------------------------------------------------------------------------

const detailDialog = document.getElementById("detail-dialog");
const detailTitle = document.getElementById("detail-title");
const detailRead = document.getElementById("detail-read");
const editForm = document.getElementById("edit-form");
const detailError = document.getElementById("detail-error");
const readLeft = document.getElementById("read-actions-left");
const readRight = document.getElementById("read-actions-right");
const editActions = document.getElementById("edit-actions");
const lightbox = document.getElementById("lightbox-dialog");
const lightboxImg = document.getElementById("lightbox-img");

let current = null; // full appointment currently shown in the modal

// The day list already holds full records, so opening one needs no request.
function openDetail(id) {
    current = state.rows.find(r => r.appointmentId === id);
    if (!current) return;
    showReadMode();
    detailDialog.showModal();
}

// Each pair sits in its own <div> so the grid can place label-over-value items,
// two across on phones; `wide` items take the whole row.
function addField(dl, label, value, wide = false) {
    const item = document.createElement("div");
    item.className = wide ? "detail-item is-wide" : "detail-item";
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    if (value instanceof Node) dd.appendChild(value);
    else dd.textContent = value || "—";
    item.append(dt, dd);
    dl.appendChild(item);
}

// Tap to call on a phone.
function phoneLink(number) {
    if (!number) return "";
    const link = document.createElement("a");
    link.href = `tel:${number}`;
    link.textContent = number;
    return link;
}

// hairImages is not in AppointmentFullDetailsResponse yet; this reads the entity's
// HairImage shape ({ imageUrl, publicId }) once the backend adds it.
function imageList(images) {
    if (!images?.length) return "Ninguna";
    const wrap = document.createElement("div");
    wrap.className = "thumbs";
    images.forEach((img, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "thumb";
        btn.setAttribute("aria-label", `Ver foto de referencia ${i + 1} en grande`);
        const el = document.createElement("img");
        el.src = img.imageUrl;
        el.alt = "";
        btn.appendChild(el);
        btn.addEventListener("click", () => {
            lightboxImg.src = img.imageUrl;
            lightbox.showModal();
        });
        wrap.appendChild(btn);
    });
    return wrap;
}

// Clicking the dark area around the photo also closes it (on phones the
// lightbox fills the screen, so there is no backdrop to click).
lightbox.querySelector(".lightbox-inner").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) lightbox.close();
});

function showReadMode() {
    const a = current;
    detailTitle.textContent = a.name;
    detailError.hidden = true;
    editFields.close();
    detailDialog.classList.remove("is-editing");

    const dl = document.createElement("dl");
    dl.className = "detail-list";
    // Most useful first: what and when, then how to reach her, then the record details.
    addField(dl, "Fecha", a.date ? formatLongDate(a.date) : "", true);
    addField(dl, "Hora de inicio", formatTime(a.startTime));
    addField(dl, "Hora de fin", formatTime(a.endTime));
    addField(dl, "Servicios", formatServices(a.serviceType), true);
    addField(dl, "Estado", statusPill(a.status));
    addField(dl, "Precio total", formatPrice(a.totalPrice));
    addField(dl, "Teléfono", phoneLink(a.phoneNumber));
    addField(dl, "Origen", SOURCE_LABELS[a.appointmentSource] ?? a.appointmentSource);
    addField(dl, "Notas adicionales", a.additionalNotes, true);
    addField(dl, "Fotos de referencia", imageList(a.hairImages), true);
    addField(dl, "Nombre", a.name);
    addField(dl, "Idioma", LANGUAGE_LABELS[a.language] ?? a.language);
    addField(dl, "Acepta SMS", a.smsConsent ? "Sí" : "No");
    addField(dl, "Recordatorio enviado", formatDateTime(a.reminderSentAt));
    addField(dl, "ID de la cita", a.appointmentId, true);
    detailRead.replaceChildren(dl);

    detailRead.hidden = false;
    editForm.hidden = true;
    readLeft.hidden = false;
    readRight.hidden = false;
    editActions.hidden = true;
}

function setDetailBusy(busy) {
    detailDialog.querySelectorAll(".modal-actions button").forEach(b => { b.disabled = busy; });
}

// ---------------------------------------------------------------------------
// Status actions
// ---------------------------------------------------------------------------

readLeft.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action; // "COMPLETED" | "NO_SHOW", the AdminAppointmentAction names

    setDetailBusy(true);
    try {
        // The backend reads the action as a request param, not a body.
        const res = await api(statusUrl(current.appointmentId, action), { method: "PATCH" });
        if (res.ok) {
            detailDialog.close();
            loadDay();
        } else if (res.status === 409) {
            showToast(`No se puede marcar como "${STATUS_LABELS[action]}": solo las citas reservadas o confirmadas pueden cambiar a ese estado.`);
        } else {
            showToast("No se pudo cambiar el estado. Inténtalo de nuevo.");
        }
    } catch (err) {
        if (!(err instanceof SessionExpiredError)) showToast(NETWORK_ERROR);
    } finally {
        setDetailBusy(false);
    }
});

// ---------------------------------------------------------------------------
// Delete, behind a confirmation dialog
// ---------------------------------------------------------------------------

const confirmDialog = document.getElementById("confirm-dialog");
const confirmYes = document.getElementById("confirm-yes");

document.getElementById("delete-btn").addEventListener("click", () => {
    document.getElementById("confirm-message").textContent =
        `La cita de ${current.name} quedará marcada como eliminada.`;
    confirmDialog.showModal();
});

document.getElementById("confirm-no").addEventListener("click", () => confirmDialog.close());

confirmYes.addEventListener("click", async () => {
    confirmYes.disabled = true;
    setDetailBusy(true);
    try {
        const res = await api(deleteUrl(current.appointmentId), { method: "DELETE" });
        confirmDialog.close();
        if (res.ok) {
            detailDialog.close();
            loadDay();
        } else {
            showToast("No se pudo eliminar la cita. Inténtalo de nuevo.");
        }
    } catch (err) {
        confirmDialog.close();
        if (!(err instanceof SessionExpiredError)) showToast(NETWORK_ERROR);
    } finally {
        confirmYes.disabled = false;
        setDetailBusy(false);
    }
});

// ---------------------------------------------------------------------------
// Edit mode: effectively a reschedule. Only date, start time and services can
// change; the end time is calculated by the backend from the services.
// ---------------------------------------------------------------------------

const editFields = createBookingFields(document.getElementById("edit-fields"), {
    idPrefix: "edit",
    request: api,
    getAppointmentId: () => current?.appointmentId ?? null,
    idleMessage: "Cambia la fecha, la hora o los servicios para revisar la disponibilidad."
});

function showEditMode() {
    editFields.set({
        date: current.date,
        startTime: current.startTime?.slice(0, 5),
        services: current.serviceType
    });

    detailDialog.classList.add("is-editing");
    detailError.hidden = true;
    detailRead.hidden = true;
    editForm.hidden = false;
    readLeft.hidden = true;
    readRight.hidden = true;
    editActions.hidden = false;
    editForm.querySelector(".service-checkbox")?.focus();
}

document.getElementById("edit-btn").addEventListener("click", showEditMode);
// Cancel throws the changes away; read mode re-renders from the untouched record.
document.getElementById("cancel-edit-btn").addEventListener("click", showReadMode);

editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const problem = editFields.missing();
    if (problem) return showDetailError(problem);

    const { date, startTime, services } = editFields.values();

    // AppointmentFullDetailsRequest: { services, date, startTime }. The backend
    // recalculates the end time.
    setDetailBusy(true);
    try {
        const id = current.appointmentId;
        const res = await api(editUrl(id), { method: "PATCH", json: { date, startTime, services } });
        if (res.ok) {
            // The appointment was on the selected day, so that day always changes.
            if (date === state.date) {
                // Still on this day: show the stored record (backend end time and price).
                await loadDay();
                current = state.rows.find(r => r.appointmentId === id) ?? current;
                showReadMode();
            } else {
                detailDialog.close();
                loadDay();
                showToast(`Cita movida al ${dayName(date)}.`, "success");
            }
        } else {
            const detail = await errorText(res);
            showDetailError(`No se pudieron guardar los cambios.${detail ? ` ${detail}` : ""} Tus cambios siguen aquí.`);
        }
    } catch (err) {
        if (!(err instanceof SessionExpiredError)) showDetailError(`${NETWORK_ERROR} Tus cambios siguen aquí.`);
    } finally {
        setDetailBusy(false);
    }
});

function showDetailError(message) {
    detailError.textContent = message;
    detailError.hidden = false;
}

detailDialog.addEventListener("close", () => editFields.close());

// ---------------------------------------------------------------------------
// New appointment modal (front desk: phone and walk-in bookings)
// ---------------------------------------------------------------------------

const newDialog = document.getElementById("new-dialog");
const newForm = document.getElementById("new-form");
const newError = document.getElementById("new-error");
const newSubmit = document.getElementById("new-submit");
const newFields = createBookingFields(document.getElementById("new-fields"), {
    idPrefix: "new",
    request: api
});

spanishValidity(newForm.elements.bookingType, () => "Elige el tipo de reserva.");
spanishValidity(newForm.elements.name, () => "Escribe el nombre del cliente.");

// Any change makes an earlier "missing field" message stale.
newForm.addEventListener("change", () => { newError.hidden = true; });
editForm.addEventListener("change", () => { detailError.hidden = true; });

document.getElementById("add-btn").addEventListener("click", () => newDialog.showModal());
newDialog.addEventListener("close", () => newFields.close());

function showNewError(message) {
    newError.textContent = message;
    newError.hidden = false;
}

newForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    newError.hidden = true;

    const problem = newFields.missing();
    if (problem) return showNewError(problem);

    const source = newForm.elements.bookingType.value; // "PHONE" | "WALK_IN"
    const name = newForm.elements.name.value.trim();
    const { date, startTime, services } = newFields.values(); // startTime is already HH:mm

    newSubmit.disabled = true;
    try {
        // AppointmentCreateAdminRequest. Answers 201 with no body.
        const res = await api(CREATE_URL, {
            method: "POST",
            json: { appointmentSource: source, name: `${name} (${NAME_SUFFIX[source]})`, services, date, startTime }
        });
        if (res.ok) {
            newDialog.close();
            newForm.reset();
            newFields.set();
            // Only the selected day needs a new fetch; another day just gets a note.
            if (date === state.date) loadDay();
            else showToast(`Cita agregada para el ${dayName(date)}.`, "success");
        } else {
            const detail = await errorText(res);
            showNewError(`No se pudo agregar la cita.${detail ? ` ${detail}` : ""} Revisa los datos e inténtalo de nuevo.`);
        }
    } catch (err) {
        if (!(err instanceof SessionExpiredError)) showNewError(NETWORK_ERROR);
    } finally {
        newSubmit.disabled = false;
    }
});

// ---------------------------------------------------------------------------
// Start on today's appointments
// ---------------------------------------------------------------------------

loadDay();
