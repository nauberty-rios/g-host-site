(() => {
  "use strict";
  const API=String(window.GHOST_CLIENT_CONFIG?.apiBase||"").replace(/\/$/,"");
  if(!API)return;
  const CONSENT_KEY="ghost_analytics_consent_v1",VISITOR_KEY="ghost_visitor_id_v1";
  let enabled=localStorage.getItem(CONSENT_KEY)==="accepted";
  let visitorId=localStorage.getItem(VISITOR_KEY)||"";
  if(!visitorId){visitorId=(crypto.randomUUID?crypto.randomUUID():`v-${Date.now()}-${Math.random().toString(36).slice(2)}`);localStorage.setItem(VISITOR_KEY,visitorId);}
  const deviceClass=matchMedia("(max-width: 760px)").matches?"mobile":"desktop";
  const send=async(eventType,extra={})=>{
    if(!enabled)return;
    try{await fetch(`${API}/analytics/event`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({visitorId,eventType,page:location.pathname,target:String(extra.target||"").slice(0,120),category:String(extra.category||"").slice(0,100),referrer:document.referrer,deviceClass}),keepalive:true,referrerPolicy:"no-referrer"});}catch(_){}
  };
  window.GHOST_ANALYTICS_EVENT=(eventType,extra)=>send(eventType,extra);
  window.addEventListener("ghost-consent-change",e=>{enabled=Boolean(e.detail?.analytics);if(enabled)send("visitou_site",{target:"consent"});});
  if(enabled)send("visitou_site",{target:document.title});
  document.addEventListener("click",event=>{
    const plan=event.target.closest("[data-plan-id],.plan-card button");if(plan){send("selecionou_plano",{target:plan.dataset.planId||plan.closest("[data-plan-id]")?.dataset.planId||plan.textContent});return;}
    const service=event.target.closest(".service-card,.config-service");if(service){send("clicou_servico",{target:service.querySelector("h3,strong")?.textContent||"servico"});return;}
    const wa=event.target.closest('a[href*="wa.me"],button');if(wa&&/whatsapp|proposta|orçamento/i.test(wa.textContent||""))send("clicou_whatsapp",{target:wa.textContent});
  },{passive:true});
})();
