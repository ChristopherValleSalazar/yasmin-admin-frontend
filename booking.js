// Shared booking behaviour for the admin panel: calendar setup, the services list,
// start time handling and the availability (overlap) check. Used by the new
// appointment modal and by edit mode, so neither duplicates this logic.
// Loaded as a classic script before panel-view.js; everything here is global.

// TODO: endpoint (availability / overlap check; the backend has no route for it yet)
const AVAILABILITY_URL = `${API_BASE_URL}/api/(placeholder)`;

// ---------------------------------------------------------------------------
// Spanish formatting. es-US gives Spanish month/day names with 12 hour time.
// ---------------------------------------------------------------------------

const LOCALE = "es-US";

// Spanish names exactly as the public booking form shows them (form.services.*
// in locales/es.json). Baby Highlight has no Spanish key there, so the public
// site falls back to the English name; it is kept the same here.
const SERVICE_LABELS = {
    HAIRCUT: "Corte de Cabello",
    BABY_HIGHLIGHT: "Baby Highlight",
    DYES: "Tintes",
    KERATIN_TREATMENT: "Tratamiento de Keratina",
    BLOW_DRYING: "Secado con Secadora",
    WASHING: "Lavado",
    TREATMENT_MOISTURIZING: "Tratamiento + Hidratación",
    HAIRCUT_BLOW_DRY: "Corte de Cabello + Secado con Secadora",
    COLOR_TOUCH_UP: "Retoque de Color",
    PERM: "Perm",
    BEARD_TRIM: "Recorte de Barba",
    EYEBROW_SHAPING: "Diseño de Cejas",
    HAIRCUT_BEARD_TRIM: "Corte de Cabello + Recorte de Barba",
    HAIRCUT_BEARD_TRIM_EYEBROW_SHAPING: "Corte de Cabello + Recorte de Barba + Diseño de Cejas"
};

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

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

function formatShortDate(iso) {
    return isoToLocalDate(iso).toLocaleDateString(LOCALE, { month: "short", day: "numeric", year: "numeric" });
}

function formatLongDate(iso) {
    return capitalize(isoToLocalDate(iso).toLocaleDateString(LOCALE,
        { weekday: "long", month: "long", day: "numeric", year: "numeric" }));
}

function formatTime(time) {
    if (!time) return "—";
    const [h, m] = time.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m);
    return d.toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit" });
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
    maxDate: salonMaxDate, // 30 days from the salon's today, same horizon as public booking
    allowInput: false,
    enableTime: false,
    dateFormat: "Y-m-d",
    disable: [
        date => date.getDay() === 1 // closed Mondays
    ]
};

// The Spanish locale is a separate CDN file (flatpickr/dist/l10n/es.js). If it
// did not load, flatpickr stays in English rather than failing.
function pickerLocale() {
    return window.flatpickr?.l10ns?.es ? "es" : "default";
}

// Wraps flatpickr, falling back to a native date input if the CDN script did not load.
//   inline: true  -> always-open calendar (the panel)
//   inline: false -> opens when the input is clicked (new appointment, edit mode)
function createDatePicker(input, { inline, defaultDate, onChange }) {
    if (typeof flatpickr === "function") {
        const fp = flatpickr(input, {
            ...PICKER_CONFIG,
            locale: pickerLocale(),
            inline,
            // static keeps the popup inside the <dialog>; appended to <body> it would
            // sit under the dialog's top layer and never be visible.
            static: !inline,
            altInput: !inline,
            altFormat: "l j \\d\\e F \\d\\e Y",
            defaultDate,
            onChange(selectedDates, dateStr) {
                if (dateStr) onChange?.(dateStr);
            },
            onOpen(selectedDates, dateStr, instance) {
                // Open upward when there is no room below (iPad landscape).
                const box = instance._input.getBoundingClientRect();
                const height = instance.calendarContainer.offsetHeight || 320;
                const flip = innerHeight - box.bottom < height + 12 && box.top > height + 12;
                instance.calendarContainer.classList.toggle("is-above", flip);
            }
        });

        // altInput hides the real input, so the <label for> has to point at the visible one.
        if (fp.altInput) {
            const id = input.id;
            input.removeAttribute("id");
            fp.altInput.id = id;
            fp.altInput.placeholder = "Selecciona una fecha";
        }

        return {
            value: () => fp.selectedDates.length ? toIso(fp.selectedDates[0]) : "",
            set: iso => fp.setDate(iso, false),
            clear: () => fp.clear(false),
            close: () => fp.close()
        };
    }

    input.type = "date";
    input.max = toIso(salonMaxDate);
    if (defaultDate) input.value = toIso(defaultDate);
    input.addEventListener("change", () => { if (input.value) onChange?.(input.value); });
    return {
        value: () => input.value,
        set: iso => { input.value = iso; },
        clear: () => { input.value = ""; },
        close: () => { }
    };
}

// ---------------------------------------------------------------------------
// Services list. Same options and two-service cap as the public booking page,
// shown as an always-visible list in its own fixed-height scroll box rather
// than a dropdown, so it never pushes the modal taller.
// ---------------------------------------------------------------------------

const MAX_SERVICES = 2;

function createServiceList(root, onChange) {
    const boxes = Array.from(root.querySelectorAll(".service-checkbox"));
    const count = root.querySelector(".service-count");

    const selected = () => boxes.filter(b => b.checked).map(b => b.value);

    // Prevent the third selection rather than validating it after the fact.
    function refresh() {
        const chosen = selected().length;
        const atCap = chosen >= MAX_SERVICES;
        boxes.forEach(box => {
            const off = atCap && !box.checked;
            box.disabled = off;
            box.parentElement.classList.toggle("is-disabled", off);
        });
        count.textContent = `${chosen} de ${MAX_SERVICES}`;
    }

    // Arrow keys move between the enabled options, as on the public site.
    root.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const enabled = boxes.filter(b => !b.disabled);
        const i = enabled.indexOf(e.target);
        if (i === -1) return;
        e.preventDefault();
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        enabled[(next + enabled.length) % enabled.length].focus();
    });

    root.addEventListener("change", () => {
        root.classList.remove("input-error");
        refresh();
        onChange?.(selected());
    });

    function set(values = []) {
        boxes.forEach(b => { b.checked = values.includes(b.value); });
        refresh();
    }

    refresh();
    return { selected, set };
}

// ---------------------------------------------------------------------------
// Booking fields = services + date + start time + availability panel, cloned
// from #booking-fields-template.
//
// Availability check rules:
//   - a new date clears the start time, forcing a conscious re-pick
//   - a start time pick or a services change fires the check
//   - it only runs when date, start time and at least one service are present
//   - the result is a warning only; saving is never blocked by it
//   - any failure but a 401 is retried once automatically, then a Reintentar
//     button appears; a 401 is handled by the request helper (logout + redirect)
// Request handling mirrors the public reschedule flow: 250ms debounce, a newer
// request aborts the older one, and a 10s timeout.
// ---------------------------------------------------------------------------

const ICON_CHECK = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>`;
const ICON_ALERT = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle>
    <line x1="12" y1="7.5" x2="12" y2="13"></line><line x1="12" y1="16.5" x2="12" y2="16.5"></line></svg>`;

const bookingTemplate = document.getElementById("booking-fields-template");

// Native validation bubbles follow the browser's language, which may not be
// Spanish; this gives a field (or a radio group) its own Spanish message.
function spanishValidity(inputs, message) {
    const list = inputs instanceof Element ? [inputs] : Array.from(inputs);
    const clear = () => list.forEach(i => i.setCustomValidity(""));
    list.forEach(input => {
        input.addEventListener("invalid", () => input.setCustomValidity(message(input)));
        input.addEventListener("input", clear);
        input.addEventListener("change", clear);
    });
}

function createBookingFields(slot, {
    idPrefix, request, getAppointmentId = () => null,
    idleMessage = "Elige servicios, fecha y hora de inicio para revisar la disponibilidad."
}) {
    slot.replaceChildren(bookingTemplate.content.cloneNode(true));

    const servicesRoot = slot.querySelector(".services-fieldset");
    const dateInput = slot.querySelector(".booking-date");
    const timeInput = slot.querySelector(".booking-time");
    const panel = slot.querySelector(".availability-panel");

    dateInput.id = `${idPrefix}-date`;
    timeInput.id = `${idPrefix}-time`;
    slot.querySelector(".booking-date-label").htmlFor = dateInput.id;
    slot.querySelector(".booking-time-label").htmlFor = timeInput.id;

    const services = createServiceList(servicesRoot, () => scheduleCheck());
    const datePicker = createDatePicker(dateInput, {
        inline: false,
        onChange: () => {
            // Deliberate: a new date always needs a new start time.
            timeInput.value = "";
            cancelCheck();
            renderState("info", "Elige una nueva hora de inicio para este día.");
        }
    });
    timeInput.addEventListener("change", () => scheduleCheck());
    spanishValidity(timeInput, () => "Usa una hora en intervalos de 5 minutos.");

    let checkTimer;
    let checkController;

    function values() {
        return { date: datePicker.value(), startTime: timeInput.value, services: services.selected() };
    }

    function cancelCheck() {
        clearTimeout(checkTimer);
        checkController?.abort();
    }

    function renderState(kind, message, extra) {
        panel.className = `availability-panel is-${kind}`;
        panel.replaceChildren();

        const row = document.createElement("div");
        row.className = "availability-row";
        if (kind === "loading") {
            row.insertAdjacentHTML("beforeend", `<span class="spinner" aria-hidden="true"></span>`);
        } else if (kind === "ok") {
            row.insertAdjacentHTML("beforeend", ICON_CHECK);
        } else if (kind !== "idle") {
            row.insertAdjacentHTML("beforeend", ICON_ALERT);
        }
        const text = document.createElement("p");
        text.textContent = message;
        row.appendChild(text);
        panel.appendChild(row);
        if (extra) panel.appendChild(extra);
    }

    function scheduleCheck() {
        cancelCheck();
        const { date, startTime, services: chosen } = values();

        if (chosen.length === 0) {
            renderState("warning", "Elige al menos un servicio para revisar la disponibilidad.");
            return;
        }
        if (!date || !startTime) {
            renderState("idle", "Elige fecha y hora de inicio para revisar la disponibilidad.");
            return;
        }

        renderState("loading", "Revisando disponibilidad…");
        checkTimer = setTimeout(() => runCheck({ autoRetry: true }), 250);
    }

    async function runCheck({ autoRetry }) {
        checkController?.abort();
        const controller = new AbortController();
        checkController = controller;
        renderState("loading", "Revisando disponibilidad…");

        const { date, startTime, services: chosen } = values();
        // appointmentId lets the backend leave the appointment being edited out of
        // its own overlap check; it is null for a new appointment.
        const body = { date, startTime, services: chosen, appointmentId: getAppointmentId() };

        const attempts = autoRetry ? 2 : 1;
        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                const res = await request(AVAILABILITY_URL, {
                    method: "POST",
                    json: body,
                    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)])
                });
                if (res.ok) {
                    renderResult(await res.json());
                    return;
                }
            } catch (err) {
                // Expired session: the request helper is already logging her out.
                if (err.name === "SessionExpiredError") return;
            }
            if (controller.signal.aborted) return; // superseded by a newer pick
        }
        renderFailed();
    }

    // Expected response: { overlaps: boolean, conflicts: [{ appointmentId, services: [...] }] }
    function renderResult(result) {
        const conflicts = result.conflicts ?? [];
        if (!result.overlaps || conflicts.length === 0) {
            renderState("ok", "Horario libre: no se cruza con ninguna otra cita.");
            return;
        }

        const list = document.createElement("ul");
        list.className = "conflict-list";
        for (const c of conflicts) {
            const li = document.createElement("li");
            const services = document.createElement("strong");
            services.textContent = formatServices(c.services);
            const id = document.createElement("span");
            id.className = "conflict-id";
            id.textContent = `Cita ${c.appointmentId}`;
            li.append(services, id);
            list.appendChild(li);
        }
        const note = document.createElement("p");
        note.className = "availability-note";
        note.textContent = "Es solo un aviso: puedes guardar de todos modos.";

        const extra = document.createDocumentFragment();
        extra.append(list, note);
        renderState("conflict",
            conflicts.length === 1 ? "Este horario se cruza con otra cita:" : "Este horario se cruza con otras citas:",
            extra);
    }

    function renderFailed() {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "btn btn-secondary btn-retry";
        retry.textContent = "Reintentar";
        retry.addEventListener("click", () => runCheck({ autoRetry: false }));
        renderState("error", "No se pudo revisar la disponibilidad.", retry);
    }

    // Fill the fields without firing a check (opening edit mode, resetting).
    function set({ date = "", startTime = "", services: chosen = [] } = {}) {
        cancelCheck();
        if (date) datePicker.set(date); else datePicker.clear();
        timeInput.value = startTime;
        services.set(chosen);
        renderState("idle", idleMessage);
    }

    // Returns a Spanish message for the first missing field, or "" when complete.
    function missing() {
        const v = values();
        if (v.services.length === 0) {
            servicesRoot.classList.add("input-error");
            return "Elige al menos un servicio.";
        }
        if (!v.date) return "Elige una fecha.";
        if (!v.startTime) return "Elige una hora de inicio.";
        return "";
    }

    set();
    return { values, set, missing, close: () => { cancelCheck(); datePicker.close(); } };
}
