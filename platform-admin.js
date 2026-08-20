(() => {
  "use strict";

  let initialized = false;
  const cfg = window.GHOST_AUTH_CONFIG || {};
  const API = String(cfg.apiBase || "").replace(/\/$/, "");
  const make = (tag, cls = "", text = "") => { const e=document.createElement(tag); if(cls)e.className=cls; if(text!=="")e.textContent=text; return e; };
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const context = () => window.GHOST_CONTROL_CONTEXT || { kind:"owner", permissions:{all:true} };
  const can = key => context().kind === "owner" || context().permissions?.all === true || context().permissions?.[key] === true;

  const api = async (path, options = {}) => {
    const token = window.GHOST_ADMIN_SESSION?.() || "";
    if (!token) throw new Error("Sessão administrativa não autenticada.");
    const headers = { "Content-Type":"application/json", "Authorization":`Bearer ${token}`, ...(options.headers||{}) };
    if (context().kind === "staff") {
      const d = localStorage.getItem("ghost_staff_device_v1") || "";
      if (d) headers["X-Ghost-Device"] = d;
    } else {
      const d = localStorage.getItem("ghost_owner_device_v1") || "";
      if (d) headers["X-Ghost-Device"] = d;
    }
    const r = await fetch(`${API}${path}`, { ...options, headers, cache:"no-store", referrerPolicy:"no-referrer" });
    const data = await r.json().catch(()=>({}));
    if (!r.ok) throw new Error(data.error || `Falha (${r.status}).`);
    return data;
  };

  const status = (id, msg, type="") => { const el=document.getElementById(id); if(el){el.textContent=msg;el.className=`platform-status ${type}`.trim();} };
  const card = (id, eyebrow, title, text="") => { const sec=make("section","admin-card");sec.id=id;sec.append(make("span","eyebrow",eyebrow),make("h2","",title));if(text)sec.append(make("p","muted",text));return sec; };
  const addNav = (href,label) => { const sidebar=document.querySelector(".admin-sidebar");if(!sidebar||sidebar.querySelector(`a[href='${href}']`))return;const a=make("a","",label);a.href=href;sidebar.insertBefore(a,sidebar.querySelector(".admin-note")||null); };

  const permissionDefs = [
    ["site_edit","Editar conteúdo"],
    ["site_visibility","Visibilidade"],
    ["prices","Planos, preços e promoções"],
    ["crm","CRM, leads e suporte"],
    ["operations","Operação técnica"],
    ["data_export","Exportar banco"],
    ["cftv","CFTV"],
    ["guardian","Guardião"],
    ["security","Segurança"],
    ["analytics","Analytics"],
    ["legal","Jurídico/LGPD"]
  ];

  const renderUsers = async () => {
    if (context().kind !== "owner") return;
    status("platform-users-status","Carregando usuários...");
    try {
      const data = await api("/admin/users"), root=document.getElementById("platform-users-list"); root.replaceChildren();
      (data.items||[]).forEach(user => {
        const row=make("article","platform-row"), main=make("div","platform-row-main");
        main.append(make("strong","",user.name||"Usuário"),make("small","",`${user.email} · ${user.phone||"sem telefone"} · ${user.trusted_devices||0} aparelho(s) confiável(is)`));
        const role=document.createElement("select");[["visitante","Visitante"],["cliente","Cliente"],["adm","ADM"]].forEach(([v,t])=>{const o=document.createElement("option");o.value=v;o.textContent=t;o.selected=user.role===v;role.append(o);});
        const limit=document.createElement("input");limit.type="number";limit.min="1";limit.max="10";limit.value=String(user.camera_device_limit||2);limit.title="Limite de aparelhos CFTV";
        let permissions={};try{permissions=JSON.parse(user.permissions_json||"{}")}catch(_){}
        const details=document.createElement("details");details.className="platform-permissions";const summary=document.createElement("summary");summary.textContent="Permissões do ADM / recursos";const grid=make("div","permission-grid"),checks={};
        permissionDefs.forEach(([key,label])=>{const l=document.createElement("label"),c=document.createElement("input");c.type="checkbox";c.checked=Boolean(permissions[key]);checks[key]=c;l.append(c,document.createTextNode(label));grid.append(l);});
        const activeLabel=document.createElement("label"),active=document.createElement("input");active.type="checkbox";active.checked=Boolean(user.active);activeLabel.append(active,document.createTextNode(" Conta ativa"));grid.append(activeLabel);details.append(summary,grid);
        const actions=make("div","platform-inline-actions");
        const save=make("button","mini-btn","Salvar");save.type="button";save.onclick=async()=>{save.disabled=true;try{const p={};Object.entries(checks).forEach(([k,c])=>p[k]=c.checked);await api(`/admin/users/${user.id}`,{method:"PUT",body:JSON.stringify({role:role.value,cameraDeviceLimit:Number(limit.value||2),active:active.checked,permissions:p})});status("platform-users-status",`Usuário ${user.email} atualizado.`,"success");await renderUsers();}catch(e){status("platform-users-status",e.message,"error");}finally{save.disabled=false;}};
        actions.append(save);
        if(user.role==="adm"){
          const reset=make("button","mini-btn danger","Resetar MFA/aparelho ADM");reset.type="button";reset.onclick=async()=>{if(!confirm(`Redefinir autenticador, aparelho administrativo e sessões de ${user.email}?`))return;reset.disabled=true;try{const r=await api(`/admin/users/${user.id}/reset-security`,{method:"POST",body:"{}"});status("platform-users-status",r.message||"Segurança ADM redefinida.","success");}catch(e){status("platform-users-status",e.message,"error");}finally{reset.disabled=false;}};actions.append(reset);
        }
        row.append(main,role,limit,actions,details);root.append(row);
      });
      if(!(data.items||[]).length)root.append(make("p","muted","Nenhuma conta pública criada ainda."));
      status("platform-users-status",`${(data.items||[]).length} conta(s) carregada(s).`,"success");
    } catch(e){status("platform-users-status",e.message,"error");}
  };

  const renderCrm = async () => {
    if(!can("crm"))return;
    status("platform-commercial-status","Carregando leads e chamados...");
    try{
      const [quotes,support]=await Promise.all([api("/admin/quotes"),api("/admin/support")]);
      const q=document.getElementById("platform-quotes"),sp=document.getElementById("platform-support");
      const quoteOptions = current => [["novo","Novo"],["em_analise","Em análise"],["proposta_enviada","Proposta enviada"],["aprovado","Aprovado"],["recusado","Recusado"],["convertido","Convertido"]].map(([v,t])=>`<option value="${v}"${current===v?" selected":""}>${t}</option>`).join("");
      const supportOptions = current => [["aberto","Aberto"],["em_atendimento","Em atendimento"],["aguardando_cliente","Aguardando cliente"],["resolvido","Resolvido"],["cancelado","Cancelado"]].map(([v,t])=>`<option value="${v}"${current===v?" selected":""}>${t}</option>`).join("");
      if(q){
        q.innerHTML=`<table class="platform-table"><thead><tr><th>Cliente</th><th>Plano</th><th>Contato</th><th>Status</th><th>Data</th><th>Ação</th></tr></thead><tbody>${(quotes.items||[]).map(x=>`<tr><td>${escapeHtml(x.name||"")}<br><small>${escapeHtml(x.email||"")} · ${escapeHtml(x.phone||"")}</small></td><td>${escapeHtml(x.plan_id||"-")}</td><td>${escapeHtml(x.contact_preference||"")}</td><td>${escapeHtml(x.status||"")}</td><td>${escapeHtml(x.created_at||"")}</td><td><select data-quote-status="${Number(x.id)}">${quoteOptions(x.status)}</select><button class="mini-btn" type="button" data-save-quote="${Number(x.id)}">Salvar</button></td></tr>`).join("")}</tbody></table>`;
        q.querySelectorAll("[data-save-quote]").forEach(btn=>btn.addEventListener("click",async()=>{const id=Number(btn.dataset.saveQuote),sel=q.querySelector(`[data-quote-status="${id}"]`);btn.disabled=true;try{await api(`/admin/quotes/${id}/status`,{method:"PUT",body:JSON.stringify({status:sel.value})});status("platform-commercial-status","Status da proposta atualizado.","success");await renderCrm();}catch(e){status("platform-commercial-status",e.message,"error");}finally{btn.disabled=false;}}));
      }
      if(sp){
        sp.innerHTML=`<table class="platform-table"><thead><tr><th>Cliente</th><th>Assunto</th><th>Prioridade</th><th>Status</th><th>Data</th><th>Ação</th></tr></thead><tbody>${(support.items||[]).map(x=>`<tr><td>${escapeHtml(x.name||"")}<br><small>${escapeHtml(x.email||"")}</small></td><td>${escapeHtml(x.subject||"")}<br><small>${escapeHtml(x.description||"")}</small></td><td>${escapeHtml(x.priority||"")}</td><td>${escapeHtml(x.status||"")}</td><td>${escapeHtml(x.created_at||"")}</td><td><select data-support-status="${Number(x.id)}">${supportOptions(x.status)}</select><button class="mini-btn" type="button" data-save-support="${Number(x.id)}">Salvar</button></td></tr>`).join("")}</tbody></table>`;
        sp.querySelectorAll("[data-save-support]").forEach(btn=>btn.addEventListener("click",async()=>{const id=Number(btn.dataset.saveSupport),sel=sp.querySelector(`[data-support-status="${id}"]`);btn.disabled=true;try{await api(`/admin/support/${id}/status`,{method:"PUT",body:JSON.stringify({status:sel.value})});status("platform-commercial-status","Status do chamado atualizado.","success");await renderCrm();}catch(e){status("platform-commercial-status",e.message,"error");}finally{btn.disabled=false;}}));
      }
      status("platform-commercial-status",`${(quotes.items||[]).length} proposta(s) e ${(support.items||[]).length} chamado(s).`,"success");
    }catch(e){status("platform-commercial-status",e.message,"error");}
  };

  const renderContracts = async () => {
    if(!can("legal"))return;
    status("platform-legal-status","Carregando contratos...");
    try{
      const [contracts,people]=await Promise.all([api("/admin/contracts"),api("/admin/client-options")]);
      const root=document.getElementById("platform-contracts");
      const contractOptions = current => [["rascunho","Rascunho"],["pendente_aceite","Pendente de aceite"],["cancelado","Cancelado"],["encerrado","Encerrado"]].map(([v,t])=>`<option value="${v}"${current===v?" selected":""}>${t}</option>`).join("");
      if(root){
        root.innerHTML=`<table class="platform-table"><thead><tr><th>Contrato</th><th>Cliente</th><th>Plano</th><th>Valor</th><th>Status</th><th>Assinado</th><th>Ação</th></tr></thead><tbody>${(contracts.items||[]).map(x=>`<tr><td>${escapeHtml(x.code||"")}<br><small>v${escapeHtml(x.version||"1")}</small></td><td>${escapeHtml(x.name||"")}<br><small>${escapeHtml(x.email||"")}</small></td><td>${escapeHtml(x.plan_id||"-")}</td><td>${Number(x.amount||0)>0?Number(x.amount).toLocaleString("pt-BR",{style:"currency",currency:"BRL"}):"-"}</td><td>${escapeHtml(x.status||"")}</td><td>${escapeHtml(x.signed_at||"-")}</td><td>${x.signed_at?"Documento aceito":`<select data-contract-status="${Number(x.id)}">${contractOptions(x.status)}</select><button class="mini-btn" type="button" data-save-contract="${Number(x.id)}">Salvar</button>`}</td></tr>`).join("")}</tbody></table>`;
        root.querySelectorAll("[data-save-contract]").forEach(btn=>btn.addEventListener("click",async()=>{const id=Number(btn.dataset.saveContract),sel=root.querySelector(`[data-contract-status="${id}"]`);btn.disabled=true;try{await api(`/admin/contracts/${id}/status`,{method:"PUT",body:JSON.stringify({status:sel.value})});status("platform-legal-status","Status do contrato atualizado.","success");await renderContracts();}catch(e){status("platform-legal-status",e.message,"error");}finally{btn.disabled=false;}}));
      }
      const select=document.getElementById("contract-person");if(select){const current=select.value;select.replaceChildren();const blank=document.createElement("option");blank.value="";blank.textContent="Selecione o cliente";select.append(blank);(people.items||[]).forEach(u=>{const o=document.createElement("option");o.value=String(u.person_id);o.textContent=`${u.name} — ${u.email||"sem conta"}`;select.append(o);});if(current)select.value=current;}
      status("platform-legal-status",`${(contracts.items||[]).length} contrato(s) carregado(s).`,"success");
    }catch(e){status("platform-legal-status",e.message,"error");}
  };

  const renderAnalytics = async () => {
    if(!can("analytics"))return;
    status("platform-analytics-status","Atualizando inteligência...");
    try{
      const data=await api("/admin/analytics/summary?days=30"),stats=document.getElementById("platform-analytics-stats");stats.replaceChildren();
      [["Visitantes aproximados",data.totals?.visitors],["Eventos",data.totals?.events],["Contas identificadas",data.totals?.identifiedAccounts],["Pedidos de proposta",data.totals?.quoteRequests]].forEach(([label,val])=>{const c=make("div","platform-stat");c.append(make("small","",label),make("strong","",String(val||0)));stats.append(c);});
      document.getElementById("platform-analytics-types").innerHTML=`<table class="platform-table"><thead><tr><th>Evento</th><th>Quantidade</th></tr></thead><tbody>${(data.byType||[]).map(x=>`<tr><td>${escapeHtml(x.event_type)}</td><td>${Number(x.n||0)}</td></tr>`).join("")}</tbody></table>`;
      status("platform-analytics-status","Analytics dos últimos 30 dias atualizado.","success");
    }catch(e){status("platform-analytics-status",e.message,"error");}
  };

  const renderDefense = async () => {
    status("platform-security-status","Carregando módulos autorizados...");
    try{
      let sec={items:[]},guardian={nodes:[]},audit={items:[]};
      if(can("security")){[sec,audit]=await Promise.all([api("/admin/security-events"),api("/admin/audit-log")]);}
      if(can("guardian"))guardian=await api("/admin/guardian");
      const sr=document.getElementById("platform-security-list");if(sr){sr.replaceChildren();(sec.items||[]).slice(0,80).forEach(x=>{const row=make("article","platform-row"),main=make("div","platform-row-main");main.append(make("strong","",x.summary||x.event_type),make("small","",`${x.name||x.email||"Conta não identificada"} · ${x.created_at||""}`));row.append(main,make("span",`platform-badge ${x.severity||""}`,x.severity||"info"));sr.append(row);});if(!(sec.items||[]).length)sr.append(make("p","muted",can("security")?"Nenhum evento de segurança registrado.":"Sem permissão para eventos de segurança."));}
      const ar=document.getElementById("platform-audit-list");if(ar)ar.innerHTML=can("security")?`<table class="platform-table"><thead><tr><th>Quando</th><th>Ação</th><th>Entidade</th><th>Detalhes</th></tr></thead><tbody>${(audit.items||[]).slice(0,150).map(x=>`<tr><td>${escapeHtml(x.created_at||"")}</td><td>${escapeHtml(x.action||"")}</td><td>${escapeHtml(x.entity_type||"")} ${escapeHtml(x.entity_id||"")}</td><td>${escapeHtml(x.details||"")}</td></tr>`).join("")}</tbody></table>`:`<p class="muted">Sem permissão para auditoria.</p>`;
      const gr=document.getElementById("platform-guardian-list");if(gr)gr.innerHTML=can("guardian")?`<table class="platform-table"><thead><tr><th>Guardião</th><th>Local</th><th>Status</th><th>Último contato</th></tr></thead><tbody>${(guardian.nodes||[]).map(x=>`<tr><td>${escapeHtml(x.name||"Guardião Hub")}</td><td>${escapeHtml(x.site_name||"")}</td><td>${escapeHtml(x.status||"")}</td><td>${escapeHtml(x.last_seen_at||"")}</td></tr>`).join("")}</tbody></table>`:`<p class="muted">Sem permissão para Guardião.</p>`;
      status("platform-security-status",`${(sec.items||[]).length} evento(s), ${(audit.items||[]).length} registro(s) de auditoria e ${(guardian.nodes||[]).length} Guardião(ões).`,"success");
    }catch(e){status("platform-security-status",e.message,"error");}
  };

  const buildUsers = root => {
    if(context().kind!=="owner")return;
    addNav("#usuarios-platform","Usuários & permissões");
    const sec=card("usuarios-platform","Identidade e RBAC","Usuários e permissões","Toda conta nova nasce como Visitante. O Dono pode promover para Cliente ou ADM, definir permissões, limite CFTV e redefinir a segurança do ADM.");
    const list=make("div","platform-list");list.id="platform-users-list";const btn=make("button","btn btn-ghost btn-small","Atualizar usuários");btn.type="button";btn.onclick=renderUsers;const st=make("div","platform-status");st.id="platform-users-status";sec.append(list,btn,st);root.prepend(sec);renderUsers();
  };

  const buildCommercial = root => {
    if(!can("crm")&&!can("legal"))return;
    addNav("#comercial-platform","Comercial & contratos");
    const sec=card("comercial-platform","Comercial, atendimento e jurídico","Leads, suporte e contratos","O painel mostra somente os módulos que o Dono autorizou para a conta ADM.");
    if(can("crm")){
      sec.append(make("h3","","Pedidos de proposta"));const q=make("div","platform-scroll");q.id="platform-quotes";sec.append(q,make("h3","","Chamados de suporte"));const s=make("div","platform-scroll");s.id="platform-support";const b=make("button","btn btn-ghost btn-small","Atualizar CRM");b.type="button";b.onclick=renderCrm;const st=make("div","platform-status");st.id="platform-commercial-status";sec.append(s,b,st);
    }
    if(can("legal")){
      sec.append(make("h3","","Contratos e aceite eletrônico"));
      const form=document.createElement("form");form.className="form-grid db-form";form.id="platform-contract-form";
      form.innerHTML=`<label>Cliente<select id="contract-person" required><option value="">Selecione o cliente</option></select></label><label>Código<input id="contract-code" maxlength="50" placeholder="Automático se vazio"></label><label>Plano<select id="contract-plan"><option value="essencial">Essencial</option><option value="protecao">Proteção</option><option value="guardiao">Guardião</option></select></label><label>Status<select id="contract-status-select"><option value="rascunho">Rascunho</option><option value="pendente_aceite">Enviar para aceite</option></select></label><label>Título<input id="contract-title" maxlength="180" value="Contrato de Prestação de Serviços G-Host" required></label><label>Valor<input id="contract-amount" type="number" min="0" step="0.01"></label><label>Início<input id="contract-start" type="date"></label><label>Término<input id="contract-end" type="date"></label><label class="wide">Resumo<textarea id="contract-summary" rows="3" maxlength="2500"></textarea></label><label class="wide">Texto integral do contrato<textarea id="contract-body" rows="12" maxlength="30000" required placeholder="Cole aqui somente a versão revisada do contrato que será apresentada ao cliente."></textarea></label><p class="muted wide">Não envie para aceite um texto jurídico provisório. Depois de aceito, alterações exigem nova versão.</p><button class="btn" type="submit">Criar contrato</button>`;
      form.addEventListener("submit",async e=>{e.preventDefault();status("platform-legal-status","Criando contrato...","busy");try{await api("/admin/contracts",{method:"POST",body:JSON.stringify({personId:Number(document.getElementById("contract-person").value||0),code:document.getElementById("contract-code").value,planId:document.getElementById("contract-plan").value,status:document.getElementById("contract-status-select").value,title:document.getElementById("contract-title").value,amount:Number(document.getElementById("contract-amount").value||0),startsAt:document.getElementById("contract-start").value,endsAt:document.getElementById("contract-end").value,summary:document.getElementById("contract-summary").value,bodyText:document.getElementById("contract-body").value,version:"1"})});form.reset();document.getElementById("contract-title").value="Contrato de Prestação de Serviços G-Host";status("platform-legal-status","Contrato criado.","success");await renderContracts();}catch(err){status("platform-legal-status",err.message,"error");}});
      const list=make("div","platform-scroll");list.id="platform-contracts";const b=make("button","btn btn-ghost btn-small","Atualizar contratos");b.type="button";b.onclick=renderContracts;const st=make("div","platform-status");st.id="platform-legal-status";sec.append(form,list,b,st);
    }
    root.prepend(sec);if(can("crm"))renderCrm();if(can("legal"))renderContracts();
  };

  const buildAnalytics = root => {
    if(!can("analytics"))return;addNav("#inteligencia-platform","Analytics");const sec=card("inteligencia-platform","Inteligência","Analytics com consentimento","Métricas opcionais não recebem o texto digitado nos formulários.");const stats=make("div","platform-grid");stats.id="platform-analytics-stats";const types=make("div","platform-scroll");types.id="platform-analytics-types";const b=make("button","btn btn-ghost btn-small","Atualizar analytics");b.type="button";b.onclick=renderAnalytics;const st=make("div","platform-status");st.id="platform-analytics-status";sec.append(stats,types,b,st);root.prepend(sec);renderAnalytics();
  };

  const buildDefense = root => {
    if(!can("security")&&!can("guardian"))return;addNav("#seguranca-platform","Segurança & Guardião");const sec=card("seguranca-platform","Defesa em profundidade","Segurança e Guardião","A identidade web usa autenticação e aparelho autorizado; MAC é reservado ao ambiente local do Guardião.");const sl=make("div","platform-list");sl.id="platform-security-list";const ah=make("h3","","Auditoria administrativa"),al=make("div","platform-scroll");al.id="platform-audit-list";const gh=make("h3","","Guardião Hub"),gl=make("div","platform-scroll");gl.id="platform-guardian-list";const b=make("button","btn btn-ghost btn-small","Atualizar defesa");b.type="button";b.onclick=renderDefense;const st=make("div","platform-status");st.id="platform-security-status";sec.append(sl,ah,al,gh,gl,b,st);root.prepend(sec);renderDefense();
  };

  const init = () => {
    if(initialized)return;initialized=true;const root=document.querySelector(".admin-content");if(!root)return;
    buildDefense(root);buildAnalytics(root);buildCommercial(root);buildUsers(root);
  };

  window.addEventListener("ghost-authenticated", init);
})();
