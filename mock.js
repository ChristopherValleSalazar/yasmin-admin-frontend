// PROTOTYPE MOCKS: the real backend is not reachable yet, so this file answers
// every API call the admin pages make. To go live, delete the <script src="mock.js">
// tag from login.html and panel-view.html (or set USE_MOCKS to false) and delete
// this file and mock-images/. Nothing else depends on them.
//
// Test hooks:
//   login        admin@yasminbeauty.salon / admin123 succeeds, anything else is a 401
//   panel        today has 10 appointments (2 pages), tomorrow 3, yesterday 4,
//                every other day is empty
//   row states   today has an overlapping pair (Ana + Luis), one rescheduled
//                (Valeria) and one deleted (Daniela) appointment
//   status       only CONFIRMED appointments accept Completada / No asistió (else 409),
//                same rule as AdminService.setAppointmentStatus
//   check        Camila Reyes' availability check fails twice, then succeeds:
//                edit her, pick a time, watch the auto-retry, then press Reintentar
//   create       a name containing "error" returns a 400
//   401          open panel-view.html?mock401 to see the session expiry redirect

const USE_MOCKS = true;

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

    // Same durations as the backend's ServiceType enum
    const DURATIONS = {
        HAIRCUT: 55, BABY_HIGHLIGHT: 250, DYES: 160, KERATIN_TREATMENT: 90, BLOW_DRYING: 70,
        WASHING: 30, TREATMENT_MOISTURIZING: 100, HAIRCUT_BLOW_DRY: 80, COLOR_TOUCH_UP: 90,
        PERM: 120, BEARD_TRIM: 30, EYEBROW_SHAPING: 20, HAIRCUT_BEARD_TRIM: 70,
        HAIRCUT_BEARD_TRIM_EYEBROW_SHAPING: 80
    };

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
            viewCode: Math.random().toString(36).slice(2, 12).toUpperCase(),
            additionalNotes: extra.notes ?? "",
            smsConsent: extra.smsConsent ?? true,
            // Not in AppointmentFullDetailsResponse yet; mirrors the entity's HairImage.
            hairImages: extra.hairImages ?? nextPhotos()
        };
    }

    const db = [
        // Today: 10 appointments, two pages of 7, one of each row state on page 1
        apt(0, "10:00", "Maria Lopez", "+13235550101", ["HAIRCUT"], "CONFIRMED", { reminderSentAt: `${salonIso(-1)}T10:00:00` }),
        apt(0, "11:00", "Ana Ramirez", "+13235550102", ["DYES"], "BOOKED", { notes: "Quiere un tono cobrizo. Alergia al amoníaco." }),
        apt(0, "11:30", "Luis Hernandez", "+13235550103", ["BEARD_TRIM"], "CONFIRMED", { language: "EN" }),
        apt(0, "12:15", "Valeria Torres", "+13235550106", ["KERATIN_TREATMENT"], "RESCHEDULED"),
        apt(0, "13:45", "Sofia Garcia", "+13235550104", ["HAIRCUT_BLOW_DRY"], "BOOKED", { smsConsent: false }),
        apt(0, "13:50", "Daniela Cruz", "+13235550107", ["EYEBROW_SHAPING"], "DELETED"),
        apt(0, "15:10", "Carlos Martinez", "+13235550105", ["HAIRCUT_BEARD_TRIM"], "CONFIRMED"),
        apt(0, "16:25", "Camila Reyes", "+13235550109", ["WASHING"], "BOOKED", { notes: "Prueba de mechón la semana pasada." }),
        apt(0, "17:00", "Jorge Flores", "+13235550108", ["HAIRCUT"], "CONFIRMED", { language: "EN" }),
        apt(0, "18:00", "Miguel Sanchez (Walk-in)", "+13235550110", ["HAIRCUT_BEARD_TRIM_EYEBROW_SHAPING"], "BOOKED"),

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

    // Statuses that no longer hold their slot.
    const INACTIVE = new Set(["CANCELED", "RESCHEDULED", "DELETED", "NO_SHOW"]);

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

    function route(method, url, body) {
        const path = url.pathname;

        if (method === "POST" && path === "/api/v1/admin/login") {
            return body?.email?.toLowerCase() === MOCK_EMAIL && body?.password === MOCK_PASSWORD
                ? json(204)
                : error(401, "BadCredentialsException", "Invalid email or password.");
        }

        if (sessionExpired) return error(401, "TokenExpired", "Your session has expired.");

        if (method === "GET" && path === "/api/v1/admin/appointments/day") {
            const date = url.searchParams.get("date") ?? salonIso(0);
            const page = Number(url.searchParams.get("page") ?? 0);
            const size = Number(url.searchParams.get("size") ?? 7);
            const all = db.filter(a => a.date === date).sort((a, b) => a.startTime.localeCompare(b.startTime));
            const totalPages = Math.ceil(all.length / size);
            const content = all.slice(page * size, page * size + size).map(a => ({
                appointmentId: a.appointmentId,
                phoneNumber: a.phoneNumber,
                name: a.name,
                serviceType: a.serviceType,
                startTime: a.startTime,
                status: a.status,
                // Overlap flag the panel colors rows by (not in AppointmentRow yet)
                overlapping: !INACTIVE.has(a.status)
                    && conflictsFor(a.date, a.startTime, a.serviceType, a.appointmentId).length > 0
            }));
            return json(200, {
                content, totalPages, totalElements: all.length, number: page, size,
                first: page === 0, last: page >= totalPages - 1, empty: content.length === 0
            });
        }

        // Both placeholder endpoints share /api/(placeholder), so they are told apart
        // by body shape: create sends a name, the availability check does not.
        if (method === "POST" && path === "/api/(placeholder)" && body && !("name" in body)) {
            if (body.appointmentId === FLAKY_ID && ++flakyAttempts <= 2) {
                return error(503, "MockError", "Mock failure for testing the retry.");
            }
            const conflicts = conflictsFor(body.date, body.startTime, body.services, body.appointmentId)
                .map(o => ({ appointmentId: o.appointmentId, services: o.serviceType }));
            return json(200, { overlaps: conflicts.length > 0, conflicts });
        }

        if (method === "POST" && path === "/api/(placeholder)") {
            if (/error/i.test(body.name)) return error(400, "MockError", "Mock failure for testing.");
            const created = apt(0, body.startTime, body.name, "", body.services, "BOOKED", { smsConsent: false, hairImages: [] });
            created.date = body.date;
            db.push(created);
            return json(200, created);
        }

        let m = path.match(/^\/api\/v1\/admin\/appointments\/([^/]+)\/status$/);
        if (m && method === "PATCH") {
            const a = db.find(x => x.appointmentId === m[1]);
            if (!a) return error(404, "AppointmentNotFoundException", "Not found");
            if (a.status !== "CONFIRMED") {
                return error(409, "InvalidStatusTransitionException", `Appointment ${a.appointmentId} is ${a.status}`);
            }
            a.status = url.searchParams.get("action");
            return json(204);
        }

        m = path.match(/^\/api\/v1\/admin\/appointments\/([^/]+)$/);
        if (m) {
            const a = db.find(x => x.appointmentId === m[1]);
            if (!a) return error(404, "AppointmentNotFoundException", "Not found");

            if (method === "GET") return json(200, a);
            if (method === "DELETE") {
                a.status = "DELETED"; // soft delete, like AdminService.markForDeletion
                return json(204);
            }
            if (method === "PATCH") {
                // Reschedule-style edit: date, start time, services; end time recalculated.
                a.date = body.date;
                a.startTime = `${body.startTime}:00`;
                a.serviceType = body.services;
                a.endTime = endTimeFor(body.startTime, body.services);
                return json(204);
            }
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
