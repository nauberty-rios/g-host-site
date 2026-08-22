window.GHOST_AUTH_CONFIG = {
  apiBase: "https://g-host-secure.naubertymoraes13.workers.dev",
  inactivitySeconds: 900
};

(() => {
  "use strict";

  const cfg = window.GHOST_AUTH_CONFIG || {};
  const apiBase = String(cfg.apiBase || "").replace(/\/+$/, "");
  const OWNER_DEVICE_KEY = "ghost_owner_device_v1";
  const STAFF_DEVICE_KEY = "ghost_staff_device_v1";

  const page = location.pathname.split("/").pop() || "";
  const protectedPages = new Set([
    "admin.html", "staff.html", "planos-admin.html", "catalogo-admin.html",
    "visibilidade-admin.html", "staff-planos.html", "staff-catalogo.html",
    "staff-visibilidade.html"
  ]);

  // Defesa contra clickjacking nas telas administrativas.
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

      // Toda chamada autenticada do Dono/ADM leva também a identidade do aparelho.
      if (headers.has("Authorization") && !headers.has("X-Ghost-Device")) {
        const kind = window.GHOST_CONTROL_CONTEXT?.kind || (page.startsWith("staff") ? "staff" : "owner");
        const device = localStorage.getItem(kind === "staff" ? STAFF_DEVICE_KEY : OWNER_DEVICE_KEY) || "";
        if (device) headers.set("X-Ghost-Device", device);
      }
      nextInit = { ...init, headers };
    }

    const response = await nativeFetch(input, nextInit);

    try {
      if (apiBase && target.startsWith(apiBase) && !response.ok) {
        const data = await response.clone().json().catch(() => ({}));
        // Em aparelho novo, guarda somente o segredo pendente. O Worker não cria
        // sessão até o aparelho ser explicitamente autorizado.
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
