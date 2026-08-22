(() => {
  "use strict";

  const cfg = window.GHOST_CLIENT_CONFIG || {};
  const API = String(cfg.apiBase || "").replace(/\/$/, "");
  const TOKEN_KEY = cfg.sessionStorageKey || "ghost_portal_token";
  const DEVICE_ID_KEY = "ghost_device_id_v1";
  const CAMERA_DEVICE_KEY = "ghost_camera_device_token_v1";
  const COOKIE_SENTINEL = "__gh_cookie__";
  const $ = id => document.getElementById(id);

  const cookieMode = (() => {
    if (cfg.cookieAuthEnabled !== true || !API) return false;
    try {
      return new URL(API).hostname.toLowerCase() === String(cfg.cookieApiHost || "api.g-host.seg.br").toLowerCase();
    } catch (_) {
      return false;
    }
  })();

  const state = {
    token: sessionStorage.getItem(TOKEN_KEY) || (cookieMode ? COOKIE_SENTINEL : ""),
    me: null,
    dashboard: null,
    role: "usuario"
  };

  const dashboard = $("client-dashboard");
  const dashboardStatus = $("client-dashboard-status");
  const logoutBtn = $("client-logout");

  const setStatus = (text = "", type = "") => {
    if (!dashboardStatus) return;
    dashboardStatus.textContent = String(text || "");
    dashboardStatus.className = `client-status${type ? ` ${type}` : ""}`;
  };

  const make = (tag, className = "", text = undefined) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = String(text ?? "");
    return el;
  };

  const addTextPair = (parent, primary, secondary) => {
    const box = make("div");
    box.append(make("strong", "", primary), make("small", "", secondary));
    parent.append(box);
    return box;
  };

  const addMetaPair = (parent, label, value) => {
    const box = make("div");
    box.append(make("small", "", label), make("strong", "", value));
    parent.append(box);
    return box;
  };

  const statusNode = text => make("span", "status", text);
  const emptyNode = text => make("div", "client-empty", text);

  const renderList = (root, items, renderer, emptyText) => {
    if (!root) return;
    root.replaceChildren();
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      root.append(emptyNode(emptyText));
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const item of list) {
      const node = renderer(item);
      if (node instanceof Node) fragment.append(node);
    }
    if (!fragment.childNodes.length) fragment.append(emptyNode(emptyText));
    root.append(fragment);
  };

  const normalizeRole = role => role === "visitante" ? "usuario" : (["usuario", "cliente", "adm", "dono"].includes(role) ? role : "usuario");
  const roleLabel = role => ({ usuario: "Usuário", cliente: "Cliente", adm: "ADM", dono: "Dono" }[normalizeRole(role)] || "Usuário");
  const isClientRole = role => ["cliente", "adm", "dono"].includes(normalizeRole(role));

  const api = async (path, options = {}) => {
    if (!API) throw new Error("Backend G-Host não configurado.");
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    if (options.deviceToken) headers["X-Ghost-Device"] = options.deviceToken;

    const response = await fetch(`${API}${path}`, {
      ...options,
      headers,
      cache: "no-store",
      credentials: cookieMode ? "include" : "omit",
      referrerPolicy: "no-referrer"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "Não foi possível concluir a operação.");
      error.code = String(data.code || "");
      error.status = response.status;
      throw error;
    }
    return data;
  };

  const clearSessionAndRedirect = () => {
    state.token = "";
    sessionStorage.removeItem(TOKEN_KEY);
    location.replace("entrar.html");
  };

  const secureRandomId = () => {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return `dev-${Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")}`;
  };

  const getDeviceId = () => {
    let id = localStorage.getItem(DEVICE_ID_KEY) || "";
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(id)) {
      id = secureRandomId().replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 120);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  };

  const configurationItem = item => {
    const article = make("article", "client-item");
    addTextPair(article, item?.name || "Projeto G-Host", `Plano: ${item?.plan_id || "não definido"} · atualizado ${item?.updated_at || ""}`);
    article.append(statusNode(item?.status || "rascunho"));
    return article;
  };

  const quoteItem = item => {
    const article = make("article", "client-item");
    addTextPair(article, `Proposta #${Number(item?.id) || 0}`, `Preferência: ${item?.contact_preference || "whatsapp"} · ${item?.created_at || ""}`);
    article.append(statusNode(item?.status || "novo"));
    return article;
  };

  const projectItem = item => {
    const article = make("article", "client-item");
    addTextPair(article, `${item?.code || "Projeto"} · ${item?.name || ""}`, item?.type || item?.location || "Projeto G-Host");
    addMetaPair(article, "Prazo", item?.due_date || "Não informado");
    article.append(statusNode(item?.status || ""));
    return article;
  };

  const assetItem = item => {
    const article = make("article", "client-item");
    addTextPair(article, `${item?.category || "Equipamento"} · ${item?.brand || ""} ${item?.model || ""}`.trim(), item?.location || item?.project_name || "");
    addMetaPair(article, "Garantia", item?.warranty_until || "Não informada");
    article.append(statusNode(item?.status || ""));
    return article;
  };

  const serviceItem = item => {
    const article = make("article", "client-item");
    addTextPair(article, item?.kind || "Serviço", item?.summary || item?.project_name || item?.site_name || "Atendimento G-Host");
    addMetaPair(article, "Próxima manutenção", item?.next_maintenance_at || "Não agendada");
    article.append(statusNode(item?.status || ""));
    return article;
  };

  const supportTicketItem = item => {
    const article = make("article", "client-item");
    addTextPair(article, `#${Number(item?.id) || 0} · ${item?.subject || "Chamado"}`, `${item?.description || ""} · prioridade ${item?.priority || "normal"}`);
    article.append(statusNode(item?.status || "aberto"));
    return article;
  };

  const contractItem = item => {
    const article = make("article", "client-item");
    addTextPair(article, item?.code || "Contrato", `Plano: ${item?.plan_id || "não informado"} · versão ${item?.version || "1"}`);
    const actions = make("div", "device-actions");
    actions.append(statusNode(item?.status || ""));
    const id = Number(item?.id);
    if (Number.isInteger(id) && id > 0) {
      const link = make("a", "btn btn-ghost btn-small", "Ver");
      link.href = `contrato.html?id=${id}`;
      actions.append(link);
    }
    article.append(actions);
    return article;
  };

  const notificationItem = item => {
    const allowed = new Set(["info", "warning", "critical", "success"]);
    const severity = allowed.has(String(item?.severity || "")) ? String(item.severity) : "info";
    const article = make("article", `client-item notification-${severity}`);
    addTextPair(article, item?.title || "Notificação", item?.body || "");
    addMetaPair(article, item?.created_at || "", item?.read_at ? "Lida" : "Nova");
    return article;
  };

  const guardianNode = item => {
    const article = make("article", "client-item");
    addTextPair(article, item?.name || "Guardião Hub", `${item?.site_name || "Local G-Host"} · versão ${item?.software_version || "não informada"}`);
    addMetaPair(article, "Último contato", item?.last_seen_at || "Aguardando");
    article.append(statusNode(item?.status || ""));
    return article;
  };

  const guardianEvent = item => {
    const article = make("article", "client-item");
    addTextPair(article, `${String(item?.source || "guardiao").toUpperCase()} · ${item?.event_type || "evento"}`, item?.summary || "");
    addMetaPair(article, item?.occurred_at || "", item?.severity || "info");
    return article;
  };

  const cameraItem = item => {
    const offline = item?.health_status === "offline";
    const article = make("article", `camera-card${offline ? " offline" : ""}`);
    article.append(
      make("strong", "", item?.display_name || item?.model || item?.category || "Câmera"),
      make("span", "", item?.location || item?.project_name || "Projeto G-Host"),
      make("span", `camera-state ${item?.health_status === "online" ? "ok" : "warn"}`, item?.health_status || (item?.monitoring_enabled ? "configurada" : "aguardando integração"))
    );
    return article;
  };

  const setText = (id, value) => {
    const el = $(id);
    if (el) el.textContent = String(value ?? "");
  };

  const setRoleVisibility = role => {
    const user = normalizeRole(role) === "usuario";
    const client = isClientRole(role);

    document.querySelectorAll("[data-user-section]").forEach(el => { el.hidden = !user; });
    document.querySelectorAll("[data-client-section]").forEach(el => { el.hidden = !client; });
    document.querySelectorAll("[data-user-nav]").forEach(el => { el.hidden = !user; });
    document.querySelectorAll("[data-client-nav]").forEach(el => { el.hidden = !client; });

    setText("primary-action", client ? "Contratar mais serviços" : "Contratar serviço");
    setText("proposal-panel-title", client ? "Novas propostas e ampliações" : "Meus projetos e propostas");

    if (user) {
      setText("summary-one-label", "Configurações");
      setText("summary-one-help", "salvas");
      setText("summary-two-label", "Propostas");
      setText("summary-two-help", "solicitadas");
      setText("summary-three-label", "Em andamento");
      setText("summary-three-help", "negociações");
    } else {
      setText("summary-one-label", "Projetos");
      setText("summary-one-help", "vinculados");
      setText("summary-two-label", "Equipamentos");
      setText("summary-two-help", "registrados");
      setText("summary-three-label", "Chamados/serviços");
      setText("summary-three-help", "em histórico");
    }
  };

  const deviceItem = item => {
    const article = make("article", "client-item");
    addTextPair(article, item?.label || "Aparelho", `${item?.purpose || "portal"} · ${item?.last_seen_at || ""}`);
    const actions = make("div", "device-actions");
    actions.append(statusNode(item?.status || ""));
    const id = Number(item?.id);
    if (item?.status === "trusted" && Number.isInteger(id) && id > 0) {
      const button = make("button", "mini-danger", "Revogar");
      button.type = "button";
      button.dataset.revokeDevice = String(id);
      actions.append(button);
    }
    article.append(actions);
    return article;
  };

  const renderDevices = async () => {
    const data = await api("/portal/devices");
    setText("device-limit-label", `CFTV: até ${data.cameraDeviceLimit || 2} aparelhos`);
    const root = $("client-devices");
    renderList(root, data.items, deviceItem, "Nenhum aparelho registrado.");
    root?.querySelectorAll("[data-revoke-device]").forEach(btn => btn.addEventListener("click", async () => {
      if (!confirm("Revogar este aparelho?")) return;
      await api(`/portal/devices/${btn.dataset.revokeDevice}/revoke`, { method: "POST", body: "{}" });
      if (!cookieMode) {
        const current = localStorage.getItem(CAMERA_DEVICE_KEY) || "";
        if (current && current.startsWith(`${getDeviceId()}.`)) localStorage.removeItem(CAMERA_DEVICE_KEY);
      }
      await renderDevices();
      await loadCameras();
    }));
  };

  const loadCameras = async () => {
    const root = $("client-cameras");
    if (!root || !isClientRole(state.role)) return;
    const button = $("authorize-camera-device");
    const stateLabel = $("camera-device-state");
    if (button) button.hidden = false;

    const token = localStorage.getItem(CAMERA_DEVICE_KEY) || "";
    if (!cookieMode && !token) {
      root.replaceChildren(emptyNode("Autorize este aparelho para consultar as câmeras vinculadas à sua conta."));
      if (stateLabel) stateLabel.textContent = "Aparelho não autorizado";
      return;
    }

    try {
      const data = await api("/portal/cameras", { deviceToken: cookieMode ? "" : token });
      if (stateLabel) stateLabel.textContent = "Aparelho autorizado";
      renderList(root, data.items, cameraItem, "Nenhuma câmera integrada ao seu projeto ainda.");
    } catch (error) {
      if (!cookieMode && ["DEVICE_REQUIRED", "PORTAL_DEVICE_REVOKED"].includes(error.code)) localStorage.removeItem(CAMERA_DEVICE_KEY);
      if (stateLabel) stateLabel.textContent = "Acesso bloqueado";
      root.replaceChildren(emptyNode(error.message));
    }
  };

  const loadGuardian = async () => {
    if (!isClientRole(state.role)) return;
    const nodes = $("guardian-nodes");
    const events = $("guardian-events");
    if (!nodes || !events) return;
    try {
      const data = await api("/portal/guardian");
      renderList(nodes, data.nodes, guardianNode, "Nenhum Guardião Hub provisionado para esta conta.");
      renderList(events, data.events, guardianEvent, "Nenhum evento recente registrado.");
    } catch (error) {
      nodes.replaceChildren(emptyNode(error.message));
      events.replaceChildren();
    }
  };

  const emergencyContactItem = item => {
    const article = make("article", "client-item");
    addTextPair(article, item?.name || "Contato", item?.relation || "Contato de emergência");
    const actions = make("div", "device-actions");
    const phoneText = String(item?.phone || "");
    const phoneHref = phoneText.replace(/[^0-9+]/g, "");
    const phone = make("a", "", phoneText);
    if (/^\+?\d{8,15}$/.test(phoneHref)) phone.href = `tel:${phoneHref}`;
    else phone.removeAttribute("href");
    actions.append(phone);
    const id = Number(item?.id);
    if (Number.isInteger(id) && id > 0) {
      const button = make("button", "mini-danger", "Remover");
      button.type = "button";
      button.dataset.deleteContact = String(id);
      actions.append(button);
    }
    article.append(actions);
    return article;
  };

  const renderEmergencyContacts = async () => {
    if (!isClientRole(state.role)) return;
    const root = $("emergency-contacts");
    if (!root) return;
    const data = await api("/portal/emergency-contacts");
    renderList(root, data.items, emergencyContactItem, "Nenhum contato cadastrado.");
    root.querySelectorAll("[data-delete-contact]").forEach(btn => btn.addEventListener("click", async () => {
      await api(`/portal/emergency-contacts/${btn.dataset.deleteContact}`, { method: "DELETE" });
      await renderEmergencyContacts();
    }));
  };

  const renderDashboardData = data => {
    const user = state.role === "usuario";
    const quotes = Array.isArray(data.quotes) ? data.quotes : [];
    const configurations = Array.isArray(data.configurations) ? data.configurations : [];
    const notifications = Array.isArray(data.notifications) ? data.notifications : [];
    const openQuotes = quotes.filter(item => !["recusado", "convertido", "cancelado"].includes(String(item?.status || "").toLowerCase()));

    renderList($("client-configurations"), configurations, configurationItem, "Nenhuma configuração salva ainda. Use 'Contratar serviço' para começar.");
    renderList($("client-quotes"), quotes, quoteItem, "Nenhuma proposta solicitada ainda.");
    renderList($("client-notifications"), notifications, notificationItem, "Nenhuma notificação.");

    if (user) {
      setText("client-project-count", configurations.length);
      setText("client-asset-count", quotes.length);
      setText("client-service-count", openQuotes.length);
    } else {
      const projects = Array.isArray(data.projects) ? data.projects : [];
      const assets = Array.isArray(data.assets) ? data.assets : [];
      const services = Array.isArray(data.services) ? data.services : [];
      const tickets = Array.isArray(data.supportTickets) ? data.supportTickets : [];
      const contracts = Array.isArray(data.contracts) ? data.contracts : [];

      setText("client-project-count", projects.length);
      setText("client-asset-count", assets.length);
      setText("client-service-count", services.length + tickets.filter(x => !["resolvido", "cancelado"].includes(String(x?.status || ""))).length);
      renderList($("client-projects"), projects, projectItem, "Nenhum projeto operacional vinculado.");
      renderList($("client-assets"), assets, assetItem, "Nenhum equipamento registrado.");
      renderList($("client-contracts"), contracts, contractItem, "Nenhum contrato disponível nesta conta.");
      renderList($("client-services"), services, serviceItem, "Nenhum serviço ou manutenção registrado.");
      renderList($("client-support-tickets"), tickets, supportTicketItem, "Nenhuma solicitação aberta.");
    }

    setText("client-notification-count", notifications.filter(x => !x?.read_at).length);
  };

  const loadDashboard = async () => {
    setStatus("Atualizando sua área...");
    const [me, data] = await Promise.all([api("/portal/me"), api("/portal/dashboard")]);
    state.me = me;
    state.dashboard = data;
    state.role = normalizeRole(me.role);

    setText("client-welcome", `Olá, ${me.person?.name || "usuário"}.`);
    setText("client-account-info", `${me.person?.email || "Conta G-Host"} · perfil ${roleLabel(state.role)}`);
    const roleEl = $("client-role");
    if (roleEl) {
      roleEl.hidden = false;
      roleEl.textContent = roleLabel(state.role);
    }
    const adminLink = $("client-admin-link");
    if (adminLink) adminLink.hidden = state.role !== "adm";

    setRoleVisibility(state.role);
    renderDashboardData(data);

    if (isClientRole(state.role)) {
      await Promise.all([renderDevices(), loadCameras(), loadGuardian(), renderEmergencyContacts()]);
    }

    setStatus("Dados atualizados.", "success");
  };

  const start = async () => {
    if (!API || (!state.token && !cookieMode)) {
      clearSessionAndRedirect();
      return;
    }
    if (dashboard) dashboard.hidden = false;
    try {
      await loadDashboard();
    } catch (error) {
      if (error.status === 401 || ["PORTAL_DEVICE_REQUIRED", "PORTAL_DEVICE_REVOKED", "PORTAL_SESSION_INVALID"].includes(error.code)) {
        clearSessionAndRedirect();
        return;
      }
      setStatus(error.message, "error");
    }
  };

  $("authorize-camera-device")?.addEventListener("click", async () => {
    if (!isClientRole(state.role)) return;
    setStatus("Autorizando este aparelho...");
    try {
      const result = await api("/portal/devices/register", {
        method: "POST",
        body: JSON.stringify({
          deviceId: getDeviceId(),
          label: navigator.userAgentData?.platform || navigator.platform || "Navegador",
          purpose: "camera"
        })
      });
      if (!cookieMode && result.deviceToken) localStorage.setItem(CAMERA_DEVICE_KEY, result.deviceToken);
      await Promise.all([renderDevices(), loadCameras()]);
      setStatus("Aparelho autorizado para CFTV.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  $("support-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!isClientRole(state.role)) return;
    setStatus("Enviando sua solicitação...");
    try {
      await api("/portal/support", {
        method: "POST",
        body: JSON.stringify({
          subject: $("support-subject")?.value || "",
          priority: $("support-priority")?.value || "normal",
          description: $("support-description")?.value || ""
        })
      });
      event.target.reset();
      setStatus("Solicitação enviada. Você pode acompanhar o andamento nesta página.", "success");
      await loadDashboard();
      location.hash = "acompanhamento";
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  $("notifications-read")?.addEventListener("click", async () => {
    try {
      await api("/portal/notifications/read", { method: "POST", body: "{}" });
      await loadDashboard();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  $("emergency-contact-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!isClientRole(state.role)) return;
    try {
      await api("/portal/emergency-contacts", {
        method: "POST",
        body: JSON.stringify({
          name: $("emergency-name")?.value || "",
          relation: $("emergency-relation")?.value || "",
          phone: $("emergency-phone")?.value || ""
        })
      });
      event.target.reset();
      await renderEmergencyContacts();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  $("get-location")?.addEventListener("click", () => {
    if (!isClientRole(state.role)) return;
    const out = $("location-result");
    if (!out) return;
    out.hidden = false;
    out.textContent = "Obtendo localização com sua autorização...";
    if (!navigator.geolocation) {
      out.textContent = "Geolocalização não disponível neste aparelho.";
      return;
    }
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude.toFixed(6);
      const lon = pos.coords.longitude.toFixed(6);
      const acc = Math.round(pos.coords.accuracy);
      out.replaceChildren();
      const p = make("p", "", `Latitude ${lat} · Longitude ${lon} · precisão aproximada ${acc} m.`);
      const a = make("a", "", "Abrir localização no mapa");
      a.href = `https://maps.google.com/?q=${encodeURIComponent(`${lat},${lon}`)}`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      out.append(p, a);
    }, () => {
      out.textContent = "Localização não autorizada ou indisponível.";
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  });

  $("client-refresh")?.addEventListener("click", () => loadDashboard().catch(error => {
    if (error.status === 401) return clearSessionAndRedirect();
    setStatus(error.message, "error");
  }));

  logoutBtn?.addEventListener("click", async () => {
    try {
      if (state.token || cookieMode) await api("/portal/logout", { method: "POST", body: "{}" });
    } catch (_) {}
    clearSessionAndRedirect();
  });

  start();
})();
