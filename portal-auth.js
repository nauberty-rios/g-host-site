(() => {
  "use strict";

  const API = String(window.GHOST_CLIENT_CONFIG?.apiBase || "").replace(/\/$/, "");
  const TOKEN_KEY = window.GHOST_CLIENT_CONFIG?.sessionStorageKey || "ghost_portal_token";
  const DEVICE_KEY = window.GHOST_CLIENT_CONFIG?.portalDeviceStorageKey || "ghost_portal_device_v1";
  const $ = id => document.getElementById(id);
  const status = $("auth-status");
  const page = document.body.dataset.authPage || "";

  let challengeId = "";
  let deviceChallengeId = "";

  const setStatus = (text = "", type = "") => {
    if (!status) return;
    status.textContent = text;
    status.className = `auth-status${type ? ` ${type}` : ""}`;
  };

  const saveSession = result => {
    if (result?.portalDeviceToken) localStorage.setItem(DEVICE_KEY, String(result.portalDeviceToken));
    if (result?.token) sessionStorage.setItem(TOKEN_KEY, String(result.token));
  };

  const api = async (path, options = {}) => {
    if (!API) throw new Error("Backend G-Host não configurado.");
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const deviceToken = localStorage.getItem(DEVICE_KEY) || "";
    if (deviceToken) headers["X-Ghost-Device"] = deviceToken;

    let response;
    try {
      response = await fetch(`${API}${path}`, {
        ...options,
        headers,
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer"
      });
    } catch (_) {
      throw new Error("Não foi possível conectar ao serviço G-Host. Verifique sua conexão e tente novamente.");
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || (response.status >= 500
        ? "Serviço temporariamente indisponível. Tente novamente em alguns instantes."
        : "Não foi possível concluir a operação."));
      error.code = data.code || "";
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  };

  const ensureDeviceVerificationForm = () => {
    let form = $("device-verification-form");
    if (form) return form;

    const loginForm = $("login-form");
    if (!loginForm) return null;

    form = document.createElement("form");
    form.id = "device-verification-form";
    form.className = loginForm.className || "auth-form";
    form.autocomplete = "off";
    form.hidden = true;

    const title = document.createElement("h2");
    title.textContent = "Autorizar este aparelho";

    const text = document.createElement("p");
    text.className = "auth-help";
    text.id = "device-verification-text";
    text.textContent = "Digite o código enviado ao seu e-mail.";

    const label = document.createElement("label");
    label.textContent = "Código de 6 dígitos";
    const input = document.createElement("input");
    input.id = "device-verification-code";
    input.inputMode = "numeric";
    input.pattern = "[0-9]{6}";
    input.maxLength = 6;
    input.autocomplete = "one-time-code";
    input.required = true;
    label.append(input);

    const submit = document.createElement("button");
    submit.className = "btn";
    submit.type = "submit";
    submit.textContent = "Autorizar aparelho e entrar";

    const cancel = document.createElement("button");
    cancel.className = "text-button";
    cancel.type = "button";
    cancel.textContent = "← Voltar ao login";
    cancel.addEventListener("click", () => {
      deviceChallengeId = "";
      input.value = "";
      form.hidden = true;
      loginForm.hidden = false;
      setStatus("");
    });

    form.append(title, text, label, submit, cancel);
    loginForm.insertAdjacentElement("afterend", form);

    form.addEventListener("submit", async event => {
      event.preventDefault();
      const code = input.value.replace(/\D/g, "");
      if (!deviceChallengeId || code.length !== 6) {
        setStatus("Digite os 6 números enviados ao seu e-mail.", "error");
        return;
      }
      setStatus("Autorizando este aparelho...");
      submit.disabled = true;
      try {
        const result = await api("/portal/login/device/verify", {
          method: "POST",
          body: JSON.stringify({ challengeId: deviceChallengeId, code })
        });
        saveSession(result);
        deviceChallengeId = "";
        input.value = "";
        location.replace("cliente.html");
      } catch (error) {
        setStatus(error.message, "error");
      } finally {
        submit.disabled = false;
      }
    });

    return form;
  };

  const existingToken = sessionStorage.getItem(TOKEN_KEY) || "";
  const existingDevice = localStorage.getItem(DEVICE_KEY) || "";
  if (existingToken && existingDevice) {
    location.replace("cliente.html");
    return;
  }
  if (existingToken && !existingDevice) sessionStorage.removeItem(TOKEN_KEY);

  const loginForm = $("login-form");
  loginForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const passwordInput = $("login-password");
    setStatus("Entrando...");
    try {
      const result = await api("/portal/login", {
        method: "POST",
        body: JSON.stringify({ email: $("login-email").value, password: passwordInput.value })
      });
      passwordInput.value = "";

      if (result.deviceVerificationRequired) {
        deviceChallengeId = result.challengeId || "";
        const form = ensureDeviceVerificationForm();
        if (!form || !deviceChallengeId) throw new Error("Não foi possível iniciar a autorização deste aparelho.");
        const text = $("device-verification-text");
        if (text) text.textContent = `Enviamos um código para ${result.maskedEmail || "seu e-mail"}.`;
        loginForm.hidden = true;
        form.hidden = false;
        $("device-verification-code")?.focus();
        setStatus("Este aparelho ainda não é confiável. Confirme o código do e-mail para continuar.", "success");
        return;
      }

      saveSession(result);
      if (!result.token) throw new Error("O servidor não criou uma sessão válida.");
      location.replace("cliente.html");
    } catch (error) {
      passwordInput.value = "";
      setStatus(error.message, "error");
    }
  });

  const registerForm = $("register-form");
  const verifyForm = $("verify-form");
  registerForm?.addEventListener("submit", async event => {
    event.preventDefault();
    setStatus("Enviando código de confirmação...");
    try {
      const result = await api("/portal/register/start", {
        method: "POST",
        body: JSON.stringify({
          name: $("register-name").value,
          email: $("register-email").value,
          phone: $("register-phone").value,
          password: $("register-password").value,
          acceptTerms: $("accept-terms").checked,
          acknowledgePrivacy: $("ack-privacy").checked
        })
      });
      challengeId = result.challengeId || "";
      $("register-step-one").hidden = true;
      $("register-step-two").hidden = false;
      $("verify-email-target").textContent = result.maskedEmail || "seu e-mail";
      setStatus("Código enviado. Ele expira em 10 minutos.", "success");
      $("register-code").focus();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  verifyForm?.addEventListener("submit", async event => {
    event.preventDefault();
    setStatus("Confirmando sua conta...");
    try {
      const result = await api("/portal/register/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId, code: $("register-code").value })
      });
      saveSession(result);
      if (!result.token || !result.portalDeviceToken) throw new Error("A conta foi confirmada, mas o aparelho não recebeu uma sessão segura.");
      location.replace("cliente.html");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  $("register-back")?.addEventListener("click", () => {
    challengeId = "";
    $("register-step-two").hidden = true;
    $("register-step-one").hidden = false;
    $("register-code").value = "";
    setStatus("");
  });

  const resetStartForm = $("reset-start-form");
  const resetVerifyForm = $("reset-verify-form");
  resetStartForm?.addEventListener("submit", async event => {
    event.preventDefault();
    setStatus("Enviando código...");
    try {
      const result = await api("/portal/password/reset/start", {
        method: "POST",
        body: JSON.stringify({ email: $("reset-email").value })
      });
      challengeId = result.challengeId || "";
      if (!challengeId) {
        setStatus(result.message || "Se existir uma conta com este e-mail, as instruções serão enviadas.", "success");
        return;
      }
      $("reset-step-one").hidden = true;
      $("reset-step-two").hidden = false;
      setStatus(result.message || "Código de recuperação enviado.", "success");
      $("reset-code").value = "";
      $("reset-password").value = "";
      $("reset-code").focus();
    } catch (error) {
      const message = error.code === "RECOVERY_EMAIL_UNAVAILABLE"
        ? "Não foi possível enviar o código de recuperação agora. Tente novamente em alguns instantes."
        : error.message;
      setStatus(message, "error");
    }
  });

  resetVerifyForm?.addEventListener("submit", async event => {
    event.preventDefault();
    setStatus("Atualizando senha...");
    try {
      const result = await api("/portal/password/reset/verify", {
        method: "POST",
        body: JSON.stringify({
          challengeId,
          code: $("reset-code").value,
          password: $("reset-password").value
        })
      });
      challengeId = "";
      sessionStorage.removeItem(TOKEN_KEY);
      $("reset-code").value = "";
      $("reset-password").value = "";
      $("reset-step-two").hidden = true;
      $("reset-done").hidden = false;
      setStatus(result.message || "Senha alterada com sucesso. Entre novamente.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  $("reset-back")?.addEventListener("click", () => {
    challengeId = "";
    $("reset-code").value = "";
    $("reset-password").value = "";
    $("reset-step-two").hidden = true;
    $("reset-step-one").hidden = false;
    setStatus("");
  });

  if (!API) setStatus("Backend de segurança ainda não configurado.", "error");
  if (!["login", "register", "reset"].includes(page)) setStatus("Página de acesso inválida.", "error");
})();
