(() => {
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const defaults = clone(window.SITE_DATA || {});
  const localKey = "ghost_admin_data";
  const previewKey = "ghost_preview_data";
  const publisherKey = "ghost_publisher_url";

  const ts = value => {
    const n = Date.parse(value || "");
    return Number.isFinite(n) ? n : 0;
  };

  let localDraft = null;
  try { localDraft = JSON.parse(localStorage.getItem(localKey)); } catch (_) {}

  // Prefer the newest copy. This avoids an old browser draft replacing newer published data.
  let data = clone(defaults);
  if (localDraft) {
    const localTime = ts(localDraft?._meta?.updatedAt);
    const publishedTime = ts(defaults?._meta?.updatedAt);
    if (localTime >= publishedTime) data = localDraft;
  }

  const getPath = (obj, path) => path.split(".").reduce((acc, key) => acc?.[key], obj);
  const setPath = (obj, path, value) => {
    const parts = path.split(".");
    const last = parts.pop();
    const parent = parts.reduce((acc, key) => acc[key], obj);
    parent[last] = value;
  };

  const statusEl = document.getElementById("publish-status");
  const setStatus = (message, kind = "") => {
    statusEl.textContent = message;
    statusEl.className = `publish-status ${kind}`.trim();
  };

  const saveLocal = () => {
    localStorage.setItem(localKey, JSON.stringify(data));
    localStorage.setItem(previewKey, JSON.stringify(data));
    const status = document.getElementById("save-status");
    if (status) {
      status.textContent = "Alterações salvas neste navegador.";
      clearTimeout(saveLocal._t);
      saveLocal._t = setTimeout(() => {
        status.textContent = "Alterações locais são salvas automaticamente.";
      }, 1500);
    }
  };

  document.querySelectorAll("[data-path]").forEach(field => {
    const path = field.dataset.path;
    const value = getPath(data, path);
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value ?? "";

    field.addEventListener("input", () => {
      setPath(data, path, field.type === "checkbox" ? field.checked : field.value);
      saveLocal();
    });
  });

  const ann = document.getElementById("announcement-enabled");
  ann.checked = Boolean(data.announcement?.enabled);
  ann.addEventListener("change", () => {
    data.announcement.enabled = ann.checked;
    saveLocal();
  });

  const controls = document.getElementById("service-controls");
  (data.services || []).forEach((service, index) => {
    const row = document.createElement("div");
    row.className = "service-control";
    row.innerHTML = `
      <span><b>${service.title}</b><small>${service.description}</small></span>
      <label class="switch" aria-label="Exibir ${service.title}">
        <input type="checkbox" ${service.enabled !== false ? "checked" : ""}>
        <i></i>
      </label>`;
    row.querySelector("input").addEventListener("change", event => {
      data.services[index].enabled = event.target.checked;
      saveLocal();
    });
    controls.appendChild(row);
  });

  const publisherUrl = document.getElementById("publisher-url");
  const publisherPassword = document.getElementById("publisher-password");
  publisherUrl.value = localStorage.getItem(publisherKey) || "";
  publisherUrl.addEventListener("input", () => {
    localStorage.setItem(publisherKey, publisherUrl.value.trim());
  });

  const normalizePublisher = raw => raw.trim().replace(/\/+$/, "");

  const exportFile = () => {
    const exportData = clone(data);
    exportData._meta = {
      ...(exportData._meta || {}),
      updatedAt: new Date().toISOString()
    };
    const content = "window.SITE_DATA = " + JSON.stringify(exportData, null, 2) + ";\n";
    const blob = new Blob([content], { type: "application/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "site-data.js";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const setPublishButtonsDisabled = disabled => {
    ["publish-btn", "publish-btn-top"].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = disabled;
    });
  };

  const publish = async () => {
    const baseUrl = normalizePublisher(publisherUrl.value);
    const password = publisherPassword.value;

    if (!baseUrl) {
      setStatus("Informe a URL do Publicador antes de publicar.", "error");
      publisherUrl.focus();
      return;
    }
    if (!/^https:\/\//i.test(baseUrl) && !/^http:\/\/localhost/i.test(baseUrl)) {
      setStatus("Use uma URL HTTPS para o Publicador.", "error");
      publisherUrl.focus();
      return;
    }
    if (!password) {
      setStatus("Digite a senha de publicação.", "error");
      publisherPassword.focus();
      return;
    }

    data._meta = {
      ...(data._meta || {}),
      updatedAt: new Date().toISOString()
    };
    saveLocal();

    setPublishButtonsDisabled(true);
    setStatus("Enviando alterações com segurança para o GitHub...", "busy");

    try {
      const response = await fetch(`${baseUrl}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, data })
      });

      let result = {};
      try { result = await response.json(); } catch (_) {}

      if (!response.ok) {
        throw new Error(result.error || `Falha na publicação (${response.status}).`);
      }

      publisherPassword.value = "";
      setStatus(
        result.message || "Alterações enviadas. O GitHub Pages está publicando a nova versão.",
        "success"
      );

      // Make published version the local baseline after a successful commit.
      localStorage.setItem(localKey, JSON.stringify(data));
      localStorage.setItem(previewKey, JSON.stringify(data));
    } catch (error) {
      setStatus(
        `${error.message} Confira a URL, a senha e a configuração do Publicador.`,
        "error"
      );
    } finally {
      setPublishButtonsDisabled(false);
    }
  };

  document.getElementById("publish-btn").addEventListener("click", publish);
  document.getElementById("publish-btn-top").addEventListener("click", publish);
  document.getElementById("export-btn").addEventListener("click", exportFile);

  document.getElementById("preview-btn").addEventListener("click", () => {
    saveLocal();
    window.open("index.html?preview=1", "_blank");
  });

  document.getElementById("reload-published-btn").addEventListener("click", () => {
    if (!confirm("Descartar o rascunho local e carregar a versão que está publicada no site?")) return;
    localStorage.removeItem(localKey);
    localStorage.removeItem(previewKey);
    location.reload();
  });

  document.getElementById("reset-btn").addEventListener("click", () => {
    if (!confirm("Restaurar todos os dados padrão do painel?")) return;
    data = clone(defaults);
    localStorage.removeItem(localKey);
    localStorage.removeItem(previewKey);
    location.reload();
  });

  saveLocal();
})();