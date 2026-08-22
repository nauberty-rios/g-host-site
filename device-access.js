(() => {
  "use strict";

  const authCfg = window.GHOST_AUTH_CONFIG || {};
  const clientCfg = window.GHOST_CLIENT_CONFIG || {};
  const apiBase = String(authCfg.apiBase || clientCfg.apiBase || "").trim().replace(/\/+$/, "");
  const OWNER_DEVICE_KEY = "ghost_owner_device_v1";
  const STAFF_DEVICE_KEY = "ghost_staff_device_v1";
  const PORTAL_DEVICE_ID_KEY = "ghost_device_id_v1";
  const CAMERA_DEVICE_KEY = "ghost_camera_device_token_v1";
  const PORTAL_TOKEN_KEY = clientCfg.sessionStorageKey || "ghost_portal_token";

  if (!/^https:\/\//i.test(apiBase)) return;

  const make = (tag, className = "", text = "") => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  const statusLabel = value => value === "trusted" ? "Autorizado" : value === "revoked" ? "Revogado" : String(value || "Desconhecido");
  const purposeLabel = value => ({ camera: "CFTV", portal: "Portal", admin: "ADM" }[value] || String(value || "Acesso"));
  const roleLabel = value => ({ visitante: "Visitante", cliente: "Cliente", adm: "ADM", dono: "Dono" }[value] || String(value || "Conta"));

  const request = async (path, { token = "", deviceToken = "", method = "GET", body } = {}) => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (deviceToken) headers["X-Ghost-Device"] = deviceToken;
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers,
      body,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Falha (${response.status}).`);
      error.code = data.code || "";
      error.status = response.status;
      throw error;
    }
    return data;
  };

  const actionButton = (label, handler) => {
    const button = make("button", "btn btn-ghost", label);
    button.type = "button";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try { await handler(); } finally { button.disabled = false; }
    });
    return button;
  };

  const row = ({ title, subtitle, status, current = false, onToggle, onRename }) => {
    const wrapper = make("div", "admin-note");
    const head = make("div");
    const strong = make("strong", "", `${title}${current ? " · este aparelho" : ""}`);
    const small = make("p", "muted", subtitle || "");
    const badge = make("p", "muted", `Status: ${statusLabel(status)}`);
    head.append(strong, small, badge);
    wrapper.append(head);

    const actions = make("div", "admin-actions");
    if (onRename) actions.append(actionButton("Renomear", onRename));
    if (onToggle) actions.append(actionButton(status === "trusted" ? "Revogar" : "Autorizar", onToggle));
    wrapper.append(actions);
    return wrapper;
  };

  const ensureSidebarLink = (id, label) => {
    const sidebar = document.querySelector(".admin-sidebar");
    if (!sidebar || sidebar.querySelector(`a[href="#${id}"]`)) return;
    const link = make("a", "", label);
    link.href = `#${id}`;
    const note = sidebar.querySelector(".admin-note");
    sidebar.insertBefore(link, note || null);
  };

  const ownerToken = () => typeof window.GHOST_ADMIN_SESSION === "function" ? String(window.GHOST_ADMIN_SESSION() || "") : "";
  const ownerDevice = () => localStorage.getItem(OWNER_DEVICE_KEY) || "";
  const staffToken = () => typeof window.GHOST_ADMIN_SESSION === "function" ? String(window.GHOST_ADMIN_SESSION() || "") : "";
  const staffDevice = () => localStorage.getItem(STAFF_DEVICE_KEY) || "";

  const showOwnerError = error => {
    const root = document.getElementById("owner-user-device-list") || document.getElementById("owner-device-list");
    if (root) root.textContent = error.message || "Falha ao carregar aparelhos.";
  };

  const initOwner = async () => {
    const ctx = window.GHOST_CONTROL_CONTEXT;
    if (ctx?.kind !== "owner") return;
    const token = ownerToken();
    const host = document.querySelector(".admin-content");
    if (!token || !host) return;

    let section = document.getElementById("device-access-control");
    if (!section) {
      section = make("section", "admin-card");
      section.id = "device-access-control";
      section.append(make("h2", "", "Aparelhos e acessos"));
      section.append(make("p", "muted", "Controle quais aparelhos do Dono, ADM, clientes e demais contas ficam autorizados."));

      const ownTitle = make("h3", "", "Aparelhos do Dono");
      const ownRoot = make("div");
      ownRoot.id = "owner-device-list";
      section.append(ownTitle, ownRoot);

      const usersTitle = make("h3", "", "Aparelhos por usuário/cargo");
      const select = make("select");
      select.id = "owner-device-account";
      select.append(new Option("Selecione uma conta", ""));
      const userRoot = make("div");
      userRoot.id = "owner-user-device-list";
      section.append(usersTitle, select, userRoot);
      host.append(section);
      ensureSidebarLink("device-access-control", "Aparelhos e acessos");
      select.addEventListener("change", () => loadOwnerUserDevices(select.value).catch(showOwnerError));
    }

    await Promise.all([loadOwnerDevices(), loadOwnerAccounts()]);
  };

  const loadOwnerDevices = async () => {
    const root = document.getElementById("owner-device-list");
    if (!root) return;
    root.textContent = "Carregando aparelhos do Dono...";
    const data = await request("/auth/devices", { token: ownerToken(), deviceToken: ownerDevice() });
    root.replaceChildren();
    if (!(data.items || []).length) {
      root.append(make("p", "muted", "Nenhum aparelho do Dono cadastrado."));
      return;
    }
    for (const item of data.items) {
      root.append(row({
        title: item.label || "Aparelho do Dono",
        subtitle: `Último acesso: ${item.lastSeenAt || "não informado"}`,
        status: item.status,
        current: Boolean(item.current),
        onRename: async () => {
          const label = prompt("Novo nome para este aparelho:", item.label || "Aparelho do Dono");
          if (!label?.trim()) return;
          await request(`/auth/devices/${encodeURIComponent(item.id)}/status`, {
            token: ownerToken(), deviceToken: ownerDevice(), method: "PUT",
            body: JSON.stringify({ status: item.status === "revoked" ? "revoked" : "trusted", label: label.trim() })
          });
          await loadOwnerDevices();
        },
        onToggle: async () => {
          const next = item.status === "trusted" ? "revoked" : "trusted";
          if (next === "revoked" && !confirm("Revogar este aparelho do Dono?")) return;
          await request(`/auth/devices/${encodeURIComponent(item.id)}/status`, {
            token: ownerToken(), deviceToken: ownerDevice(), method: "PUT",
            body: JSON.stringify({ status: next })
          });
          if (item.current && next === "revoked") localStorage.removeItem(OWNER_DEVICE_KEY);
          await loadOwnerDevices();
        }
      }));
    }
  };

  const loadOwnerAccounts = async () => {
    const select = document.getElementById("owner-device-account");
    if (!select) return;
    const current = select.value;
    const data = await request("/admin/users", { token: ownerToken(), deviceToken: ownerDevice() });
    select.replaceChildren(new Option("Selecione uma conta", ""));
    for (const account of data.items || []) {
      const name = account.name || account.email || `Conta #${account.id}`;
      const text = `${name} · ${roleLabel(account.role)} · ${Number(account.trusted_devices || 0)} autorizado(s)`;
      select.append(new Option(text, String(account.id)));
    }
    if ([...select.options].some(option => option.value === current)) select.value = current;
    if (select.value) await loadOwnerUserDevices(select.value);
  };

  const loadOwnerUserDevices = async accountId => {
    const root = document.getElementById("owner-user-device-list");
    if (!root) return;
    root.replaceChildren();
    if (!accountId) {
      root.append(make("p", "muted", "Escolha uma conta para ver os aparelhos."));
      return;
    }
    root.textContent = "Carregando aparelhos da conta...";
    const data = await request(`/admin/users/${encodeURIComponent(accountId)}/devices`, { token: ownerToken(), deviceToken: ownerDevice() });
    root.replaceChildren();
    if (!(data.items || []).length) {
      root.append(make("p", "muted", "Nenhum aparelho cadastrado nesta conta."));
      return;
    }
    for (const item of data.items) {
      root.append(row({
        title: item.label || "Aparelho",
        subtitle: `${purposeLabel(item.purpose)} · último acesso: ${item.last_seen_at || "não informado"}`,
        status: item.status,
        onRename: async () => {
          const label = prompt("Novo nome para este aparelho:", item.label || "Aparelho");
          if (!label?.trim()) return;
          await request(`/admin/users/${encodeURIComponent(accountId)}/devices/${Number(item.id)}/status`, {
            token: ownerToken(), deviceToken: ownerDevice(), method: "PUT",
            body: JSON.stringify({ status: item.status === "revoked" ? "revoked" : "trusted", label: label.trim() })
          });
          await loadOwnerUserDevices(accountId);
        },
        onToggle: async () => {
          const next = item.status === "trusted" ? "revoked" : "trusted";
          if (next === "revoked" && !confirm("Revogar este aparelho desta conta?")) return;
          await request(`/admin/users/${encodeURIComponent(accountId)}/devices/${Number(item.id)}/status`, {
            token: ownerToken(), deviceToken: ownerDevice(), method: "PUT",
            body: JSON.stringify({ status: next })
          });
          await Promise.all([loadOwnerUserDevices(accountId), loadOwnerAccounts()]);
        }
      }));
    }
  };

  const initStaff = async () => {
    const ctx = window.GHOST_CONTROL_CONTEXT;
    if (ctx?.kind !== "staff") return;
    const token = staffToken();
    const host = document.querySelector(".admin-content");
    if (!token || !host) return;

    let section = document.getElementById("staff-device-access-control");
    if (!section) {
      section = make("section", "admin-card");
      section.id = "staff-device-access-control";
      section.append(make("h2", "", "Meus aparelhos ADM"));
      section.append(make("p", "muted", "Revogue, autorize novamente ou renomeie os aparelhos vinculados à sua conta ADM."));
      const root = make("div");
      root.id = "staff-device-list";
      section.append(root);
      host.append(section);
      ensureSidebarLink("staff-device-access-control", "Meus aparelhos");
    }
    await loadStaffDevices();
  };

  const loadStaffDevices = async () => {
    const root = document.getElementById("staff-device-list");
    if (!root) return;
    root.textContent = "Carregando aparelhos ADM...";
    const currentToken = staffDevice();
    const currentId = currentToken.includes(".") ? currentToken.split(".", 1)[0] : "";
    const data = await request("/staff/devices", { token: staffToken(), deviceToken: currentToken });
    root.replaceChildren();
    if (!(data.items || []).length) {
      root.append(make("p", "muted", "Nenhum aparelho ADM cadastrado."));
      return;
    }
    for (const item of data.items) {
      root.append(row({
        title: item.label || "Aparelho ADM",
        subtitle: `Último acesso: ${item.last_seen_at || "não informado"}`,
        status: item.status,
        current: item.device_id === currentId,
        onRename: async () => {
          const label = prompt("Novo nome para este aparelho:", item.label || "Aparelho ADM");
          if (!label?.trim()) return;
          await request(`/staff/devices/${Number(item.id)}/status`, {
            token: staffToken(), deviceToken: staffDevice(), method: "PUT",
            body: JSON.stringify({ status: item.status === "revoked" ? "revoked" : "trusted", label: label.trim() })
          });
          await loadStaffDevices();
        },
        onToggle: async () => {
          const next = item.status === "trusted" ? "revoked" : "trusted";
          if (next === "revoked" && !confirm("Revogar este aparelho ADM?")) return;
          await request(`/staff/devices/${Number(item.id)}/status`, {
            token: staffToken(), deviceToken: staffDevice(), method: "PUT",
            body: JSON.stringify({ status: next })
          });
          if (item.device_id === currentId && next === "revoked") localStorage.removeItem(STAFF_DEVICE_KEY);
          await loadStaffDevices();
        }
      }));
    }
  };

  const portalToken = () => sessionStorage.getItem(PORTAL_TOKEN_KEY) || "";
  const currentPortalDeviceId = () => localStorage.getItem(PORTAL_DEVICE_ID_KEY) || "";

  const initClient = async () => {
    const section = document.getElementById("devices");
    const oldRoot = document.getElementById("client-devices");
    if (!section || !portalToken()) return;
    let root = document.getElementById("ghost-client-device-access");
    if (!root) {
      root = make("div");
      root.id = "ghost-client-device-access";
      section.append(root);
    }
    try {
      await loadClientDevices();
      if (oldRoot) oldRoot.hidden = true;
    } catch (error) {
      root.textContent = error.message || "Falha ao carregar aparelhos.";
      if (oldRoot) oldRoot.hidden = false;
    }
  };

  const loadClientDevices = async () => {
    const root = document.getElementById("ghost-client-device-access");
    if (!root) return;
    root.textContent = "Carregando aparelhos...";
    const data = await request("/portal/devices", { token: portalToken() });
    const limit = document.getElementById("device-limit-label");
    if (limit) limit.textContent = `CFTV: até ${data.cameraDeviceLimit || 2} aparelhos`;
    root.replaceChildren();
    if (!(data.items || []).length) {
      root.append(make("p", "muted", "Nenhum aparelho registrado."));
      return;
    }

    const currentId = currentPortalDeviceId();
    for (const item of data.items) {
      root.append(row({
        title: item.label || "Aparelho",
        subtitle: `${purposeLabel(item.purpose)} · último acesso: ${item.last_seen_at || "não informado"}`,
        status: item.status,
        current: item.device_id === currentId,
        onRename: async () => {
          const label = prompt("Novo nome para este aparelho:", item.label || "Aparelho");
          if (!label?.trim()) return;
          await request(`/portal/devices/${Number(item.id)}/status`, {
            token: portalToken(), method: "PUT",
            body: JSON.stringify({ status: item.status === "revoked" ? "revoked" : "trusted", label: label.trim() })
          });
          await loadClientDevices();
        },
        onToggle: async () => {
          const next = item.status === "trusted" ? "revoked" : "trusted";
          if (next === "revoked" && !confirm("Revogar este aparelho?")) return;

          if (next === "trusted" && item.purpose === "camera" && item.device_id === currentId) {
            const result = await request("/portal/devices/register", {
              token: portalToken(), method: "POST",
              body: JSON.stringify({ deviceId: currentId, label: item.label || "Meu aparelho", purpose: "camera" })
            });
            if (result.deviceToken) localStorage.setItem(CAMERA_DEVICE_KEY, result.deviceToken);
          } else {
            await request(`/portal/devices/${Number(item.id)}/status`, {
              token: portalToken(), method: "PUT",
              body: JSON.stringify({ status: next })
            });
          }

          if (next === "revoked" && item.purpose === "camera" && item.device_id === currentId) {
            localStorage.removeItem(CAMERA_DEVICE_KEY);
          }
          await loadClientDevices();
        }
      }));
    }
  };

  const init = () => {
    initClient().catch(() => {});
    const kind = window.GHOST_CONTROL_CONTEXT?.kind;
    if (kind === "owner") initOwner().catch(showOwnerError);
    if (kind === "staff") initStaff().catch(error => {
      const root = document.getElementById("staff-device-list");
      if (root) root.textContent = error.message || "Falha ao carregar aparelhos ADM.";
    });
  };

  window.addEventListener("ghost-authenticated", init);
  window.addEventListener("ghost-logout", () => {
    document.getElementById("device-access-control")?.remove();
    document.getElementById("staff-device-access-control")?.remove();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
