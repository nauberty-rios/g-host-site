(() => {
  "use strict";
  const plans=(window.GHOST_PLANS?.plans||[]).filter(p=>p?.enabled!==false && (p.visibility||"public")==="public" && p.allowSelfService!==false);
  const categories=(window.GHOST_CATALOG?.categories||[]).filter(c=>c?.enabled!==false);
  const allServices=window.GHOST_CATALOG?.services||[];
  const visibility=window.GHOST_VISIBILITY||{options:{}};
  const root=document.getElementById("self-service-app"); if(!root)return;
  const draftKey="ghost_self_service_draft_v1";
  const money=n=>Number(n||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const now=()=>Date.now();
  const promoActive=p=>{ if(!p?.enabled||visibility.options?.showPromotions===false)return false; const s=p.start?Date.parse(p.start):0,e=p.end?Date.parse(p.end):0; return(!s||now()>=s)&&(!e||now()<=e)&&Number(p.price||0)>0; };
  let state={planId:plans[0]?.id||"",items:{}};
  try{const saved=JSON.parse(localStorage.getItem(draftKey)||"null"); if(saved&&plans.some(p=>p.id===saved.planId))state=saved;}catch(_){ }
  const make=(tag,cls="",txt="")=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=="")e.textContent=txt;return e;};
  const currentPlan=()=>plans.find(p=>p.id===state.planId)||plans[0];
  const eligible=s=>s?.enabled!==false && (s.visibility||"public")==="public" && (s.availablePlans||[]).includes(state.planId);
  const activePrice=s=>promoActive(s.promo)?Number(s.promo.price||0):Number(s.price||0);
  const showPrice=s=>visibility.options?.showServicePrices!==false && s.showPrice!==false && activePrice(s)>0;
  const save=()=>{try{localStorage.setItem(draftKey,JSON.stringify(state));}catch(_){}};
  const selectPlan=id=>{ if(!plans.some(p=>p.id===id))return; state.planId=id; Object.keys(state.items).forEach(k=>{const s=allServices.find(x=>x.id===k); if(!s||!eligible(s))delete state.items[k];}); save(); render(); };
  window.addEventListener("ghost-select-plan",e=>selectPlan(e.detail?.planId));

  const render=()=>{
    root.replaceChildren();
    const planBox=make("div","config-step"); planBox.append(make("div","config-step-number","1"),make("div","config-step-title","Escolha o nível G-Host"));
    const planChoices=make("div","config-plan-choices"); plans.forEach(p=>{const b=make("button",`config-plan${p.id===state.planId?" active":""}`);b.type="button";b.append(make("strong","",p.name),make("small","",p.kicker));b.onclick=()=>selectPlan(p.id);planChoices.append(b);}); planBox.append(planChoices); root.append(planBox);

    const serviceBox=make("div","config-step"); serviceBox.append(make("div","config-step-number","2"),make("div","config-step-title","Escolha os serviços"));
    categories.forEach(cat=>{
      const services=allServices.filter(s=>s.category===cat.id && eligible(s)); if(!services.length)return;
      const block=make("div","config-category");block.append(make("h3","",cat.name));const grid=make("div","config-services");
      services.forEach(s=>{
        const selected=Boolean(state.items[s.id]); const card=make("article",`config-service${selected?" selected":""}`);
        const top=make("div","config-service-top"); const check=document.createElement("input");check.type="checkbox";check.checked=selected;check.setAttribute("aria-label",`Selecionar ${s.name}`);
        const copy=make("div");copy.append(make("strong","",s.name),make("p","",s.description)); top.append(check,copy); card.append(top);
        const meta=make("div","config-service-meta");
        meta.append(make("span","",showPrice(s)?`${money(activePrice(s))}${s.billing==="monthly"?"/mês":s.billing==="unit"?` / ${s.unit||"un."}`:""}`:"Sob consulta"));
        if(promoActive(s.promo))meta.append(make("b","","Promoção"));card.append(meta);
        const setSelected=v=>{if(v){state.items[s.id]={qty:Math.max(1,Number(s.min||1))};}else delete state.items[s.id];save();render();};
        check.onchange=()=>setSelected(check.checked); card.onclick=e=>{if(e.target.closest("button,input"))return;setSelected(!selected);};
        if(selected && Number(s.max||1)>1){
          const q=make("div","qty-control");const minus=make("button","","−"),num=make("span","",String(state.items[s.id].qty||1)),plus=make("button","","+"); minus.type=plus.type="button";
          minus.onclick=()=>{state.items[s.id].qty=Math.max(Number(s.min||1),Number(state.items[s.id].qty||1)-1);save();render();};
          plus.onclick=()=>{state.items[s.id].qty=Math.min(Number(s.max||99),Number(state.items[s.id].qty||1)+1);save();render();};
          q.append(minus,num,plus,make("small","",s.unit||"unidade"));card.append(q);
        }
        grid.append(card);
      }); block.append(grid); serviceBox.append(block);
    }); root.append(serviceBox);

    const summary=make("div","config-summary"); summary.append(make("div","config-step-number","3"),make("div","config-step-title","Resumo do seu projeto"));
    const plan=currentPlan(); const list=make("div","summary-list"); list.append(make("div","summary-row",plan?plan.name:"Plano não selecionado"));
    let one=0,monthly=0,hasQuote=false;
    Object.entries(state.items).forEach(([id,item])=>{const s=allServices.find(x=>x.id===id);if(!s||!eligible(s))return;const qty=Number(item.qty||1);const row=make("div","summary-row");row.append(make("span","",`${qty}× ${s.name}`));
      if(showPrice(s)){const total=activePrice(s)*qty;if(s.billing==="monthly")monthly+=total;else if(s.billing!=="quote")one+=total; row.append(make("b","",s.billing==="monthly"?`${money(total)}/mês`:money(total)));} else {hasQuote=true;row.append(make("b","","Sob consulta"));}list.append(row);
    }); summary.append(list);
    if(visibility.options?.showConfiguratorEstimate!==false){const totals=make("div","config-totals"); if(one>0)totals.append(make("div","",`Implantação estimada: ${money(one)}`)); if(monthly>0)totals.append(make("div","",`Mensalidade estimada: ${money(monthly)}/mês`)); if(hasQuote||(!one&&!monthly))totals.append(make("small","","A avaliação técnica e o orçamento final confirmam valores, quantidades, compatibilidade e condições de instalação.")); summary.append(totals);}
    const actions=make("div","config-actions");const saveBtn=make("button","btn btn-ghost","Salvar projeto"),waBtn=make("button","btn","Solicitar proposta");saveBtn.type=waBtn.type="button";
    const feedback=make("small","config-feedback","");saveBtn.onclick=()=>{save();feedback.textContent="Projeto salvo neste navegador.";};
    waBtn.onclick=()=>{const company=window.SITE_DATA?.company||{};const number=String(company.whatsapp||"").replace(/\D/g,"");const lines=[`Olá, ${company.name||"G-Host"}! Montei um projeto pelo autoatendimento.`,`Plano: ${plan?.name||""}`];Object.entries(state.items).forEach(([id,item])=>{const s=allServices.find(x=>x.id===id);if(s)lines.push(`- ${item.qty||1}x ${s.name}`);});lines.push("Gostaria de uma avaliação técnica e proposta final."); if(!/^\d{12,15}$/.test(number)){feedback.textContent="WhatsApp comercial ainda não configurado.";return;} window.open(`https://wa.me/${number}?text=${encodeURIComponent(lines.join("\n"))}`,"_blank","noopener,noreferrer");};
    actions.append(saveBtn,waBtn);summary.append(actions,feedback);root.append(summary);
  };
  render();
})();
