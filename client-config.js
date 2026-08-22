window.GHOST_CLIENT_CONFIG = {
  apiBase: "https://g-host-secure.naubertymoraes13.workers.dev",
  sessionStorageKey: "ghost_portal_token",
  portalDeviceStorageKey: "ghost_portal_device_v1"
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

  // Toda chamada autenticada do portal leva o segredo do aparelho confiável.
  // Se a chamada já estiver usando um token específico de CFTV, ele é preservado.
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
    return nativeFetch(input, nextInit);
  };

  // A área autenticada não aceita mais uma sessão antiga sem aparelho de portal vinculado.
  if (page === "cliente.html") {
    const token = sessionStorage.getItem(tokenKey) || "";
    const device = localStorage.getItem(deviceKey) || "";
    if (!token || !device) {
      sessionStorage.removeItem(tokenKey);
      location.replace("entrar.html");
      return;
    }

    // Se uma sessão expirar e a tela antiga de login interno aparecer, encaminha
    // para o fluxo dedicado, que possui verificação de novo aparelho por e-mail.
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
