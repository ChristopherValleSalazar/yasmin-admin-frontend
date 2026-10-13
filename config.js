// API host. Locally it follows the page's own host (localhost or 127.0.0.1), so the
// panel and the API are always the same site and the SameSite=Lax login cookie is
// stored and sent. Anywhere else it is production.
const LOCAL_DEV = ["localhost", "127.0.0.1"].includes(location.hostname);
const API_BASE_URL = LOCAL_DEV
    ? `${location.protocol}//${location.hostname}:8080`
    : "https://api.yasminbeauty.salon";

console.info("[admin] API:", API_BASE_URL);
