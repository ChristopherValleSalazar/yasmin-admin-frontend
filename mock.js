// PROTOTYPE MOCKS: the real backend is not reachable yet, so this file answers
// every API call the admin pages make. To go live, delete the <script src="mock.js">
// tag from login.html and panel-view.html (or set USE_MOCKS to false) and delete
// this file. Nothing else depends on it.
//
// Test hooks:
//   login        password "admin" succeeds, anything else is a 401
//   panel        today has 10 appointments (2 pages), tomorrow 3, yesterday 4,
//                every other day is empty
//   status       only CONFIRMED appointments accept Completed / No show (else 409),
//                same rule as AdminService.setAppointmentStatus
//   edit/create  a name containing "error" returns a 400
//   401          open panel-view.html?mock401 to see the session expiry redirect

const USE_MOCKS = true;

(() => {
    if (!USE_MOCKS) return;

    const realFetch = window.fetch.bind(window);
    const LATENCY_MS = 350;
    const sessionExpired = new URLSearchParams(location.search).has("mock401");

    // Dates relative to the salon's today so the data always lines up with the calendar.
    function salonIso(offsetDays) {
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
        now.setDate(now.getDate() + offsetDays);
        const p = n => String(n).padStart(2, "0");
        return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
    }

    // Placeholder "reference photos" in different aspect ratios, drawn inline so
    // they work offline.
    function fakePhoto(w, h, from, to) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
            `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
            `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
            `<rect width="100%" height="100%" fill="url(#g)"/>` +
            `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="rgba(255,255,255,0.35)"/>` +
            `<text x="50%" y="92%" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(h / 14)}" fill="#fff">${w}×${h} reference</text></svg>`;
        return { imageUrl: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg), publicId: `mock/${w}x${h}` };
    }

    const PHOTOS = [
        fakePhoto(1200, 1600, "#6d34a0", "#e889c4"),
        fakePhoto(1600, 1000, "#2a1145", "#8a4fc4"),
        fakePhoto(1000, 1000, "#b05a8c", "#f2c6e0")
    ];

    let nextId = 1;
    function apt(dayOffset, startTime, endTime, name, phone, services, status, extra = {}) {
        const id = `mock-${String(nextId++).padStart(4, "0")}-${Math.random().toString(16).slice(2, 10)}`;
        return {
            appointmentId: id,
            phoneNumber: phone,
            language: extra.language ?? "EN",
            name,
            serviceType: services,
            date: salonIso(dayOffset),
            startTime,
            endTime,
            reminderSentAt: extra.reminderSentAt ?? null,
            status,
            viewCode: Math.random().toString(36).slice(2, 12).toUpperCase(),
            additionalNotes: extra.notes ?? "",
            smsConsent: extra.smsConsent ?? true,
            // Not in AppointmentFullDetailsResponse yet; mirrors the entity's HairImage.
            hairImages: extra.hairImages ?? []
        };
    }

    const db = [
        // Today: 10 appointments, enough for two pages of 7
        apt(0, "10:00:00", "10:55:00", "Maria Lopez", "+13235550101", ["HAIRCUT"], "CONFIRMED", { language: "ES", reminderSentAt: `${salonIso(-1)}T10:00:00` }),
        apt(0, "10:30:00", "13:10:00", "Ana Ramirez", "+13235550102", ["DYES"], "BOOKED", { hairImages: PHOTOS, notes: "Wants a copper tone. Allergic to ammonia." }),
        apt(0, "11:00:00", "11:30:00", "Luis Hernandez", "+13235550103", ["BEARD_TRIM"], "CONFIRMED"),
        apt(0, "11:45:00", "13:05:00", "Sofia Garcia", "+13235550104", ["HAIRCUT_BLOW_DRY"], "BOOKED", { smsConsent: false }),
        apt(0, "12:15:00", "13:25:00", "Carlos Martinez", "+13235550105", ["HAIRCUT_BEARD_TRIM"], "CONFIRMED", { language: "ES" }),
        apt(0, "13:00:00", "14:30:00", "Valeria Torres", "+13235550106", ["KERATIN_TREATMENT"], "RESCHEDULED", { hairImages: [PHOTOS[1]] }),
        apt(0, "14:00:00", "14:20:00", "Daniela Cruz", "+13235550107", ["EYEBROW_SHAPING"], "CANCELED"),
        apt(0, "15:00:00", "16:25:00", "Jorge Flores", "+13235550108", ["HAIRCUT", "WASHING"], "CONFIRMED"),
        apt(0, "16:00:00", "18:00:00", "Camila Reyes", "+13235550109", ["PERM"], "BOOKED", { hairImages: [PHOTOS[0], PHOTOS[2]], notes: "Strand test done last week." }),
        apt(0, "17:30:00", "18:50:00", "Miguel Sanchez (Walk-in)", "+13235550110", ["HAIRCUT_BEARD_TRIM_EYEBROW_SHAPING"], "BOOKED"),

        // Tomorrow: 3 appointments
        apt(1, "10:00:00", "11:10:00", "Isabella Moreno", "+13235550111", ["BLOW_DRYING"], "BOOKED"),
        apt(1, "12:00:00", "13:30:00", "Gabriela Diaz (Phone)", "+13235550112", ["COLOR_TOUCH_UP"], "CONFIRMED", { hairImages: [PHOTOS[2]] }),
        apt(1, "15:30:00", "16:25:00", "Andres Ortiz", "+13235550113", ["HAIRCUT"], "BOOKED", { language: "ES" }),

        // Yesterday: 4 appointments, mostly finished
        apt(-1, "10:00:00", "10:55:00", "Paola Jimenez", "+13235550114", ["HAIRCUT"], "COMPLETED"),
        apt(-1, "11:00:00", "15:10:00", "Lucia Vargas", "+13235550115", ["BABY_HIGHLIGHT"], "COMPLETED", { hairImages: [PHOTOS[0]] }),
        apt(-1, "13:30:00", "14:40:00", "Diego Castillo", "+13235550116", ["HAIRCUT_BEARD_TRIM"], "NO_SHOW"),
        apt(-1, "16:00:00", "17:40:00", "Fernanda Ruiz", "+13235550117", ["TREATMENT_MOISTURIZING"], "CONFIRMED", { hairImages: [PHOTOS[1]] })
    ];

    function json(status, body) {
        return new Response(body === undefined ? null : JSON.stringify(body), {
            status,
            headers: body === undefined ? {} : { "Content-Type": "application/json" }
        });
    }

    function error(status, type, message) {
        return json(status, { type, error: message });
    }

    function addMinutes(time, minutes) {
        const [h, m] = time.split(":").map(Number);
        const total = h * 60 + m + minutes;
        return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`;
    }

    // Same durations as the backend's ServiceType enum
    const DURATIONS = {
        HAIRCUT: 55, BABY_HIGHLIGHT: 250, DYES: 160, KERATIN_TREATMENT: 90, BLOW_DRYING: 70,
        WASHING: 30, TREATMENT_MOISTURIZING: 100, HAIRCUT_BLOW_DRY: 80, COLOR_TOUCH_UP: 90,
        PERM: 120, BEARD_TRIM: 30, EYEBROW_SHAPING: 20, HAIRCUT_BEARD_TRIM: 70,
        HAIRCUT_BEARD_TRIM_EYEBROW_SHAPING: 80
    };

    function route(method, url, body) {
        const path = url.pathname;

        if (method === "POST" && path === "/api/v1/admin/login") {
            return body?.password === "admin"
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
                status: a.status
            }));
            return json(200, {
                content, totalPages, totalElements: all.length, number: page, size,
                first: page === 0, last: page >= totalPages - 1, empty: content.length === 0
            });
        }

        // Placeholder create endpoint used by panel-view.js
        if (method === "POST" && path === "/api/(placeholder)") {
            if (/error/i.test(body?.name ?? "")) return error(400, "MockError", "Mock failure for testing.");
            const services = body.services ?? [];
            const minutes = services.reduce((sum, s) => sum + (DURATIONS[s] ?? 0), 0);
            const created = apt(0, `${body.startTime}:00`, addMinutes(body.startTime, minutes), body.name, "",
                services, "BOOKED", { smsConsent: false });
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
                if (/error/i.test(body?.name ?? "")) return error(400, "MockError", "Mock failure for testing.");
                Object.assign(a, body, { appointmentId: a.appointmentId, hairImages: a.hairImages });
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

        await new Promise(r => setTimeout(r, LATENCY_MS));
        console.info(`[mock] ${method} ${url.pathname}${url.search} -> ${res.status}`);
        return res;
    };
})();
