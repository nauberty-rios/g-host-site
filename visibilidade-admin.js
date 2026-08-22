(() => {
  "use strict";
  const apiBase = String(window.GHOST_AUTH_CONFIG?.apiBase || "").replace(/\/+$/, "");
  let data = JSON.parse(JSON.stringify(window.GHOST_VISIBILITY || { sections: {}, options: {} }));
  const status = document.getElementById("control-status");
  const labels = {
    hero: "Destaque principal", solucoes: "Soluções", ecossistema: "Guardião, Horus e Sentinela",
    planos: "Planos", configurador: "Autoatendimento", plataforma: "Plataforma e recursos reais",
    empresa: "Sobre a empresa", processo: "Como funciona", simulador: "Simulador simples", faq: "Dúvidas frequentes",
    contato: "Contato", areaCliente: "Área do Cliente", showPlanPrices: "Permitir preços dos planos",
    showServicePrices: "Permitir preços dos serviços", showPromotions: "Mostrar promoções ativas",
    showConfiguratorEstimate: "Mostrar estimativa no configurador"
  };

  const set = (message, kind = "") => {
    if (!status) return;
    status.textContent = message;
    status.className = `publish-status ${kind}`.trim();
  };

  const drawGroup = (rootId, object) => {
    const root = document.getElementById(rootId);
    if (!root) return;
    root.replaceChildren();
    Object.keys(object || {}).forEach(key => {
      const label = document.createElement("label");
      label.className = "toggle-card";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = object[key] !== false;
      const copy = document.createElement("span");
      const title = document.createElement("b");
      title.textContent = labels[key] || key;
      const stateText = document.createElement("small");
      const refreshState = () => { stateText.textContent = checkbox.checked ? "Visível/ativo" : "Oculto/desativado"; };
      refreshState();
      copy.append(title, stateText);
      checkbox.addEventListener("change", () => {
        object[key] = checkbox.checked;
        refreshState();
        set("Alterações ainda não publicadas.", "busy");
      });
      label.append(checkbox, copy);
      root.append(label);
    });
  };

  const render = () => {
    drawGroup("visibility-list", data.sections || {});
    drawGroup("option-list", data.options || {});
  };

  const publish = async () => {
    const token = window.GHOST_ADMIN_SESSION?.() || "";
    if (!token || !apiBase) {
      set("Sessão administrativa inválida.", "error");
      return;
    }
    set("Publicando visibilidade...", "busy");
    try {
      const response = await fetch(`${apiBase}/publish-visibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ data }),
        cache: "no-store",
        referrerPolicy: "no-referrer"
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401) {
        window.GHOST_AUTH_LOGOUT?.();
        throw new Error("Sessão expirada.");
      }
      if (!response.ok) throw new Error(body.error || `Falha (${response.status}).`);
      set("Visibilidade publicada com sucesso.", "success");
    } catch (error) {
      set(error.message, "error");
    }
  };

  document.getElementById("publish")?.addEventListener("click", publish);
  document.getElementById("preview")?.addEventListener("click", () => window.open("index.html", "_blank", "noopener,noreferrer"));
  window.addEventListener("ghost-authenticated", render);
})();
