window.GHOST_AUTH_CONFIG = {
  apiBase: "https://g-host-secure.naubertymoraes13.workers.dev",
  inactivitySeconds: 900
};

if (!document.querySelector('script[data-ghost-device-access]')) {
  const script = document.createElement("script");
  script.src = "device-access.js";
  script.defer = true;
  script.dataset.ghostDeviceAccess = "1";
  document.head.append(script);
}
