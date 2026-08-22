(() => {
  "use strict";
  const API = String(window.GHOST_CLIENT_CONFIG?.apiBase || "").replace(/\/$/, "");
  const TOKEN_KEY = window.GHOST_CLIENT_CONFIG?.sessionStorageKey || "ghost_portal_token";
  const $ = id => document.getElementById(id);
  const status = $("auth-status");
  const page = document.body.dataset.authPage || "";
  let challengeId = "";

  const setStatus = (text = "", type = "") => {
    if (!status) return;
    status.textContent = text;
    status.className = `auth-status${type ? ` ${type}` : ""}`;
  };

  const api = async (path, options = {}) => {
    if (!API) throw new Error("Backend G-Host não configurado.");
    let response;
    try {
      response = await fetch(`${API}${path}`, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) },
        cache: "no-store",
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
      throw error;
    }
    return data;
  };

  const saveToken = token => {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
  };

  if (sessionStorage.getItem(TOKEN_KEY)) {
    location.replace("cliente.html");
    return;
  }

  const loginForm = $("login-form");
  loginForm?.addEventListener("submit", async event => {
    event.preventDefault();
    setStatus("Entrando...");
    try {
      const result = await api("/portal/login", {
        method: "POST",
        body: JSON.stringify({ email: $("login-email").value, password: $("login-password").value })
      });
      $("login-password").value = "";
      saveToken(result.token);
      location.replace("cliente.html");
    } catch (error) {
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
      saveToken(result.token);
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
      $("reset-code").value = "";
      $("reset-password").value = "";
      $("reset-step-two").hidden = true;
      $("reset-done").hidden = false;
      setStatus(result.message || "Senha alterada com sucesso.", "success");
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
