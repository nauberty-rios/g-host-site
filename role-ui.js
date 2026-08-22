(() => {
  "use strict";

  const replaceStaticCopy = () => {
    const replacements = new Map([
      ["Seu cadastro começa como Visitante. Você já pode montar e salvar soluções; depois da contratação, os recursos de Cliente são liberados para a sua conta.", "Seu cadastro cria uma conta de Usuário. Você já pode montar e salvar soluções; depois que um projeto for fechado com a G-Host, os recursos de Cliente são liberados para a sua conta."],
      ["Toda conta nova começa como Visitante. O Dono da G-Host libera o perfil Cliente após a contratação.", "Toda conta cadastrada começa como Usuário. Depois que um projeto for fechado com a G-Host, o perfil Cliente é liberado."],
      ["Seu perfil ainda é Visitante. Você pode montar e salvar projetos. Após a contratação, a G-Host libera o perfil Cliente e os dados operacionais do seu imóvel.", "Sua conta está como Usuário. Você pode montar e salvar projetos. Depois que um projeto for fechado com a G-Host, o perfil Cliente e os dados operacionais são liberados."]
    ]);

    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const value = String(node.nodeValue || "").trim();
      const next = replacements.get(value);
      if (next && next !== value) node.nodeValue = node.nodeValue.replace(value, next);
    }
  };

  const normalizeDynamicRoles = () => {
    const badge = document.getElementById("client-role");
    if (badge && ["visitante", "usuario"].includes(badge.textContent.trim().toLowerCase()) && badge.textContent !== "Usuário") {
      badge.textContent = "Usuário";
    }

    const accountInfo = document.getElementById("client-account-info");
    if (accountInfo) {
      const next = accountInfo.textContent
        .replace(/perfil\s+visitante/gi, "perfil Usuário")
        .replace(/perfil\s+usuario/gi, "perfil Usuário");
      if (next !== accountInfo.textContent) accountInfo.textContent = next;
    }

    const upgrade = document.getElementById("visitor-upgrade-note");
    if (upgrade && badge?.textContent.trim() === "Usuário") {
      const next = "Sua conta está como Usuário. Depois que um projeto for fechado com a G-Host, o perfil Cliente e os dados operacionais são liberados.";
      if (upgrade.hidden) upgrade.hidden = false;
      if (upgrade.textContent !== next) upgrade.textContent = next;
    }

    document.querySelectorAll("#platform-users-list select").forEach(select => {
      const old = [...select.options].find(option => option.value === "visitante");
      if (old) {
        old.value = "usuario";
        if (old.textContent !== "Usuário") old.textContent = "Usuário";
      }
      const userOption = [...select.options].find(option => option.value === "usuario");
      if (userOption && userOption.textContent !== "Usuário") userOption.textContent = "Usuário";
    });

    document.querySelectorAll("#owner-device-account option").forEach(option => {
      const next = option.textContent
        .replace(/ · visitante · /gi, " · Usuário · ")
        .replace(/ · usuario · /gi, " · Usuário · ");
      if (next !== option.textContent) option.textContent = next;
    });

    document.querySelectorAll(".admin-note p.muted").forEach(node => {
      if (node.textContent.trim() === "Status: pending") node.textContent = "Status: Pendente";
    });
  };

  let scheduled = false;
  const apply = () => {
    scheduled = false;
    replaceStaticCopy();
    normalizeDynamicRoles();
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(apply);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply, { once: true });
  else apply();

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
