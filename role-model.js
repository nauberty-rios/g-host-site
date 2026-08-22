(() => {
  "use strict";

  const USER_ROLE = "usuario";
  const LEGACY_ROLE = "visitante";

  const patchRoleOptions = root => {
    (root.querySelectorAll?.('option[value="visitante"]') || []).forEach(option => {
      option.value = USER_ROLE;
      option.textContent = "Usuário";
    });
  };

  const patchClientTexts = root => {
    const role = root.querySelector?.("#client-role");
    if (role && role.textContent.trim() === "Visitante") role.textContent = "Usuário";

    const info = root.querySelector?.("#client-account-info");
    if (info && /perfil\s+Visitante\b/i.test(info.textContent)) {
      info.textContent = info.textContent.replace(/perfil\s+Visitante\b/i, "perfil Usuário");
    }

    const registerNote = root.querySelector?.("#client-register-form .muted");
    if (registerNote && /Toda conta nova começa como Visitante/i.test(registerNote.textContent)) {
      registerNote.textContent = "Toda conta cadastrada começa como Usuário. O perfil Cliente é liberado quando um projeto é fechado com a G-Host.";
    }

    const upgrade = root.querySelector?.("#visitor-upgrade-note");
    if (upgrade) {
      upgrade.innerHTML = "Seu perfil atual é <strong>Usuário</strong>. Você pode montar e salvar projetos. Quando um projeto for fechado com a G-Host, sua conta passa para Cliente e os recursos contratados são liberados.";
      if (role && role.textContent.trim() === "Usuário") upgrade.hidden = false;
      if (role && ["Cliente", "ADM", "Dono"].includes(role.textContent.trim())) upgrade.hidden = true;
    }
  };

  const patch = root => {
    if (!root || root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    patchRoleOptions(root);
    patchClientTexts(document);
  };

  const normalizeLegacyStorage = () => {
    try {
      if (sessionStorage.getItem("ghost_account_role") === LEGACY_ROLE) {
        sessionStorage.setItem("ghost_account_role", USER_ROLE);
      }
    } catch (_) {}
  };

  normalizeLegacyStorage();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => patch(document), { once: true });
  } else {
    patch(document);
  }

  new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) patch(node);
      });
    }
    patchClientTexts(document);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
