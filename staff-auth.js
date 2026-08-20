(() => {
  "use strict";

  const cfg = window.GHOST_AUTH_CONFIG || {};
  const apiBase = String(cfg.apiBase || "").trim().replace(/\/+$/, "");
  const inactivitySeconds = Math.max(300, Math.min(1800, Number(cfg.inactivitySeconds || 900)));
  const STAFF_DEVICE_KEY = "ghost_staff_device_v1";

  const authShell = document.getElementById("auth-shell");
  const adminShell = document.getElementById("admin-shell");
  const setupWarning = document.getElementById("auth-setup-warning");
  const authStatus = document.getElementById("auth-status");
  const stepPassword = document.getElementById("step-password");
  const stepEmail = document.getElementById("step-email");
  const stepTotp = document.getElementById("step-sms");
  const emailTarget = document.getElementById("email-target");
  const totpTarget = document.getElementById("phone-target");
  const logoutBtn = document.getElementById("logout-btn");
  const sessionTimer = document.getElementById("session-timer");
  const sessionTimerCard = document.getElementById("session-timer-card");
  const lastPublishEl = document.getElementById("last-publish-at");

  let token = "";
  let challengeId = "";
  let expiresAt = 0;
  let inactivityDeadline = 0;
  let timerId = 0;
  let healthId = 0;
  let unlocked = false;
  let permissions = {};
  const configured = /^https:\/\//i.test(apiBase) && !apiBase.includes("SEU-WORKER");

  // As telas reaproveitam o formulário do Dono; o e-mail do ADM é adicionado sem HTML inline executável.
  let staffEmail = document.getElementById("staff-email");
  if (!staffEmail && stepPassword) {
    const label = document.createElement("label");
    label.textContent = "E-mail do ADM";
    staffEmail = document.createElement("input");
    staffEmail.id = "staff-email";
    staffEmail.type = "email";
    staffEmail.autocomplete = "username";
    staffEmail.required = true;
    label.append(staffEmail);
    const passwordLabel = document.getElementById("admin-password")?.closest("label");
    stepPassword.insertBefore(label, passwordLabel || stepPassword.querySelector("button"));
  }

  const setStatus = (message, kind = "") => {
    if (!authStatus) return;
    authStatus.textContent = message;
    authStatus.className = `auth-status ${kind}`.trim();
  };

  const showStep = step => {
    [stepPassword, stepEmail, stepTotp].forEach(el => { if (el) el.hidden = true; });
    if (step) step.hidden = false;
  };

  const resetForms = () => {
    ["admin-password", "email-code", "sms-code"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
  };

  const clearSession = () => {
    token = ""; challengeId = ""; expiresAt = 0; inactivityDeadline = 0; unlocked = false; permissions = {};
    if (timerId) clearInterval(timerId);
    if (healthId) clearInterval(healthId);
    timerId = 0; healthId = 0;
    if (sessionTimer) sessionTimer.textContent = "Sessão bloqueada";
    if (sessionTimerCard) sessionTimerCard.textContent = "bloqueada";
    window.GHOST_CONTROL_CONTEXT = null;
  };

  const api = async (path, options = {}) => {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const device = localStorage.getItem(STAFF_DEVICE_KEY) || "";
    if (device) headers["X-Ghost-Device"] = device;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${apiBase}${path}`, { ...options, headers, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal });
      let body = {}; try { body = await response.json(); } catch (_) {}
      if (!response.ok) { const error = new Error(body.error || `Falha (${response.status}).`); error.code = body.code || ""; throw error; }
      return body;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("O servidor demorou para responder. Tente novamente.");
      throw error;
    } finally { clearTimeout(timeout); }
  };

  const hasPermission = key => !key || permissions?.[key] === true;
  const requiredPermission = String(document.body?.dataset?.requiredPermission || "").trim();

  const formatRemaining = seconds => {
    const s = Math.max(0, Math.floor(seconds)), m = Math.floor(s / 60), r = s % 60;
    return `${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}`;
  };

  const refreshSessionInfo = async () => {
    if (!token || !unlocked) return;
    try {
      const info = await api("/staff/me", { method: "GET", headers: {} });
      if (info.expiresAt) expiresAt = Number(info.expiresAt);
      permissions = info.permissions || permissions;
      window.GHOST_CONTROL_CONTEXT = { kind: "staff", role: "adm", email: info.email || "", permissions };
      if (lastPublishEl) lastPublishEl.textContent = "Sessão ADM ativa";
    } catch (_) { lockPanel("Sua sessão ADM expirou. Faça as três etapas novamente."); }
  };

  const updateTimer = () => {
    if (!unlocked || !token) return;
    const now = Date.now();
    const remaining = Math.min(Math.max(0, Math.floor((expiresAt-now)/1000)), Math.max(0, Math.floor((inactivityDeadline-now)/1000)));
    if (sessionTimer) sessionTimer.textContent = `Sessão: ${formatRemaining(remaining)}`;
    if (sessionTimerCard) sessionTimerCard.textContent = `${formatRemaining(remaining)} restantes`;
    if (remaining <= 0) lockPanel("Sessão encerrada por expiração ou inatividade.", true);
  };

  const touchActivity = () => { if (unlocked) inactivityDeadline = Date.now() + inactivitySeconds * 1000; };
  const startWatch = () => { touchActivity(); timerId=setInterval(updateTimer,1000); healthId=setInterval(refreshSessionInfo,60000); updateTimer(); };

  const applyStaffVisibility = () => {
    const p = permissions || {};
    const show = (id, ok) => { const el=document.getElementById(id); if(el) el.hidden=!ok; const link=document.querySelector(`.admin-sidebar a[href="#${id}"]`); if(link) link.hidden=!ok; };
    const site = Boolean(p.site_edit);
    ["empresa","aparencia","destaque","conteudo-manual","aviso"].forEach(id=>show(id,site));
    const ops = Boolean(p.operations);
    ["pessoas","locais","projetos","vinculos","sistemas","equipamentos","registros","materiais","servicos"].forEach(id=>show(id,ops));
    show("seguranca", Boolean(p.security));
    const exportButton=document.getElementById("db-export");if(exportButton)exportButton.hidden=!p.data_export;
    document.querySelectorAll('.admin-sidebar a[href="planos-admin.html"]').forEach(a=>{a.hidden=!p.prices;a.href="staff-planos.html";});
    document.querySelectorAll('.admin-sidebar a[href="catalogo-admin.html"]').forEach(a=>{a.hidden=!p.prices;a.href="staff-catalogo.html";});
    document.querySelectorAll('.admin-sidebar a[href="visibilidade-admin.html"]').forEach(a=>{a.hidden=!p.site_visibility;a.href="staff-visibilidade.html";});
    document.querySelectorAll(".admin-publish").forEach(el=>{el.hidden=!site;});
    const heading=document.querySelector(".admin-heading h1"); if(heading) heading.textContent="Painel ADM";
    const lead=document.querySelector(".admin-heading p"); if(lead) lead.textContent="Somente os módulos autorizados pelo Dono são exibidos para esta conta.";
  };

  const unlockPanel = () => {
    if (requiredPermission && !hasPermission(requiredPermission)) {
      setStatus("Sua conta ADM não possui a permissão necessária para esta área.", "error");
      return;
    }
    if (authShell) authShell.hidden = true;
    if (adminShell) adminShell.hidden = false;
    unlocked = true;
    window.GHOST_ADMIN_SESSION = () => token;
    window.GHOST_CONTROL_CONTEXT = { kind: "staff", role: "adm", permissions };
    applyStaffVisibility();
    startWatch();
    window.dispatchEvent(new CustomEvent("ghost-authenticated"));
    refreshSessionInfo();
  };

  const revoke = async () => { if(token&&configured) try{await api("/staff/logout",{method:"POST",body:"{}"});}catch(_){} };
  const lockPanel = (message="Sessão encerrada.", revokeServer=false) => {
    if(revokeServer) revoke(); clearSession(); resetForms();
    if(adminShell) adminShell.hidden=true; if(authShell) authShell.hidden=false; showStep(stepPassword); setStatus(message); window.dispatchEvent(new CustomEvent("ghost-logout"));
  };
  window.GHOST_AUTH_LOGOUT = () => lockPanel("Sessão encerrada.", true);

  ["pointerdown","keydown","touchstart"].forEach(name=>window.addEventListener(name,touchActivity,{passive:true}));
  document.addEventListener("visibilitychange",()=>{if(!document.hidden&&unlocked){updateTimer();refreshSessionInfo();}});

  stepPassword?.addEventListener("submit", async event => {
    event.preventDefault();
    const email=String(staffEmail?.value||"").trim(), passwordInput=document.getElementById("admin-password"), password=passwordInput?.value||"";
    if(!email||!password)return;
    setStatus("Verificando conta ADM...","busy"); const button=event.submitter;if(button)button.disabled=true;
    try{
      const result=await api("/staff/password",{method:"POST",body:JSON.stringify({email,password})});
      challengeId=result.challengeId||""; if(passwordInput)passwordInput.value=""; if(emailTarget)emailTarget.textContent=result.maskedEmail||"e-mail cadastrado"; showStep(stepEmail); setStatus("1ª etapa concluída. Digite o código enviado ao e-mail.","success"); document.getElementById("email-code")?.focus();
    }catch(error){if(passwordInput)passwordInput.value="";setStatus(error.message,"error");}finally{if(button)button.disabled=false;}
  });

  stepEmail?.addEventListener("submit", async event => {
    event.preventDefault(); const input=document.getElementById("email-code"),code=String(input?.value||"").replace(/\D/g,""); if(code.length!==6||!challengeId)return setStatus("Digite os 6 números recebidos por e-mail.","error");
    setStatus("Confirmando e-mail e autenticador...","busy");const button=event.submitter;if(button)button.disabled=true;
    try{const result=await api("/staff/email/verify",{method:"POST",body:JSON.stringify({challengeId,code})});if(input)input.value="";if(totpTarget)totpTarget.textContent=result.setupSecret?`Chave de configuração do ADM: ${result.setupSecret}`:"Aplicativo autenticador ADM já configurado";showStep(stepTotp);setStatus(result.setupSecret?"Cadastre a chave no autenticador e digite o código de 6 números.":"Digite o código de 6 números do autenticador.","success");document.getElementById("sms-code")?.focus();}catch(error){if(input)input.value="";setStatus(error.message,"error");}finally{if(button)button.disabled=false;}
  });

  stepTotp?.addEventListener("submit", async event => {
    event.preventDefault();const input=document.getElementById("sms-code"),code=String(input?.value||"").replace(/\D/g,"");if(code.length!==6||!challengeId)return setStatus("Digite os 6 números do autenticador.","error");
    setStatus("Concluindo autenticação ADM...","busy");const button=event.submitter;if(button)button.disabled=true;
    try{const result=await api("/staff/totp/verify",{method:"POST",body:JSON.stringify({challengeId,code})});token=result.token||"";permissions=result.permissions||{};if(result.staffDeviceToken)localStorage.setItem(STAFF_DEVICE_KEY,result.staffDeviceToken);expiresAt=Number(result.expiresAt||(Date.now()+Number(result.expiresIn||1800)*1000));challengeId="";if(input)input.value="";if(!token)throw new Error("O servidor não criou uma sessão ADM válida.");setStatus("Acesso ADM autorizado.","success");unlockPanel();}catch(error){if(input)input.value="";setStatus(error.message,"error");}finally{if(button)button.disabled=false;}
  });

  document.getElementById("restart-auth")?.addEventListener("click",()=>{challengeId="";resetForms();showStep(stepPassword);setStatus("Verificação reiniciada.");});
  logoutBtn?.addEventListener("click",async()=>{await revoke();lockPanel("Sessão encerrada com segurança.");});

  if(!configured){if(setupWarning)setupWarning.hidden=false;setStatus("Configure auth-config.js com a URL do Worker antes de usar o painel.","error");document.querySelectorAll("#auth-shell input,#auth-shell button").forEach(el=>{el.disabled=true;});}
  else{if(setupWarning)setupWarning.hidden=true;showStep(stepPassword);}
})();
