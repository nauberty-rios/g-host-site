(() => {
  "use strict";

  const API = String(window.GHOST_CLIENT_CONFIG?.apiBase || "").replace(/\/$/, "");
  const TOKEN_KEY = window.GHOST_CLIENT_CONFIG?.sessionStorageKey || "ghost_portal_token";
  const DEVICE_ID_KEY = "ghost_device_id_v1";
  const CAMERA_DEVICE_KEY = "ghost_camera_device_token_v1";
  const $ = id => document.getElementById(id);
  const state = {
    token: sessionStorage.getItem(TOKEN_KEY) || "",
    registerChallenge: "",
    resetChallenge: "",
    me: null,
    dashboard: null
  };

  const auth = $("client-auth"), dashboard = $("client-dashboard"), logoutBtn = $("client-logout");
  const authStatus = $("client-auth-status"), dashboardStatus = $("client-dashboard-status");
  const loginForm = $("client-login-form"), registerForm = $("client-register-form"), verifyForm = $("client-verify-form");
  const resetForm = $("client-reset-form"), resetVerifyForm = $("client-reset-verify-form");

  const setStatus = (el, text = "", type = "") => { if (!el) return; el.textContent = text; el.className = `client-status${type ? ` ${type}` : ""}`; };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const empty = text => `<div class="client-empty">${esc(text)}</div>`;
  const roleLabel = role => ({ visitante:"Visitante", cliente:"Cliente", adm:"ADM", dono:"Dono" }[role] || "Visitante");

  const api = async (path, options = {}) => {
    if (!API) throw new Error("Backend G-Host não configurado.");
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    if (options.deviceToken) headers["X-Ghost-Device"] = options.deviceToken;
    const response = await fetch(`${API}${path}`, { ...options, headers, cache: "no-store", referrerPolicy: "no-referrer" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || "Não foi possível concluir a operação.");
      error.code = data.code || ""; error.status = response.status; throw error;
    }
    return data;
  };

  const setToken = token => {
    state.token = token || "";
    if (state.token) sessionStorage.setItem(TOKEN_KEY, state.token); else sessionStorage.removeItem(TOKEN_KEY);
  };

  const getDeviceId = () => {
    let id = localStorage.getItem(DEVICE_ID_KEY) || "";
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(id)) {
      id = (crypto.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "-");
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  };

  const showAuthForm = mode => {
    [loginForm, registerForm, verifyForm, resetForm, resetVerifyForm].forEach(x => { if (x) x.hidden = true; });
    [$("tab-login"),$("tab-register"),$("tab-reset")].forEach(x => x?.classList.remove("active"));
    if (mode === "register") { registerForm.hidden = false; $("tab-register").classList.add("active"); }
    else if (mode === "verify") verifyForm.hidden = false;
    else if (mode === "reset") { resetForm.hidden = false; $("tab-reset").classList.add("active"); }
    else if (mode === "reset-verify") { resetVerifyForm.hidden = false; $("tab-reset").classList.add("active"); }
    else { loginForm.hidden = false; $("tab-login").classList.add("active"); }
    setStatus(authStatus, "");
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

  const renderDevices = async () => {
    const data = await api("/portal/devices");
    $("device-limit-label").textContent = `CFTV: até ${data.cameraDeviceLimit || 2} aparelhos`;
    $("client-devices").innerHTML = (data.items || []).map(item => `<article class="client-item"><div><strong>${esc(item.label || "Aparelho")}</strong><small>${esc(item.purpose)} · ${esc(item.last_seen_at || "")}</small></div><div class="device-actions"><span class="status">${esc(item.status)}</span>${item.status === "trusted" ? `<button class="mini-danger" type="button" data-revoke-device="${Number(item.id)}">Revogar</button>` : ""}</div></article>`).join("") || empty("Nenhum aparelho registrado.");
    document.querySelectorAll("[data-revoke-device]").forEach(btn => btn.addEventListener("click", async () => {
      if (!confirm("Revogar este aparelho? Se ele for usado para CFTV, precisará ser autorizado novamente.")) return;
      await api(`/portal/devices/${btn.dataset.revokeDevice}/revoke`, { method:"POST", body:"{}" });
      const current = localStorage.getItem(CAMERA_DEVICE_KEY) || "";
      if (current && current.startsWith(`${getDeviceId()}.`)) localStorage.removeItem(CAMERA_DEVICE_KEY);
      await renderDevices(); await loadCameras();
    }));
  };

  const loadCameras = async () => {
    const root = $("client-cameras");
    if (!["cliente","adm","dono"].includes(state.me?.role)) {
      root.innerHTML = empty("As câmeras serão liberadas quando sua conta for promovida a Cliente e houver CFTV contratado.");
      $("authorize-camera-device").hidden = true; $("camera-device-state").textContent = "CFTV não liberado"; return;
    }
    $("authorize-camera-device").hidden = false;
    const token = localStorage.getItem(CAMERA_DEVICE_KEY) || "";
    if (!token) { root.innerHTML = empty("Autorize este aparelho para consultar as câmeras vinculadas à sua conta."); $("camera-device-state").textContent = "Aparelho não autorizado"; return; }
    try {
      const data = await api("/portal/cameras", { deviceToken: token });
      $("camera-device-state").textContent = "Aparelho autorizado";
      root.innerHTML = (data.items || []).map(cameraItem).join("") || empty("Nenhuma câmera integrada ao Gateway G-Host ainda.");
    } catch (error) {
      if (error.code === "DEVICE_REQUIRED") localStorage.removeItem(CAMERA_DEVICE_KEY);
      $("camera-device-state").textContent = "Acesso bloqueado"; root.innerHTML = empty(error.message);
    }
  };

  const loadGuardian = async () => {
    try {
      const data = await api("/portal/guardian");
      $("guardian-nodes").innerHTML = (data.nodes || []).map(guardianNode).join("") || empty("Nenhum Guardião Hub provisionado para esta conta.");
      $("guardian-events").innerHTML = (data.events || []).map(guardianEvent).join("") || empty("Nenhum evento Guardião/Horus/Sentinela registrado.");
    } catch (error) { $("guardian-nodes").innerHTML = empty(error.message); $("guardian-events").innerHTML = ""; }
  };

  const renderEmergencyContacts = async () => {
    const data = await api("/portal/emergency-contacts");
    $("emergency-contacts").innerHTML = (data.items || []).map(item => `<article class="client-item"><div><strong>${esc(item.name)}</strong><small>${esc(item.relation || "Contato de emergência")}</small></div><div class="device-actions"><a href="tel:${esc(String(item.phone||"").replace(/[^0-9+]/g,""))}">${esc(item.phone)}</a><button type="button" class="mini-danger" data-delete-contact="${Number(item.id)}">Remover</button></div></article>`).join("") || empty("Nenhum contato cadastrado.");
    document.querySelectorAll("[data-delete-contact]").forEach(btn => btn.addEventListener("click", async () => { await api(`/portal/emergency-contacts/${btn.dataset.deleteContact}`, {method:"DELETE"}); await renderEmergencyContacts(); }));
  };

  const loadDashboard = async () => {
    setStatus(dashboardStatus, "Atualizando dados...");
    const [me, data] = await Promise.all([api("/portal/me"), api("/portal/dashboard")]);
    state.me = me; state.dashboard = data;
    $("client-welcome").textContent = `Olá, ${me.person?.name || "usuário"}.`;
    $("client-account-info").textContent = `${me.person?.email || "Conta G-Host"} · perfil ${roleLabel(me.role)}`;
    $("client-role").hidden = false; $("client-role").textContent = roleLabel(me.role);
    const adminLink = $("client-admin-link"); if (adminLink) adminLink.hidden = me.role !== "adm";
    $("visitor-upgrade-note").hidden = me.role !== "visitante";
    $("client-project-count").textContent = String(data.projects?.length || data.configurations?.length || 0);
    $("client-asset-count").textContent = String(data.assets?.length || 0);
    $("client-service-count").textContent = String((data.services?.length || 0) + (data.supportTickets?.filter(x => !["resolvido","cancelado"].includes(x.status)).length || 0));
    $("client-notification-count").textContent = String(data.notifications?.filter(x => !x.read_at).length || 0);
    $("client-configurations").innerHTML = (data.configurations || []).map(configurationItem).join("") || empty("Nenhuma configuração salva ainda.");
    $("client-quotes").innerHTML = (data.quotes || []).map(quoteItem).join("") || empty("Nenhuma proposta solicitada ainda.");
    $("client-projects").innerHTML = (data.projects || []).map(projectItem).join("") || empty(me.role === "visitante" ? "Disponível após contratação." : "Nenhum projeto operacional vinculado.");
    $("client-assets").innerHTML = (data.assets || []).map(assetItem).join("") || empty(me.role === "visitante" ? "Disponível após contratação." : "Nenhum equipamento registrado.");
    $("client-services").innerHTML = (data.services || []).map(serviceItem).join("") || empty("Nenhum serviço registrado.");
    $("client-contracts").innerHTML = (data.contracts || []).map(contractItem).join("") || empty("Nenhum contrato disponível nesta conta.");
    $("client-notifications").innerHTML = (data.notifications || []).map(notificationItem).join("") || empty("Nenhuma notificação.");
    $("client-support-tickets").innerHTML = (data.supportTickets || []).map(supportTicketItem).join("") || empty("Nenhum chamado aberto nesta conta.");
    await Promise.all([renderDevices(), loadCameras(), loadGuardian(), renderEmergencyContacts()]);
    setStatus(dashboardStatus, "Dados atualizados.", "success");
  };

  const enterDashboard = async token => {
    setToken(token); auth.hidden = true; dashboard.hidden = false; logoutBtn.hidden = false;
    try { await loadDashboard(); } catch (error) { if (error.status === 401) { setToken(""); dashboard.hidden = true; auth.hidden = false; logoutBtn.hidden = true; showAuthForm("login"); } setStatus(dashboardStatus, error.message, "error"); }
  };

  $("tab-login").addEventListener("click", () => showAuthForm("login"));
  $("tab-register").addEventListener("click", () => showAuthForm("register"));
  $("tab-reset").addEventListener("click", () => showAuthForm("reset"));

  loginForm.addEventListener("submit", async event => {
    event.preventDefault(); setStatus(authStatus, "Entrando...");
    try { const r = await api("/portal/login", { method:"POST", body:JSON.stringify({email:$("login-email").value,password:$("login-password").value}) }); $("login-password").value=""; await enterDashboard(r.token); }
    catch(error){ setStatus(authStatus,error.message,"error"); }
  });

  registerForm.addEventListener("submit", async event => {
    event.preventDefault(); setStatus(authStatus,"Enviando código de confirmação...");
    try {
      const r=await api("/portal/register/start",{method:"POST",body:JSON.stringify({name:$("register-name").value,email:$("register-email").value,phone:$("register-phone").value,password:$("register-password").value,acceptTerms:$("accept-terms").checked,acknowledgePrivacy:$("ack-privacy").checked})});
      state.registerChallenge=r.challengeId; $("verify-email-target").textContent=r.maskedEmail||"seu e-mail"; showAuthForm("verify"); setStatus(authStatus,"Código enviado. Ele expira em 10 minutos.","success"); $("register-code").focus();
    } catch(error){ setStatus(authStatus,error.message,"error"); }
  });

  verifyForm.addEventListener("submit", async event => {
    event.preventDefault(); setStatus(authStatus,"Confirmando conta...");
    try { const r=await api("/portal/register/verify",{method:"POST",body:JSON.stringify({challengeId:state.registerChallenge,code:$("register-code").value})}); state.registerChallenge=""; $("register-password").value=""; $("register-code").value=""; await enterDashboard(r.token); }
    catch(error){ setStatus(authStatus,error.message,"error"); }
  });
  $("cancel-verify").addEventListener("click",()=>{state.registerChallenge="";showAuthForm("register");});

  resetForm.addEventListener("submit", async event => {
    event.preventDefault();setStatus(authStatus,"Enviando código...");
    try{const r=await api("/portal/password/reset/start",{method:"POST",body:JSON.stringify({email:$("reset-email").value})});state.resetChallenge=r.challengeId||"";if(!state.resetChallenge){setStatus(authStatus,"Se existir uma conta com este e-mail, você receberá as instruções.","success");return;}showAuthForm("reset-verify");setStatus(authStatus,"Código enviado.","success");}
    catch(error){setStatus(authStatus,error.message,"error");}
  });
  resetVerifyForm.addEventListener("submit",async event=>{event.preventDefault();setStatus(authStatus,"Alterando senha...");try{await api("/portal/password/reset/verify",{method:"POST",body:JSON.stringify({challengeId:state.resetChallenge,code:$("reset-code").value,password:$("reset-password").value})});state.resetChallenge="";showAuthForm("login");setStatus(authStatus,"Senha atualizada. Você já pode entrar.","success");}catch(error){setStatus(authStatus,error.message,"error");}});

  $("authorize-camera-device").addEventListener("click", async () => {
    setStatus(dashboardStatus,"Autorizando este aparelho...");
    try {
      const r=await api("/portal/devices/register",{method:"POST",body:JSON.stringify({deviceId:getDeviceId(),label:navigator.userAgentData?.platform||navigator.platform||"Navegador",purpose:"camera"})});
      localStorage.setItem(CAMERA_DEVICE_KEY,r.deviceToken); await renderDevices(); await loadCameras(); setStatus(dashboardStatus,"Aparelho autorizado para CFTV.","success");
    } catch(error){setStatus(dashboardStatus,error.message,"error");}
  });

  $("support-form").addEventListener("submit",async event=>{event.preventDefault();setStatus(dashboardStatus,"Abrindo chamado...");try{await api("/portal/support",{method:"POST",body:JSON.stringify({subject:$("support-subject").value,priority:$("support-priority").value,description:$("support-description").value})});event.target.reset();setStatus(dashboardStatus,"Chamado aberto com sucesso.","success");await loadDashboard();}catch(error){setStatus(dashboardStatus,error.message,"error");}});

  $("notifications-read").addEventListener("click",async()=>{try{await api("/portal/notifications/read",{method:"POST",body:"{}"});await loadDashboard();}catch(error){setStatus(dashboardStatus,error.message,"error");}});

  $("emergency-contact-form").addEventListener("submit",async event=>{event.preventDefault();try{await api("/portal/emergency-contacts",{method:"POST",body:JSON.stringify({name:$("emergency-name").value,relation:$("emergency-relation").value,phone:$("emergency-phone").value})});event.target.reset();await renderEmergencyContacts();}catch(error){setStatus(dashboardStatus,error.message,"error");}});

  $("get-location").addEventListener("click",()=>{
    const out=$("location-result");out.hidden=false;out.textContent="Obtendo localização com sua autorização...";
    if(!navigator.geolocation){out.textContent="Geolocalização não disponível neste aparelho.";return;}
    navigator.geolocation.getCurrentPosition(pos=>{const lat=pos.coords.latitude.toFixed(6),lon=pos.coords.longitude.toFixed(6),acc=Math.round(pos.coords.accuracy);out.replaceChildren();const p=document.createElement("p");p.textContent=`Latitude ${lat} · Longitude ${lon} · precisão aproximada ${acc} m.`;const a=document.createElement("a");a.href=`https://maps.google.com/?q=${encodeURIComponent(`${lat},${lon}`)}`;a.target="_blank";a.rel="noopener";a.textContent="Abrir localização no mapa";out.append(p,a);},()=>{out.textContent="Localização não autorizada ou indisponível. Você pode usar o endereço cadastrado do imóvel ao falar com o serviço de emergência.";},{enableHighAccuracy:true,timeout:10000,maximumAge:30000});
  });

  $("client-refresh").addEventListener("click",()=>loadDashboard().catch(error=>setStatus(dashboardStatus,error.message,"error")));
  logoutBtn.addEventListener("click",async()=>{try{if(state.token)await api("/portal/logout",{method:"POST",body:"{}"});}catch(_){}setToken("");state.me=null;dashboard.hidden=true;auth.hidden=false;logoutBtn.hidden=true;$("client-role").hidden=true;showAuthForm("login");});

  if(!API)setStatus(authStatus,"Backend de segurança ainda não configurado.","error");
  else if(state.token) enterDashboard(state.token);
  else showAuthForm("login");
})();
