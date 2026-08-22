(() => {
  "use strict";

  const API = String(window.GHOST_CLIENT_CONFIG?.apiBase || "").replace(/\/$/, "");
  const TOKEN_KEY = window.GHOST_CLIENT_CONFIG?.sessionStorageKey || "ghost_portal_token";
  const DEVICE_ID_KEY = "ghost_device_id_v1";
  const CAMERA_DEVICE_KEY = "ghost_camera_device_token_v1";
  const $ = id => document.getElementById(id);

  const state = {
    token: sessionStorage.getItem(TOKEN_KEY) || "",
    me: null,
    dashboard: null,
    role: "usuario"
  };

  const dashboard = $("client-dashboard");
  const dashboardStatus = $("client-dashboard-status");
  const logoutBtn = $("client-logout");

  const setStatus = (text = "", type = "") => {
    if (!dashboardStatus) return;
    dashboardStatus.textContent = text;
    dashboardStatus.className = `client-status${type ? ` ${type}` : ""}`;
  };

  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;"
  }[ch]));
  const empty = text => `<div class="client-empty">${esc(text)}</div>`;
  const normalizeRole = role => role === "visitante" ? "usuario" : (["usuario","cliente","adm","dono"].includes(role) ? role : "usuario");
  const roleLabel = role => ({ usuario:"Usuário", cliente:"Cliente", adm:"ADM", dono:"Dono" }[normalizeRole(role)] || "Usuário");
  const isClientRole = role => ["cliente","adm","dono"].includes(normalizeRole(role));

  const api = async (path, options = {}) => {
    if (!API) throw new Error("Backend G-Host não configurado.");
    const headers = { "Content-Type":"application/json", ...(options.headers || {}) };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    if (options.deviceToken) headers["X-Ghost-Device"] = options.deviceToken;

    const response = await fetch(`${API}${path}`, {
      ...options,
      headers,
      cache:"no-store",
      credentials:"omit",
      referrerPolicy:"no-referrer"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "Não foi possível concluir a operação.");
      error.code = data.code || "";
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

  const getDeviceId = () => {
    let id = localStorage.getItem(DEVICE_ID_KEY) || "";
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(id)) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "-");
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  };

  const configurationItem = item => `<article class="client-item"><div><strong>${esc(item.name || "Projeto G-Host")}</strong><small>Plano: ${esc(item.plan_id || "não definido")} · atualizado ${esc(item.updated_at || "")}</small></div><span class="status">${esc(item.status || "rascunho")}</span></article>`;
  const quoteItem = item => `<article class="client-item"><div><strong>Proposta #${esc(item.id)}</strong><small>Preferência: ${esc(item.contact_preference || "whatsapp")} · ${esc(item.created_at || "")}</small></div><span class="status">${esc(item.status || "novo")}</span></article>`;
  const projectItem = item => `<article class="client-item"><div><strong>${esc(item.code || "Projeto")} · ${esc(item.name || "")}</strong><small>${esc(item.type || item.location || "Projeto G-Host")}</small></div><div><small>Prazo</small><strong>${esc(item.due_date || "Não informado")}</strong></div><span class="status">${esc(item.status || "")}</span></article>`;
  const assetItem = item => `<article class="client-item"><div><strong>${esc(item.category || "Equipamento")} · ${esc(item.brand || "")} ${esc(item.model || "")}</strong><small>${esc(item.location || item.project_name || "")}</small></div><div><small>Garantia</small><strong>${esc(item.warranty_until || "Não informada")}</strong></div><span class="status">${esc(item.status || "")}</span></article>`;
  const serviceItem = item => `<article class="client-item"><div><strong>${esc(item.kind || "Serviço")}</strong><small>${esc(item.summary || item.project_name || item.site_name || "Atendimento G-Host")}</small></div><div><small>Próxima manutenção</small><strong>${esc(item.next_maintenance_at || "Não agendada")}</strong></div><span class="status">${esc(item.status || "")}</span></article>`;
  const supportTicketItem = item => `<article class="client-item"><div><strong>#${Number(item.id)} · ${esc(item.subject || "Chamado")}</strong><small>${esc(item.description || "")} · prioridade ${esc(item.priority || "normal")}</small></div><span class="status">${esc(item.status || "aberto")}</span></article>`;
  const contractItem = item => `<article class="client-item"><div><strong>${esc(item.code || "Contrato")}</strong><small>Plano: ${esc(item.plan_id || "não informado")} · versão ${esc(item.version || "1")}</small></div><div class="device-actions"><span class="status">${esc(item.status || "")}</span><a class="btn btn-ghost btn-small" href="contrato.html?id=${Number(item.id)}">Ver</a></div></article>`;
  const notificationItem = item => `<article class="client-item notification-${esc(item.severity || "info")}"><div><strong>${esc(item.title || "Notificação")}</strong><small>${esc(item.body || "")}</small></div><div><small>${esc(item.created_at || "")}</small><strong>${item.read_at ? "Lida" : "Nova"}</strong></div></article>`;
  const guardianNode = item => `<article class="client-item"><div><strong>${esc(item.name || "Guardião Hub")}</strong><small>${esc(item.site_name || "Local G-Host")} · versão ${esc(item.software_version || "não informada")}</small></div><div><small>Último contato</small><strong>${esc(item.last_seen_at || "Aguardando")}</strong></div><span class="status">${esc(item.status || "")}</span></article>`;
  const guardianEvent = item => `<article class="client-item"><div><strong>${esc((item.source || "guardiao").toUpperCase())} · ${esc(item.event_type || "evento")}</strong><small>${esc(item.summary || "")}</small></div><div><small>${esc(item.occurred_at || "")}</small><strong>${esc(item.severity || "info")}</strong></div></article>`;
  const cameraItem = item => `<article class="camera-card ${item.health_status === "offline" ? "offline" : ""}"><strong>${esc(item.display_name || item.model || item.category || "Câmera")}</strong><span>${esc(item.location || item.project_name || "Projeto G-Host")}</span><span class="camera-state ${item.health_status === "online" ? "ok" : "warn"}">${esc(item.health_status || (item.monitoring_enabled ? "configurada" : "aguardando integração"))}</span></article>`;

  const setRoleVisibility = role => {
    const user = normalizeRole(role) === "usuario";
    const client = isClientRole(role);

    document.querySelectorAll("[data-user-section]").forEach(el => { el.hidden = !user; });
    document.querySelectorAll("[data-client-section]").forEach(el => { el.hidden = !client; });
    document.querySelectorAll("[data-user-nav]").forEach(el => { el.hidden = !user; });
    document.querySelectorAll("[data-client-nav]").forEach(el => { el.hidden = !client; });

    const primary = $("primary-action");
    if (primary) primary.textContent = client ? "Contratar mais serviços" : "Contratar serviço";
    const title = $("proposal-panel-title");
    if (title) title.textContent = client ? "Novas propostas e ampliações" : "Meus projetos e propostas";

    if (user) {
      $("summary-one-label").textContent = "Configurações";
      $("summary-one-help").textContent = "salvas";
      $("summary-two-label").textContent = "Propostas";
      $("summary-two-help").textContent = "solicitadas";
      $("summary-three-label").textContent = "Em andamento";
      $("summary-three-help").textContent = "negociações";
    } else {
      $("summary-one-label").textContent = "Projetos";
      $("summary-one-help").textContent = "vinculados";
      $("summary-two-label").textContent = "Equipamentos";
      $("summary-two-help").textContent = "registrados";
      $("summary-three-label").textContent = "Chamados/serviços";
      $("summary-three-help").textContent = "em histórico";
    }
  };

  const renderDevices = async () => {
    const data = await api("/portal/devices");
    const limit = $("device-limit-label");
    if (limit) limit.textContent = `CFTV: até ${data.cameraDeviceLimit || 2} aparelhos`;
    const root = $("client-devices");
    if (!root) return;
    root.innerHTML = (data.items || []).map(item => `<article class="client-item"><div><strong>${esc(item.label || "Aparelho")}</strong><small>${esc(item.purpose || "portal")} · ${esc(item.last_seen_at || "")}</small></div><div class="device-actions"><span class="status">${esc(item.status)}</span>${item.status === "trusted" ? `<button class="mini-danger" type="button" data-revoke-device="${Number(item.id)}">Revogar</button>` : ""}</div></article>`).join("") || empty("Nenhum aparelho registrado.");
    root.querySelectorAll("[data-revoke-device]").forEach(btn => btn.addEventListener("click", async () => {
      if (!confirm("Revogar este aparelho?")) return;
      await api(`/portal/devices/${btn.dataset.revokeDevice}/revoke`, { method:"POST", body:"{}" });
      const current = localStorage.getItem(CAMERA_DEVICE_KEY) || "";
      if (current && current.startsWith(`${getDeviceId()}.`)) localStorage.removeItem(CAMERA_DEVICE_KEY);
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
    if (!token) {
      root.innerHTML = empty("Autorize este aparelho para consultar as câmeras vinculadas à sua conta.");
      if (stateLabel) stateLabel.textContent = "Aparelho não autorizado";
      return;
    }
    try {
      const data = await api("/portal/cameras", { deviceToken: token });
      if (stateLabel) stateLabel.textContent = "Aparelho autorizado";
      root.innerHTML = (data.items || []).map(cameraItem).join("") || empty("Nenhuma câmera integrada ao seu projeto ainda.");
    } catch (error) {
      if (["DEVICE_REQUIRED","PORTAL_DEVICE_REVOKED"].includes(error.code)) localStorage.removeItem(CAMERA_DEVICE_KEY);
      if (stateLabel) stateLabel.textContent = "Acesso bloqueado";
      root.innerHTML = empty(error.message);
    }
  };

  const loadGuardian = async () => {
    if (!isClientRole(state.role)) return;
    const nodes = $("guardian-nodes"), events = $("guardian-events");
    if (!nodes || !events) return;
    try {
      const data = await api("/portal/guardian");
      nodes.innerHTML = (data.nodes || []).map(guardianNode).join("") || empty("Nenhum Guardião Hub provisionado para esta conta.");
      events.innerHTML = (data.events || []).map(guardianEvent).join("") || empty("Nenhum evento recente registrado.");
    } catch (error) {
      nodes.innerHTML = empty(error.message);
      events.innerHTML = "";
    }
  };

  const renderEmergencyContacts = async () => {
    if (!isClientRole(state.role)) return;
    const root = $("emergency-contacts");
    if (!root) return;
    const data = await api("/portal/emergency-contacts");
    root.innerHTML = (data.items || []).map(item => `<article class="client-item"><div><strong>${esc(item.name)}</strong><small>${esc(item.relation || "Contato de emergência")}</small></div><div class="device-actions"><a href="tel:${esc(String(item.phone || "").replace(/[^0-9+]/g, ""))}">${esc(item.phone)}</a><button type="button" class="mini-danger" data-delete-contact="${Number(item.id)}">Remover</button></div></article>`).join("") || empty("Nenhum contato cadastrado.");
    root.querySelectorAll("[data-delete-contact]").forEach(btn => btn.addEventListener("click", async () => {
      await api(`/portal/emergency-contacts/${btn.dataset.deleteContact}`, { method:"DELETE" });
      await renderEmergencyContacts();
    }));
  };

  const renderDashboardData = data => {
    const user = state.role === "usuario";
    const quotes = data.quotes || [];
    const configurations = data.configurations || [];
    const openQuotes = quotes.filter(item => !["recusado","convertido","cancelado"].includes(String(item.status || "").toLowerCase()));

    $("client-configurations").innerHTML = configurations.map(configurationItem).join("") || empty("Nenhuma configuração salva ainda. Use 'Contratar serviço' para começar.");
    $("client-quotes").innerHTML = quotes.map(quoteItem).join("") || empty("Nenhuma proposta solicitada ainda.");
    $("client-notifications").innerHTML = (data.notifications || []).map(notificationItem).join("") || empty("Nenhuma notificação.");

    if (user) {
      $("client-project-count").textContent = String(configurations.length);
      $("client-asset-count").textContent = String(quotes.length);
      $("client-service-count").textContent = String(openQuotes.length);
    } else {
      $("client-project-count").textContent = String((data.projects || []).length);
      $("client-asset-count").textContent = String((data.assets || []).length);
      $("client-service-count").textContent = String((data.services || []).length + (data.supportTickets || []).filter(x => !["resolvido","cancelado"].includes(x.status)).length);
      $("client-projects").innerHTML = (data.projects || []).map(projectItem).join("") || empty("Nenhum projeto operacional vinculado.");
      $("client-assets").innerHTML = (data.assets || []).map(assetItem).join("") || empty("Nenhum equipamento registrado.");
      $("client-contracts").innerHTML = (data.contracts || []).map(contractItem).join("") || empty("Nenhum contrato disponível nesta conta.");
      $("client-services").innerHTML = (data.services || []).map(serviceItem).join("") || empty("Nenhum serviço ou manutenção registrado.");
      $("client-support-tickets").innerHTML = (data.supportTickets || []).map(supportTicketItem).join("") || empty("Nenhuma solicitação aberta.");
    }

    $("client-notification-count").textContent = String((data.notifications || []).filter(x => !x.read_at).length);
  };

  const loadDashboard = async () => {
    setStatus("Atualizando sua área...");
    const [me, data] = await Promise.all([api("/portal/me"), api("/portal/dashboard")]);
    state.me = me;
    state.dashboard = data;
    state.role = normalizeRole(me.role);

    $("client-welcome").textContent = `Olá, ${me.person?.name || "usuário"}.`;
    $("client-account-info").textContent = `${me.person?.email || "Conta G-Host"} · perfil ${roleLabel(state.role)}`;
    $("client-role").hidden = false;
    $("client-role").textContent = roleLabel(state.role);
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
    if (!API || !state.token) {
      clearSessionAndRedirect();
      return;
    }
    dashboard.hidden = false;
    try {
      await loadDashboard();
    } catch (error) {
      if (error.status === 401 || ["PORTAL_DEVICE_REQUIRED","PORTAL_DEVICE_REVOKED","PORTAL_SESSION_INVALID"].includes(error.code)) {
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
        method:"POST",
        body:JSON.stringify({
          deviceId:getDeviceId(),
          label:navigator.userAgentData?.platform || navigator.platform || "Navegador",
          purpose:"camera"
        })
      });
      localStorage.setItem(CAMERA_DEVICE_KEY, result.deviceToken);
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
        method:"POST",
        body:JSON.stringify({
          subject:$("support-subject").value,
          priority:$("support-priority").value,
          description:$("support-description").value
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
      await api("/portal/notifications/read", { method:"POST", body:"{}" });
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
        method:"POST",
        body:JSON.stringify({
          name:$("emergency-name").value,
          relation:$("emergency-relation").value,
          phone:$("emergency-phone").value
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
      const lat = pos.coords.latitude.toFixed(6), lon = pos.coords.longitude.toFixed(6), acc = Math.round(pos.coords.accuracy);
      out.replaceChildren();
      const p = document.createElement("p");
      p.textContent = `Latitude ${lat} · Longitude ${lon} · precisão aproximada ${acc} m.`;
      const a = document.createElement("a");
      a.href = `https://maps.google.com/?q=${encodeURIComponent(`${lat},${lon}`)}`;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Abrir localização no mapa";
      out.append(p, a);
    }, () => {
      out.textContent = "Localização não autorizada ou indisponível.";
    }, { enableHighAccuracy:true, timeout:10000, maximumAge:30000 });
  });

  $("client-refresh")?.addEventListener("click", () => loadDashboard().catch(error => {
    if (error.status === 401) return clearSessionAndRedirect();
    setStatus(error.message, "error");
  }));

  logoutBtn?.addEventListener("click", async () => {
    try {
      if (state.token) await api("/portal/logout", { method:"POST", body:"{}" });
    } catch (_) {}
    clearSessionAndRedirect();
  });

  start();
})();
