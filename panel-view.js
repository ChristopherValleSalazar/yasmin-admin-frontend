// Admin panel: daily appointment table, detail/edit modal, image lightbox and the
// front desk "new appointment" form. Every request goes through api() below.
// Calendar, services, start time and the availability check live in booking.js.

const PAGE_SIZE = 7;
const DAY_URL = `${API_BASE_URL}/api/v1/admin/appointments/day`;
const appointmentUrl = id => `${API_BASE_URL}/api/v1/admin/appointments/${encodeURIComponent(id)}`;
// TODO: endpoint (the backend has no admin create endpoint yet)
const CREATE_URL = `${API_BASE_URL}/api/(placeholder)`;

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

const toast = document.getElementById("toast");
const toastText = document.getElementById("toast-text");
let toastTimer;

function showToast(message) {
    clearTimeout(toastTimer);
    toastText.textContent = message;
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

// Error text from the backend's { type, error } shape, when it sent one.
async function errorText(res) {
    try { return (await res.json()).error ?? ""; } catch { return ""; }
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

// Row colour: deleted and rescheduled come from the status; overlapping comes from
// the row's overlap flag (not in AppointmentRow yet; the mock sends `overlapping`).
function rowState(row) {
    if (row.status === "DELETED") return "deleted";
    if (row.status === "RESCHEDULED") return "rescheduled";
    if (row.overlapping) return "overlapping";
    return "normal";
}

// ---------------------------------------------------------------------------
// Daily table + pagination
// ---------------------------------------------------------------------------

const rowsBody = document.getElementById("apt-rows");
const tableArea = document.getElementById("table-area");
const table = document.getElementById("apt-table");
const emptyState = document.getElementById("empty-state");
const tableDay = document.getElementById("table-day");
const pageInfo = document.getElementById("page-info");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");

const state = {
    date: toIso(today),
    page: 0,
    totalPages: 0
};

// Only the newest request may render, so fast date clicks cannot show a stale day.
let loadSeq = 0;

async function loadPage() {
    const seq = ++loadSeq;
    const params = new URLSearchParams({ date: state.date, page: state.page, size: PAGE_SIZE });
    tableDay.textContent = formatLongDate(state.date);
    tableArea.setAttribute("aria-busy", "true");

    try {
        const res = await api(`${DAY_URL}?${params}`);
        if (seq !== loadSeq) return;
        if (!res.ok) {
            showToast("No se pudieron cargar las citas. Actualiza la página e inténtalo de nuevo.");
            return;
        }
        const data = await res.json();
        if (seq !== loadSeq) return;

        state.totalPages = data.totalPages ?? 0;
        state.page = data.number ?? state.page;

        // A change can empty the last page; step back one.
        if (data.content.length === 0 && state.page > 0 && state.page >= state.totalPages) {
            state.page = Math.max(state.totalPages - 1, 0);
            return loadPage();
        }

        renderRows(data.content);
    } catch (err) {
        if (err instanceof SessionExpiredError || seq !== loadSeq) return;
        showToast(NETWORK_ERROR);
    } finally {
        if (seq === loadSeq) tableArea.setAttribute("aria-busy", "false");
    }
}

function renderRows(rows) {
    rowsBody.replaceChildren();
    const empty = rows.length === 0;
    emptyState.hidden = !empty;
    table.classList.toggle("is-empty", empty);

    // The row DTO has no date; every row belongs to the day that was requested.
    const dateText = formatShortDate(state.date);

    for (const row of rows) {
        const tr = document.createElement("tr");
        const rs = rowState(row);
        tr.tabIndex = 0;
        tr.dataset.id = row.appointmentId;
        tr.className = `row-${rs}`;
        // Overlap has no status word, so screen readers get it in the row label.
        const overlapNote = rs === "overlapping" ? ", se cruza con otra cita" : "";
        tr.setAttribute("aria-label",
            `${row.name}, ${formatTime(row.startTime)}, ${STATUS_LABELS[row.status] ?? row.status}${overlapNote}. Abrir detalles`);

        const cells = [row.name, dateText, formatTime(row.startTime), formatServices(row.serviceType)];
        for (const text of cells) {
            const td = document.createElement("td");
            td.textContent = text;
            tr.appendChild(td);
        }
        const statusTd = document.createElement("td");
        statusTd.appendChild(statusPill(row.status));
        tr.appendChild(statusTd);

        rowsBody.appendChild(tr);
    }

    const total = Math.max(state.totalPages, 1);
    pageInfo.textContent = `Página ${state.page + 1} de ${total}`;
    prevBtn.disabled = state.page <= 0;
    nextBtn.disabled = state.page >= total - 1;
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

prevBtn.addEventListener("click", () => {
    if (state.page <= 0) return;
    state.page--;
    loadPage();
});

nextBtn.addEventListener("click", () => {
    if (state.page >= state.totalPages - 1) return;
    state.page++;
    loadPage();
});

createDatePicker(document.getElementById("panel-date"), {
    inline: true,
    defaultDate: today,
    onChange(iso) {
        state.date = iso;
        state.page = 0; // a new day always starts on page one
        loadPage();
    }
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

async function fetchDetail(id) {
    const res = await api(appointmentUrl(id));
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
}

async function openDetail(id) {
    try {
        current = await fetchDetail(id);
        showReadMode();
        detailDialog.showModal();
    } catch (err) {
        if (!(err instanceof SessionExpiredError)) showToast("No se pudo cargar esta cita. Inténtalo de nuevo.");
    }
}

function addField(dl, label, value) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    if (value instanceof Node) dd.appendChild(value);
    else dd.textContent = value || "—";
    dl.append(dt, dd);
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
    addField(dl, "Nombre", a.name);
    addField(dl, "Teléfono", a.phoneNumber);
    addField(dl, "Idioma", LANGUAGE_LABELS[a.language] ?? a.language);
    addField(dl, "Fecha", a.date ? formatLongDate(a.date) : "");
    addField(dl, "Hora de inicio", formatTime(a.startTime));
    addField(dl, "Hora de fin", formatTime(a.endTime));
    addField(dl, "Servicios", formatServices(a.serviceType));
    addField(dl, "Estado", statusPill(a.status));
    addField(dl, "Notas adicionales", a.additionalNotes);
    addField(dl, "Acepta SMS", a.smsConsent ? "Sí" : "No");
    addField(dl, "Recordatorio enviado", formatDateTime(a.reminderSentAt));
    addField(dl, "Código de la cita", a.viewCode);
    addField(dl, "ID de la cita", a.appointmentId);
    addField(dl, "Fotos de referencia", imageList(a.hairImages));
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
        const res = await api(`${appointmentUrl(current.appointmentId)}/status?action=${action}`, { method: "PATCH" });
        if (res.ok) {
            detailDialog.close();
            loadPage();
        } else if (res.status === 409) {
            showToast(`No se puede marcar como "${STATUS_LABELS[action]}": solo las citas confirmadas pueden cambiar a ese estado.`);
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
        const res = await api(appointmentUrl(current.appointmentId), { method: "DELETE" });
        confirmDialog.close();
        if (res.ok) {
            detailDialog.close();
            loadPage();
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

    // Note: the backend's edit endpoint currently binds only name, phoneNumber,
    // language and status, and has no @RequestBody yet, so it needs updating to
    // accept this reschedule body.
    setDetailBusy(true);
    try {
        const res = await api(appointmentUrl(current.appointmentId), {
            method: "PATCH",
            json: { date, startTime, services }
        });
        if (res.ok) {
            // Refetch so the read view shows the end time the backend recalculated.
            current = await fetchDetail(current.appointmentId);
            showReadMode();
            loadPage();
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

    const type = newForm.elements.bookingType.value;
    const name = newForm.elements.name.value.trim();
    const { date, startTime, services } = newFields.values(); // startTime is already HH:mm

    newSubmit.disabled = true;
    try {
        const res = await api(CREATE_URL, {
            method: "POST",
            json: { name: `${name} (${type})`, date, startTime, services }
        });
        if (res.ok) {
            newDialog.close();
            newForm.reset();
            newFields.set();
            loadPage(); // the panel's selected day, not the new appointment's
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

loadPage();
