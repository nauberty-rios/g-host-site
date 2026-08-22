(() => {
  "use strict";

  const COOKIE_SENTINEL = "__gh_cookie__";
  const DEVICE_KEYS = ["ghost_owner_device_v1", "ghost_staff_device_v1", "ghost_portal_device_v1"];
  const CAMERA_DEVICE_KEY = "ghost_camera_device_token_v1";
  const SESSION_KEYS = ["ghost_portal_token"];
  const cfg = window.GHOST_CLIENT_CONFIG || window.GHOST_AUTH_CONFIG || {};
  const apiBase = String(cfg.apiBase || "").replace(/\/+$/, "");
  const siteKey = String(cfg.turnstileSiteKey || "").trim();
  const cookieAuthEnabled = cfg.cookieAuthEnabled === true;
  const turnstileState = new Map();
  const widgetIds = new Map();

  const protectedActions = new Map([
    ["/portal/login", "login"],
    ["/portal/register/start", "register"],
    ["/portal/password/reset/start", "password_reset"],
    ["/staff/password", "staff_login"],
    ["/auth/password", "owner_login"]
  ]);

  const clearLegacySecrets = () => {
    try { DEVICE_KEYS.forEach(key => localStorage.removeItem(key)); } catch (_) {}
  };

  const setCookieSentinel = () => {
    try { SESSION_KEYS.forEach(key => sessionStorage.setItem(key, COOKIE_SENTINEL)); } catch (_) {}
  };

  const actionForUrl = value => {
    try {
      const url = new URL(value, location.href);
      if (!apiBase || !url.href.startsWith(apiBase)) return "";
      return protectedActions.get(url.pathname) || "";
    } catch (_) {
      return "";
    }
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
    const sameApi = Boolean(apiBase && target.startsWith(apiBase));
    if (!sameApi) return previousFetch(input, init);

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

    if (!cookieAuthEnabled) return response;
    return cloneJsonResponse(response, data => {
      let next = data;
      if (data?.sessionMode === "cookie") {
        clearLegacySecrets();
        setCookieSentinel();
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
    if (path.startsWith("staff")) return [["step-password", "staff_login"]];
    if (["admin.html", "planos-admin.html", "catalogo-admin.html", "visibilidade-admin.html"].includes(path)) return [["step-password", "owner_login"]];
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
