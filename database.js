(() => {
  "use strict";
  let started = false;
  let people = [], sites = [], projects = [], systems = [], assets = [], records = [], materials = [], services = [];
  const $ = id => document.getElementById(id);
  const cfg = () => String(window.GHOST_AUTH_CONFIG?.apiBase || "").trim().replace(/\/+$/, "");
  const token = () => window.GHOST_ADMIN_SESSION?.() || "";
  const val = id => $(id)?.value ?? "";
  const num = value => {
    const normalized = String(value ?? "").trim().replace(/\./g, "").replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  };
  const money = value => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
  const labelize = value => String(value || "").replaceAll("_", " ");

  const request = async (path, opts = {}) => {
    const response = await fetch(`${cfg()}${path}`, {
      ...opts,
      headers: { ...(opts.headers || {}), "Content-Type": "application/json", "Authorization": `Bearer ${token()}` },
      cache: "no-store",
      referrerPolicy: "no-referrer"
    });
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (response.status === 401) {
      window.GHOST_AUTH_LOGOUT?.();
      throw new Error("Sessão expirada.");
    }
    if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
    return data;
  };

  const actionButton = (label, handler, danger = false) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = `mini-btn${danger ? " danger" : ""}`; b.textContent = label; b.addEventListener("click", handler); return b;
  };
  const tdText = text => { const td = document.createElement("td"); td.textContent = text || "—"; return td; };
  const emptyRow = (body, cols, text) => { const tr = document.createElement("tr"), td = document.createElement("td"); td.colSpan = cols; td.className = "db-empty"; td.textContent = text; tr.append(td); body.append(tr); };
  const setOptions = (select, items, labelFn, blank = null) => {
    if (!select) return;
    const old = select.value; select.replaceChildren();
    if (blank !== null) { const o = document.createElement("option"); o.value = ""; o.textContent = blank; select.append(o); }
    for (const item of items) { const o = document.createElement("option"); o.value = item.id; o.textContent = labelFn(item); select.append(o); }
    if ([...select.options].some(o => o.value === old)) select.value = old;
  };

  const clearPerson = () => { ["person-id","person-name","person-phone","person-email","person-organization","person-notes"].forEach(id => $(id).value = ""); $("person-kind").value = "cliente"; };
  const clearSite = () => { ["site-id","site-name","site-address","site-city","site-state","site-postal","site-property-type","site-access-notes","site-infra-notes"].forEach(id => $(id).value = ""); $("site-customer").value = ""; };
  const clearProject = () => { ["project-id","project-code","project-name","project-type","project-location","project-start","project-due","project-completed","project-request","project-scope","project-description","project-quoted","project-approved","project-notes"].forEach(id => $(id).value = ""); $("project-status").value = "planejamento"; $("project-priority").value = "normal"; $("project-payment").value = "nao_informado"; $("project-site").value = ""; };
  const clearSystem = () => { ["system-id","system-name","system-area","system-description","system-specs","system-notes"].forEach(id => $(id).value = ""); $("system-kind").value = "cftv"; $("system-status").value = "planejamento"; };
  const clearAsset = () => { ["asset-id","asset-category","asset-brand","asset-model","asset-serial","asset-mac","asset-ip","asset-vlan","asset-channel","asset-location","asset-firmware","asset-power","asset-installed","asset-warranty","asset-credential-ref","asset-specs","asset-notes"].forEach(id => $(id).value = ""); $("asset-system").value = ""; $("asset-status").value = "planejado"; };
  const clearRecord = () => { ["record-id","record-title","record-status","record-date","record-area","record-details","record-url"].forEach(id => $(id).value = ""); $("record-category").value = "vistoria"; };
  const clearMaterial = () => { ["material-id","material-sku","material-name","material-category","material-brand","material-model","material-notes"].forEach(id => $(id).value = ""); $("material-unit").value = "un"; $("material-stock").value = "0"; $("material-min-stock").value = "0"; $("material-cost").value = "0"; $("material-supplier").value = ""; };
  const clearService = () => { ["service-id","service-scheduled","service-started","service-finished","service-next","service-summary","service-tech-notes","service-customer-notes"].forEach(id => $(id).value = ""); $("service-project").value = ""; $("service-site").value = ""; $("service-kind").value = "instalacao"; $("service-status").value = "aberta"; };

  const renderPeople = () => {
    const q = val("people-search").trim().toLowerCase(), body = $("people-rows"); body.replaceChildren();
    const list = people.filter(p => !q || [p.name,p.email,p.phone,p.organization,p.kind].some(v => String(v||"").toLowerCase().includes(q)));
    $("people-count").textContent = people.length;
    for (const p of list) {
      const tr = document.createElement("tr"), actions = tdText(""); actions.className = "db-actions";
      actions.replaceChildren(actionButton("Editar",()=>editPerson(p)),actionButton("Excluir",()=>deleteEntity("people",p.id,p.name),true));
      tr.append(tdText(p.name),tdText(labelize(p.kind)),tdText([p.phone,p.email].filter(Boolean).join(" · ")),tdText(p.organization),actions); body.append(tr);
    }
    if (!list.length) emptyRow(body,5,"Nenhuma pessoa encontrada.");
  };
  const renderSites = () => {
    const q = val("site-search").trim().toLowerCase(), body = $("site-rows"); body.replaceChildren();
    const list = sites.filter(s => !q || [s.name,s.address,s.city,s.property_type,s.customer_name].some(v => String(v||"").toLowerCase().includes(q)));
    $("site-count").textContent = sites.length;
    for (const s of list) {
      const actions = tdText(""); actions.className="db-actions"; actions.replaceChildren(actionButton("Editar",()=>editSite(s)),actionButton("Excluir",()=>deleteEntity("sites",s.id,s.name),true));
      const tr=document.createElement("tr"); tr.append(tdText(s.name),tdText(s.customer_name),tdText([s.city,s.state].filter(Boolean).join("/")),tdText(s.property_type),actions); body.append(tr);
    }
    if (!list.length) emptyRow(body,5,"Nenhum local cadastrado.");
  };
  const renderProjects = () => {
    const q = val("project-search").trim().toLowerCase(), body=$("project-rows"); body.replaceChildren();
    const list=projects.filter(p=>!q||[p.code,p.name,p.status,p.location,p.type,p.site_name].some(v=>String(v||"").toLowerCase().includes(q)));
    $("project-count").textContent=projects.length;
    for(const p of list){
      const status=tdText(""); const pill=document.createElement("span"); pill.className="status-pill"; pill.textContent=labelize(p.status); status.replaceChildren(pill);
      const actions=tdText(""); actions.className="db-actions"; actions.replaceChildren(actionButton("Editar",()=>editProject(p)),actionButton("Dossiê",()=>focusProject(p.id)),actionButton("Excluir",()=>deleteEntity("projects",p.id,`${p.code} — ${p.name}`),true));
      const tr=document.createElement("tr"); tr.append(tdText(p.code),tdText(p.name),status,tdText(p.site_name||p.location),tdText(String(p.system_count||0)),actions); body.append(tr);
    }
    if(!list.length) emptyRow(body,6,"Nenhum projeto encontrado.");
  };
  const renderSystems = () => {
    const filter=val("system-filter-project"), body=$("system-rows"); body.replaceChildren();
    const list=systems.filter(s=>!filter||String(s.project_id)===filter); $("system-count").textContent=list.length;
    for(const s of list){ const actions=tdText(""); actions.className="db-actions"; actions.replaceChildren(actionButton("Editar",()=>editSystem(s)),actionButton("Excluir",()=>deleteEntity("systems",s.id,s.name),true)); const tr=document.createElement("tr"); tr.append(tdText(s.project_code),tdText(labelize(s.kind)),tdText(s.name),tdText(s.area),tdText(labelize(s.status)),actions); body.append(tr); }
    if(!list.length) emptyRow(body,6,"Nenhum sistema encontrado.");
  };
  const renderAssets = () => {
    const project=val("asset-filter-project"), q=val("asset-search").trim().toLowerCase(), body=$("asset-rows"); body.replaceChildren();
    const list=assets.filter(a=>(!project||String(a.project_id)===project)&&(!q||[a.category,a.brand,a.model,a.serial_number,a.mac_address,a.ip_address,a.location].some(v=>String(v||"").toLowerCase().includes(q)))); $("asset-count").textContent=list.length;
    for(const a of list){ const actions=tdText(""); actions.className="db-actions"; actions.replaceChildren(actionButton("Editar",()=>editAsset(a)),actionButton("Excluir",()=>deleteEntity("assets",a.id,`${a.category} ${a.model}`),true)); const tr=document.createElement("tr"); tr.append(tdText(a.category),tdText([a.brand,a.model].filter(Boolean).join(" ")),tdText([a.serial_number,a.ip_address,a.mac_address].filter(Boolean).join(" · ")),tdText(a.location),tdText(labelize(a.status)),actions); body.append(tr); }
    if(!list.length) emptyRow(body,6,"Nenhum equipamento encontrado.");
  };
  const renderRecords = () => {
    const project=val("record-filter-project"), category=val("record-filter-category"), root=$("record-list"); root.replaceChildren();
    const list=records.filter(r=>(!project||String(r.project_id)===project)&&(!category||r.category===category)); $("record-count").textContent=list.length;
    for(const r of list){ const row=document.createElement("div"); row.className="relation-row record-row"; const info=document.createElement("div"), strong=document.createElement("strong"), small=document.createElement("small"), p=document.createElement("p"); strong.textContent=`${labelize(r.category)} — ${r.title}`; small.textContent=[r.project_code,r.record_date,r.area,r.status].filter(Boolean).join(" · "); p.textContent=r.details||""; info.append(strong,small,p); const actions=document.createElement("div"); actions.className="db-actions"; actions.append(actionButton("Editar",()=>editRecord(r)),actionButton("Excluir",()=>deleteEntity("records",r.id,r.title),true)); row.append(info,actions); root.append(row); }
    if(!list.length){ const d=document.createElement("div"); d.className="db-empty"; d.textContent="Nenhum registro técnico encontrado."; root.append(d); }
  };
  const renderMaterials = () => {
    const q=val("material-search").trim().toLowerCase(), body=$("material-rows"); body.replaceChildren(); const list=materials.filter(m=>!q||[m.name,m.sku,m.category,m.brand,m.model].some(v=>String(v||"").toLowerCase().includes(q))); $("material-count").textContent=materials.length;
    for(const m of list){ const actions=tdText(""); actions.className="db-actions"; actions.replaceChildren(actionButton("Editar",()=>editMaterial(m)),actionButton("Excluir",()=>deleteEntity("materials",m.id,m.name),true)); const stock=`${m.current_stock||0} ${m.unit||"un"}${Number(m.current_stock||0)<=Number(m.min_stock||0)?" ⚠":""}`; const tr=document.createElement("tr"); tr.append(tdText([m.sku,m.name].filter(Boolean).join(" — ")),tdText(m.category),tdText(stock),tdText(money(m.unit_cost)),actions); body.append(tr); }
    if(!list.length) emptyRow(body,5,"Nenhum material encontrado.");
  };
  const renderServices = () => {
    const statusFilter=val("service-filter-status"), body=$("service-rows"); body.replaceChildren(); const list=services.filter(s=>!statusFilter||s.status===statusFilter); $("service-count").textContent=list.length;
    for(const s of list){ const actions=tdText(""); actions.className="db-actions"; actions.replaceChildren(actionButton("Editar",()=>editService(s)),actionButton("Excluir",()=>deleteEntity("services",s.id,s.summary||s.kind),true)); const tr=document.createElement("tr"); tr.append(tdText(labelize(s.kind)),tdText(s.project_code||s.site_name),tdText(s.scheduled_at?String(s.scheduled_at).replace("T"," "):""),tdText(labelize(s.status)),tdText(s.next_maintenance_at),actions); body.append(tr); }
    if(!list.length) emptyRow(body,6,"Nenhuma ordem de serviço encontrada.");
  };

  const fillSelects = () => {
    setOptions($("site-customer"), people.filter(p=>p.kind==="cliente"||p.kind==="contato"), p=>`${p.name}${p.organization?` — ${p.organization}`:""}`, "Sem vínculo");
    setOptions($("material-supplier"), people.filter(p=>p.kind==="fornecedor"), p=>p.name, "Sem vínculo");
    const projectSelectors=["link-project","system-project","system-filter-project","asset-project","asset-filter-project","record-project","record-filter-project","pm-project","service-project"];
    projectSelectors.forEach(id=>setOptions($(id),projects,p=>`${p.code} — ${p.name}`, id.includes("filter")||id==="service-project"?"Todos / sem vínculo":null));
    setOptions($("project-site"),sites,s=>`${s.name}${s.city?` — ${s.city}`:""}`,"Sem vínculo");
    setOptions($("service-site"),sites,s=>s.name,"Sem vínculo");
    setOptions($("link-person"),people,p=>`${p.name} (${labelize(p.kind)})`);
    setOptions($("pm-material"),materials,m=>`${m.name}${m.sku?` — ${m.sku}`:""}`);
    const assetProject=val("asset-project"); setOptions($("asset-system"),systems.filter(s=>!assetProject||String(s.project_id)===assetProject),s=>`${labelize(s.kind)} — ${s.name}`,"Sem vínculo");
    if(val("link-project")) loadRelations(val("link-project"));
    if(val("pm-project")) loadProjectMaterials(val("pm-project"));
  };

  const load = async () => {
    if(!cfg()||!token()) return;
    const [pp,ss,pr,sy,aa,rr,mm,sv]=await Promise.all([
      request("/db/people"),request("/db/sites"),request("/db/projects"),request("/db/systems"),request("/db/assets"),request("/db/records"),request("/db/materials"),request("/db/services")
    ]);
    people=pp.items||[]; sites=ss.items||[]; projects=pr.items||[]; systems=sy.items||[]; assets=aa.items||[]; records=rr.items||[]; materials=mm.items||[]; services=sv.items||[];
    renderPeople(); renderSites(); renderProjects(); renderSystems(); renderAssets(); renderRecords(); renderMaterials(); renderServices(); fillSelects();
  };

  const editPerson=p=>{ $("person-id").value=p.id; $("person-name").value=p.name||""; $("person-kind").value=p.kind||"cliente"; $("person-phone").value=p.phone||""; $("person-email").value=p.email||""; $("person-organization").value=p.organization||""; $("person-notes").value=p.notes||""; location.hash="pessoas"; };
  const editSite=s=>{ $("site-id").value=s.id; $("site-name").value=s.name||""; $("site-customer").value=s.customer_id||""; $("site-address").value=s.address||""; $("site-city").value=s.city||""; $("site-state").value=s.state||""; $("site-postal").value=s.postal_code||""; $("site-property-type").value=s.property_type||""; $("site-access-notes").value=s.access_notes||""; $("site-infra-notes").value=s.infrastructure_notes||""; location.hash="locais"; };
  const editProject=p=>{ $("project-id").value=p.id; $("project-code").value=p.code||""; $("project-name").value=p.name||""; $("project-status").value=p.status||"planejamento"; $("project-priority").value=p.priority||"normal"; $("project-type").value=p.type||""; $("project-site").value=p.site_id||""; $("project-location").value=p.location||""; $("project-start").value=p.start_date||""; $("project-due").value=p.due_date||""; $("project-completed").value=p.completed_date||""; $("project-request").value=p.customer_request||""; $("project-scope").value=p.scope_summary||""; $("project-description").value=p.description||""; $("project-quoted").value=p.quoted_value||""; $("project-approved").value=p.approved_value||""; $("project-payment").value=p.payment_status||"nao_informado"; $("project-notes").value=p.notes||""; location.hash="projetos"; };
  const editSystem=s=>{ $("system-id").value=s.id; $("system-project").value=s.project_id; $("system-kind").value=s.kind; $("system-name").value=s.name||""; $("system-area").value=s.area||""; $("system-status").value=s.status||"planejamento"; $("system-description").value=s.description||""; $("system-specs").value=s.specs||""; $("system-notes").value=s.notes||""; location.hash="sistemas"; };
  const editAsset=a=>{ $("asset-id").value=a.id; $("asset-project").value=a.project_id; setOptions($("asset-system"),systems.filter(s=>String(s.project_id)===String(a.project_id)),s=>`${labelize(s.kind)} — ${s.name}`,"Sem vínculo"); $("asset-system").value=a.system_id||""; ["category","brand","model"].forEach(k=>$("asset-"+k).value=a[k]||""); $("asset-serial").value=a.serial_number||""; $("asset-mac").value=a.mac_address||""; $("asset-ip").value=a.ip_address||""; $("asset-vlan").value=a.vlan||""; $("asset-channel").value=a.channel||""; $("asset-location").value=a.location||""; $("asset-firmware").value=a.firmware||""; $("asset-power").value=a.power_source||""; $("asset-installed").value=a.installed_at||""; $("asset-warranty").value=a.warranty_until||""; $("asset-status").value=a.status||"planejado"; $("asset-credential-ref").value=a.credential_ref||""; $("asset-specs").value=a.specs||""; $("asset-notes").value=a.notes||""; location.hash="equipamentos"; };
  const editRecord=r=>{ $("record-id").value=r.id; $("record-project").value=r.project_id; $("record-category").value=r.category; $("record-title").value=r.title||""; $("record-status").value=r.status||""; $("record-date").value=r.record_date||""; $("record-area").value=r.area||""; $("record-details").value=r.details||""; $("record-url").value=r.reference_url||""; location.hash="registros"; };
  const editMaterial=m=>{ $("material-id").value=m.id; $("material-sku").value=m.sku||""; $("material-name").value=m.name||""; $("material-category").value=m.category||""; $("material-brand").value=m.brand||""; $("material-model").value=m.model||""; $("material-unit").value=m.unit||"un"; $("material-stock").value=m.current_stock||0; $("material-min-stock").value=m.min_stock||0; $("material-cost").value=m.unit_cost||0; $("material-supplier").value=m.supplier_id||""; $("material-notes").value=m.notes||""; location.hash="materiais"; };
  const editService=s=>{ $("service-id").value=s.id; $("service-project").value=s.project_id||""; $("service-site").value=s.site_id||""; $("service-kind").value=s.kind||"instalacao"; $("service-status").value=s.status||"aberta"; $("service-scheduled").value=s.scheduled_at||""; $("service-started").value=s.started_at||""; $("service-finished").value=s.finished_at||""; $("service-next").value=s.next_maintenance_at||""; $("service-summary").value=s.summary||""; $("service-tech-notes").value=s.technician_notes||""; $("service-customer-notes").value=s.customer_notes||""; location.hash="servicos"; };

  const deleteEntity=async(type,id,name)=>{ if(!confirm(`Excluir ${name||"este registro"}?`))return; await request(`/db/${type}/${id}`,{method:"DELETE"}); await load(); };
  const focusProject=id=>{ ["system-filter-project","asset-filter-project","record-filter-project","system-project","asset-project","record-project","pm-project","link-project"].forEach(x=>{if($(x))$(x).value=String(id)}); renderSystems(); renderAssets(); renderRecords(); loadRelations(id); loadProjectMaterials(id); location.hash="sistemas"; };

  const loadRelations=async projectId=>{ const root=$("project-people-list"); root.replaceChildren(); if(!projectId)return; const data=await request(`/db/projects/${projectId}/people`); for(const item of data.items||[]){ const row=document.createElement("div"); row.className="relation-row"; const info=document.createElement("div"), strong=document.createElement("strong"), small=document.createElement("small"); strong.textContent=item.name; small.textContent=[item.role,item.email,item.phone].filter(Boolean).join(" · "); info.append(strong,small); row.append(info,actionButton("Remover vínculo",async()=>{await request(`/db/projects/${projectId}/people/${item.id}`,{method:"DELETE"}); await loadRelations(projectId);},true)); root.append(row);} if(!(data.items||[]).length){const d=document.createElement("div");d.className="db-empty";d.textContent="Nenhuma pessoa vinculada.";root.append(d);} };
  const loadProjectMaterials=async projectId=>{ const root=$("project-material-list"); root.replaceChildren(); if(!projectId)return; const data=await request(`/db/projects/${projectId}/materials`); for(const item of data.items||[]){ const row=document.createElement("div"); row.className="relation-row"; const info=document.createElement("div"), strong=document.createElement("strong"), small=document.createElement("small"); strong.textContent=item.name; small.textContent=`Previsto: ${item.planned_qty||0} ${item.unit} · Usado: ${item.used_qty||0} ${item.unit}`; info.append(strong,small); row.append(info,actionButton("Remover",async()=>{await request(`/db/projects/${projectId}/materials/${item.id}`,{method:"DELETE"}); await loadProjectMaterials(projectId);},true)); root.append(row);} if(!(data.items||[]).length){const d=document.createElement("div");d.className="db-empty";d.textContent="Nenhum material vinculado a este projeto.";root.append(d);} };

  const start=()=>{
    if(started)return; started=true;
    $("person-form").addEventListener("submit",async e=>{e.preventDefault();const id=val("person-id");await request(id?`/db/people/${id}`:"/db/people",{method:id?"PUT":"POST",body:JSON.stringify({name:val("person-name"),kind:val("person-kind"),phone:val("person-phone"),email:val("person-email"),organization:val("person-organization"),notes:val("person-notes")})});clearPerson();await load();});
    $("site-form").addEventListener("submit",async e=>{e.preventDefault();const id=val("site-id");await request(id?`/db/sites/${id}`:"/db/sites",{method:id?"PUT":"POST",body:JSON.stringify({name:val("site-name"),customerId:Number(val("site-customer")||0),address:val("site-address"),city:val("site-city"),state:val("site-state"),postalCode:val("site-postal"),propertyType:val("site-property-type"),accessNotes:val("site-access-notes"),infrastructureNotes:val("site-infra-notes")})});clearSite();await load();});
    $("project-form").addEventListener("submit",async e=>{e.preventDefault();const id=val("project-id");await request(id?`/db/projects/${id}`:"/db/projects",{method:id?"PUT":"POST",body:JSON.stringify({code:val("project-code"),name:val("project-name"),status:val("project-status"),priority:val("project-priority"),type:val("project-type"),siteId:Number(val("project-site")||0),location:val("project-location"),startDate:val("project-start"),dueDate:val("project-due"),completedDate:val("project-completed"),customerRequest:val("project-request"),scopeSummary:val("project-scope"),description:val("project-description"),quotedValue:num(val("project-quoted")),approvedValue:num(val("project-approved")),paymentStatus:val("project-payment"),notes:val("project-notes")})});clearProject();await load();});
    $("system-form").addEventListener("submit",async e=>{e.preventDefault();const id=val("system-id");await request(id?`/db/systems/${id}`:"/db/systems",{method:id?"PUT":"POST",body:JSON.stringify({projectId:Number(val("system-project")),kind:val("system-kind"),name:val("system-name"),area:val("system-area"),status:val("system-status"),description:val("system-description"),specs:val("system-specs"),notes:val("system-notes")})});clearSystem();await load();});
    $("asset-form").addEventListener("submit",async e=>{e.preventDefault();const id=val("asset-id");await request(id?`/db/assets/${id}`:"/db/assets",{method:id?"PUT":"POST",body:JSON.stringify({projectId:Number(val("asset-project")),systemId:Number(val("asset-system")||0),category:val("asset-category"),brand:val("asset-brand"),model:val("asset-model"),serialNumber:val("asset-serial"),macAddress:val("asset-mac"),ipAddress:val("asset-ip"),vlan:val("asset-vlan"),channel:val("asset-channel"),location:val("asset-location"),firmware:val("asset-firmware"),powerSource:val("asset-power"),installedAt:val("asset-installed"),warrantyUntil:val("asset-warranty"),status:val("asset-status"),credentialRef:val("asset-credential-ref"),specs:val("asset-specs"),notes:val("asset-notes")})});clearAsset();await load();});
    $("record-form").addEventListener("submit",async e=>{e.preventDefault();const id=val("record-id");await request(id?`/db/records/${id}`:"/db/records",{method:id?"PUT":"POST",body:JSON.stringify({projectId:Number(val("record-project")),category:val("record-category"),title:val("record-title"),status:val("record-status"),recordDate:val("record-date"),area:val("record-area"),details:val("record-details"),referenceUrl:val("record-url")})});clearRecord();await load();});
    $("material-form").addEventListener("submit",async e=>{e.preventDefault();const id=val("material-id");await request(id?`/db/materials/${id}`:"/db/materials",{method:id?"PUT":"POST",body:JSON.stringify({sku:val("material-sku"),name:val("material-name"),category:val("material-category"),brand:val("material-brand"),model:val("material-model"),unit:val("material-unit"),currentStock:num(val("material-stock")),minStock:num(val("material-min-stock")),unitCost:num(val("material-cost")),supplierId:Number(val("material-supplier")||0),notes:val("material-notes")})});clearMaterial();await load();});
    $("service-form").addEventListener("submit",async e=>{e.preventDefault();const id=val("service-id");await request(id?`/db/services/${id}`:"/db/services",{method:id?"PUT":"POST",body:JSON.stringify({projectId:Number(val("service-project")||0),siteId:Number(val("service-site")||0),kind:val("service-kind"),status:val("service-status"),scheduledAt:val("service-scheduled"),startedAt:val("service-started"),finishedAt:val("service-finished"),nextMaintenanceAt:val("service-next"),summary:val("service-summary"),technicianNotes:val("service-tech-notes"),customerNotes:val("service-customer-notes")})});clearService();await load();});
    $("link-form").addEventListener("submit",async e=>{e.preventDefault();const projectId=val("link-project");await request(`/db/projects/${projectId}/people`,{method:"POST",body:JSON.stringify({personId:Number(val("link-person")),role:val("link-role"),notes:val("link-notes")})});$("link-role").value="";$("link-notes").value="";await loadRelations(projectId);});
    $("project-material-form").addEventListener("submit",async e=>{e.preventDefault();const projectId=val("pm-project");await request(`/db/projects/${projectId}/materials`,{method:"POST",body:JSON.stringify({materialId:Number(val("pm-material")),plannedQty:num(val("pm-planned")),usedQty:num(val("pm-used")),notes:val("pm-notes")})});await loadProjectMaterials(projectId);});

    [["person-cancel",clearPerson],["site-cancel",clearSite],["project-cancel",clearProject],["system-cancel",clearSystem],["asset-cancel",clearAsset],["record-cancel",clearRecord],["material-cancel",clearMaterial],["service-cancel",clearService]].forEach(([id,fn])=>$(id)?.addEventListener("click",fn));
    [["people-search",renderPeople],["site-search",renderSites],["project-search",renderProjects],["system-filter-project",renderSystems],["asset-filter-project",renderAssets],["asset-search",renderAssets],["record-filter-project",renderRecords],["record-filter-category",renderRecords],["material-search",renderMaterials],["service-filter-status",renderServices]].forEach(([id,fn])=>$(id)?.addEventListener("input",fn));
    ["system-filter-project","asset-filter-project","record-filter-project","record-filter-category","service-filter-status"].forEach(id=>$(id)?.addEventListener("change",()=>({"system-filter-project":renderSystems,"asset-filter-project":renderAssets,"record-filter-project":renderRecords,"record-filter-category":renderRecords,"service-filter-status":renderServices}[id])()));
    $("asset-project")?.addEventListener("change",()=>setOptions($("asset-system"),systems.filter(s=>String(s.project_id)===val("asset-project")),s=>`${labelize(s.kind)} — ${s.name}`,"Sem vínculo"));
    $("link-project")?.addEventListener("change",()=>loadRelations(val("link-project")));
    $("pm-project")?.addEventListener("change",()=>loadProjectMaterials(val("pm-project")));
    ["people-refresh","site-refresh","project-refresh","system-refresh","asset-refresh","record-refresh","material-refresh","service-refresh"].forEach(id=>$(id)?.addEventListener("click",()=>load().catch(console.error)));
    $("db-export")?.addEventListener("click",async()=>{const data=await request("/db/export");const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`g-host-banco-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);});
    load().catch(error=>console.error(error));
  };
  window.addEventListener("ghost-authenticated",start,{once:true});
})();
