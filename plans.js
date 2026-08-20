(() => {
  "use strict";
  const source = window.GHOST_PLANS || {};
  const visibility = window.GHOST_VISIBILITY || {options:{}};
  const plans = Array.isArray(source.plans) ? source.plans : [];
  const root = document.getElementById("plans-grid");
  if (!root) return;
  const text = value => String(value ?? "");
  const money = value => Number(value||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const now = Date.now();
  const promoActive = promo => {
    if (!promo?.enabled || visibility.options?.showPromotions === false) return false;
    const start = promo.start ? Date.parse(promo.start) : 0;
    const end = promo.end ? Date.parse(promo.end) : 0;
    return (!start || now >= start) && (!end || now <= end) && Number(promo.price||0) >= 0;
  };
  const make = (tag, className, value) => { const el=document.createElement(tag); if(className)el.className=className; if(value!==undefined)el.textContent=text(value); return el; };
  root.replaceChildren();
  plans.filter(p=>p?.enabled!==false && (p.visibility||"public")==="public").forEach(plan=>{
    const card=make("article",`plan-card${plan.featured?" featured":""}`); card.dataset.planId=plan.id;
    if(plan.featured) card.append(make("span","plan-recommended","Recomendado"));
    const promo=promoActive(plan.promo);
    if(promo) card.append(make("span","plan-promo",plan.promo.label||"Promoção"));
    const head=make("div","plan-head"); head.append(make("span","plan-kicker",plan.kicker),make("h3","",plan.name),make("p","",plan.description));
    const price=make("div","plan-price");
    const canShow=visibility.options?.showPlanPrices!==false && plan.showPrice!==false && Number(plan.price||0)>0;
    if(canShow){
      if(promo && Number(plan.promo.price||0)>0){ const old=Number(plan.promo.oldPrice||plan.price||0); if(old>0) price.append(make("span","plan-old-price",money(old))); price.append(make("strong","",money(plan.promo.price))); }
      else price.append(make("strong","",money(plan.price)));
    } else price.append(make("strong","","Valor sob consulta"));
    if(plan.priceDetail) price.append(make("small","",plan.priceDetail));
    const ul=make("ul","plan-features"); (Array.isArray(plan.features)?plan.features:[]).forEach(x=>ul.append(make("li","",x)));
    const a=make("a","btn plan-cta",plan.cta||"Montar projeto");
    a.href=plan.allowSelfService===false?"#contato":"#configurador";
    a.addEventListener("click",()=>{ if(plan.allowSelfService!==false) window.dispatchEvent(new CustomEvent("ghost-select-plan",{detail:{planId:plan.id}})); });
    card.append(head,price,ul,a); root.append(card);
  });
})();
