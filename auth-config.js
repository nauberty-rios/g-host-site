window.GHOST_AUTH_CONFIG = {
  apiBase: "https://g-host-secure.naubertymoraes13.workers.dev",
  inactivitySeconds: 900,
  cookieAuthEnabled: false,
  cookieApiHost: "api.g-host.seg.br",
  publicContentEnabled: false,
  turnstileSiteKey: ""
};

(() => {
  "use strict";

  const cfg = window.GHOST_AUTH_CONFIG || {};
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

  window.GHOST_PUBLIC_CONFIG_READY = window.GHOST_PUBLIC_CONFIG_READY || (async () => {
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

  let contentGateReleased = cfg.publicContentEnabled !== true;
  let contentGateReplaying = false;
  window.addEventListener("ghost-authenticated", event => {
    if (contentGateReleased) return;
    event.stopImmediatePropagation();
    if (contentGateReplaying) return;
    contentGateReplaying = true;
    Promise.resolve(window.GHOST_PUBLIC_CONFIG_READY).finally(() => {
      contentGateReleased = true;
      window.dispatchEvent(new CustomEvent("ghost-authenticated"));
    });
  }, true);

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
        const kind = window.GHOST_CONTROL_CONTEXT?.kind || (page.startsWith("staff") ? "staff" : "owner");
        const device = localStorage.getItem(kind === "staff" ? STAFF_DEVICE_KEY : OWNER_DEVICE_KEY) || "";
        if (device && (!cookieAuthEnabled || device !== COOKIE_SENTINEL)) headers.set("X-Ghost-Device", device);
      }

      nextInit = { ...init, headers, cache: "no-store", referrerPolicy: "no-referrer" };
      if (cookieAuthEnabled) nextInit.credentials = "include";
    }

    const response = await nativeFetch(input, nextInit);

    try {
      if (sameApi && !response.ok) {
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
