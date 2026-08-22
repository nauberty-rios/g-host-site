window.GHOST_AUTH_CONFIG = {
  apiBase: "https://g-host-secure.naubertymoraes13.workers.dev",
  inactivitySeconds: 900,
  cookieAuthEnabled: false,
  turnstileSiteKey: ""
};

(() => {
  "use strict";

  const cfg = window.GHOST_AUTH_CONFIG || {};
  const apiBase = String(cfg.apiBase || "").replace(/\/+$/, "");
  const cookieAuthEnabled = cfg.cookieAuthEnabled === true;
  const COOKIE_SENTINEL = "__gh_cookie__";
  const OWNER_DEVICE_KEY = "ghost_owner_device_v1";
  const STAFF_DEVICE_KEY = "ghost_staff_device_v1";

  const page = location.pathname.split("/").pop() || "";
  const protectedPages = new Set([
    "admin.html", "staff.html", "planos-admin.html", "catalogo-admin.html",
    "visibilidade-admin.html", "staff-planos.html", "staff-catalogo.html",
    "staff-visibilidade.html"
  ]);

  if (protectedPages.has(page) && window.top !== window.self) {
    window.stop();
    document.documentElement.replaceChildren();
    return;
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    let target = "";
    try { target = typeof input === "string" ? input : String(input?.url || ""); } catch (_) {}

    let nextInit = init;
    if (apiBase && target.startsWith(apiBase)) {
      const originalHeaders = init?.headers || (input instanceof Request ? input.headers : undefined);
      const headers = new Headers(originalHeaders || {});

      if (cookieAuthEnabled) {
        if ((headers.get("Authorization") || "").trim() === `Bearer ${COOKIE_SENTINEL}`) headers.delete("Authorization");
        if ((headers.get("X-Ghost-Device") || "").trim() === COOKIE_SENTINEL) headers.delete("X-Ghost-Device");
      }

      if (headers.has("Authorization") && !headers.has("X-Ghost-Device")) {
        const kind = window.GHOST_CONTROL_CONTEXT?.kind || (page.startsWith("staff") ? "staff" : "owner");
        const device = localStorage.getItem(kind === "staff" ? STAFF_DEVICE_KEY : OWNER_DEVICE_KEY) || "";
        if (device && (!cookieAuthEnabled || device !== COOKIE_SENTINEL)) headers.set("X-Ghost-Device", device);
      }

      nextInit = { ...init, headers, cache: "no-store", referrerPolicy: "no-referrer" };
      if (cookieAuthEnabled) nextInit.credentials = "include";
    }

    const response = await nativeFetch(input, nextInit);

    try {
      if (apiBase && target.startsWith(apiBase) && !response.ok) {
        const data = await response.clone().json().catch(() => ({}));
        if (data?.code === "OWNER_DEVICE_PENDING" && data?.ownerDeviceToken) {
          localStorage.setItem(OWNER_DEVICE_KEY, String(data.ownerDeviceToken));
        }
        if (data?.code === "STAFF_DEVICE_PENDING" && data?.staffDeviceToken) {
          localStorage.setItem(STAFF_DEVICE_KEY, String(data.staffDeviceToken));
        }
      }
    } catch (_) {}

    return response;
  };

  if (!document.querySelector('script[data-ghost-phase1]')) {
    const script = document.createElement("script");
    script.src = "security-phase1.js";
    script.async = false;
    script.dataset.ghostPhase1 = "1";
    document.head.append(script);
  }

  if (!document.querySelector('script[data-ghost-device-access]')) {
    const script = document.createElement("script");
    script.src = "device-access.js";
    script.defer = true;
    script.dataset.ghostDeviceAccess = "1";
    document.head.append(script);
  }

  if (!document.querySelector('script[data-ghost-role-ui]')) {
    const script = document.createElement("script");
    script.src = "role-ui.js";
    script.defer = true;
    script.dataset.ghostRoleUi = "1";
    document.head.append(script);
  }
})();
