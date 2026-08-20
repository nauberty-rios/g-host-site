(() => {
  "use strict";
  const KEY="ghost_analytics_consent_v1";
  const current=localStorage.getItem(KEY)||"";
  const notify=value=>window.dispatchEvent(new CustomEvent("ghost-consent-change",{detail:{analytics:value==="accepted"}}));
  if(current){notify(current);return;}
  const banner=document.createElement("div");banner.className="privacy-banner";banner.setAttribute("role","dialog");banner.setAttribute("aria-label","Preferências de privacidade");
  const p=document.createElement("p");p.innerHTML='A G-Host usa armazenamento necessário para o funcionamento do site. Analytics opcional ajuda a entender páginas, serviços e conversões sem registrar o texto dos formulários. Veja o <a href="privacidade.html">Aviso de Privacidade</a>.';
  const actions=document.createElement("div");actions.className="privacy-actions";
  const reject=document.createElement("button");reject.type="button";reject.className="privacy-reject";reject.textContent="Somente necessários";
  const accept=document.createElement("button");accept.type="button";accept.className="privacy-accept";accept.textContent="Aceitar analytics";
  const choose=value=>{localStorage.setItem(KEY,value);banner.remove();notify(value);};
  reject.onclick=()=>choose("necessary");accept.onclick=()=>choose("accepted");actions.append(reject,accept);banner.append(p,actions);document.body.append(banner);
})();
