(() => {
  "use strict";
  const config=window.GHOST_VISIBILITY||{};
  const sections=config.sections||{};
  document.querySelectorAll("[data-visibility-key]").forEach(el=>{
    const key=el.dataset.visibilityKey;
    if(sections[key]===false) el.hidden=true;
  });
  document.querySelectorAll("[data-nav-target]").forEach(el=>{
    const key=el.dataset.navTarget;
    if(sections[key]===false) el.hidden=true;
  });
})();
