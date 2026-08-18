(() => {
  "use strict";

  const cfg = window.GHOST_AUTH_CONFIG || {};
  const apiBase = String(cfg.apiBase || "").trim().replace(/\/+$/, "");
  const inactivitySeconds = Math.max(300, Math.min(1800, Number(cfg.inactivitySeconds || 900)));

  const authShell = document.getElementById("auth-shell");
  const adminShell = document.getElementById("admin-shell");
  const setupWarning = document.getElementById("auth-setup-warning");
  const authStatus = document.getElementById("auth-status");
  const stepPassword = document.getElementById("step-password");
  const stepEmail = document.getElementById("step-email");
  const stepSms = document.getElementById("step-sms");
  const emailTarget = document.getElementById("email-target");
  const phoneTarget = document.getElementById("phone-target");
  const logoutBtn = document.getElementById("logout-btn");
  const sessionTimer = document.getElementById("session-timer");
  const sessionTimerCard = document.getElementById("session-timer-card");
  const lastPublishEl = document.getElementById("last-publish-at");

  // Por segurança, token e challenge ficam somente na memória desta página.
  // Atualizar/fechar o painel exige nova autenticação completa.
  let token = "";
  let challengeId = "";
  let expiresAt = 0;
  let inactivityDeadline = 0;
  let timerId = 0;
  let healthId = 0;
  let unlocked = false;

  const configured = /^https:\/\//i.test(apiBase) && !apiBase.includes("SEU-WORKER");

  const setStatus = (message, kind = "") => {
    authStatus.textContent = message;
    authStatus.className = `auth-status ${kind}`.trim();
  };

  const showStep = step => {
    [stepPassword, stepEmail, stepSms].forEach(el => { el.hidden = true; });
    step.hidden = false;
  };

  const resetForms = () => {
    ["admin-password", "email-code", "sms-code"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
  };

  const clearSession = () => {
    token = "";
    challengeId = "";
    expiresAt = 0;
    inactivityDeadline = 0;
    unlocked = false;
    if (timerId) clearInterval(timerId);
    if (healthId) clearInterval(healthId);
    timerId = 0;
    healthId = 0;
    if (sessionTimer) sessionTimer.textContent = "Sessão bloqueada";
    if (sessionTimerCard) sessionTimerCard.textContent = "bloqueada";
  };

  const api = async (path, options = {}) => {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers,
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal
      });
      let body = {};
      try { body = await response.json(); } catch (_) {}
      if (!response.ok) throw new Error(body.error || `Falha (${response.status}).`);
      return body;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("O servidor demorou para responder. Tente novamente.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  const formatRemaining = seconds => {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  };

  const formatDateTime = value => {
    if (!value) return "Nenhuma publicação nesta sessão";
    try {
      return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
    } catch (_) {
      return "Registro indisponível";
    }
  };

  const refreshSessionInfo = async () => {
    if (!token || !unlocked) return;
    try {
      const info = await api("/auth/me", { method: "GET", headers: {} });
      if (info.expiresAt) expiresAt = Number(info.expiresAt);
      if (lastPublishEl) lastPublishEl.textContent = formatDateTime(info.lastPublishAt);
    } catch (_) {
      lockAdmin("Sua sessão expirou. Faça as três etapas novamente.");
    }
  };

  const updateTimer = () => {
    if (!unlocked || !token) return;
    const now = Date.now();
    const serverRemaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
    const inactivityRemaining = Math.max(0, Math.floor((inactivityDeadline - now) / 1000));
    const remaining = Math.min(serverRemaining, inactivityRemaining);
    if (sessionTimer) sessionTimer.textContent = `Sessão: ${formatRemaining(remaining)}`;
    if (sessionTimerCard) sessionTimerCard.textContent = `${formatRemaining(remaining)} restantes`;
    if (remaining <= 0) lockAdmin("Sessão encerrada por expiração ou inatividade.", true);
  };

  const touchActivity = () => {
    if (!unlocked) return;
    inactivityDeadline = Date.now() + inactivitySeconds * 1000;
  };

  const startSessionWatch = () => {
    touchActivity();
    if (timerId) clearInterval(timerId);
    if (healthId) clearInterval(healthId);
    timerId = setInterval(updateTimer, 1000);
    healthId = setInterval(refreshSessionInfo, 60_000);
    updateTimer();
  };

  const unlockAdmin = () => {
    authShell.hidden = true;
    adminShell.hidden = false;
    unlocked = true;
    window.GHOST_ADMIN_SESSION = () => token;
    startSessionWatch();
    window.dispatchEvent(new CustomEvent("ghost-authenticated"));
    refreshSessionInfo();
  };

  const revokeServerSession = async () => {
    if (!token || !configured) return;
    try { await api("/auth/logout", { method: "POST", body: "{}" }); } catch (_) {}
  };

  const lockAdmin = (message = "Sessão encerrada.", revoke = false) => {
    const oldToken = token;
    if (revoke && oldToken) revokeServerSession();
    clearSession();
    resetForms();
    adminShell.hidden = true;
    authShell.hidden = false;
    showStep(stepPassword);
    setStatus(message);
    window.dispatchEvent(new CustomEvent("ghost-logout"));
  };

  window.GHOST_AUTH_LOGOUT = () => lockAdmin("Sessão encerrada.", true);

  ["pointerdown", "keydown", "touchstart"].forEach(eventName => {
    window.addEventListener(eventName, touchActivity, { passive: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && unlocked) {
      updateTimer();
      refreshSessionInfo();
    }
  });

  stepPassword.addEventListener("submit", async event => {
    event.preventDefault();
    const passwordInput = document.getElementById("admin-password");
    const password = passwordInput.value;
    if (!password) return;

    setStatus("Verificando senha...", "busy");
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      const result = await api("/auth/password", {
        method: "POST",
        body: JSON.stringify({ password })
      });
      challengeId = result.challengeId;
      passwordInput.value = "";
      emailTarget.textContent = result.maskedEmail || "e-mail cadastrado";
      showStep(stepEmail);
      setStatus("1ª etapa concluída. Digite o código enviado ao e-mail.", "success");
      document.getElementById("email-code").focus();
    } catch (error) {
      passwordInput.value = "";
      setStatus(error.message, "error");
    } finally {
      if (button) button.disabled = false;
    }
  });

    stepEmail.addEventListener("submit", async event => {
    event.preventDefault();

    const codeInput = document.getElementById("email-code");
    const code = codeInput.value.replace(/\D/g, "");

    if (code.length !== 6 || !challengeId) {
      setStatus("Digite os 6 números recebidos por e-mail.", "error");
      return;
    }

    setStatus("Confirmando e-mail e preparando autenticador...", "busy");

    const button = event.submitter;
    if (button) button.disabled = true;

    try {
      const result = await api("/auth/email/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId, code })
      });

      codeInput.value = "";

      if (result.setupSecret) {
        phoneTarget.textContent =
          `Chave de configuração: ${result.setupSecret}`;

        setStatus(
          "2ª etapa concluída. Adicione essa chave ao aplicativo autenticador e digite o código de 6 números.",
          "success"
        );
      } else {
        phoneTarget.textContent =
          "Aplicativo autenticador já configurado";

        setStatus(
          "2ª etapa concluída. Digite o código de 6 números do aplicativo autenticador.",
          "success"
        );
      }

      showStep(stepSms);

      const authenticatorInput =
        document.getElementById("sms-code");

      if (authenticatorInput) {
        authenticatorInput.value = "";
        authenticatorInput.focus();
      }

    } catch (error) {
      codeInput.value = "";
      setStatus(error.message, "error");

    } finally {
      if (button) button.disabled = false;
    }
  });

  stepSms.addEventListener("submit", async event => {
    event.preventDefault();

    const codeInput =
      document.getElementById("sms-code");

    const code =
      codeInput.value.replace(/\D/g, "");

    if (code.length !== 6 || !challengeId) {
      setStatus(
        "Digite os 6 números do aplicativo autenticador.",
        "error"
      );
      return;
    }

    setStatus("Concluindo a autenticação...", "busy");

    const button = event.submitter;
    if (button) button.disabled = true;

    try {
      const result = await api("/auth/totp/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId, code })
      });

      token = result.token || "";

      expiresAt = Number(
        result.expiresAt ||
        (
          Date.now() +
          Number(result.expiresIn || 1800) * 1000
        )
      );

      challengeId = "";
      codeInput.value = "";

      if (!token) {
        throw new Error(
          "O servidor não criou uma sessão válida."
        );
      }

      setStatus("Acesso autorizado.", "success");
      unlockAdmin();

    } catch (error) {
      codeInput.value = "";
      setStatus(error.message, "error");

    } finally {
      if (button) button.disabled = false;
    }
  });
  document.getElementById("restart-auth").addEventListener("click", () => {
    challengeId = "";
    resetForms();
    showStep(stepPassword);
    setStatus("Verificação reiniciada.");
  });

  logoutBtn.addEventListener("click", async () => {
    await revokeServerSession();
    lockAdmin("Sessão encerrada com segurança.");
  });

  if (!configured) {
    setupWarning.hidden = false;
    setStatus("Configure auth-config.js com a URL do Worker antes de usar o painel.", "error");
    document.querySelectorAll("#auth-shell input, #auth-shell button").forEach(el => { el.disabled = true; });
  } else {
    setupWarning.hidden = true;
    showStep(stepPassword);
  }
})();
