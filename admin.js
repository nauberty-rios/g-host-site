(() => {
  "use strict";

  let initialized = false;
  const clone = value => JSON.parse(JSON.stringify(value));
  const localKey = "ghost_admin_data";
  const previewKey = "ghost_preview_data";
  const backupKey = "ghost_admin_backups";

  const timestamp = value => {
    const n = Date.parse(value || "");
    return Number.isFinite(n) ? n : 0;
  };

  const make = (tag, className = "", text = "") => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  const field = (labelText, value, onChange, options = {}) => {
    const label = make("label", options.wide ? "wide" : "");
    const caption = make("span", "", labelText);
    let control;
    if (options.type === "textarea") {
      control = document.createElement("textarea");
      control.rows = options.rows || 3;
      control.maxLength = options.max || 1000;
      control.value = value || "";
    } else if (options.type === "select") {
      control = document.createElement("select");
      for (const [optionValue, optionText] of options.options || []) {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = optionText;
        if (optionValue === value) option.selected = true;
        control.append(option);
      }
    } else {
      control = document.createElement("input");
      control.type = options.type || "text";
      control.maxLength = options.max || 300;
      control.value = value ?? "";
    }
    control.addEventListener(options.type === "select" ? "change" : "input", () => onChange(control.value));
    label.append(caption, control);
    return label;
  };

  const init = () => {
    if (initialized) return;
    initialized = true;

    const defaults = clone(window.SITE_DATA || {});
    let localDraft = null;
    try { localDraft = JSON.parse(localStorage.getItem(localKey)); } catch (_) {}

    let data = clone(defaults);
    if (localDraft && timestamp(localDraft?._meta?.updatedAt) >= timestamp(defaults?._meta?.updatedAt)) data = localDraft;
    data.services = Array.isArray(data.services) ? data.services : [];
    data.stats = Array.isArray(data.stats) ? data.stats : [];
    data.process = Array.isArray(data.process) ? data.process : [];
    data.faq = Array.isArray(data.faq) ? data.faq : [];
    data.customSections = Array.isArray(data.customSections) ? data.customSections : [];

    const getPath = (object, path) => path.split(".").reduce((acc, key) => acc?.[key], object);
    const setPath = (object, path, value) => {
      const parts = path.split(".");
      const last = parts.pop();
      const parent = parts.reduce((acc, key) => acc[key], object);
      parent[last] = value;
    };

    const statusEl = document.getElementById("publish-status");
    const setStatus = (message, kind = "") => {
      statusEl.textContent = message;
      statusEl.className = `publish-status ${kind}`.trim();
    };

    const saveLocal = () => {
      data._meta = { ...(data._meta || {}), updatedAt: new Date().toISOString() };
      localStorage.setItem(localKey, JSON.stringify(data));
      localStorage.setItem(previewKey, JSON.stringify(data));
      const saveStatus = document.getElementById("save-status");
      if (saveStatus) {
        saveStatus.textContent = "Alterações salvas neste navegador.";
        clearTimeout(saveLocal.timer);
        saveLocal.timer = setTimeout(() => { saveStatus.textContent = "Alterações locais são salvas automaticamente neste navegador."; }, 1400);
      }
    };

    document.querySelectorAll("[data-path]").forEach(control => {
      const path = control.dataset.path;
      const value = getPath(data, path);
      if (control.type === "checkbox") control.checked = Boolean(value);
      else control.value = value ?? "";
      control.addEventListener("input", () => {
        setPath(data, path, control.type === "checkbox" ? control.checked : control.value);
        saveLocal();
      });
    });

    const announcement = document.getElementById("announcement-enabled");
    announcement.checked = Boolean(data.announcement?.enabled);
    announcement.addEventListener("change", () => {
      data.announcement.enabled = announcement.checked;
      saveLocal();
    });

    const moveItem = (array, index, direction) => {
      const target = index + direction;
      if (target < 0 || target >= array.length) return;
      [array[index], array[target]] = [array[target], array[index]];
      saveLocal();
      renderAllEditors();
    };

    const editorHeader = (titleText, array, index, rerender) => {
      const head = make("div", "editor-item-head");
      head.append(make("strong", "", titleText || `Item ${index + 1}`));
      const actions = make("div", "editor-actions");
      const up = make("button", "mini-btn", "↑"); up.type = "button"; up.addEventListener("click", () => moveItem(array, index, -1));
      const down = make("button", "mini-btn", "↓"); down.type = "button"; down.addEventListener("click", () => moveItem(array, index, 1));
      const remove = make("button", "mini-btn danger", "Remover"); remove.type = "button";
      remove.addEventListener("click", () => {
        if (!confirm("Remover este item?")) return;
        array.splice(index, 1); saveLocal(); rerender();
      });
      actions.append(up, down, remove); head.append(actions); return head;
    };

    const renderServices = () => {
      const root = document.getElementById("service-controls");
      root.replaceChildren();
      data.services.forEach((service, index) => {
        const card = make("div", "editor-item");
        card.append(editorHeader(service.title, data.services, index, renderServices));
        const grid = make("div", "editor-grid");
        grid.append(
          field("Título", service.title, value => { service.title = value; saveLocal(); }, { max: 100 }),
          field("Ícone", service.icon, value => { service.icon = value; saveLocal(); }, { type: "select", options: [["camera", "Câmera"], ["alarm", "Alarme"], ["home", "Casa"], ["tools", "Ferramentas"], ["repair", "Manutenção"], ["access", "Acesso"]] }),
          field("Descrição", service.description, value => { service.description = value; saveLocal(); }, { type: "textarea", wide: true, max: 700 }),
          field("Recursos — um por linha", (service.features || []).join("\n"), value => { service.features = value.split(/\r?\n/).map(v => v.trim()).filter(Boolean).slice(0, 10); saveLocal(); }, { type: "textarea", wide: true, max: 1400 })
        );
        const toggle = make("label", "wide");
        const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = service.enabled !== false;
        checkbox.addEventListener("change", () => { service.enabled = checkbox.checked; saveLocal(); });
        toggle.append(checkbox, document.createTextNode(" Exibir no site")); grid.append(toggle);
        card.append(grid); root.append(card);
      });
    };

    const renderStats = () => {
      const root = document.getElementById("stats-controls"); root.replaceChildren();
      data.stats.forEach((item, index) => {
        const card = make("div", "editor-item"); card.append(editorHeader(item.label, data.stats, index, renderStats));
        const grid = make("div", "editor-grid");
        grid.append(field("Valor", item.value, value => { item.value = value; saveLocal(); }, { max: 40 }), field("Legenda", item.label, value => { item.label = value; saveLocal(); }, { max: 100 }));
        card.append(grid); root.append(card);
      });
    };

    const renderProcess = () => {
      const root = document.getElementById("process-controls"); root.replaceChildren();
      data.process.forEach((item, index) => {
        const card = make("div", "editor-item"); card.append(editorHeader(item.title, data.process, index, renderProcess));
        const grid = make("div", "editor-grid");
        grid.append(field("Número", item.number, value => { item.number = value; saveLocal(); }, { max: 8 }), field("Título", item.title, value => { item.title = value; saveLocal(); }, { max: 100 }), field("Texto", item.text, value => { item.text = value; saveLocal(); }, { type: "textarea", wide: true, max: 500 }));
        card.append(grid); root.append(card);
      });
    };

    const renderFaq = () => {
      const root = document.getElementById("faq-controls"); root.replaceChildren();
      data.faq.forEach((item, index) => {
        const card = make("div", "editor-item"); card.append(editorHeader(item.q, data.faq, index, renderFaq));
        const grid = make("div", "editor-grid");
        grid.append(field("Pergunta", item.q, value => { item.q = value; saveLocal(); }, { wide: true, max: 220 }), field("Resposta", item.a, value => { item.a = value; saveLocal(); }, { type: "textarea", wide: true, max: 1000 }));
        card.append(grid); root.append(card);
      });
    };

    const renderCustom = () => {
      const root = document.getElementById("custom-controls"); root.replaceChildren();
      data.customSections.forEach((item, index) => {
        const card = make("div", "editor-item"); card.append(editorHeader(item.title, data.customSections, index, renderCustom));
        const grid = make("div", "editor-grid");
        grid.append(field("Etiqueta", item.eyebrow, value => { item.eyebrow = value; saveLocal(); }, { max: 80 }), field("Título", item.title, value => { item.title = value; saveLocal(); }, { max: 180 }), field("Texto", item.body, value => { item.body = value; saveLocal(); }, { type: "textarea", wide: true, max: 2500 }));
        const options = make("div", "wide");
        const visible = document.createElement("input"); visible.type = "checkbox"; visible.checked = item.enabled !== false;
        visible.addEventListener("change", () => { item.enabled = visible.checked; saveLocal(); });
        const muted = document.createElement("input"); muted.type = "checkbox"; muted.checked = Boolean(item.muted);
        muted.addEventListener("change", () => { item.muted = muted.checked; saveLocal(); });
        options.append(visible, document.createTextNode(" Exibir   "), muted, document.createTextNode(" Fundo alternativo"));
        grid.append(options); card.append(grid); root.append(card);
      });
    };

    const renderAllEditors = () => { renderServices(); renderStats(); renderProcess(); renderFaq(); renderCustom(); };
    renderAllEditors();

    document.getElementById("add-service").addEventListener("click", () => { data.services.push({ id: `service-${Date.now()}`, enabled: true, icon: "camera", title: "Novo serviço", description: "", features: [] }); saveLocal(); renderServices(); });
    document.getElementById("add-stat").addEventListener("click", () => { data.stats.push({ value: "", label: "" }); saveLocal(); renderStats(); });
    document.getElementById("add-process").addEventListener("click", () => { data.process.push({ number: String(data.process.length + 1).padStart(2, "0"), title: "Nova etapa", text: "" }); saveLocal(); renderProcess(); });
    document.getElementById("add-faq").addEventListener("click", () => { data.faq.push({ q: "Nova pergunta", a: "" }); saveLocal(); renderFaq(); });
    document.getElementById("add-custom").addEventListener("click", () => { data.customSections.push({ id: `conteudo-${Date.now()}`, enabled: true, eyebrow: "", title: "Novo bloco", body: "", muted: false }); saveLocal(); renderCustom(); });

    const importInput = document.getElementById("import-json-file");
    document.getElementById("import-json-btn").addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        const imported = JSON.parse(await file.text());
        if (!imported || typeof imported !== "object" || !Array.isArray(imported.services)) throw new Error("INVALID");
        data = imported; saveLocal(); location.reload();
      } catch (_) {
        alert("Backup JSON inválido.");
      } finally { importInput.value = ""; }
    });

    const saveAutomaticBackup = () => {
      try {
        const backups = JSON.parse(localStorage.getItem(backupKey) || "[]");
        backups.unshift({ at: new Date().toISOString(), data: clone(data) });
        localStorage.setItem(backupKey, JSON.stringify(backups.slice(0, 5)));
      } catch (_) {}
    };

    const exportFile = () => {
      const content = `window.SITE_DATA = ${JSON.stringify(data, null, 2)};\n`;
      const blob = new Blob([content], { type: "application/javascript;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "site-data.js"; a.click();
      URL.revokeObjectURL(url);
    };

    const setPublishButtonsDisabled = disabled => {
      ["publish-btn", "publish-btn-top"].forEach(id => { const button = document.getElementById(id); if (button) button.disabled = disabled; });
    };

    const publish = async () => {
      const baseUrl = String(window.GHOST_AUTH_CONFIG?.apiBase || "").trim().replace(/\/+$/, "");
      const token = window.GHOST_ADMIN_SESSION?.() || "";
      if (!baseUrl || !token) {
        setStatus("Sua sessão não está autenticada. Entre novamente.", "error");
        window.GHOST_AUTH_LOGOUT?.(); return;
      }
      saveAutomaticBackup(); saveLocal(); setPublishButtonsDisabled(true); setStatus("Publicando conteúdo com sessão autenticada...", "busy");
      try {
        const response = await fetch(`${baseUrl}/publish`, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify({ data }), cache: "no-store", referrerPolicy: "no-referrer" });
        let result = {}; try { result = await response.json(); } catch (_) {}
        if (response.status === 401) { window.GHOST_AUTH_LOGOUT?.(); throw new Error("Sessão expirada. Faça as três etapas novamente."); }
        if (!response.ok) throw new Error(result.error || `Falha na publicação (${response.status}).`);
        setStatus(result.message || "Alterações publicadas com sucesso.", "success");
      } catch (error) { setStatus(error.message, "error"); }
      finally { setPublishButtonsDisabled(false); }
    };

    document.getElementById("publish-btn").addEventListener("click", publish);
    document.getElementById("publish-btn-top").addEventListener("click", publish);
    document.getElementById("export-btn").addEventListener("click", exportFile);
    document.getElementById("preview-btn").addEventListener("click", () => { saveLocal(); window.open("index.html?preview=1", "_blank", "noopener,noreferrer"); });
    document.getElementById("reload-published-btn").addEventListener("click", () => { if (confirm("Descartar o rascunho local e carregar a versão publicada?")) { localStorage.removeItem(localKey); localStorage.removeItem(previewKey); location.reload(); } });
    document.getElementById("reset-btn").addEventListener("click", () => { if (confirm("Restaurar todos os dados padrão?")) { localStorage.removeItem(localKey); localStorage.removeItem(previewKey); location.reload(); } });
    saveLocal();
  };

  window.addEventListener("ghost-authenticated", init, { once: true });
})();
