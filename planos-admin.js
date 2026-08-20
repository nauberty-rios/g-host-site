(() => {
  "use strict";
  const apiBase = String(window.GHOST_AUTH_CONFIG?.apiBase || "").trim().replace(/\/+$/, "");
  let data = JSON.parse(JSON.stringify(window.GHOST_PLANS || { plans: [] }));
  data.plans = Array.isArray(data.plans) ? data.plans : [];
  const editor = document.getElementById("plans-editor");
  const status = document.getElementById("plans-save-status");

  const setStatus = (message, kind = "") => { status.textContent = message; status.className = `publish-status ${kind}`.trim(); };
  const make = (tag, cls = "", text = "") => { const el=document.createElement(tag); if(cls)el.className=cls; if(text)el.textContent=text; return el; };
  const labelInput = (caption, value, onInput, opts={}) => {
    const l=make("label", opts.wide?"wide":"", caption); let c;
    if(opts.textarea){ c=document.createElement("textarea"); c.rows=opts.rows||3; }
    else { c=document.createElement("input"); c.type=opts.type||"text"; }
    c.value=value??""; c.maxLength=opts.max||500; c.addEventListener("input",()=>{onInput(c.value); dirty();}); l.append(c); return l;
  };
  const dirty=()=>{data._meta={...(data._meta||{}),updatedAt:new Date().toISOString()};setStatus("Alterações ainda não publicadas.","busy");};

  const render=()=>{
    editor.replaceChildren();
    data.plans.forEach((p,index)=>{
      p.promo=p.promo||{enabled:false,label:"Promoção",oldPrice:0,price:0,start:"",end:""}; if(p.showPrice===undefined)p.showPrice=false; if(!p.visibility)p.visibility="public";
      p.features=Array.isArray(p.features)?p.features:[];
      const card=make("article","plan-edit-card");
      const head=make("div","plan-edit-head"); head.append(make("h2","",p.name||`Plano ${index+1}`));
      const grid=make("div","plan-edit-grid");
      grid.append(
        labelInput("Nome do plano",p.name,v=>p.name=v,{max:80}),
        labelInput("Chamada curta",p.kicker,v=>p.kicker=v,{max:120}),
        labelInput("Descrição",p.description,v=>p.description=v,{textarea:true,wide:true,max:600}),
        labelInput("Preço normal (R$)",p.price,v=>p.price=Number(v||0),{type:"number",max:60}),
        labelInput("Detalhe do preço",p.priceDetail,v=>p.priceDetail=v,{max:100}),
        labelInput("Etiqueta da promoção",p.promo.label,v=>p.promo.label=v,{max:40}),
        labelInput("Preço anterior (R$)",p.promo.oldPrice,v=>p.promo.oldPrice=Number(v||0),{type:"number",max:60}),
        labelInput("Preço promocional (R$)",p.promo.price,v=>p.promo.price=Number(v||0),{type:"number",max:60}),
        labelInput("Início da promoção",p.promo.start||"",v=>p.promo.start=v,{type:"datetime-local",max:60}),
        labelInput("Fim da promoção",p.promo.end||"",v=>p.promo.end=v,{type:"datetime-local",max:60}),
        labelInput("Recursos — um por linha",p.features.join("\n"),v=>p.features=v.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,12),{textarea:true,wide:true,max:1800,rows:7}),
        labelInput("Texto do botão",p.cta,v=>p.cta=v,{max:70})
      );
      const checks=make("div","inline-checks");
      const addCheck=(txt,checked,onChange)=>{const l=document.createElement("label"),c=document.createElement("input");c.type="checkbox";c.checked=!!checked;c.addEventListener("change",()=>{onChange(c.checked);dirty();});l.append(c,document.createTextNode(txt));checks.append(l);};
      addCheck("Exibir no site",p.enabled!==false,v=>p.enabled=v);
      addCheck("Destacar como recomendado",p.featured,v=>p.featured=v);
      addCheck("Promoção ativa",p.promo.enabled,v=>p.promo.enabled=v);
      addCheck("Mostrar preço",p.showPrice!==false,v=>p.showPrice=v);
      addCheck("Permitir autoatendimento",p.allowSelfService!==false,v=>p.allowSelfService=v);
      grid.append(checks); card.append(head,grid); editor.append(card);
    });
  };

  const publish=async()=>{
    const token=window.GHOST_ADMIN_SESSION?.()||"";
    if(!token||!apiBase){setStatus("Sessão administrativa inválida. Entre novamente.","error");return;}
    setStatus("Publicando planos...","busy");
    try{
      const r=await fetch(`${apiBase}/publish-plans`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},body:JSON.stringify({data}),cache:"no-store",referrerPolicy:"no-referrer"});
      let body={};try{body=await r.json();}catch(_){}
      if(r.status===401){window.GHOST_AUTH_LOGOUT?.();throw new Error("Sessão expirada. Entre novamente.");}
      if(!r.ok)throw new Error(body.error||`Falha (${r.status}).`);
      setStatus("Planos e promoções publicados. O GitHub Pages pode levar alguns instantes para atualizar.","success");
    }catch(e){setStatus(e.message||"Não foi possível publicar.","error");}
  };

  document.getElementById("publish-plans")?.addEventListener("click",publish);
  document.getElementById("publish-plans-bottom")?.addEventListener("click",publish);
  document.getElementById("preview-plans")?.addEventListener("click",()=>window.open("index.html#planos","_blank","noopener,noreferrer"));
  window.addEventListener("ghost-authenticated",render);
})();
