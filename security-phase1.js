(() => {
  "use strict";

  const COOKIE_SENTINEL = "__gh_cookie__";
  const DEVICE_KEYS = ["ghost_owner_device_v1", "ghost_staff_device_v1", "ghost_portal_device_v1"];
  const CAMERA_DEVICE_KEY = "ghost_camera_device_token_v1";
  const SESSION_KEYS = ["ghost_portal_token"];
  const cfg = window.GHOST_CLIENT_CONFIG || window.GHOST_AUTH_CONFIG || {};
  const apiBase = String(cfg.apiBase || "").replace(/\/+$/, "");
  const apiOrigin = (() => { try { return new URL(apiBase).origin; } catch (_) { return ""; } })();
  const siteKey = String(cfg.turnstileSiteKey || "").trim();
  const cookieApiHost = String(cfg.cookieApiHost || "api.g-host.seg.br").trim().toLowerCase();
  const cookieHostMatches = (() => {
    try { return new URL(apiBase).hostname.toLowerCase() === cookieApiHost; } catch (_) { return false; }
  })();
  const cookieAuthEnabled = cfg.cookieAuthEnabled === true && cookieHostMatches;
  const turnstileState = new Map();
  const widgetIds = new Map();
  const csrfTokens = new Map();

  const protectedActions = new Map([
    ["/portal/login", "login"],
    ["/portal/register/start", "register"],
    ["/portal/password/reset/start", "password_reset"]
  ]);

  const clearLegacySecrets = () => {
    try { DEVICE_KEYS.forEach(key => localStorage.removeItem(key)); } catch (_) {}
  };

  const setCookieSentinel = () => {
    try { SESSION_KEYS.forEach(key => sessionStorage.setItem(key, COOKIE_SENTINEL)); } catch (_) {}
  };

  const parseApiUrl = value => {
    try {
      const url = new URL(value, location.href);
      return apiOrigin && url.origin === apiOrigin ? url : null;
    } catch (_) {
      return null;
    }
  };

  const actionForUrl = value => {
    const url = parseApiUrl(value);
    return url ? (protectedActions.get(url.pathname) || "") : "";
  };

  const csrfScopeForPath = path => {
    if (path.startsWith("/portal/")) return "portal";
    if (path.startsWith("/staff/")) return "staff";
    if (path.startsWith("/auth/")) return "owner";
    if (path.startsWith("/admin/") || path.startsWith("/db/") || path.startsWith("/publish")) {
      const kind = window.GHOST_CONTROL_CONTEXT?.kind;
      return kind === "staff" ? "staff" : "owner";
    }
    return "";
  };

  const csrfPublicMutation = path => new Set([
    "/analytics/event",
    "/portal/register/start",
    "/portal/register/verify",
    "/portal/login",
    "/portal/login/device/verify",
    "/portal/password/reset/start",
    "/portal/password/reset/verify",
    "/staff/password",
    "/staff/email/verify",
    "/staff/totp/verify",
    "/auth/password",
    "/auth/email/verify",
    "/auth/totp/verify"
  ]).has(path);

  const csrfEndpoint = scope => ({
    portal: "/portal/csrf",
    staff: "/staff/csrf",
    owner: "/auth/csrf"
  }[scope] || "");

  const ensureCsrf = async scope => {
    if (!cookieAuthEnabled || !scope || !apiOrigin) return "";
    const cached = String(csrfTokens.get(scope) || "");
    if (cached) return cached;
    const endpoint = csrfEndpoint(scope);
    if (!endpoint) return "";
    const response = await previousFetch(`${apiBase}${endpoint}`, {
      method: "GET",
      headers: { "Accept": "application/json" },
      credentials: "include",
      cache: "no-store",
      referrerPolicy: "no-referrer"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.csrfToken) return "";
    const token = String(data.csrfToken);
    csrfTokens.set(scope, token);
    return token;
  };

  const resetAction = action => {
    if (!action || !window.turnstile) return;
    const widgetId = widgetIds.get(action);
    if (widgetId !== undefined) {
      try { window.turnstile.reset(widgetId); } catch (_) {}
    }
    turnstileState.delete(action);
  };

  const cloneJsonResponse = async (response, patch) => {
    const type = response.headers.get("Content-Type") || "";
    if (!type.includes("application/json")) return response;
    const data = await response.clone().json().catch(() => null);
    if (!data || typeof data !== "object") return response;
    const next = patch(data);
    if (next === data) return response;
    const headers = new Headers(response.headers);
    headers.delete("Content-Length");
    return new Response(JSON.stringify(next), { status: response.status, statusText: response.statusText, headers });
  };

  const previousFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const target = typeof input === "string" ? input : String(input?.url || "");
    const url = parseApiUrl(target);
    if (!url) return previousFetch(input, init);

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined) || {});
    if (cookieAuthEnabled) {
      if ((headers.get("Authorization") || "").trim() === `Bearer ${COOKIE_SENTINEL}`) headers.delete("Authorization");
      if ((headers.get("X-Ghost-Device") || "").trim() === COOKIE_SENTINEL) headers.delete("X-Ghost-Device");
    }

    const action = actionForUrl(target);
    let body = init?.body;
    if (action && typeof body === "string" && body.trim().startsWith("{")) {
      try {
        const json = JSON.parse(body);
        const token = String(turnstileState.get(action) || "");
        if (token && !json.turnstileToken) json.turnstileToken = token;
        body = JSON.stringify(json);
      } catch (_) {}
    }

    const method = String(init?.method || (input instanceof Request ? input.method : "GET") || "GET").toUpperCase();
    const scope = csrfScopeForPath(url.pathname);
    if (cookieAuthEnabled && ["POST", "PUT", "DELETE"].includes(method) && !csrfPublicMutation(url.pathname)) {
      const csrf = await ensureCsrf(scope);
      if (csrf) headers.set("X-Ghost-CSRF", csrf);
    }

    const nextInit = {
      ...init,
      body,
      headers,
      cache: "no-store",
      referrerPolicy: "no-referrer"
    };
    if (cookieAuthEnabled) nextInit.credentials = "include";

    const response = await previousFetch(input, nextInit);

    if (action) resetAction(action);

    if (cookieAuthEnabled && !response.ok && scope) {
      try {
        const data = await response.clone().json().catch(() => ({}));
        if (["CSRF_INVALID", "PORTAL_SESSION_INVALID", "STAFF_SESSION_INVALID", "OWNER_SESSION_INVALID"].includes(String(data?.code || ""))) {
          csrfTokens.delete(scope);
        }
      } catch (_) {}
    }

    if (!cookieAuthEnabled) return response;
    return cloneJsonResponse(response, data => {
      let next = data;
      if (data?.sessionMode === "cookie") {
        clearLegacySecrets();
        setCookieSentinel();
        csrfTokens.clear();
        if (!data.token) next = { ...next, token: COOKIE_SENTINEL };
      }
      if (data?.deviceMode === "cookie") {
        try { localStorage.setItem(CAMERA_DEVICE_KEY, COOKIE_SENTINEL); } catch (_) {}
        if (!next.deviceToken) next = { ...next, deviceToken: COOKIE_SENTINEL };
      }
      return next;
    });
  };

  const formSpecs = () => {
    const path = location.pathname.split("/").pop() || "";
    if (path === "entrar.html") return [["login-form", "login"]];
    if (path === "cadastro.html") return [["register-form", "register"]];
    if (path === "recuperar-senha.html") return [["reset-start-form", "password_reset"]];
    return [];
  };

  const renderTurnstile = () => {
    if (!siteKey || !window.turnstile) return;
    formSpecs().forEach(([formId, action]) => {
      const form = document.getElementById(formId);
      if (!form || widgetIds.has(action)) return;
      const holder = document.createElement("div");
      holder.className = "ghost-turnstile";
      holder.setAttribute("aria-label", "Verificação anti-bot");
      const button = form.querySelector('button[type="submit"]');
      form.insertBefore(holder, button || null);
      const widgetId = window.turnstile.render(holder, {
        sitekey: siteKey,
        action,
        theme: "auto",
        callback: token => turnstileState.set(action, String(token || "")),
        "expired-callback": () => turnstileState.delete(action),
        "error-callback": () => turnstileState.delete(action)
      });
      widgetIds.set(action, widgetId);
    });
  };

  const loadTurnstile = () => {
    if (!siteKey || document.querySelector('script[data-ghost-turnstile]')) return;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.ghostTurnstile = "1";
    script.addEventListener("load", renderTurnstile, { once: true });
    document.head.append(script);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadTurnstile, { once: true });
  else loadTurnstile();

  window.GHOST_PHASE1 = Object.freeze({ COOKIE_SENTINEL, clearLegacySecrets });
})();
