window.GHOST_CLIENT_CONFIG = {
  apiBase: "https://g-host-secure.naubertymoraes13.workers.dev",
  sessionStorageKey: "ghost_portal_token",
  portalDeviceStorageKey: "ghost_portal_device_v1",
  cookieAuthEnabled: false,
  cookieApiHost: "api.g-host.seg.br",
  publicContentEnabled: false,
  turnstileSiteKey: ""
};

(() => {
  "use strict";

  const cfg = window.GHOST_CLIENT_CONFIG;
  const apiBase = String(cfg.apiBase || "").replace(/\/+$/, "");
  const apiOrigin = (() => { try { return new URL(apiBase).origin; } catch (_) { return ""; } })();
  const isApiTarget = value => {
    try { return Boolean(apiOrigin && new URL(value, location.href).origin === apiOrigin); } catch (_) { return false; }
  };
  const cookieApiHost = String(cfg.cookieApiHost || "api.g-host.seg.br").trim().toLowerCase();
  const cookieHostMatches = (() => {
    try { return new URL(apiBase).hostname.toLowerCase() === cookieApiHost; } catch (_) { return false; }
  })();
  const cookieAuthEnabled = cfg.cookieAuthEnabled === true && cookieHostMatches;
  const COOKIE_SENTINEL = "__gh_cookie__";
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

  const hasUnsafeObjectKey = value => {
    if (!value || typeof value !== "object") return false;
    if (Array.isArray(value)) return value.some(hasUnsafeObjectKey);
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) return true;
      if (hasUnsafeObjectKey(child)) return true;
    }
    return false;
  };

  const applyPublicContent = payload => {
    const content = payload?.content;
    if (!payload?.ok || !content || typeof content !== "object" || Array.isArray(content) || hasUnsafeObjectKey(content)) return false;
    const mappings = [
      ["site", "SITE_DATA"],
      ["plans", "GHOST_PLANS"],
      ["catalog", "GHOST_CATALOG"],
      ["visibility", "GHOST_VISIBILITY"]
    ];
    let applied = false;
    for (const [key, globalName] of mappings) {
      const value = content[key];
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      window[globalName] = value;
      applied = true;
    }
    return applied;
  };

  window.GHOST_PUBLIC_CONFIG_READY = (async () => {
    if (cfg.publicContentEnabled !== true || !apiBase || !apiOrigin) return false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await nativeFetch(`${apiBase}/public/content.json`, {
        method: "GET",
        headers: { "Accept": "application/json" },
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        signal: controller.signal
      });
      if (!response.ok) return false;
      const type = String(response.headers.get("Content-Type") || "").toLowerCase();
      if (!type.includes("application/json")) return false;
      const declared = Number(response.headers.get("Content-Length") || 0);
      if (declared > 1048576) return false;
      const raw = await response.text();
      if (!raw || raw.length > 1048576) return false;
      return applyPublicContent(JSON.parse(raw));
    } catch (_) {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  })();

  window.fetch = async (input, init = {}) => {
    let target = "";
    try { target = typeof input === "string" ? input : String(input?.url || ""); } catch (_) {}
    const sameApi = isApiTarget(target);

    let nextInit = init;
    if (sameApi) {
      const originalHeaders = init?.headers || (input instanceof Request ? input.headers : undefined);
      const headers = new Headers(originalHeaders || {});

      if (cookieAuthEnabled) {
        if ((headers.get("Authorization") || "").trim() === `Bearer ${COOKIE_SENTINEL}`) headers.delete("Authorization");
        if ((headers.get("X-Ghost-Device") || "").trim() === COOKIE_SENTINEL) headers.delete("X-Ghost-Device");
      }

      if (headers.has("Authorization") && !headers.has("X-Ghost-Device")) {
        const device = localStorage.getItem(deviceKey) || "";
        if (device && (!cookieAuthEnabled || device !== COOKIE_SENTINEL)) headers.set("X-Ghost-Device", device);
      }

      nextInit = { ...init, headers, cache: "no-store", referrerPolicy: "no-referrer" };
      if (cookieAuthEnabled) nextInit.credentials = "include";
    }

    const response = await nativeFetch(input, nextInit);

    if (page === "cliente.html" && sameApi && response.status === 401) {
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
