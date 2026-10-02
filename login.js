// Admin login. The backend answers with an HttpOnly cookie; nothing about the
// session is read or stored here.

const LOGIN_URL = `${API_BASE_URL}/api/v1/admin/login`;
const EMAIL_DEBOUNCE_MS = 1500;
const TOAST_MS = 5000;

const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const emailError = document.getElementById("email-error");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("login-btn");
const toast = document.getElementById("toast");
const toastText = document.getElementById("toast-text");

document.getElementById("copyright-year").textContent = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Email validation states
// The regex lives in the input's pattern attribute, so validity.patternMismatch
// is the single source of truth. States are applied only once typing pauses.
// ---------------------------------------------------------------------------

let emailTimer;

function clearEmailState() {
    emailInput.classList.remove("is-valid", "is-invalid");
    emailInput.removeAttribute("aria-invalid");
    emailError.hidden = true;
}

function applyEmailState() {
    clearEmailState();
    // An empty field is neither valid nor invalid until submit.
    if (emailInput.value === "") return;

    const valid = !emailInput.validity.patternMismatch;
    emailInput.classList.add(valid ? "is-valid" : "is-invalid");
    if (!valid) {
        emailInput.setAttribute("aria-invalid", "true");
        emailError.hidden = false;
    }
}

emailInput.addEventListener("input", () => {
    emailInput.setCustomValidity("");
    clearTimeout(emailTimer);
    clearEmailState();
    emailTimer = setTimeout(applyEmailState, EMAIL_DEBOUNCE_MS);
});

// Native validation blocks a submit with a bad email; show the state right away then.
// The bubble text is set in Spanish because the browser's own may not be.
emailInput.addEventListener("invalid", () => {
    emailInput.setCustomValidity(emailInput.value === ""
        ? "Escribe tu correo electrónico."
        : "Escribe un correo válido, por ejemplo nombre@ejemplo.com.");
    clearTimeout(emailTimer);
    applyEmailState();
    if (emailInput.value === "") emailInput.classList.add("is-invalid");
});

passwordInput.addEventListener("invalid", () => passwordInput.setCustomValidity("Escribe tu contraseña."));
passwordInput.addEventListener("input", () => passwordInput.setCustomValidity(""));

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

let toastTimer;

function showToast(message) {
    clearTimeout(toastTimer);
    toastText.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, TOAST_MS);
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    toast.hidden = true;
    loginBtn.disabled = true;

    try {
        const res = await fetch(LOGIN_URL, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: emailInput.value.trim(),
                password: passwordInput.value
            })
        });

        if (res.ok) {
            window.location.href = "panel-view.html";
            return;
        }
        // One generic message for every failure: never say which field was wrong.
        showToast("Correo o contraseña incorrectos.");
    } catch {
        showToast("No pudimos conectar con el servidor. Inténtalo de nuevo.");
    }

    loginBtn.disabled = false;
});
