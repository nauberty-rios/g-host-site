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

  // Painéis administrativos não devem funcionar embutidos em outro site.
  const page = location.pathname.split("/").pop() || "";
  const protectedPages = new Set([
    "admin.html", "staff.html", "planos-admin.html", "catalogo-admin.html",
    "visibilidade-admin.html", "staff-planos.html", "staff-catalogo.html",
    "staff-visibilidade.html"
  ]);
  if (protectedPages.has(page) && window.top !== window.self) {
    document.documentElement.replaceChildren();
    return;
  }

  // Em um aparelho novo, o Worker pode negar a sessão mas devolver o segredo
  // do aparelho pendente. Guardamos somente esse segredo; nenhum token de sessão
  // é criado até o aparelho ser explicitamente autorizado no servidor.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const target = typeof args[0] === "string" ? args[0] : String(args[0]?.url || "");
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
