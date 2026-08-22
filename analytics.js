(() => {
  "use strict";
  const API = String(window.GHOST_CLIENT_CONFIG?.apiBase || "").replace(/\/$/, "");
  if (!API) return;

  const CONSENT_KEY = "ghost_analytics_consent_v1";
  const VISITOR_KEY = "ghost_visitor_id_v1";
  let enabled = localStorage.getItem(CONSENT_KEY) === "accepted";
  let visitorId = enabled ? (localStorage.getItem(VISITOR_KEY) || "") : "";

  const secureVisitorId = () => {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return `v-${Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")}`;
  };

  const ensureVisitorId = () => {
    if (!enabled) return "";
    if (!visitorId) {
      visitorId = secureVisitorId();
      localStorage.setItem(VISITOR_KEY, visitorId);
    }
    return visitorId;
  };

  const referrerOrigin = () => {
    try { return document.referrer ? new URL(document.referrer).origin : ""; } catch (_) { return ""; }
  };

  const deviceClass = matchMedia("(max-width: 760px)").matches ? "mobile" : "desktop";
  const send = async (eventType, extra = {}) => {
    if (!enabled) return;
    const id = ensureVisitorId();
    if (!id) return;
    try {
      await fetch(`${API}/analytics/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId: id,
          eventType,
          page: location.pathname,
          target: String(extra.target || "").slice(0, 120),
          category: String(extra.category || "").slice(0, 100),
          referrer: referrerOrigin(),
          deviceClass
        }),
        keepalive: true,
        credentials: "omit",
        referrerPolicy: "no-referrer"
      });
    } catch (_) {}
  };

  window.GHOST_ANALYTICS_EVENT = (eventType, extra) => send(eventType, extra);
  window.addEventListener("ghost-consent-change", event => {
    enabled = Boolean(event.detail?.analytics);
    if (!enabled) {
      visitorId = "";
      localStorage.removeItem(VISITOR_KEY);
      return;
    }
    send("visitou_site", { target: "consent" });
  });

  if (enabled) send("visitou_site", { target: document.title });

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const plan = target.closest("[data-plan-id],.plan-card button");
    if (plan) {
      send("selecionou_plano", { target: plan.dataset.planId || plan.closest("[data-plan-id]")?.dataset.planId || plan.textContent });
      return;
    }
    const service = target.closest(".service-card,.config-service");
    if (service) {
      send("clicou_servico", { target: service.querySelector("h3,strong")?.textContent || "servico" });
      return;
    }
    const wa = target.closest('a[href*="wa.me"],button');
    if (wa && /whatsapp|proposta|orçamento/i.test(wa.textContent || "")) send("clicou_whatsapp", { target: wa.textContent });
  }, { passive: true });
})();
