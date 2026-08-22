(async () => {
  "use strict";
  try { await (window.GHOST_PUBLIC_CONFIG_READY || Promise.resolve(false)); } catch (_) {}
  const plans=(window.GHOST_PLANS?.plans||[]).filter(p=>p?.enabled!==false && (p.visibility||"public")==="public" && p.allowSelfService!==false);
  const categories=(window.GHOST_CATALOG?.categories||[]).filter(c=>c?.enabled!==false);
  const allServices=window.GHOST_CATALOG?.services||[];
  const visibility=window.GHOST_VISIBILITY||{options:{}};
  const root=document.getElementById("self-service-app"); if(!root)return;
  const draftKey="ghost_self_service_draft_v2",lastConfigKey="ghost_last_config_id";
  const API=String(window.GHOST_CLIENT_CONFIG?.apiBase||"").replace(/\/$/,"");
  const TOKEN_KEY=window.GHOST_CLIENT_CONFIG?.sessionStorageKey||"ghost_portal_token";
  const money=n=>Number(n||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const now=()=>Date.now();
  const promoActive=p=>{ if(!p?.enabled||visibility.options?.showPromotions===false)return false; const s=p.start?Date.parse(p.start):0,e=p.end?Date.parse(p.end):0; return(!s||now()>=s)&&(!e||now()<=e)&&Number(p.price||0)>0; };
  let state={planId:plans[0]?.id||"",items:{}};
  try{const saved=JSON.parse(localStorage.getItem(draftKey)||"null"); if(saved&&plans.some(p=>p.id===saved.planId))state=saved;}catch(_){}
  const make=(tag,cls="",txt="")=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=="")e.textContent=txt;return e;};
  const currentPlan=()=>plans.find(p=>p.id===state.planId)||plans[0];
  const eligible=s=>s?.enabled!==false && (s.visibility||"public")==="public" && (s.availablePlans||[]).includes(state.planId);
  const activePrice=s=>promoActive(s.promo)?Number(s.promo.price||0):Number(s.price||0);
  const showPrice=s=>visibility.options?.showServicePrices!==false && s.showPrice!==false && activePrice(s)>0;
  const saveLocal=()=>{try{localStorage.setItem(draftKey,JSON.stringify(state));}catch(_){}};
  const token=()=>sessionStorage.getItem(TOKEN_KEY)||"";
  const api=async(path,options={})=>{if(!API||!token())throw new Error("Entre na Minha G-Host para salvar este projeto na sua conta.");const r=await fetch(`${API}${path}`,{...options,headers:{"Content-Type":"application/json","Authorization":`Bearer ${token()}`,...(options.headers||{})},cache:"no-store",referrerPolicy:"no-referrer"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||"Não foi possível salvar o projeto.");return d;};
  const selectPlan=id=>{ if(!plans.some(p=>p.id===id))return; state.planId=id; Object.keys(state.items).forEach(k=>{const s=allServices.find(x=>x.id===k); if(!s||!eligible(s))delete state.items[k];}); saveLocal(); window.GHOST_ANALYTICS_EVENT?.("selecionou_plano",{target:id}); render(); };
  window.addEventListener("ghost-select-plan",e=>selectPlan(e.detail?.planId));

  const calculate=()=>{
    let one=0,monthly=0,hasQuote=false;
    Object.entries(state.items).forEach(([id,item])=>{const s=allServices.find(x=>x.id===id);if(!s||!eligible(s))return;const qty=Number(item.qty||1);if(showPrice(s)){const total=activePrice(s)*qty;if(s.billing==="monthly")monthly+=total;else if(s.billing!=="quote")one+=total;}else hasQuote=true;});
    return {oneTime:one,monthly,hasQuote};
  };

  const saveToAccount=async(status="rascunho")=>{
    const totals=calculate();
    const result=await api("/portal/configurations",{method:"POST",body:JSON.stringify({name:`Projeto ${currentPlan()?.name||"G-Host"}`,planId:state.planId,items:state.items,totals,status})});
    if(result.id)localStorage.setItem(lastConfigKey,String(result.id));
    window.GHOST_ANALYTICS_EVENT?.("salvou_projeto",{target:state.planId});
    return result;
  };

  const render=()=>{
    root.replaceChildren();
    const planBox=make("div","config-step"); planBox.append(make("div","config-step-number","1"),make("div","config-step-title","Escolha o nível G-Host"));
    const planChoices=make("div","config-plan-choices"); plans.forEach(p=>{const b=make("button",`config-plan${p.id===state.planId?" active":""}`);b.type="button";b.dataset.planId=p.id;b.append(make("strong","",p.name),make("small","",p.kicker));b.onclick=()=>selectPlan(p.id);planChoices.append(b);}); planBox.append(planChoices); root.append(planBox);

    const serviceBox=make("div","config-step"); serviceBox.append(make("div","config-step-number","2"),make("div","config-step-title","Escolha os serviços"));
    categories.forEach(cat=>{
      const services=allServices.filter(s=>s.category===cat.id && eligible(s)); if(!services.length)return;
      const block=make("div","config-category");block.append(make("h3","",cat.name));const grid=make("div","config-services");
      services.forEach(s=>{
        const selected=Boolean(state.items[s.id]); const card=make("article",`config-service${selected?" selected":""}`);
        const top=make("div","config-service-top"); const check=document.createElement("input");check.type="checkbox";check.checked=selected;check.setAttribute("aria-label",`Selecionar ${s.name}`);
        const copy=make("div");copy.append(make("strong","",s.name),make("p","",s.description)); top.append(check,copy); card.append(top);
        const meta=make("div","config-service-meta");meta.append(make("span","",showPrice(s)?`${money(activePrice(s))}${s.billing==="monthly"?"/mês":s.billing==="unit"?` / ${s.unit||"un."}`:""}`:"Sob consulta"));if(promoActive(s.promo))meta.append(make("b","","Promoção"));card.append(meta);
        const setSelected=v=>{if(v){state.items[s.id]={qty:Math.max(1,Number(s.min||1))};window.GHOST_ANALYTICS_EVENT?.("alterou_configurador",{target:s.id,category:"add"});}else{delete state.items[s.id];window.GHOST_ANALYTICS_EVENT?.("alterou_configurador",{target:s.id,category:"remove"});}saveLocal();render();};
        check.onchange=()=>setSelected(check.checked); card.onclick=e=>{if(e.target.closest("button,input"))return;setSelected(!selected);};
        if(selected && Number(s.max||1)>1){const q=make("div","qty-control");const minus=make("button","","−"),num=make("span","",String(state.items[s.id].qty||1)),plus=make("button","","+");minus.type=plus.type="button";minus.onclick=()=>{state.items[s.id].qty=Math.max(Number(s.min||1),Number(state.items[s.id].qty||1)-1);saveLocal();render();};plus.onclick=()=>{state.items[s.id].qty=Math.min(Number(s.max||99),Number(state.items[s.id].qty||1)+1);saveLocal();render();};q.append(minus,num,plus,make("small","",s.unit||"unidade"));card.append(q);}
        grid.append(card);
      });block.append(grid);serviceBox.append(block);
    });root.append(serviceBox);

    const summary=make("div","config-summary");summary.append(make("div","config-step-number","3"),make("div","config-step-title","Resumo do seu projeto"));const plan=currentPlan();const list=make("div","summary-list");list.append(make("div","summary-row",plan?plan.name:"Plano não selecionado"));
    Object.entries(state.items).forEach(([id,item])=>{const s=allServices.find(x=>x.id===id);if(!s||!eligible(s))return;const qty=Number(item.qty||1);const row=make("div","summary-row");row.append(make("span","",`${qty}× ${s.name}`));if(showPrice(s)){const total=activePrice(s)*qty;row.append(make("b","",s.billing==="monthly"?`${money(total)}/mês`:money(total)));}else row.append(make("b","","Sob consulta"));list.append(row);});summary.append(list);
    const totals=calculate();if(visibility.options?.showConfiguratorEstimate!==false){const box=make("div","config-totals");if(totals.oneTime>0)box.append(make("div","",`Implantação estimada: ${money(totals.oneTime)}`));if(totals.monthly>0)box.append(make("div","",`Mensalidade estimada: ${money(totals.monthly)}/mês`));if(totals.hasQuote||(!totals.oneTime&&!totals.monthly))box.append(make("small","","A avaliação técnica e o orçamento final confirmam valores, quantidades, compatibilidade e condições de instalação."));summary.append(box);}
    const actions=make("div","config-actions");const saveBtn=make("button","btn btn-ghost",token()?"Salvar na Minha G-Host":"Salvar neste navegador"),accountBtn=document.createElement("a"),waBtn=make("button","btn","Solicitar proposta");saveBtn.type=waBtn.type="button";accountBtn.className="btn btn-ghost";accountBtn.href=token()?"cliente.html":"entrar.html";accountBtn.textContent=token()?"Abrir Minha G-Host":"Entrar para salvar";const feedback=make("small","config-feedback","");
    saveBtn.onclick=async()=>{saveLocal();if(!token()){feedback.textContent="Projeto salvo neste navegador. Entre na Minha G-Host para vinculá-lo à sua conta.";return;}try{await saveToAccount("rascunho");feedback.textContent="Projeto salvo na sua conta G-Host.";}catch(error){feedback.textContent=error.message;}};
    waBtn.onclick=async()=>{let configurationId=Number(localStorage.getItem(lastConfigKey)||0);if(token()){try{const saved=await saveToAccount("enviado");configurationId=Number(saved.id||configurationId);await api("/portal/quotes",{method:"POST",body:JSON.stringify({configurationId,contactPreference:"whatsapp",notes:"Solicitação enviada pelo configurador público."})});feedback.textContent="Solicitação registrada na sua conta.";window.GHOST_ANALYTICS_EVENT?.("solicitou_orcamento",{target:state.planId});}catch(error){feedback.textContent=error.message;}}
      const company=window.SITE_DATA?.company||{},number=String(company.whatsapp||"").replace(/\D/g,"");const lines=[`Olá, ${company.name||"G-Host"}! Montei um projeto pelo autoatendimento.`,`Plano: ${plan?.name||""}`];Object.entries(state.items).forEach(([id,item])=>{const s=allServices.find(x=>x.id===id);if(s)lines.push(`- ${item.qty||1}x ${s.name}`);});lines.push("Gostaria de uma avaliação técnica e proposta final.");if(!/^\d{12,15}$/.test(number)){feedback.textContent+=" WhatsApp comercial ainda não configurado.";return;}window.open(`https://wa.me/${number}?text=${encodeURIComponent(lines.join("\n"))}`,"_blank","noopener,noreferrer");};
    actions.append(saveBtn,accountBtn,waBtn);summary.append(actions,feedback);root.append(summary);
  };
  render();
})();
