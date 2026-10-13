// MOCKS, currently OFF: the panel talks to the real backend. Set USE_MOCKS to true to
// work on the UI without a backend; this file then answers every API call the admin
// pages make, with the same routes and shapes as the backend's dev/build/mac branch.
// To remove it for good, delete the <script src="mock.js"> tags from login.html and
// panel-view.html, this file and mock-images/. Nothing else depends on them.
//
// Test hooks:
//   login        admin@yasminbeauty.salon / admin123 succeeds, anything else is a 401
// Shapes follow the backend's dev/build/mac branch (AdminController).
//   panel        today has 10 appointments, tomorrow 3, yesterday 4,
//                every other day is empty
//   row states   today has an overlapping pair (Ana + Luis), one rescheduled
//                (Valeria) and one deleted (Daniela) appointment
//   status       only BOOKED or CONFIRMED appointments accept Completada / No asistió (else 409),
//                same rule as AdminService.setAppointmentStatus
//   check        Camila Reyes' availability check fails twice, then succeeds:
//                edit her, pick a time, watch the auto-retry, then press Reintentar
//   edit/create  a Monday or a slot past closing returns a 400, like validateBusinessHours;
//                a new appointment whose name contains "error" also returns a 400
//   401          open panel-view.html?mock401 to see the session expiry redirect

const USE_MOCKS = false;

(() => {
    if (!USE_MOCKS) return;

    const realFetch = window.fetch.bind(window);
    const LATENCY_MS = 450;
    const sessionExpired = new URLSearchParams(location.search).has("mock401");
    const MOCK_EMAIL = "admin@yasminbeauty.salon";
    const MOCK_PASSWORD = "admin123";

    // Dates relative to the salon's today so the data always lines up with the calendar.
    function salonIso(offsetDays) {
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
        now.setDate(now.getDate() + offsetDays);
        const p = n => String(n).padStart(2, "0");
        return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
    }

    // Same durations and prices as the backend's ServiceType enum (dev/build/mac)
    const DURATIONS = {
        HAIRCUT: 60, BABY_HIGHLIGHT: 240, DYES: 180, KERATIN_TREATMENT: 90, BLOW_DRYING: 60,
        WASHING: 30, TREATMENT_MOISTURIZING: 90, HAIRCUT_BLOW_DRY: 90, COLOR_TOUCH_UP: 90,
        PERM: 120, BEARD_TRIM: 30, EYEBROW_SHAPING: 30, HAIRCUT_BEARD_TRIM: 60,
        HAIRCUT_BEARD_TRIM_EYEBROW_SHAPING: 90
    };
    const PRICES = {
        HAIRCUT: 25, BABY_HIGHLIGHT: 180, DYES: 80, KERATIN_TREATMENT: 50, BLOW_DRYING: 35,
        WASHING: 8, TREATMENT_MOISTURIZING: 50, HAIRCUT_BLOW_DRY: 35, COLOR_TOUCH_UP: 50,
        PERM: 50, BEARD_TRIM: 10, EYEBROW_SHAPING: 10, HAIRCUT_BEARD_TRIM: 30,
        HAIRCUT_BEARD_TRIM_EYEBROW_SHAPING: 45
    };
    const priceFor = services => services.reduce((sum, s) => sum + (PRICES[s] ?? 0), 0);

    const toMinutes = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const fromMinutes = n => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}:00`;
    const endTimeFor = (start, services) =>
        fromMinutes(toMinutes(start) + services.reduce((sum, s) => sum + (DURATIONS[s] ?? 0), 0));

    // Real JPEG files in mock-images/, in three aspect ratios. Counts cycle 1, 2, 3.
    const PHOTOS = [1, 2, 3, 4, 5, 6].map(n => ({
        imageUrl: new URL(`mock-images/ref-${n}.jpg`, location.href).href,
        publicId: `mock/ref-${n}`
    }));
    let photoCursor = 0;
    function nextPhotos() {
        const count = (photoCursor % 3) + 1;
        const start = photoCursor % PHOTOS.length;
        photoCursor++;
        return Array.from({ length: count }, (_, i) => PHOTOS[(start + i) % PHOTOS.length]);
    }

    let nextId = 1;
    function apt(dayOffset, startTime, name, phone, services, status, extra = {}) {
        const id = `mock-${String(nextId++).padStart(4, "0")}`;
        return {
            appointmentId: id,
            phoneNumber: phone,
            language: extra.language ?? "ES",
            name,
            serviceType: services,
            date: salonIso(dayOffset),
            startTime: `${startTime}:00`,
            endTime: endTimeFor(startTime, services),
            reminderSentAt: extra.reminderSentAt ?? null,
            status,
            appointmentSource: extra.source ?? (/\(Walk-in\)/.test(name) ? "WALK_IN" : /\(Phone\)/.test(name) ? "PHONE" : "ONLINE"),
            totalPrice: priceFor(services).toFixed(2),
            additionalNotes: extra.notes ?? "",
            smsConsent: extra.smsConsent ?? true,
            // AppointmentFullDetailsResponse.imageUrl: List<String> of public URLs
            imageUrl: (extra.hairImages ?? nextPhotos()).map(p => p.imageUrl)
        };
    }

    const db = [
        // Today: 10 appointments with one of each row state
        apt(0, "10:00", "Maria Lopez", "+13235550101", ["HAIRCUT"], "CONFIRMED", { reminderSentAt: `${salonIso(-1)}T10:00:00` }),
        apt(0, "11:00", "Ana Ramirez", "+13235550102", ["DYES"], "BOOKED", { notes: "Quiere un tono cobrizo. Alergia al amoníaco." }),
        apt(0, "11:30", "Luis Hernandez", "+13235550103", ["BEARD_TRIM"], "CONFIRMED", { language: "EN" }),
        apt(0, "12:15", "Valeria Torres", "+13235550106", ["KERATIN_TREATMENT"], "RESCHEDULED"),
        apt(0, "14:00", "Sofia Garcia", "+13235550104", ["HAIRCUT_BLOW_DRY"], "BOOKED", { smsConsent: false }),
        apt(0, "13:50", "Daniela Cruz", "+13235550107", ["EYEBROW_SHAPING"], "DELETED"),
        apt(0, "15:30", "Carlos Martinez", "+13235550105", ["HAIRCUT_BEARD_TRIM"], "CONFIRMED"),
        apt(0, "16:30", "Camila Reyes", "+13235550109", ["WASHING"], "BOOKED", { notes: "Prueba de mechón la semana pasada." }),
        apt(0, "17:00", "Jorge Flores", "+13235550108", ["HAIRCUT"], "CONFIRMED", { language: "EN" }),
        apt(0, "18:00", "Miguel Sanchez (Walk-in)", "+13235550110", ["HAIRCUT_BEARD_TRIM"], "BOOKED"),

        // Tomorrow: 3 appointments
        apt(1, "10:00", "Isabella Moreno", "+13235550111", ["BLOW_DRYING"], "BOOKED"),
        apt(1, "12:00", "Gabriela Diaz (Phone)", "+13235550112", ["COLOR_TOUCH_UP"], "CONFIRMED"),
        apt(1, "15:30", "Andres Ortiz", "+13235550113", ["HAIRCUT"], "BOOKED", { language: "EN" }),

        // Yesterday: 4 appointments, mostly finished
        apt(-1, "10:00", "Paola Jimenez", "+13235550114", ["HAIRCUT"], "COMPLETED"),
        apt(-1, "11:00", "Lucia Vargas", "+13235550115", ["BABY_HIGHLIGHT"], "COMPLETED"),
        apt(-1, "15:30", "Diego Castillo", "+13235550116", ["HAIRCUT_BEARD_TRIM"], "NO_SHOW"),
        apt(-1, "17:00", "Fernanda Ruiz", "+13235550117", ["TREATMENT_MOISTURIZING"], "CONFIRMED")
    ];

    // The appointment whose availability check fails on its first two attempts.
    const FLAKY_ID = db.find(a => a.name === "Camila Reyes").appointmentId;
    let flakyAttempts = 0;

    // Statuses that no longer hold their slot (AppointmentService.NON_BLOCKING_STATUSES).
    const INACTIVE = new Set(["CANCELED", "RESCHEDULED", "COMPLETED", "NO_SHOW", "DELETED"]);

    function conflictsFor(date, startTime, services, excludeId) {
        const start = toMinutes(startTime);
        const end = toMinutes(endTimeFor(startTime.slice(0, 5), services));
        return db.filter(o => o.appointmentId !== excludeId && o.date === date && !INACTIVE.has(o.status)
            && toMinutes(o.startTime) < end && start < toMinutes(o.endTime));
    }

    function json(status, body) {
        return new Response(body === undefined ? null : JSON.stringify(body), {
            status,
            headers: body === undefined ? {} : { "Content-Type": "application/json" }
        });
    }

    function error(status, type, message) {
        return json(status, { type, error: message });
    }

    // Same checks as AppointmentService.validateBusinessHours; null when the slot is fine.
    function businessHoursError(date, startTime, services) {
        const [y, mo, d] = date.split("-").map(Number);
        const day = new Date(y, mo - 1, d).getDay();
        const closing = day === 0 ? 900 : 1140;
        const start = toMinutes(startTime);
        if (day === 1) return error(400, "SlotIsMondayException", "Selected date is Monday");
        if (start < 600 || start >= closing) {
            return error(400, "OutsideServiceHoursException", "Selected time is outside of business hours");
        }
        if (toMinutes(endTimeFor(startTime, services)) > closing) {
            return error(400, "EndsAfterClosingException", "Appointment would end after closing time");
        }
        return null;
    }

    function route(method, url, body) {
        const path = url.pathname;

        if (method === "POST" && path === "/api/v1/admin/login") {
            return body?.email?.toLowerCase() === MOCK_EMAIL && body?.password === MOCK_PASSWORD
                ? json(204)
                : error(401, "BadCredentialsException", "Invalid email or password.");
        }

        if (sessionExpired) return error(401, "TokenExpired", "Your session has expired.");

        // AdminController.me, called by login.js to confirm the session before redirecting
        if (method === "GET" && path === "/api/v1/admin/me") return json(200, { name: "Yasmin" });

        // List<AppointmentFullDetailsResponse>, every appointment of the day, unsorted
        if (method === "GET" && path === "/api/v1/admin/appointments/day") {
            const date = url.searchParams.get("date") ?? salonIso(0);
            const all = db.filter(a => a.date === date).map(a => structuredClone(a));
            return json(200, all.reverse());
        }

        // checkOverlaps -> List<AppointmentOverlapDetailsResponse>. Answered as POST:
        // see the note on AVAILABILITY_URL in booking.js.
        if (path === "/api/v1/admin/appointments/overlaps") {
            if (body.excludeId === FLAKY_ID && ++flakyAttempts <= 2) {
                return error(503, "MockError", "Mock failure for testing the retry.");
            }
            const conflicts = conflictsFor(body.date, body.startTime, body.serviceTypes, body.excludeId)
                .map(o => ({ id: o.appointmentId, name: o.name, serviceTypeList: o.serviceType }));
            return json(200, conflicts);
        }

        // createAppointment: business hours checked, 201 with no body
        if (method === "POST" && path === "/api/v1/admin/appointments/create") {
            if (/error/i.test(body.name)) return error(400, "MockError", "Mock failure for testing.");
            const invalid = businessHoursError(body.date, body.startTime, body.services);
            if (invalid) return invalid;
            const created = apt(0, body.startTime, body.name, null, body.services, "BOOKED",
                { smsConsent: false, hairImages: [], source: body.appointmentSource });
            created.date = body.date;
            db.push(created);
            return json(201);
        }

        let m = path.match(/^\/api\/v1\/admin\/appointments\/(status|edit|delete)\/([^/]+)$/);
        if (!m) return null;
        const [, op, id] = m;
        const a = db.find(x => x.appointmentId === id);
        if (!a) return error(404, "AppointmentNotFoundException", "Not found");

        if (op === "status" && method === "PATCH") {
            // AdminService.ACTIONABLE: BOOKED or CONFIRMED
            if (a.status !== "CONFIRMED" && a.status !== "BOOKED") {
                return error(409, "InvalidStatusTransitionException", `Appointment ${a.appointmentId} is ${a.status}`);
            }
            a.status = url.searchParams.get("action");
            return json(204);
        }

        if (op === "delete" && method === "DELETE") {
            a.status = "DELETED"; // soft delete, like AdminService.markForDeletion
            return json(204);
        }

        if (op === "edit" && method === "PATCH") {
            // AppointmentFullDetailsRequest { services, date, startTime }; end time
            // recalculated and business hours checked, like editAppointmentDetails.
            const invalid = businessHoursError(body.date, body.startTime, body.services);
            if (invalid) return invalid;
            a.date = body.date;
            a.startTime = `${body.startTime}:00`;
            a.serviceType = body.services;
            a.endTime = endTimeFor(body.startTime, body.services);
            a.totalPrice = priceFor(body.services).toFixed(2);
            return json(204);
        }

        return null;
    }

    window.fetch = async (input, init = {}) => {
        const url = new URL(typeof input === "string" ? input : input.url, location.href);
        const method = (init.method ?? "GET").toUpperCase();
        let body;
        try { body = init.body ? JSON.parse(init.body) : undefined; } catch { body = undefined; }

        const res = route(method, url, body);
        if (!res) return realFetch(input, init);

        // Honour aborts the way a real fetch would, so superseded checks are dropped.
        await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, LATENCY_MS);
            init.signal?.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(init.signal.reason ?? new DOMException("Aborted", "AbortError"));
            }, { once: true });
        });
        console.info(`[mock] ${method} ${url.pathname}${url.search} -> ${res.status}`);
        return res;
    };
})();
