(() => {
  "use strict";

  let initialized = false;
  const cfg = window.GHOST_AUTH_CONFIG || {};
  const API = String(cfg.apiBase || "").replace(/\/$/, "");
  const make = (tag, cls = "", text = undefined) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = String(text ?? "");
    return el;
  };
  const context = () => window.GHOST_CONTROL_CONTEXT || { kind: "owner", permissions: { all: true } };
  const can = key => context().kind === "owner" || context().permissions?.all === true || context().permissions?.[key] === true;

  const cookieMode = (() => {
    if (cfg.cookieAuthEnabled !== true || !API) return false;
    try { return new URL(API).hostname.toLowerCase() === String(cfg.cookieApiHost || "api.g-host.seg.br").toLowerCase(); }
    catch (_) { return false; }
  })();

  const api = async (path, options = {}) => {
    const token = window.GHOST_ADMIN_SESSION?.() || "";
    if (!token && !cookieMode) throw new Error("Sessão administrativa não autenticada.");
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!cookieMode) {
      const key = context().kind === "staff" ? "ghost_staff_device_v1" : "ghost_owner_device_v1";
      const device = localStorage.getItem(key) || "";
      if (device) headers["X-Ghost-Device"] = device;
    }
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers,
      cache: "no-store",
      credentials: cookieMode ? "include" : "omit",
      referrerPolicy: "no-referrer"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Falha (${response.status}).`);
    return data;
  };

  const status = (id, message, type = "") => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.className = `platform-status ${type}`.trim();
  };

  const card = (id, eyebrow, title, text = "") => {
    const section = make("section", "admin-card");
    section.id = id;
    section.append(make("span", "eyebrow", eyebrow), make("h2", "", title));
    if (text) section.append(make("p", "muted", text));
    return section;
  };

  const addNav = (href, label) => {
    const sidebar = document.querySelector(".admin-sidebar");
    if (!sidebar || sidebar.querySelector(`a[href='${href}']`)) return;
    const link = make("a", "", label);
    link.href = href;
    sidebar.insertBefore(link, sidebar.querySelector(".admin-note") || null);
  };

  const stack = (primary, secondary = "") => {
    const wrap = make("div");
    wrap.append(make("span", "", primary));
    if (secondary) wrap.append(document.createElement("br"), make("small", "", secondary));
    return wrap;
  };

  const tableCell = content => {
    const cell = document.createElement("td");
    if (content instanceof Node) cell.append(content);
    else cell.textContent = String(content ?? "");
    return cell;
  };

  const buildTable = (headers, items, rowBuilder) => {
    const table = make("table", "platform-table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headers.forEach(text => headerRow.append(make("th", "", text)));
    thead.append(headerRow);
    const tbody = document.createElement("tbody");
    (Array.isArray(items) ? items : []).forEach(item => {
      const row = document.createElement("tr");
      const cells = rowBuilder(item) || [];
      cells.forEach(content => row.append(tableCell(content)));
      tbody.append(row);
    });
    table.append(thead, tbody);
    return table;
  };

  const selectFrom = (items, current, datasetName = "", datasetValue = "") => {
    const select = document.createElement("select");
    if (datasetName) select.dataset[datasetName] = String(datasetValue);
    items.forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      option.selected = String(current || "") === value;
      select.append(option);
    });
    return select;
  };

  const actionButton = (text, datasetName, datasetValue) => {
    const button = make("button", "mini-btn", text);
    button.type = "button";
    if (datasetName) button.dataset[datasetName] = String(datasetValue);
    return button;
  };

  const permissionDefs = [
    ["site_edit", "Editar conteúdo"], ["site_visibility", "Visibilidade"], ["prices", "Planos, preços e promoções"],
    ["crm", "CRM, leads e suporte"], ["operations", "Operação técnica"], ["data_export", "Exportar banco"],
    ["cftv", "CFTV"], ["guardian", "Guardião"], ["security", "Segurança"], ["analytics", "Analytics"], ["legal", "Jurídico/LGPD"]
  ];

  const renderUsers = async () => {
    if (context().kind !== "owner") return;
    status("platform-users-status", "Carregando usuários...");
    try {
      const data = await api("/admin/users");
      const root = document.getElementById("platform-users-list");
      if (!root) return;
      root.replaceChildren();
      (data.items || []).forEach(user => {
        const row = make("article", "platform-row");
        const main = make("div", "platform-row-main");
        main.append(make("strong", "", user.name || "Usuário"), make("small", "", `${user.email || ""} · ${user.phone || "sem telefone"} · ${user.trusted_devices || 0} aparelho(s) confiável(is)`));

        const normalizedRole = user.role === "visitante" ? "usuario" : user.role;
        const role = selectFrom([["usuario", "Usuário"], ["cliente", "Cliente"], ["adm", "ADM"]], normalizedRole);
        const limit = document.createElement("input");
        limit.type = "number";
        limit.min = "1";
        limit.max = "10";
        limit.value = String(user.camera_device_limit || 2);
        limit.title = "Limite de aparelhos CFTV";

        let permissions = {};
        try { permissions = JSON.parse(user.permissions_json || "{}"); } catch (_) {}
        const details = make("details", "platform-permissions");
        const summary = make("summary", "", "Permissões do ADM / recursos");
        const grid = make("div", "permission-grid");
        const checks = {};
        permissionDefs.forEach(([key, label]) => {
          const holder = document.createElement("label");
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = Boolean(permissions[key]);
          checks[key] = checkbox;
          holder.append(checkbox, document.createTextNode(label));
          grid.append(holder);
        });
        const activeLabel = document.createElement("label");
        const active = document.createElement("input");
        active.type = "checkbox";
        active.checked = Boolean(user.active);
        activeLabel.append(active, document.createTextNode(" Conta ativa"));
        grid.append(activeLabel);
        details.append(summary, grid);

        const actions = make("div", "platform-inline-actions");
        const save = actionButton("Salvar");
        save.addEventListener("click", async () => {
          save.disabled = true;
          try {
            const nextPermissions = {};
            Object.entries(checks).forEach(([key, checkbox]) => { nextPermissions[key] = checkbox.checked; });
            await api(`/admin/users/${Number(user.id)}`, {
              method: "PUT",
              body: JSON.stringify({ role: role.value, cameraDeviceLimit: Number(limit.value || 2), active: active.checked, permissions: nextPermissions })
            });
            status("platform-users-status", `Usuário ${user.email || ""} atualizado.`, "success");
            await renderUsers();
          } catch (error) { status("platform-users-status", error.message, "error"); }
          finally { save.disabled = false; }
        });
        actions.append(save);

        if (normalizedRole === "adm") {
          const reset = make("button", "mini-btn danger", "Resetar MFA/aparelho ADM");
          reset.type = "button";
          reset.addEventListener("click", async () => {
            if (!confirm(`Redefinir autenticador, aparelho administrativo e sessões de ${user.email || "esta conta"}?`)) return;
            reset.disabled = true;
            try {
              const result = await api(`/admin/users/${Number(user.id)}/reset-security`, { method: "POST", body: "{}" });
              status("platform-users-status", result.message || "Segurança ADM redefinida.", "success");
            } catch (error) { status("platform-users-status", error.message, "error"); }
            finally { reset.disabled = false; }
          });
          actions.append(reset);
        }

        row.append(main, role, limit, actions, details);
        root.append(row);
      });
      if (!(data.items || []).length) root.append(make("p", "muted", "Nenhuma conta pública criada ainda."));
      status("platform-users-status", `${(data.items || []).length} conta(s) carregada(s).`, "success");
    } catch (error) { status("platform-users-status", error.message, "error"); }
  };

  const quoteStatuses = [["novo", "Novo"], ["em_analise", "Em análise"], ["proposta_enviada", "Proposta enviada"], ["aprovado", "Aprovado"], ["recusado", "Recusado"], ["convertido", "Convertido"]];
  const supportStatuses = [["aberto", "Aberto"], ["em_atendimento", "Em atendimento"], ["aguardando_cliente", "Aguardando cliente"], ["resolvido", "Resolvido"], ["cancelado", "Cancelado"]];
  const contractStatuses = [["rascunho", "Rascunho"], ["pendente_aceite", "Pendente de aceite"], ["cancelado", "Cancelado"], ["encerrado", "Encerrado"]];

  const renderCrm = async () => {
    if (!can("crm")) return;
    status("platform-commercial-status", "Carregando leads e chamados...");
    try {
      const [quotes, support] = await Promise.all([api("/admin/quotes"), api("/admin/support")]);
      const q = document.getElementById("platform-quotes");
      const sp = document.getElementById("platform-support");

      if (q) {
        q.replaceChildren(buildTable(["Cliente", "Plano", "Contato", "Status", "Data", "Ação"], quotes.items || [], item => {
          const id = Number(item.id);
          const select = selectFrom(quoteStatuses, item.status, "quoteStatus", id);
          const button = actionButton("Salvar", "saveQuote", id);
          const action = make("div", "platform-inline-actions");
          action.append(select, button);
          button.addEventListener("click", async () => {
            button.disabled = true;
            try {
              await api(`/admin/quotes/${id}/status`, { method: "PUT", body: JSON.stringify({ status: select.value }) });
              status("platform-commercial-status", "Status da proposta atualizado.", "success");
              await renderCrm();
            } catch (error) { status("platform-commercial-status", error.message, "error"); }
            finally { button.disabled = false; }
          });
          return [stack(item.name || "", `${item.email || ""} · ${item.phone || ""}`), item.plan_id || "-", item.contact_preference || "", item.status || "", item.created_at || "", action];
        }));
      }

      if (sp) {
        sp.replaceChildren(buildTable(["Cliente", "Assunto", "Prioridade", "Status", "Data", "Ação"], support.items || [], item => {
          const id = Number(item.id);
          const select = selectFrom(supportStatuses, item.status, "supportStatus", id);
          const button = actionButton("Salvar", "saveSupport", id);
          const action = make("div", "platform-inline-actions");
          action.append(select, button);
          button.addEventListener("click", async () => {
            button.disabled = true;
            try {
              await api(`/admin/support/${id}/status`, { method: "PUT", body: JSON.stringify({ status: select.value }) });
              status("platform-commercial-status", "Status do chamado atualizado.", "success");
              await renderCrm();
            } catch (error) { status("platform-commercial-status", error.message, "error"); }
            finally { button.disabled = false; }
          });
          return [stack(item.name || "", item.email || ""), stack(item.subject || "", item.description || ""), item.priority || "", item.status || "", item.created_at || "", action];
        }));
      }
      status("platform-commercial-status", `${(quotes.items || []).length} proposta(s) e ${(support.items || []).length} chamado(s).`, "success");
    } catch (error) { status("platform-commercial-status", error.message, "error"); }
  };

  const renderContracts = async () => {
    if (!can("legal")) return;
    status("platform-legal-status", "Carregando contratos...");
    try {
      const [contracts, people] = await Promise.all([api("/admin/contracts"), api("/admin/client-options")]);
      const root = document.getElementById("platform-contracts");
      if (root) {
        root.replaceChildren(buildTable(["Contrato", "Cliente", "Plano", "Valor", "Status", "Assinado", "Ação"], contracts.items || [], item => {
          const id = Number(item.id);
          let action = make("span", "", "Documento aceito");
          if (!item.signed_at) {
            const select = selectFrom(contractStatuses, item.status, "contractStatus", id);
            const button = actionButton("Salvar", "saveContract", id);
            action = make("div", "platform-inline-actions");
            action.append(select, button);
            button.addEventListener("click", async () => {
              button.disabled = true;
              try {
                await api(`/admin/contracts/${id}/status`, { method: "PUT", body: JSON.stringify({ status: select.value }) });
                status("platform-legal-status", "Status do contrato atualizado.", "success");
                await renderContracts();
              } catch (error) { status("platform-legal-status", error.message, "error"); }
              finally { button.disabled = false; }
            });
          }
          const amount = Number(item.amount || 0) > 0 ? Number(item.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "-";
          return [stack(item.code || "", `v${item.version || "1"}`), stack(item.name || "", item.email || ""), item.plan_id || "-", amount, item.status || "", item.signed_at || "-", action];
        }));
      }

      const select = document.getElementById("contract-person");
      if (select) {
        const current = select.value;
        select.replaceChildren();
        const blank = make("option", "", "Selecione o cliente");
        blank.value = "";
        select.append(blank);
        (people.items || []).forEach(user => {
          const option = make("option", "", `${user.name || "Cliente"} — ${user.email || "sem conta"}`);
          option.value = String(Number(user.person_id) || "");
          select.append(option);
        });
        if (current) select.value = current;
      }
      status("platform-legal-status", `${(contracts.items || []).length} contrato(s) carregado(s).`, "success");
    } catch (error) { status("platform-legal-status", error.message, "error"); }
  };

  const renderAnalytics = async () => {
    if (!can("analytics")) return;
    status("platform-analytics-status", "Atualizando inteligência...");
    try {
      const data = await api("/admin/analytics/summary?days=30");
      const stats = document.getElementById("platform-analytics-stats");
      if (stats) {
        stats.replaceChildren();
        [["Visitantes aproximados", data.totals?.visitors], ["Eventos", data.totals?.events], ["Contas identificadas", data.totals?.identifiedAccounts], ["Pedidos de proposta", data.totals?.quoteRequests]].forEach(([label, value]) => {
          const item = make("div", "platform-stat");
          item.append(make("small", "", label), make("strong", "", String(value || 0)));
          stats.append(item);
        });
      }
      const types = document.getElementById("platform-analytics-types");
      if (types) types.replaceChildren(buildTable(["Evento", "Quantidade"], data.byType || [], item => [item.event_type || "", Number(item.n || 0)]));
      status("platform-analytics-status", "Analytics dos últimos 30 dias atualizado.", "success");
    } catch (error) { status("platform-analytics-status", error.message, "error"); }
  };

  const renderDefense = async () => {
    status("platform-security-status", "Carregando módulos autorizados...");
    try {
      let security = { items: [] }, guardian = { nodes: [] }, audit = { items: [] };
      if (can("security")) [security, audit] = await Promise.all([api("/admin/security-events"), api("/admin/audit-log")]);
      if (can("guardian")) guardian = await api("/admin/guardian");

      const securityRoot = document.getElementById("platform-security-list");
      if (securityRoot) {
        securityRoot.replaceChildren();
        (security.items || []).slice(0, 80).forEach(item => {
          const row = make("article", "platform-row");
          const main = make("div", "platform-row-main");
          main.append(make("strong", "", item.summary || item.event_type || "Evento"), make("small", "", `${item.name || item.email || "Conta não identificada"} · ${item.created_at || ""}`));
          const severity = ["info", "warning", "critical", "success"].includes(String(item.severity || "")) ? String(item.severity) : "info";
          row.append(main, make("span", `platform-badge ${severity}`, severity));
          securityRoot.append(row);
        });
        if (!(security.items || []).length) securityRoot.append(make("p", "muted", can("security") ? "Nenhum evento de segurança registrado." : "Sem permissão para eventos de segurança."));
      }

      const auditRoot = document.getElementById("platform-audit-list");
      if (auditRoot) {
        auditRoot.replaceChildren();
        if (can("security")) {
          auditRoot.append(buildTable(["Quando", "Ação", "Entidade", "Detalhes"], (audit.items || []).slice(0, 150), item => [item.created_at || "", item.action || "", `${item.entity_type || ""} ${item.entity_id || ""}`.trim(), item.details || ""]));
        } else auditRoot.append(make("p", "muted", "Sem permissão para auditoria."));
      }

      const guardianRoot = document.getElementById("platform-guardian-list");
      if (guardianRoot) {
        guardianRoot.replaceChildren();
        if (can("guardian")) {
          guardianRoot.append(buildTable(["Guardião", "Local", "Status", "Último contato"], guardian.nodes || [], item => [item.name || "Guardião Hub", item.site_name || "", item.status || "", item.last_seen_at || ""]));
        } else guardianRoot.append(make("p", "muted", "Sem permissão para Guardião."));
      }
      status("platform-security-status", `${(security.items || []).length} evento(s), ${(audit.items || []).length} registro(s) de auditoria e ${(guardian.nodes || []).length} Guardião(ões).`, "success");
    } catch (error) { status("platform-security-status", error.message, "error"); }
  };

  const field = (labelText, control, wide = false) => {
    const label = make("label", wide ? "wide" : "");
    label.append(document.createTextNode(labelText), control);
    return label;
  };

  const input = (id, type = "text", options = {}) => {
    const el = document.createElement("input");
    el.id = id;
    el.type = type;
    if (options.required) el.required = true;
    if (options.maxLength) el.maxLength = options.maxLength;
    if (options.placeholder) el.placeholder = options.placeholder;
    if (options.value !== undefined) el.value = options.value;
    if (options.min !== undefined) el.min = String(options.min);
    if (options.step !== undefined) el.step = String(options.step);
    return el;
  };

  const textarea = (id, rows, maxLength, placeholder = "") => {
    const el = document.createElement("textarea");
    el.id = id;
    el.rows = rows;
    el.maxLength = maxLength;
    if (placeholder) el.placeholder = placeholder;
    return el;
  };

  const selectControl = (id, options) => {
    const el = selectFrom(options, options[0]?.[0] || "");
    el.id = id;
    return el;
  };

  const buildContractForm = () => {
    const form = make("form", "form-grid db-form");
    form.id = "platform-contract-form";

    const person = document.createElement("select");
    person.id = "contract-person";
    person.required = true;
    const blank = make("option", "", "Selecione o cliente");
    blank.value = "";
    person.append(blank);

    const title = input("contract-title", "text", { maxLength: 180, value: "Contrato de Prestação de Serviços G-Host", required: true });
    const amount = input("contract-amount", "number", { min: 0, step: 0.01 });
    const summary = textarea("contract-summary", 3, 2500);
    const body = textarea("contract-body", 12, 30000, "Cole aqui somente a versão revisada do contrato que será apresentada ao cliente.");
    body.required = true;

    form.append(
      field("Cliente", person),
      field("Código", input("contract-code", "text", { maxLength: 50, placeholder: "Automático se vazio" })),
      field("Plano", selectControl("contract-plan", [["essencial", "Essencial"], ["protecao", "Proteção"], ["guardiao", "Guardião"]])),
      field("Status", selectControl("contract-status-select", [["rascunho", "Rascunho"], ["pendente_aceite", "Enviar para aceite"]])),
      field("Título", title),
      field("Valor", amount),
      field("Início", input("contract-start", "date")),
      field("Término", input("contract-end", "date")),
      field("Resumo", summary, true),
      field("Texto integral do contrato", body, true)
    );
    form.append(make("p", "muted wide", "Não envie para aceite um texto jurídico provisório. Depois de aceito, alterações exigem nova versão."));
    const submit = make("button", "btn", "Criar contrato");
    submit.type = "submit";
    form.append(submit);

    form.addEventListener("submit", async event => {
      event.preventDefault();
      status("platform-legal-status", "Criando contrato...", "busy");
      try {
        await api("/admin/contracts", {
          method: "POST",
          body: JSON.stringify({
            personId: Number(person.value || 0),
            code: document.getElementById("contract-code")?.value || "",
            planId: document.getElementById("contract-plan")?.value || "essencial",
            status: document.getElementById("contract-status-select")?.value || "rascunho",
            title: title.value,
            amount: Number(amount.value || 0),
            startsAt: document.getElementById("contract-start")?.value || "",
            endsAt: document.getElementById("contract-end")?.value || "",
            summary: summary.value,
            bodyText: body.value,
            version: "1"
          })
        });
        form.reset();
        title.value = "Contrato de Prestação de Serviços G-Host";
        status("platform-legal-status", "Contrato criado.", "success");
        await renderContracts();
      } catch (error) { status("platform-legal-status", error.message, "error"); }
    });
    return form;
  };

  const buildUsers = root => {
    if (context().kind !== "owner") return;
    addNav("#usuarios-platform", "Usuários & permissões");
    const section = card("usuarios-platform", "Identidade e RBAC", "Usuários e permissões", "Toda conta nova nasce como Usuário. O Dono pode promover para Cliente ou ADM, definir permissões, limite CFTV e redefinir a segurança do ADM.");
    const list = make("div", "platform-list");
    list.id = "platform-users-list";
    const button = make("button", "btn btn-ghost btn-small", "Atualizar usuários");
    button.type = "button";
    button.addEventListener("click", renderUsers);
    const state = make("div", "platform-status");
    state.id = "platform-users-status";
    section.append(list, button, state);
    root.prepend(section);
    renderUsers();
  };

  const buildCommercial = root => {
    if (!can("crm") && !can("legal")) return;
    addNav("#comercial-platform", "Comercial & contratos");
    const section = card("comercial-platform", "Comercial, atendimento e jurídico", "Leads, suporte e contratos", "O painel mostra somente os módulos que o Dono autorizou para a conta ADM.");
    if (can("crm")) {
      section.append(make("h3", "", "Pedidos de proposta"));
      const quotes = make("div", "platform-scroll");
      quotes.id = "platform-quotes";
      section.append(quotes, make("h3", "", "Chamados de suporte"));
      const support = make("div", "platform-scroll");
      support.id = "platform-support";
      const button = make("button", "btn btn-ghost btn-small", "Atualizar CRM");
      button.type = "button";
      button.addEventListener("click", renderCrm);
      const state = make("div", "platform-status");
      state.id = "platform-commercial-status";
      section.append(support, button, state);
    }
    if (can("legal")) {
      section.append(make("h3", "", "Contratos e aceite eletrônico"), buildContractForm());
      const list = make("div", "platform-scroll");
      list.id = "platform-contracts";
      const button = make("button", "btn btn-ghost btn-small", "Atualizar contratos");
      button.type = "button";
      button.addEventListener("click", renderContracts);
      const state = make("div", "platform-status");
      state.id = "platform-legal-status";
      section.append(list, button, state);
    }
    root.prepend(section);
    if (can("crm")) renderCrm();
    if (can("legal")) renderContracts();
  };

  const buildAnalytics = root => {
    if (!can("analytics")) return;
    addNav("#inteligencia-platform", "Analytics");
    const section = card("inteligencia-platform", "Inteligência", "Analytics com consentimento", "Métricas opcionais não recebem o texto digitado nos formulários.");
    const stats = make("div", "platform-grid");
    stats.id = "platform-analytics-stats";
    const types = make("div", "platform-scroll");
    types.id = "platform-analytics-types";
    const button = make("button", "btn btn-ghost btn-small", "Atualizar analytics");
    button.type = "button";
    button.addEventListener("click", renderAnalytics);
    const state = make("div", "platform-status");
    state.id = "platform-analytics-status";
    section.append(stats, types, button, state);
    root.prepend(section);
    renderAnalytics();
  };

  const buildDefense = root => {
    if (!can("security") && !can("guardian")) return;
    addNav("#seguranca-platform", "Segurança & Guardião");
    const section = card("seguranca-platform", "Defesa em profundidade", "Segurança e Guardião", "A identidade web usa autenticação e aparelho autorizado; MAC é reservado ao ambiente local do Guardião.");
    const security = make("div", "platform-list");
    security.id = "platform-security-list";
    const audit = make("div", "platform-scroll");
    audit.id = "platform-audit-list";
    const guardian = make("div", "platform-scroll");
    guardian.id = "platform-guardian-list";
    const button = make("button", "btn btn-ghost btn-small", "Atualizar defesa");
    button.type = "button";
    button.addEventListener("click", renderDefense);
    const state = make("div", "platform-status");
    state.id = "platform-security-status";
    section.append(security, make("h3", "", "Auditoria administrativa"), audit, make("h3", "", "Guardião Hub"), guardian, button, state);
    root.prepend(section);
    renderDefense();
  };

  const init = () => {
    if (initialized) return;
    initialized = true;
    const root = document.querySelector(".admin-content");
    if (!root) return;
    buildDefense(root);
    buildAnalytics(root);
    buildCommercial(root);
    buildUsers(root);
  };

  window.addEventListener("ghost-authenticated", init);
})();
