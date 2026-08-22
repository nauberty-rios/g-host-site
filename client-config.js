window.GHOST_CLIENT_CONFIG = {
  apiBase: "https://g-host-secure.naubertymoraes13.workers.dev",
  sessionStorageKey: "ghost_portal_token",
  portalDeviceStorageKey: "ghost_portal_device_v1",
  turnstileSiteKey: ""
};

(() => {
  "use strict";

  const cfg = window.GHOST_CLIENT_CONFIG;
  const apiBase = String(cfg.apiBase || "").replace(/\/+$/, "");
  const tokenKey = cfg.sessionStorageKey;
  const deviceKey = cfg.portalDeviceStorageKey;
  const page = location.pathname.split("/").pop() || "";

  const protectedPortalPages = new Set([
    "entrar.html", "cadastro.html", "recuperar-senha.html", "cliente.html", "contrato.html"
  ]);
  if (protectedPortalPages.has(page) && window.top !== window.self) {
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
      if (headers.has("Authorization") && !headers.has("X-Ghost-Device")) {
        const device = localStorage.getItem(deviceKey) || "";
        if (device) headers.set("X-Ghost-Device", device);
      }
      nextInit = { ...init, headers };
    }

    const response = await nativeFetch(input, nextInit);

    if (page === "cliente.html" && apiBase && target.startsWith(apiBase) && response.status === 401) {
      const data = await response.clone().json().catch(() => ({}));
      if (["PORTAL_DEVICE_REQUIRED", "PORTAL_DEVICE_REVOKED", "PORTAL_SESSION_INVALID"].includes(String(data?.code || ""))) {
        sessionStorage.removeItem(tokenKey);
        location.replace("entrar.html");
      }
    }

    return response;
  };

  if (page === "cliente.html") {
    const token = sessionStorage.getItem(tokenKey) || "";
    if (!token) {
      location.replace("entrar.html");
      return;
    }

    document.addEventListener("submit", event => {
      const id = event.target?.id || "";
      const route = {
        "client-login-form": "entrar.html",
        "client-register-form": "cadastro.html",
        "client-verify-form": "cadastro.html",
        "client-reset-form": "recuperar-senha.html",
        "client-reset-verify-form": "recuperar-senha.html"
      }[id];
      if (!route) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      location.replace(route);
    }, true);
  }

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
