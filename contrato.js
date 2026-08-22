(() => {
  "use strict";

  const cfg = window.GHOST_CLIENT_CONFIG || {};
  const API = String(cfg.apiBase || "").replace(/\/$/, "");
  const KEY = cfg.sessionStorageKey || "ghost_portal_token";
  const COOKIE_SENTINEL = "__gh_cookie__";
  const cookieHost = String(cfg.cookieApiHost || "api.g-host.seg.br").trim().toLowerCase();
  const cookieMode = (() => {
    if (cfg.cookieAuthEnabled !== true || !API) return false;
    try { return new URL(API).hostname.toLowerCase() === cookieHost; } catch (_) { return false; }
  })();

  let token = sessionStorage.getItem(KEY) || "";
  if (cookieMode && !token) {
    token = COOKIE_SENTINEL;
    sessionStorage.setItem(KEY, COOKIE_SENTINEL);
  }

  const id = Number(new URLSearchParams(location.search).get("id") || 0);
  const paper = document.getElementById("contract-paper");
  const acceptBox = document.getElementById("contract-accept");
  const status = document.getElementById("contract-status");
  const codeBox = document.getElementById("contract-code-box");
  const codeInput = document.getElementById("contract-accept-code");
  let contract = null;
  let challengeId = "";

  const redirectToLogin = () => {
    sessionStorage.removeItem(KEY);
    location.replace("entrar.html");
  };

  const applySessionResult = data => {
    if (!data?.sessionRotated) return;
    if (data.sessionMode === "cookie") {
      token = COOKIE_SENTINEL;
      sessionStorage.setItem(KEY, COOKIE_SENTINEL);
      return;
    }
    const next = String(data.token || "");
    if (/^[A-Za-z0-9_-]{30,}$/.test(next)) {
      token = next;
      sessionStorage.setItem(KEY, next);
    }
  };

  const api = async (path, options = {}) => {
    if (!API || (!token && !cookieMode)) throw new Error("Entre na Minha G-Host para acessar o contrato.");
    const headers = new Headers(options.headers || {});
    headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers,
      cache: "no-store",
      credentials: cookieMode ? "include" : "omit",
      referrerPolicy: "no-referrer"
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      redirectToLogin();
      throw new Error(data.error || "Sessão expirada.");
    }
    if (!response.ok) throw new Error(data.error || "Não foi possível carregar o contrato.");
    applySessionResult(data);
    return data;
  };

  const el = (tag, text = "", cls = "") => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  };

  const setStatus = (text, kind = "") => {
    if (!status) return;
    status.textContent = text;
    status.className = `client-status ${kind}`.trim();
  };

  const render = c => {
    if (!paper || !acceptBox || !codeBox) return;
    paper.replaceChildren();
    const h = el("h1", c.title || "Contrato G-Host");
    const sub = el("p", `${c.code || "Contrato"} · versão ${c.version || "1"}`);
    const meta = el("div", "", "contract-meta");
    [
      ["Status", c.status],
      ["Plano", c.plan_id || "Não informado"],
      ["Valor", Number(c.amount || 0) > 0 ? Number(c.amount).toLocaleString("pt-BR", { style: "currency", currency: c.currency || "BRL" }) : "Conforme proposta"],
      ["Início", c.starts_at || "A definir"],
      ["Término", c.ends_at || "Conforme contrato"],
      ["Hash", c.document_hash || "-"]
    ].forEach(([label, value]) => {
      const item = el("div");
      item.append(el("small", label), el("strong", String(value || "")));
      meta.append(item);
    });
    paper.append(h, sub, meta, el("p", c.summary || ""), el("div", c.body_text || "", "contract-body"));
    acceptBox.hidden = c.status !== "pendente_aceite";
    if (acceptBox.hidden) {
      challengeId = "";
      codeBox.hidden = true;
    }
  };

  const load = async () => {
    if (!id) throw new Error("Contrato inválido.");
    const data = await api(`/portal/contracts/${id}`);
    contract = data.contract;
    render(contract);
  };

  document.getElementById("print-contract")?.addEventListener("click", () => window.print());

  document.getElementById("accept-contract")?.addEventListener("click", async () => {
    if (!document.getElementById("accept-contract-check")?.checked) return setStatus("Marque a confirmação depois de ler o documento.", "error");
    if (!confirm("Enviar um código ao seu e-mail para confirmar o aceite desta versão?")) return;
    setStatus("Enviando código de confirmação...");
    try {
      const result = await api(`/portal/contracts/${id}/accept/start`, { method: "POST", body: JSON.stringify({ accept: true }) });
      challengeId = String(result.challengeId || "");
      if (codeBox) codeBox.hidden = false;
      if (codeInput) {
        codeInput.value = "";
        codeInput.focus();
      }
      setStatus(`Código enviado para ${result.maskedEmail || "seu e-mail"}.`, "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  document.getElementById("confirm-contract")?.addEventListener("click", async () => {
    const code = String(codeInput?.value || "").replace(/\D/g, "");
    if (!challengeId || code.length !== 6) return setStatus("Digite o código de 6 números enviado por e-mail.", "error");
    if (!confirm("Confirmar definitivamente o aceite eletrônico desta versão do contrato?")) return;
    setStatus("Registrando aceite com confirmação por e-mail...");
    try {
      await api(`/portal/contracts/${id}/accept/verify`, { method: "POST", body: JSON.stringify({ accept: true, challengeId, code }) });
      challengeId = "";
      if (codeInput) codeInput.value = "";
      if (codeBox) codeBox.hidden = true;
      setStatus("Contrato aceito e registrado com sucesso.", "success");
      await load();
    } catch (error) {
      setStatus(error.message, "error");
    }
  });

  load().catch(error => {
    if (paper) paper.replaceChildren(el("h1", "Não foi possível abrir o contrato"), el("p", error.message));
  });
})();
