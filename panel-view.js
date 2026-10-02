// Admin panel: daily appointment table, detail/edit modal, image lightbox and the
// front desk "new appointment" form. Every request goes through api() below.

const PAGE_SIZE = 7;
const DAY_URL = `${API_BASE_URL}/api/v1/admin/appointments/day`;
const appointmentUrl = id => `${API_BASE_URL}/api/v1/admin/appointments/${encodeURIComponent(id)}`;
// TODO: endpoint (the backend has no admin create endpoint yet)
const CREATE_URL = `${API_BASE_URL}/api/(placeholder)`;

// ---------------------------------------------------------------------------
// Fetch helper: every panel request uses it, so the 401 rule lives in one place.
// After logging back in, login.js always lands on this page again.
// ---------------------------------------------------------------------------

class SessionExpiredError extends Error { }

async function api(url, { json, ...options } = {}) {
    const init = { credentials: "include", ...options };
    if (json !== undefined) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(json);
    }

    const res = await fetch(url, init);
    if (res.status === 401) {
        window.location.href = "login.html";
        throw new SessionExpiredError();
    }
    return res;
}

// Error text from the backend's { type, error } shape, when it sent one.
async function errorText(res) {
    try { return (await res.json()).error ?? ""; } catch { return ""; }
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

const toast = document.getElementById("toast");
let toastTimer;

function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    // Re-showing moves it to the top of the top layer, above whichever dialog is open.
    if (toast.matches(":popover-open")) toast.hidePopover();
    toast.showPopover();
    toastTimer = setTimeout(() => toast.hidePopover(), 5000);
}

// ---------------------------------------------------------------------------
// Formatting. The backend sends raw ISO values only (no display strings), so the
// display text is built here; the raw values are kept for all logic.
// ---------------------------------------------------------------------------

const SERVICE_LABELS = {
    HAIRCUT: "Haircut",
    BABY_HIGHLIGHT: "Baby Highlight",
    DYES: "Dyes",
    KERATIN_TREATMENT: "Keratin Treatment",
    BLOW_DRYING: "Blow Drying",
    WASHING: "Washing",
    TREATMENT_MOISTURIZING: "Treatment Moisturizing",
    HAIRCUT_BLOW_DRY: "Haircut Blow Dry",
    COLOR_TOUCH_UP: "Color Touch Up",
    PERM: "Perm",
    BEARD_TRIM: "Beard Trim",
    EYEBROW_SHAPING: "Eyebrow Shaping",
    HAIRCUT_BEARD_TRIM: "Haircut Beard Trim",
    HAIRCUT_BEARD_TRIM_EYEBROW_SHAPING: "Haircut Beard Trim Eyebrow Shaping"
};

const STATUS_LABELS = {
    BOOKED: "Booked",
    CONFIRMED: "Confirmed",
    CANCELED: "Canceled",
    RESCHEDULED: "Rescheduled",
    COMPLETED: "Completed",
    NO_SHOW: "No show",
    DELETED: "Deleted"
};

const LANGUAGE_LABELS = { EN: "English", ES: "Spanish" };

function formatServices(services) {
    return (services ?? []).map(s => SERVICE_LABELS[s] ?? s).join(", ");
}

// Built from the parts so the date is never shifted by a UTC parse.
function isoToLocalDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function toIso(date) {
    const p = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function formatShortDate(iso) {
    return isoToLocalDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatLongDate(iso) {
    return isoToLocalDate(iso).toLocaleDateString("en-US",
        { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatTime(time) {
    if (!time) return "—";
    const [h, m] = time.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m);
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(value) {
    if (!value) return "Not sent";
    const [date, time] = value.split("T");
    return `${formatShortDate(date)}, ${formatTime(time)}`;
}

function statusPill(status) {
    const pill = document.createElement("span");
    pill.className = `status-pill status-${status.toLowerCase()}`;
    pill.textContent = STATUS_LABELS[status] ?? status;
    return pill;
}

// ---------------------------------------------------------------------------
// Calendar. Same flatpickr settings as the public booking page, except past
// dates are allowed: minDate and the "today after closing" rule are removed so
// the owner can look back.
// ---------------------------------------------------------------------------

const SALON_TZ = "America/Los_Angeles";

function salonToday() {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: SALON_TZ, year: "numeric", month: "numeric", day: "numeric"
    }).formatToParts(new Date());
    const v = Object.fromEntries(parts.filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
    return new Date(v.year, v.month - 1, v.day);
}

const today = salonToday();
const salonMaxDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);

const PICKER_CONFIG = {
    inline: true,
    maxDate: salonMaxDate, // 30 days from the salon's today, same horizon as public booking
    allowInput: false,
    enableTime: false,
    dateFormat: "Y-m-d",
    disable: [
        date => date.getDay() === 1 // closed Mondays
    ]
};

// Wraps flatpickr, falling back to a native date input if the CDN script did not load.
function createDatePicker(input, { defaultDate, onChange }) {
    if (typeof flatpickr === "function") {
        const fp = flatpickr(input, {
            ...PICKER_CONFIG,
            defaultDate,
            onChange(selectedDates, dateStr) {
                if (dateStr) onChange?.(dateStr);
            }
        });
        return {
            value: () => fp.selectedDates.length ? toIso(fp.selectedDates[0]) : "",
            set: iso => fp.setDate(iso, false),
            clear: () => fp.clear(false)
        };
    }

    input.type = "date";
    input.max = toIso(salonMaxDate);
    if (defaultDate) input.value = toIso(defaultDate);
    input.addEventListener("change", () => { if (input.value) onChange?.(input.value); });
    return {
        value: () => input.value,
        set: iso => { input.value = iso; },
        clear: () => { input.value = ""; }
    };
}

// ---------------------------------------------------------------------------
// Services picker. Behaviour copied from the public booking page (button +
// checkbox panel, two-service cap, arrow keys, Escape and outside click close);
// wrapped in a factory because this page needs more than one instance.
// ---------------------------------------------------------------------------

const MAX_SERVICES = 2;
const pickerTemplate = document.getElementById("service-picker-template");

function createServicePicker(slot, idPrefix) {
    slot.replaceChildren(pickerTemplate.content.cloneNode(true));

    const root = slot.querySelector(".service-select");
    const trigger = root.querySelector(".service-trigger");
    const panel = root.querySelector(".service-panel");
    const boxes = Array.from(panel.querySelectorAll(".service-checkbox"));

    trigger.id = `${idPrefix}-trigger`;
    panel.id = `${idPrefix}-panel`;
    trigger.setAttribute("aria-controls", panel.id);
    panel.setAttribute("aria-labelledby", trigger.id);

    const selected = () => boxes.filter(b => b.checked).map(b => b.value);

    function render() {
        const chosen = selected();
        trigger.textContent = chosen.length ? formatServices(chosen) : "Select up to 2 services";
        trigger.classList.toggle("is-placeholder", chosen.length === 0);
    }

    // Prevent the third selection rather than validating it after the fact.
    function applyCap() {
        const atCap = selected().length >= MAX_SERVICES;
        boxes.forEach(box => {
            const off = atCap && !box.checked;
            box.disabled = off;
            box.parentElement.classList.toggle("is-disabled", off);
        });
    }

    const firstEnabled = () => boxes.find(b => !b.disabled) ?? boxes[0];
    const isOpen = () => panel.classList.contains("show");

    function open({ focusFirst = false } = {}) {
        panel.classList.add("show");
        trigger.setAttribute("aria-expanded", "true");
        if (focusFirst) firstEnabled()?.focus();
    }

    function close({ focusTrigger = false } = {}) {
        panel.classList.remove("show");
        trigger.setAttribute("aria-expanded", "false");
        if (focusTrigger) trigger.focus();
    }

    trigger.addEventListener("click", (e) => {
        if (isOpen()) return close();
        // detail === 0 means Enter or Space rather than a pointer.
        open({ focusFirst: e.detail === 0 });
    });

    trigger.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowDown") return;
        e.preventDefault();
        if (!isOpen()) open({ focusFirst: true });
        else firstEnabled()?.focus();
    });

    panel.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const enabled = boxes.filter(b => !b.disabled);
        const i = enabled.indexOf(e.target);
        if (i === -1) return;
        e.preventDefault();
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        enabled[(next + enabled.length) % enabled.length].focus();
    });

    // Escape closes the panel only, not the dialog around it.
    root.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && isOpen()) {
            e.preventDefault();
            e.stopPropagation();
            close({ focusTrigger: true });
        }
    });

    document.addEventListener("click", (e) => {
        if (!root.contains(e.target)) close();
    });

    panel.addEventListener("change", () => {
        trigger.classList.remove("input-error");
        applyCap();
        render();
    });

    function set(values = []) {
        boxes.forEach(b => { b.checked = values.includes(b.value); });
        applyCap();
        render();
    }

    return { selected, set, close, trigger };
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
            showToast("Could not load appointments. Please refresh and try again.");
            return;
        }
        const data = await res.json();
        if (seq !== loadSeq) return;

        state.totalPages = data.totalPages ?? 0;
        state.page = data.number ?? state.page;

        // A delete or status change can empty the last page; step back one.
        if (data.content.length === 0 && state.page > 0 && state.page >= state.totalPages) {
            state.page = Math.max(state.totalPages - 1, 0);
            return loadPage();
        }

        renderRows(data.content);
    } catch (err) {
        if (err instanceof SessionExpiredError || seq !== loadSeq) return;
        showToast("Could not reach the server. Please try again.");
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
        tr.tabIndex = 0;
        tr.dataset.id = row.appointmentId;
        tr.setAttribute("aria-label", `${row.name}, ${formatTime(row.startTime)}. Open details`);

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
    pageInfo.textContent = `Page ${state.page + 1} of ${total}`;
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
    dialog.querySelector("[data-close]").addEventListener("click", () => dialog.close());
    // The dialog box itself is only hit outside .modal-inner, i.e. on the backdrop.
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

async function openDetail(id) {
    try {
        const res = await api(appointmentUrl(id));
        if (!res.ok) {
            showToast("Could not load this appointment. Please try again.");
            return;
        }
        current = await res.json();
        showReadMode();
        detailDialog.showModal();
    } catch (err) {
        if (!(err instanceof SessionExpiredError)) showToast("Could not reach the server. Please try again.");
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
    if (!images?.length) return "None";
    const wrap = document.createElement("div");
    wrap.className = "thumbs";
    images.forEach((img, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "thumb";
        btn.setAttribute("aria-label", `View reference photo ${i + 1} large`);
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

function showReadMode() {
    const a = current;
    detailTitle.textContent = a.name;
    detailError.hidden = true;

    const dl = document.createElement("dl");
    dl.className = "detail-list";
    addField(dl, "Name", a.name);
    addField(dl, "Phone", a.phoneNumber);
    addField(dl, "Language", LANGUAGE_LABELS[a.language] ?? a.language);
    addField(dl, "Date", a.date ? formatLongDate(a.date) : "");
    addField(dl, "Start time", formatTime(a.startTime));
    addField(dl, "End time", formatTime(a.endTime));
    addField(dl, "Services", formatServices(a.serviceType));
    addField(dl, "Status", statusPill(a.status));
    addField(dl, "Additional notes", a.additionalNotes);
    addField(dl, "SMS consent", a.smsConsent ? "Yes" : "No");
    addField(dl, "Reminder sent", formatDateTime(a.reminderSentAt));
    addField(dl, "View code", a.viewCode);
    addField(dl, "Appointment ID", a.appointmentId);
    addField(dl, "Reference photos", imageList(a.hairImages));
    detailRead.replaceChildren(dl);

    detailRead.hidden = false;
    editForm.hidden = true;
    readLeft.hidden = false;
    readRight.hidden = false;
    editActions.hidden = true;
}

// ---------------------------------------------------------------------------
// Status actions, delete
// ---------------------------------------------------------------------------

function setDetailBusy(busy) {
    detailDialog.querySelectorAll(".modal-actions button").forEach(b => { b.disabled = busy; });
}

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
            showToast(`Can't mark as ${STATUS_LABELS[action].toLowerCase()}: only confirmed appointments can change to that status.`);
        } else {
            showToast("Could not update the status. Please try again.");
        }
    } catch (err) {
        if (!(err instanceof SessionExpiredError)) showToast("Could not reach the server. Please try again.");
    } finally {
        setDetailBusy(false);
    }
});

document.getElementById("delete-btn").addEventListener("click", async () => {
    if (!confirm(`Delete the appointment for ${current.name}? This cannot be undone from the panel.`)) return;

    setDetailBusy(true);
    try {
        const res = await api(appointmentUrl(current.appointmentId), { method: "DELETE" });
        if (res.ok) {
            detailDialog.close();
            loadPage();
        } else {
            showToast("Could not delete the appointment. Please try again.");
        }
    } catch (err) {
        if (!(err instanceof SessionExpiredError)) showToast("Could not reach the server. Please try again.");
    } finally {
        setDetailBusy(false);
    }
});

// ---------------------------------------------------------------------------
// Edit mode. Every field is editable except the id (it is the record's key) and
// the photos (view only; uploads are out of scope for this prototype).
// Dates use the native date input here to keep the modal compact.
// ---------------------------------------------------------------------------

// One picker for edit mode, created once and moved into the form each time.
const editServicesSlot = document.createElement("div");
const editServices = createServicePicker(editServicesSlot, "edit-services");

function editInput(label, name, type, value, extra = {}) {
    const id = `edit-${name}`;
    const lab = document.createElement("label");
    lab.htmlFor = id;
    lab.textContent = label;

    let input;
    if (type === "select") {
        input = document.createElement("select");
        for (const [val, text] of Object.entries(extra.options)) {
            input.add(new Option(text, val, false, val === value));
        }
    } else if (type === "textarea") {
        input = document.createElement("textarea");
        input.rows = 3;
        input.maxLength = 1000;
        input.value = value ?? "";
    } else {
        input = document.createElement("input");
        input.type = type;
        if (type === "checkbox") input.checked = !!value;
        else input.value = value ?? "";
        if (extra.step) input.step = extra.step;
    }
    input.id = id;
    input.name = name;

    const field = document.createElement("div");
    field.className = type === "checkbox" ? "edit-field edit-field-check" : "edit-field";
    if (type === "checkbox") field.append(input, lab);
    else field.append(lab, input);
    editForm.appendChild(field);
}

function showEditMode() {
    const a = current;
    editForm.replaceChildren();

    editInput("Name", "name", "text", a.name);
    editInput("Phone", "phoneNumber", "tel", a.phoneNumber);
    editInput("Language", "language", "select", a.language, { options: LANGUAGE_LABELS });
    editInput("Date", "date", "date", a.date);
    editInput("Start time", "startTime", "time", a.startTime?.slice(0, 5), { step: 300 });
    editInput("End time", "endTime", "time", a.endTime?.slice(0, 5), { step: 300 });

    const servicesField = document.createElement("div");
    servicesField.className = "edit-field";
    const servicesLabel = document.createElement("label");
    servicesLabel.htmlFor = "edit-services-trigger";
    servicesLabel.textContent = "Services";
    servicesField.append(servicesLabel, editServicesSlot);
    editForm.appendChild(servicesField);
    editServices.close();
    editServices.set(a.serviceType);

    editInput("Status", "status", "select", a.status, { options: STATUS_LABELS });
    editInput("Additional notes", "additionalNotes", "textarea", a.additionalNotes);
    editInput("Reminder sent", "reminderSentAt", "datetime-local", a.reminderSentAt?.slice(0, 16), { step: 60 });
    editInput("View code", "viewCode", "text", a.viewCode);
    editInput("SMS consent", "smsConsent", "checkbox", a.smsConsent);

    detailError.hidden = true;
    detailRead.hidden = true;
    editForm.hidden = false;
    readLeft.hidden = true;
    readRight.hidden = true;
    editActions.hidden = false;
    editForm.querySelector("input")?.focus();
}

document.getElementById("edit-btn").addEventListener("click", showEditMode);
// Cancel throws the form away; read mode re-renders from the untouched record.
document.getElementById("cancel-edit-btn").addEventListener("click", showReadMode);

editForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = editForm.elements;
    const services = editServices.selected();

    if (!f.name.value.trim() || services.length === 0) {
        showDetailError("Name and at least one service are required.");
        return;
    }

    // Full record in the response's field names. Note: the backend's edit endpoint
    // currently binds only name, phoneNumber, language and status, and has no
    // @RequestBody yet, so it needs updating to accept this JSON.
    const payload = {
        name: f.name.value.trim(),
        phoneNumber: f.phoneNumber.value.trim(),
        language: f.language.value,
        date: f.date.value,
        startTime: f.startTime.value,
        endTime: f.endTime.value,
        serviceType: services,
        status: f.status.value,
        additionalNotes: f.additionalNotes.value,
        reminderSentAt: f.reminderSentAt.value || null,
        viewCode: f.viewCode.value.trim(),
        smsConsent: f.smsConsent.checked
    };

    setDetailBusy(true);
    try {
        const res = await api(appointmentUrl(current.appointmentId), { method: "PATCH", json: payload });
        if (res.ok) {
            current = { ...current, ...payload };
            showReadMode();
            loadPage();
        } else {
            const detail = await errorText(res);
            showDetailError(`Could not save the changes.${detail ? ` ${detail}` : ""} Your edits are still here.`);
        }
    } catch (err) {
        if (!(err instanceof SessionExpiredError)) showDetailError("Could not reach the server. Your edits are still here.");
    } finally {
        setDetailBusy(false);
    }
});

function showDetailError(message) {
    detailError.textContent = message;
    detailError.hidden = false;
}

// ---------------------------------------------------------------------------
// New appointment modal (front desk: phone and walk-in bookings)
// ---------------------------------------------------------------------------

const newDialog = document.getElementById("new-dialog");
const newForm = document.getElementById("new-form");
const newError = document.getElementById("new-error");
const newSubmit = document.getElementById("new-submit");
const newServices = createServicePicker(document.getElementById("new-services"), "new-services");
const newDatePicker = createDatePicker(document.getElementById("new-date"), {
    onChange: () => { newError.hidden = true; }
});

document.getElementById("add-btn").addEventListener("click", () => {
    // Simplest default: the day the owner is looking at. Kept if already chosen.
    if (!newDatePicker.value()) newDatePicker.set(state.date);
    newDialog.showModal();
});

function showNewError(message) {
    newError.textContent = message;
    newError.hidden = false;
}

newForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    newError.hidden = true;

    const type = newForm.elements.bookingType.value;
    const name = newForm.elements.name.value.trim();
    const date = newDatePicker.value();
    const startTime = newForm.elements.time.value; // already HH:mm
    const services = newServices.selected();

    if (!date) return showNewError("Pick a date.");
    if (services.length === 0) {
        newServices.trigger.classList.add("input-error");
        return showNewError("Select at least one service.");
    }

    newSubmit.disabled = true;
    try {
        const res = await api(CREATE_URL, {
            method: "POST",
            json: { name: `${name} (${type})`, date, startTime, services }
        });
        if (res.ok) {
            newDialog.close();
            newForm.reset();
            newServices.set([]);
            newDatePicker.clear();
            loadPage(); // the panel's selected day, not the new appointment's
        } else {
            const detail = await errorText(res);
            showNewError(`Could not add the appointment.${detail ? ` ${detail}` : ""} Check the details and try again.`);
        }
    } catch (err) {
        if (!(err instanceof SessionExpiredError)) showNewError("Could not reach the server. Please try again.");
    } finally {
        newSubmit.disabled = false;
    }
});

// ---------------------------------------------------------------------------
// Start on today's appointments
// ---------------------------------------------------------------------------

loadPage();
