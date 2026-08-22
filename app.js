(async () => {
  "use strict";
  try { await (window.GHOST_PUBLIC_CONFIG_READY || Promise.resolve(false)); } catch (_) {}

  const base = window.SITE_DATA || {};
  let draft = null;
  try {
    const raw = localStorage.getItem("ghost_preview_data");
    draft = raw ? JSON.parse(raw) : null;
  } catch (_) {}

  const preview = new URLSearchParams(location.search).get("preview") === "1";
  const data = preview && draft ? draft : base;
  const list = value => Array.isArray(value) ? value : [];
  const textValue = value => String(value ?? "");
  const byId = id => document.getElementById(id);

  const root = document.documentElement;
  if (/^#[0-9a-f]{6}$/i.test(data.theme?.accent || "")) root.style.setProperty("--accent", data.theme.accent);
  if (/^#[0-9a-f]{6}$/i.test(data.theme?.accent2 || "")) root.style.setProperty("--accent2", data.theme.accent2);

  const setText = (selector, value) => {
    document.querySelectorAll(selector).forEach(el => { el.textContent = textValue(value); });
  };
  const setIdText = (id, value) => {
    const el = byId(id);
    if (el) el.textContent = textValue(value);
  };

  setText("[data-company-name]", data.company?.name);
  setText("[data-company-subtitle]", data.company?.subtitle);
  setText("[data-company-tagline]", data.company?.tagline);
  setText("[data-phone-display]", data.company?.phoneDisplay);
  setText("[data-email]", data.company?.email);
  setText("[data-location]", data.company?.location);

  document.title = `${textValue(data.company?.name || "G-Host")} | ${textValue(data.company?.subtitle || "Segurança Eletrônica")}`;

  const ann = byId("announcement");
  const annText = byId("announcement-text");
  if (ann && annText) {
    if (data.announcement?.enabled) annText.textContent = textValue(data.announcement.text);
    else ann.hidden = true;
  }

  setIdText("hero-eyebrow", data.hero?.eyebrow);
  setIdText("hero-title", data.hero?.title);
  setIdText("hero-description", data.hero?.description);
  setIdText("hero-primary", data.hero?.primaryButton || "Solicitar avaliação");
  setIdText("hero-secondary", data.hero?.secondaryButton || "Conhecer soluções");

  const SVG_NS = "http://www.w3.org/2000/svg";
  const iconDefs = Object.freeze({
    camera: [
      ["path", { d: "M4 7h11a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H4z" }],
      ["path", { d: "m18 11 4-2v6l-4-2" }],
      ["circle", { cx: "9", cy: "12", r: "2" }]
    ],
    alarm: [
      ["path", { d: "M6 17h12l-1-2V10a5 5 0 0 0-10 0v5z" }],
      ["path", { d: "M10 20h4" }],
      ["path", { d: "M4 6 2 4M20 6l2-2" }]
    ],
    home: [
      ["path", { d: "m3 11 9-8 9 8" }],
      ["path", { d: "M5 10v10h14V10" }],
      ["path", { d: "M9 20v-6h6v6" }],
      ["path", { d: "M17 5c1.5.5 2.5 1.5 3 3" }]
    ],
    tools: [
      ["path", { d: "m14 7 3-3a4 4 0 0 1-5 5L5 16l3 3 7-7a4 4 0 0 1 5-5l-3 3" }],
      ["path", { d: "m4 4 5 5" }]
    ],
    repair: [
      ["path", { d: "M14 6a4 4 0 0 0-5 5l-6 6 4 4 6-6a4 4 0 0 0 5-5l-3 3-3-3z" }],
      ["path", { d: "m14 6 4-4 4 4-4 4" }]
    ],
    access: [
      ["rect", { x: "4", y: "3", width: "12", height: "18", rx: "1" }],
      ["path", { d: "M8 12h.01" }],
      ["path", { d: "M18 8h2v8h-2" }]
    ]
  });

  const createTrustedIcon = name => {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    const def = iconDefs[name] || iconDefs.camera;
    for (const [tag, attrs] of def) {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      svg.appendChild(node);
    }
    return svg;
  };

  const stats = byId("stats");
  if (stats) {
    stats.replaceChildren();
    list(data.stats).forEach(item => {
      const card = document.createElement("div");
      card.className = "stat";
      const strong = document.createElement("strong");
      const span = document.createElement("span");
      strong.textContent = textValue(item?.value);
      span.textContent = textValue(item?.label);
      card.append(strong, span);
      stats.appendChild(card);
    });
  }

  const grid = byId("service-grid");
  if (grid) {
    grid.replaceChildren();
    list(data.services).filter(service => service?.enabled !== false).forEach(service => {
      const card = document.createElement("article");
      card.className = "service-card";

      const iconWrap = document.createElement("div");
      iconWrap.className = "icon-wrap";
      iconWrap.appendChild(createTrustedIcon(service?.icon));

      const h3 = document.createElement("h3");
      h3.textContent = textValue(service?.title);
      const p = document.createElement("p");
      p.textContent = textValue(service?.description);
      const ul = document.createElement("ul");
      list(service?.features).forEach(feature => {
        const li = document.createElement("li");
        li.textContent = textValue(feature);
        ul.appendChild(li);
      });
      card.append(iconWrap, h3, p, ul);
      grid.appendChild(card);
    });
  }

  const customRoot = byId("custom-sections");
  if (customRoot) {
    customRoot.replaceChildren();
    list(data.customSections).filter(section => section?.enabled !== false).forEach((section, index) => {
      const sec = document.createElement("section");
      sec.className = `section${section?.muted ? " section-muted" : ""}`;
      sec.id = textValue(section?.id || `conteudo-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "-");
      const container = document.createElement("div");
      container.className = "container";
      const heading = document.createElement("div");
      heading.className = "section-heading";
      if (section?.eyebrow) {
        const eyebrow = document.createElement("span");
        eyebrow.className = "eyebrow";
        eyebrow.textContent = textValue(section.eyebrow);
        heading.appendChild(eyebrow);
      }
      const h2 = document.createElement("h2");
      h2.textContent = textValue(section?.title);
      const body = document.createElement("p");
      body.textContent = textValue(section?.body);
      heading.append(h2, body);
      container.appendChild(heading);
      sec.appendChild(container);
      customRoot.appendChild(sec);
    });
  }

  setIdText("about-title", data.about?.title);
  setIdText("about-text", data.about?.text);

  const process = byId("process-grid");
  if (process) {
    process.replaceChildren();
    list(data.process).forEach(step => {
      const card = document.createElement("article");
      card.className = "process-card";
      const number = document.createElement("b");
      number.textContent = textValue(step?.number);
      const h3 = document.createElement("h3");
      h3.textContent = textValue(step?.title);
      const p = document.createElement("p");
      p.textContent = textValue(step?.text);
      card.append(number, h3, p);
      process.appendChild(card);
    });
  }

  const faq = byId("faq-list");
  if (faq) {
    faq.replaceChildren();
    list(data.faq).forEach(item => {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      const p = document.createElement("p");
      summary.textContent = textValue(item?.q);
      p.textContent = textValue(item?.a);
      details.append(summary, p);
      faq.appendChild(details);
    });
  }

  setIdText("contact-title", data.contact?.title);
  setIdText("contact-text", data.contact?.text);

  const emailLink = document.querySelector("[data-email-link]");
  const email = textValue(data.company?.email).trim();
  if (emailLink && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    emailLink.href = `mailto:${email}`;
    emailLink.textContent = email;
  } else if (emailLink) {
    emailLink.removeAttribute("href");
    emailLink.textContent = email;
  }

  const phoneLink = document.querySelector("[data-phone-link]");
  const phoneDigits = textValue(data.company?.phoneDisplay).replace(/\D/g, "");
  if (phoneLink) {
    phoneLink.textContent = textValue(data.company?.phoneDisplay);
    if (phoneDigits.length >= 10) phoneLink.href = `tel:+${phoneDigits}`;
    else phoneLink.removeAttribute("href");
  }

  const menuBtn = byId("menu-btn");
  const nav = byId("nav-links");
  if (menuBtn && nav) {
    menuBtn.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      menuBtn.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    });
    nav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
      nav.classList.remove("open");
      menuBtn.classList.remove("open");
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.setAttribute("aria-label", "Abrir menu");
    }));
  }

  const clock = byId("clock");
  if (clock) {
    const updateClock = () => {
      clock.textContent = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date());
    };
    updateClock();
    setInterval(updateClock, 30_000);
  }

  const simulatorInputs = [...document.querySelectorAll("[data-sim]")];
  const simulatorResult = byId("sim-result");
  if (simulatorResult) {
    const updateSimulator = () => {
      const selected = simulatorInputs.filter(input => input.checked).map(input => input.dataset.sim);
      simulatorResult.textContent = !selected.length
        ? "Selecione uma ou mais soluções"
        : selected.length === 1
          ? `Projeto focado em ${selected[0]}`
          : `Solução integrada: ${selected.join(" + ")}`;
    };
    simulatorInputs.forEach(input => input.addEventListener("change", updateSimulator));
  }

  const form = byId("contact-form");
  const note = byId("form-note");
  if (form && note) {
    form.addEventListener("submit", event => {
      event.preventDefault();
      const whatsapp = String(data.company?.whatsapp || "").replace(/\D/g, "");
      if (!/^\d{12,15}$/.test(whatsapp) || whatsapp === "5500000000000") {
        note.textContent = "O WhatsApp comercial ainda precisa ser configurado.";
        note.className = "form-note warning";
        return;
      }

      const name = byId("name")?.value?.trim().slice(0, 80) || "";
      const service = byId("service")?.value?.trim().slice(0, 100) || "";
      const message = byId("message")?.value?.trim().slice(0, 1200) || "";
      if (!name || !service || !message) {
        note.textContent = "Preencha os campos antes de continuar.";
        note.className = "form-note warning";
        return;
      }

      const body = [
        `Olá, ${textValue(data.company?.name || "G-Host")}! Gostaria de solicitar uma avaliação.`,
        "",
        `Nome: ${name}`,
        `Serviço: ${service}`,
        `Mensagem: ${message}`
      ].join("\n");

      note.textContent = "Abrindo o WhatsApp com sua mensagem. Nenhum dado foi armazenado pelo site.";
      note.className = "form-note success";
      window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(body)}`, "_blank", "noopener,noreferrer");
    });
  }

  setIdText("year", new Date().getFullYear());
})();
