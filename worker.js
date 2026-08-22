const enc = new TextEncoder();

const securityHeaders = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
};

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", ...securityHeaders, ...headers }
});

const digestBytes = async text => new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(text))));
const digestHex = async text => [...await digestBytes(text)].map(b => b.toString(16).padStart(2, "0")).join("");

const safeEqual = async (a, b) => {
  const x = await digestBytes(a), y = await digestBytes(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
};

const hmacHex = async (secret, message) => {
  const key = await crypto.subtle.importKey("raw", enc.encode(String(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(String(message))));
  return [...sig].map(b => b.toString(16).padStart(2, "0")).join("");
};

const randomDigits = (length = 6) => {
  const out = [];
  const limit = 250; // maior múltiplo de 10 menor que 256, evita viés de módulo
  while (out.length < length) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= limit) continue;
      out.push(String(b % 10));
      if (out.length === length) break;
    }
  }
  return out.join("");
};

const randomToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const encodeBase64Utf8 = text => {
  const bytes = enc.encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const allowedOrigin = (request, env) => {
  const origin = (request.headers.get("Origin") || "").replace(/\/$/, "");
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(x => x.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return allowed.includes(origin) ? origin : "";
};

const corsHeaders = origin => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Ghost-Device",
  "Access-Control-Max-Age": "600",
  "Vary": "Origin"
});

const clientIp = request => request.headers.get("CF-Connecting-IP") || "unknown";
const userAgent = request => (request.headers.get("User-Agent") || "unknown").slice(0, 300);

const sanitizeLogText = value => String(value ?? "")
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
  .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
  .replace(/\b(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}\b/g, "[mac]")
  .replace(/\b(?:re_|ghp_|github_pat_)[A-Za-z0-9_-]{10,}\b/g, "[token]")
  .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [redacted]")
  .slice(0, 240);

const requestFingerprint = async (request, env) =>
  hmacHex(env.AUTH_PEPPER, `fingerprint|${clientIp(request)}|${userAgent(request)}`);
const userAgentHash = async request => digestHex(userAgent(request));

const consumeRate = async (env, key, limit, ttl) => {
  // Não grava IP, e-mail ou ID bruto no nome da chave do KV.
  const keyHash = await hmacHex(env.AUTH_PEPPER, `rate|${key}`);
  const full = `rate:${keyHash}`;
  try {
    const current = Number(await env.AUTH_KV.get(full) || 0);
    if (current >= limit) return false;
    await env.AUTH_KV.put(full, String(current + 1), { expirationTtl: ttl });
    return true;
  } catch (error) {
    // KV tem limite de gravação por chave; falhar fechado evita transformar isso em HTTP 500.
    console.error("rate_limit_backend_failed", { errorName: String(error?.name || "Error").slice(0, 60) });
    return false;
  }
};

const maskEmail = email => {
  const [local = "", domain = ""] = String(email).split("@");
  if (!domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
};

const sendEmailCode = async (env, code) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [env.ADMIN_EMAIL],
      subject: "Código de acesso G-Host",
      text: `Seu código de confirmação G-Host é: ${code}. Ele expira em 10 minutos. Se você não tentou entrar, ignore esta mensagem.`
    })
  });
  if (!response.ok) throw new Error("Não foi possível enviar o código por e-mail.");
};
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const randomBase32 = (byteLength = 20) => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);

  let output = "";
  let value = 0;
  let bits = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
};

const base32ToBytes = input => {
  const clean = String(input || "")
    .toUpperCase()
    .replace(/[^A-Z2-7]/g, "");

  if (!clean) throw new Error("TOTP_SECRET_INVALID");

  const out = [];
  let value = 0;
  let bits = 0;

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error("TOTP_SECRET_INVALID");

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(out);
};

const hotp = async (secret, counter, digits = 6) => {
  const key = await crypto.subtle.importKey(
    "raw",
    base32ToBytes(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const buffer = new Uint8Array(8);
  let value = BigInt(counter);

  for (let i = 7; i >= 0; i--) {
    buffer[i] = Number(value & 255n);
    value >>= 8n;
  }

  const mac = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, buffer)
  );

  const offset = mac[mac.length - 1] & 15;

  const binary =
    ((mac[offset] & 127) << 24) |
    ((mac[offset + 1] & 255) << 16) |
    ((mac[offset + 2] & 255) << 8) |
    (mac[offset + 3] & 255);

  return String(binary % (10 ** digits)).padStart(digits, "0");
};

const verifyTotp = async (secret, code, now = Date.now()) => {
  const cleanCode = String(code || "").replace(/\D/g, "");

  if (!/^\d{6}$/.test(cleanCode)) return false;

  const counter = Math.floor(now / 1000 / 30);

  for (const drift of [-1, 0, 1]) {
    const expected = await hotp(secret, counter + drift, 6);

    if (await safeEqual(expected, cleanCode)) {
      return true;
    }
  }

  return false;
};

const getTotpState = async env => {
  let secret = await env.AUTH_KV.get("auth:totp_secret");
  const enrolled =
    (await env.AUTH_KV.get("auth:totp_enrolled")) === "1";

  if (!secret) {
    secret = randomBase32(20);
    await env.AUTH_KV.put("auth:totp_secret", secret);
  }

  return { secret, enrolled };
};


const requireSecrets = env => [
  "ADMIN_PASSWORD",
  "ADMIN_EMAIL",
  "RESEND_API_KEY",
  "AUTH_PEPPER"
].every(k => Boolean(env[k])) &&
  Boolean(env.AUTH_KV) &&
  Boolean(env.EMAIL_FROM);

const getBearer = request => {
  const h = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+([A-Za-z0-9_-]{30,})$/i.exec(h);
  return m ? m[1] : "";
};

const getSession = async (request, env) => {
  const token = getBearer(request);
  if (!token) return null;
  const hash = await digestHex(token);
  const raw = await env.AUTH_KV.get(`session:${hash}`);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data.expiresAt || Date.now() >= data.expiresAt) {
      await env.AUTH_KV.delete(`session:${hash}`);
      return null;
    }
    const uaHash = await userAgentHash(request);
    if (!data.uaHash || !(await safeEqual(data.uaHash, uaHash))) return null;
    return { token, hash, data };
  } catch (_) {
    return null;
  }
};

const githubHeaders = token => ({
  "Accept": "application/vnd.github+json",
  "Authorization": `Bearer ${token}`,
  "X-GitHub-Api-Version": "2026-03-10",
  "User-Agent": "g-host-secure-publisher"
});

const str = (value, max = 300) => String(value ?? "").trim().slice(0, max);
const arr = value => Array.isArray(value) ? value : [];
const color = value => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : "#39e6b1";
const safeBool = value => value !== false;

const normalizeSiteData = input => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_DATA");

  const company = input.company || {};
  const hero = input.hero || {};
  const about = input.about || {};
  const contact = input.contact || {};
  const announcement = input.announcement || {};
  const theme = input.theme || {};
  const iconAllow = new Set(["camera", "alarm", "home", "tools", "repair", "access"]);

  const whatsapp = String(company.whatsapp ?? "").replace(/\D/g, "").slice(0, 15);
  const cleaned = {
    _meta: { updatedAt: new Date().toISOString() },
    company: {
      name: str(company.name, 80),
      subtitle: str(company.subtitle, 120),
      tagline: str(company.tagline, 120),
      whatsapp,
      phoneDisplay: str(company.phoneDisplay, 40),
      email: str(company.email, 160),
      location: str(company.location, 160),
      instagram: str(company.instagram, 100)
    },
    theme: {
      accent: color(theme.accent),
      accent2: /^#[0-9a-f]{6}$/i.test(String(theme.accent2 || "")) ? String(theme.accent2) : "#34b7ff"
    },
    announcement: {
      enabled: Boolean(announcement.enabled),
      text: str(announcement.text, 220)
    },
    hero: {
      eyebrow: str(hero.eyebrow, 100),
      title: str(hero.title, 180),
      description: str(hero.description, 700),
      primaryButton: str(hero.primaryButton, 70),
      secondaryButton: str(hero.secondaryButton, 70)
    },
    stats: arr(input.stats).slice(0, 6).map(item => ({ value: str(item?.value, 40), label: str(item?.label, 100) })),
    services: arr(input.services).slice(0, 16).map((service, index) => ({
      id: str(service?.id || `service-${index + 1}`, 60).replace(/[^a-zA-Z0-9_-]/g, "-"),
      enabled: safeBool(service?.enabled),
      icon: iconAllow.has(service?.icon) ? service.icon : "camera",
      title: str(service?.title, 100),
      description: str(service?.description, 700),
      features: arr(service?.features).slice(0, 10).map(v => str(v, 140))
    })),
    about: {
      title: str(about.title, 180),
      text: str(about.text, 1100)
    },
    process: arr(input.process).slice(0, 8).map(item => ({
      number: str(item?.number, 8),
      title: str(item?.title, 100),
      text: str(item?.text, 500)
    })),
    faq: arr(input.faq).slice(0, 20).map(item => ({
      q: str(item?.q, 220),
      a: str(item?.a, 1000)
    })),
    customSections: arr(input.customSections).slice(0, 20).map((item, index) => ({
      id: str(item?.id || `conteudo-${index + 1}`, 80).replace(/[^a-zA-Z0-9_-]/g, "-"),
      enabled: safeBool(item?.enabled),
      eyebrow: str(item?.eyebrow, 80),
      title: str(item?.title, 180),
      body: str(item?.body, 2500),
      muted: Boolean(item?.muted)
    })),
    contact: {
      title: str(contact.title, 160),
      text: str(contact.text, 600)
    }
  };

  if (!cleaned.company.name || !cleaned.hero.title || cleaned.services.length === 0) throw new Error("INVALID_DATA");
  const serialized = JSON.stringify(cleaned);
  if (serialized.length > 180_000) throw new Error("PAYLOAD_TOO_LARGE");
  return cleaned;
};

const safeJsonForJs = data => JSON.stringify(data, null, 2)
  .replace(/</g, "\\u003c")
  .replace(/>/g, "\\u003e")
  .replace(/&/g, "\\u0026");


const normalizePlansData = input => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_DATA");
  const plans = arr(input.plans).slice(0, 6).map((plan, index) => ({
    id: str(plan?.id || `plan-${index + 1}`, 60).replace(/[^a-zA-Z0-9_-]/g, "-"),
    enabled: safeBool(plan?.enabled),
    visibility: ["public","user","client","internal","disabled"].includes(plan?.visibility) ? plan.visibility : "public",
    featured: Boolean(plan?.featured),
    showPrice: Boolean(plan?.showPrice),
    allowSelfService: safeBool(plan?.allowSelfService),
    name: str(plan?.name, 80),
    kicker: str(plan?.kicker, 120),
    description: str(plan?.description, 700),
    price: Math.max(0, Number(plan?.price || 0)),
    billing: ["monthly","one_time","quote"].includes(plan?.billing) ? plan.billing : "monthly",
    priceDetail: str(plan?.priceDetail, 120),
    promo: {
      enabled: Boolean(plan?.promo?.enabled),
      label: str(plan?.promo?.label, 40),
      oldPrice: Math.max(0, Number(plan?.promo?.oldPrice || 0)),
      price: Math.max(0, Number(plan?.promo?.price || 0)),
      start: str(plan?.promo?.start, 40),
      end: str(plan?.promo?.end, 40)
    },
    features: arr(plan?.features).slice(0, 12).map(v => str(v, 160)),
    cta: str(plan?.cta, 70)
  }));
  if (!plans.length || plans.some(p => !p.name)) throw new Error("INVALID_DATA");
  const cleaned = { _meta: { updatedAt: new Date().toISOString() }, plans };
  if (JSON.stringify(cleaned).length > 80_000) throw new Error("PAYLOAD_TOO_LARGE");
  return cleaned;
};


const normalizeVisibilityData = input => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_DATA");
  const allowedSections = ["hero","solucoes","ecossistema","planos","configurador","plataforma","empresa","processo","simulador","faq","contato","areaCliente"];
  const allowedOptions = ["showPlanPrices","showServicePrices","showPromotions","showConfiguratorEstimate"];
  const sections = {}; for (const key of allowedSections) sections[key] = input.sections?.[key] !== false;
  const options = {}; for (const key of allowedOptions) options[key] = input.options?.[key] !== false;
  return { _meta:{updatedAt:new Date().toISOString()}, sections, options, protected:{privacy:true,terms:true} };
};

const normalizeCatalogData = input => {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_DATA");
  const plans = new Set(["essencial","protecao","guardiao"]);
  const billing = new Set(["unit","monthly","one_time","quote"]);
  const categories = arr(input.categories).slice(0,20).map((c,i)=>({id:str(c?.id||`cat-${i+1}`,50).replace(/[^a-zA-Z0-9_-]/g,"-"),name:str(c?.name,100),enabled:safeBool(c?.enabled)}));
  const services = arr(input.services).slice(0,100).map((s,i)=>({
    id:str(s?.id||`service-${i+1}`,60).replace(/[^a-zA-Z0-9_-]/g,"-"), category:str(s?.category,50), name:str(s?.name,100), description:str(s?.description,700), enabled:safeBool(s?.enabled),
    visibility:["public","user","client","internal","disabled"].includes(s?.visibility)?s.visibility:"public",
    availablePlans:arr(s?.availablePlans).filter(x=>plans.has(x)).slice(0,3), showPrice:Boolean(s?.showPrice), price:Math.max(0,Number(s?.price||0)), billing:billing.has(s?.billing)?s.billing:"quote", unit:str(s?.unit,40), min:Math.max(1,Math.min(999,Number(s?.min||1))), max:Math.max(1,Math.min(999,Number(s?.max||1))),
    promo:{enabled:Boolean(s?.promo?.enabled),oldPrice:Math.max(0,Number(s?.promo?.oldPrice||0)),price:Math.max(0,Number(s?.promo?.price||0)),start:str(s?.promo?.start,40),end:str(s?.promo?.end,40)}
  }));
  if(!categories.length||!services.length) throw new Error("INVALID_DATA");
  const cleaned={_meta:{updatedAt:new Date().toISOString()},categories,services}; if(JSON.stringify(cleaned).length>180_000) throw new Error("PAYLOAD_TOO_LARGE"); return cleaned;
};

const parseJson = async request => {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 220_000) throw new Error("PAYLOAD_TOO_LARGE");
  try {
    return await request.json();
  } catch (_) {
    throw new Error("INVALID_JSON");
  }
};

const putAudit = async (env, key, data) => {
  try { await env.AUTH_KV.put(`audit:${key}`, JSON.stringify(data), { expirationTtl: 60 * 60 * 24 * 30 }); } catch (_) {}
};

const personKinds = new Set(["visitante", "cliente", "contato", "fornecedor", "equipe", "outro"]);
const projectStatuses = new Set(["planejamento", "orcamento", "aprovado", "em_andamento", "pausado", "concluido", "cancelado"]);
const projectPriorities = new Set(["baixa", "normal", "alta", "urgente"]);
const paymentStatuses = new Set(["nao_informado", "pendente", "parcial", "pago", "cancelado"]);
const systemKinds = new Set(["cftv", "alarme", "automacao", "cerca_eletrica", "controle_acesso", "interfonia", "rede", "outro"]);
const systemStatuses = new Set(["planejamento", "instalacao", "teste", "operacional", "manutencao", "desativado"]);
const assetStatuses = new Set(["planejado", "instalado", "operacional", "manutencao", "defeito", "substituido", "retirado"]);
const serviceKinds = new Set(["instalacao", "vistoria", "preventiva", "corretiva", "retorno", "expansao", "outro"]);
const serviceStatuses = new Set(["aberta", "agendada", "em_andamento", "concluida", "cancelada"]);
const recordCategories = new Set(["vistoria","rede","cabeamento","checklist","teste","foto","documento","garantia","manutencao","entrega","treinamento","cerca_eletrica_inspecao","observacao"]);

const dateOnly = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
const dateTime = value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(value || "")) ? String(value).slice(0, 16) : "";
const intId = value => { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : 0; };
const nonneg = value => { const n = Number(value); return Number.isFinite(n) && n >= 0 ? Math.min(n, 1e12) : 0; };

const cleanPerson = body => ({
  name: str(body?.name, 120),
  kind: personKinds.has(body?.kind) ? body.kind : "outro",
  phone: str(body?.phone, 40),
  email: str(body?.email, 160).toLowerCase(),
  organization: str(body?.organization, 160),
  documentRef: str(body?.documentRef, 120),
  notes: str(body?.notes, 2000)
});
const cleanSite = body => ({
  name: str(body?.name, 120),
  customerId: intId(body?.customerId),
  address: str(body?.address, 220),
  city: str(body?.city, 100),
  state: str(body?.state, 30),
  postalCode: str(body?.postalCode, 20),
  propertyType: str(body?.propertyType, 80),
  accessNotes: str(body?.accessNotes, 1000),
  infrastructureNotes: str(body?.infrastructureNotes, 1800)
});
const cleanProject = body => ({
  code: str(body?.code, 40).toUpperCase(),
  name: str(body?.name, 120),
  status: projectStatuses.has(body?.status) ? body.status : "planejamento",
  priority: projectPriorities.has(body?.priority) ? body.priority : "normal",
  type: str(body?.type, 100),
  siteId: intId(body?.siteId),
  location: str(body?.location, 160),
  startDate: dateOnly(body?.startDate),
  dueDate: dateOnly(body?.dueDate),
  completedDate: dateOnly(body?.completedDate),
  customerRequest: str(body?.customerRequest, 1800),
  scopeSummary: str(body?.scopeSummary, 2200),
  description: str(body?.description, 2200),
  quotedValue: nonneg(body?.quotedValue),
  approvedValue: nonneg(body?.approvedValue),
  paymentStatus: paymentStatuses.has(body?.paymentStatus) ? body.paymentStatus : "nao_informado",
  notes: str(body?.notes, 2500)
});
const cleanSystem = body => ({
  projectId: intId(body?.projectId),
  kind: systemKinds.has(body?.kind) ? body.kind : "outro",
  name: str(body?.name, 120),
  area: str(body?.area, 120),
  status: systemStatuses.has(body?.status) ? body.status : "planejamento",
  description: str(body?.description, 1600),
  specs: str(body?.specs, 2500),
  notes: str(body?.notes, 1800)
});
const cleanAsset = body => ({
  projectId: intId(body?.projectId),
  systemId: intId(body?.systemId),
  category: str(body?.category, 100),
  brand: str(body?.brand, 100),
  model: str(body?.model, 120),
  serialNumber: str(body?.serialNumber, 120),
  macAddress: str(body?.macAddress, 40),
  ipAddress: str(body?.ipAddress, 64),
  vlan: str(body?.vlan, 40),
  channel: str(body?.channel, 60),
  location: str(body?.location, 160),
  firmware: str(body?.firmware, 100),
  powerSource: str(body?.powerSource, 100),
  installedAt: dateOnly(body?.installedAt),
  warrantyUntil: dateOnly(body?.warrantyUntil),
  status: assetStatuses.has(body?.status) ? body.status : "planejado",
  credentialRef: str(body?.credentialRef, 160),
  specs: str(body?.specs, 2500),
  notes: str(body?.notes, 1800)
});
const cleanRecord = body => ({
  projectId: intId(body?.projectId),
  category: recordCategories.has(body?.category) ? body.category : "observacao",
  title: str(body?.title, 150),
  status: str(body?.status, 80),
  recordDate: dateOnly(body?.recordDate),
  area: str(body?.area, 120),
  details: str(body?.details, 5000),
  referenceUrl: /^https:\/\//i.test(String(body?.referenceUrl || "")) ? str(body.referenceUrl, 500) : ""
});
const cleanMaterial = body => ({
  sku: str(body?.sku, 80),
  name: str(body?.name, 140),
  category: str(body?.category, 100),
  brand: str(body?.brand, 100),
  model: str(body?.model, 120),
  unit: str(body?.unit, 20) || "un",
  currentStock: nonneg(body?.currentStock),
  minStock: nonneg(body?.minStock),
  unitCost: nonneg(body?.unitCost),
  supplierId: intId(body?.supplierId),
  notes: str(body?.notes, 1600)
});
const cleanService = body => ({
  projectId: intId(body?.projectId),
  siteId: intId(body?.siteId),
  kind: serviceKinds.has(body?.kind) ? body.kind : "outro",
  status: serviceStatuses.has(body?.status) ? body.status : "aberta",
  scheduledAt: dateTime(body?.scheduledAt),
  startedAt: dateTime(body?.startedAt),
  finishedAt: dateTime(body?.finishedAt),
  nextMaintenanceAt: dateOnly(body?.nextMaintenanceAt),
  summary: str(body?.summary, 1600),
  technicianNotes: str(body?.technicianNotes, 2500),
  customerNotes: str(body?.customerNotes, 1600)
});
const auditDb = async (env, action, entityType, entityId = "", details = "") => {
  if (!env.DB) return;
  try {
    await env.DB.prepare("INSERT INTO audit_log(action, entity_type, entity_id, details) VALUES(?,?,?,?)")
      .bind(str(action, 80), str(entityType, 80), str(entityId, 80), sanitizeLogText(details)).run();
  } catch (_) {}
};
const dbWriteRate = async (request, env) => consumeRate(env, `dbw:${clientIp(request)}`, 120, 600);


// =========================================================
// G-HOST PLATFORM — contas, portal, dispositivos e analytics
// =========================================================

const getOwnerDeviceIds = async env => {
  try { const raw=await env.AUTH_KV.get("auth:owner_devices"); const list=raw?JSON.parse(raw):[]; return Array.isArray(list)?list.filter(x=>typeof x==="string").slice(0,4):[]; } catch(_){ return []; }
};
const parseOwnerDeviceHeader = request => {
  const raw=String(request.headers.get("X-Ghost-Device")||""); const i=raw.indexOf("."); if(i<1)return null;
  const id=raw.slice(0,i).trim(),secret=raw.slice(i+1).trim(); if(!/^[A-Za-z0-9_-]{8,120}$/.test(id)||!/^[A-Za-z0-9_-]{30,120}$/.test(secret))return null; return {id,secret};
};
const verifyOwnerDevice = async (request,env) => {
  const ids=await getOwnerDeviceIds(env); if(!ids.length)return {required:false,valid:true,deviceId:""};
  const parsed=parseOwnerDeviceHeader(request); if(!parsed||!ids.includes(parsed.id))return {required:true,valid:false,deviceId:parsed?.id||""};
  try{const raw=await env.AUTH_KV.get(`auth:owner_device:${parsed.id}`);if(!raw)return {required:true,valid:false,deviceId:parsed.id};const d=JSON.parse(raw);const h=await digestHex(parsed.secret);if(!(await safeEqual(h,d.secretHash||"")))return {required:true,valid:false,deviceId:parsed.id};const ua=await userAgentHash(request);if(d.uaHash&&!(await safeEqual(d.uaHash,ua)))return {required:true,valid:false,deviceId:parsed.id};d.lastSeenAt=Date.now();d.lastIpHash=await ipPrivacyHash(request,env);await env.AUTH_KV.put(`auth:owner_device:${parsed.id}`,JSON.stringify(d));return {required:true,valid:true,deviceId:parsed.id};}catch(_){return {required:true,valid:false,deviceId:parsed.id};}
};
const enrollFirstOwnerDevice = async (request,env) => {
  const ids=await getOwnerDeviceIds(env);if(ids.length)return null;
  const id=crypto.randomUUID(),secret=randomToken();
  const data={secretHash:await digestHex(secret),uaHash:await userAgentHash(request),firstIpHash:await ipPrivacyHash(request,env),lastIpHash:await ipPrivacyHash(request,env),createdAt:Date.now(),lastSeenAt:Date.now(),label:"Navegador autorizado"};
  await env.AUTH_KV.put(`auth:owner_device:${id}`,JSON.stringify(data));await env.AUTH_KV.put("auth:owner_devices",JSON.stringify([id]));return {deviceId:id,deviceToken:`${id}.${secret}`};
};

const PORTAL_SESSION_TTL = 60 * 60 * 12;
const LEGAL_VERSIONS = {
  terms: { version: "2026-08-20.1", hash: "pending-review" },
  privacy: { version: "2026-08-20.1", hash: "pending-review" }
};
const portalRoles = new Set(["visitante", "cliente", "adm", "dono"]);

const normalizeEmail = value => str(value, 160).toLowerCase();

const sendEmailTo = async (env, to, subject, text) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text })
  });
  if (!response.ok) {
    const provider = await response.json().catch(() => ({}));
    const error = new Error("EMAIL_SEND_FAILED");
    error.status = response.status;
    error.providerCode = str(provider?.name || provider?.code || "", 80);
    throw error;
  }
  return true;
};

const derivePasswordHash = async (password, salt, iterations = 310000) => {
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(String(password)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(String(salt)), iterations }, baseKey, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
};

const ipPrivacyHash = async (request, env) => hmacHex(env.AUTH_PEPPER, `ip|${clientIp(request)}`);
const visitorPrivacyHash = async (env, visitorId) => hmacHex(env.AUTH_PEPPER, `visitor|${String(visitorId || "anonymous").slice(0, 120)}`);

const createUserSession = async (request, env, account) => {
  const token = randomToken();
  const hash = await digestHex(token);
  const createdAt = Date.now();
  const expiresAt = createdAt + PORTAL_SESSION_TTL * 1000;
  const data = {
    accountId: Number(account.id),
    personId: Number(account.person_id),
    email: String(account.email || ""),
    role: portalRoles.has(account.role) ? account.role : "visitante",
    authVersion: Number(account.auth_version || 1),
    createdAt,
    expiresAt,
    uaHash: await userAgentHash(request)
  };
  await env.AUTH_KV.put(`user-session:${hash}`, JSON.stringify(data), { expirationTtl: PORTAL_SESSION_TTL });
  return { token, expiresAt, expiresIn: PORTAL_SESSION_TTL, data };
};

const getUserSession = async (request, env) => {
  const token = getBearer(request);
  if (!token) return null;
  const hash = await digestHex(token);
  const raw = await env.AUTH_KV.get(`user-session:${hash}`);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data.expiresAt || Date.now() >= Number(data.expiresAt)) {
      await env.AUTH_KV.delete(`user-session:${hash}`);
      return null;
    }
    const uaHash = await userAgentHash(request);
    if (!data.uaHash || !(await safeEqual(data.uaHash, uaHash))) return null;
    return { token, hash, data };
  } catch (_) { return null; }
};

const getPortalAccount = async (request, env) => {
  const session = await getUserSession(request, env);
  if (!session || !env.DB) return null;
  const account = await env.DB.prepare(`
    SELECT ua.id,ua.person_id,ua.email,ua.role,ua.permissions_json,ua.email_verified,ua.active,ua.camera_device_limit,ua.auth_version,
           p.name,p.phone,p.organization,p.kind
    FROM user_accounts ua JOIN people p ON p.id=ua.person_id
    WHERE ua.id=? AND ua.active=1 AND ua.email_verified=1 LIMIT 1
  `).bind(session.data.accountId).first();
  if (!account) return null;
  if (Number(session.data.authVersion || 1) !== Number(account.auth_version || 1)) { await env.AUTH_KV.delete(`user-session:${session.hash}`).catch(()=>{}); return null; }
  return { session, account };
};

const portalAudit = async (env, accountId, eventType, severity, summary, request, deviceId = "", details = {}) => {
  if (!env.DB) return;
  try {
    await env.DB.prepare("INSERT INTO security_events(account_id,event_type,severity,ip_hash,device_id,summary,details_json) VALUES(?,?,?,?,?,?,?)")
      .bind(accountId || null, str(eventType,80), str(severity,20), await ipPrivacyHash(request, env), str(deviceId,120), str(summary,500), JSON.stringify(details).slice(0,4000)).run();
  } catch (_) {}
};

const notifyAccount = async (env, accountId, severity, title, body, actionUrl = "") => {
  if (!env.DB || !accountId) return;
  try {
    await env.DB.prepare("INSERT INTO notifications(account_id,severity,title,body,action_url) VALUES(?,?,?,?,?)")
      .bind(accountId, str(severity,20), str(title,140), str(body,1200), str(actionUrl,300)).run();
  } catch (_) {}
};

const parseDeviceHeader = request => {
  const raw = String(request.headers.get("X-Ghost-Device") || "");
  const idx = raw.indexOf(".");
  if (idx < 1) return null;
  const deviceId = raw.slice(0, idx).trim();
  const secret = raw.slice(idx + 1).trim();
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(deviceId) || !/^[A-Za-z0-9_-]{30,120}$/.test(secret)) return null;
  return { deviceId, secret };
};

const verifyCameraDevice = async (request, env, account) => {
  const parsed = parseDeviceHeader(request);
  if (!parsed) return null;
  const row = await env.DB.prepare("SELECT id,device_secret_hash,status,purpose FROM user_devices WHERE account_id=? AND device_id=? LIMIT 1")
    .bind(account.id, parsed.deviceId).first();
  if (!row || row.status !== "trusted" || row.purpose !== "camera") return null;
  const candidate = await digestHex(parsed.secret);
  if (!(await safeEqual(candidate, row.device_secret_hash || ""))) return null;
  await env.DB.prepare("UPDATE user_devices SET last_ip_hash=?,user_agent_hash=?,last_seen_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(await ipPrivacyHash(request, env), await userAgentHash(request), row.id).run().catch(()=>{});
  return { id: row.id, deviceId: parsed.deviceId };
};


const getStaffTotpState = async (env, accountId) => {
  const secretKey=`staff:totp_secret:${accountId}`, enrolledKey=`staff:totp_enrolled:${accountId}`;
  let secret=await env.AUTH_KV.get(secretKey);const enrolled=(await env.AUTH_KV.get(enrolledKey))==="1";
  if(!secret){secret=randomBase32(20);await env.AUTH_KV.put(secretKey,secret);}
  return {secret,enrolled,secretKey,enrolledKey};
};

const createStaffSession = async (request,env,account) => {
  const token=randomToken(),hash=await digestHex(token),createdAt=Date.now(),ttl=1800,expiresAt=createdAt+ttl*1000;
  let permissions={};try{permissions=JSON.parse(account.permissions_json||"{}")}catch(_){}
  const data={accountId:Number(account.id),personId:Number(account.person_id),email:String(account.email||""),role:"adm",permissions,authVersion:Number(account.auth_version||1),createdAt,expiresAt,uaHash:await userAgentHash(request)};
  await env.AUTH_KV.put(`staff-session:${hash}`,JSON.stringify(data),{expirationTtl:ttl});return {token,hash,data,expiresAt,expiresIn:ttl};
};

const getStaffSession = async (request,env) => {
  const token=getBearer(request);if(!token)return null;const hash=await digestHex(token),raw=await env.AUTH_KV.get(`staff-session:${hash}`);if(!raw)return null;
  try{const data=JSON.parse(raw);if(!data.expiresAt||Date.now()>=Number(data.expiresAt)){await env.AUTH_KV.delete(`staff-session:${hash}`);return null;}if(!(await safeEqual(data.uaHash||"",await userAgentHash(request))))return null;
    const account=await env.DB.prepare("SELECT id,person_id,email,role,permissions_json,active,auth_version FROM user_accounts WHERE id=? AND role='adm' AND active=1 LIMIT 1").bind(data.accountId).first();if(!account)return null;if(Number(data.authVersion||1)!==Number(account.auth_version||1)){await env.AUTH_KV.delete(`staff-session:${hash}`).catch(()=>{});return null;}let permissions={};try{permissions=JSON.parse(account.permissions_json||"{}")}catch(_){}
    data.permissions=permissions;return {token,hash,data,account};
  }catch(_){return null;}
};

const getControlSession = async (request,env,permission="") => {
  const owner=await getSession(request,env);if(owner)return {kind:"owner",...owner,permissions:{all:true}};
  if(!env.DB)return null;const staff=await getStaffSession(request,env);if(!staff)return null;if(permission&&!staff.data.permissions?.[permission])return null;return {kind:"staff",...staff,permissions:staff.data.permissions||{}};
};

const verifyAccountPurposeDevice = async (request,env,accountId,purpose) => {
  const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM user_devices WHERE account_id=? AND purpose=? AND status='trusted'").bind(accountId,purpose).first();
  if(Number(count?.n||0)===0)return {required:false,valid:true};const parsed=parseDeviceHeader(request);if(!parsed)return {required:true,valid:false};
  const row=await env.DB.prepare("SELECT id,device_secret_hash,user_agent_hash FROM user_devices WHERE account_id=? AND device_id=? AND purpose=? AND status='trusted' LIMIT 1").bind(accountId,parsed.deviceId,purpose).first();if(!row)return {required:true,valid:false};
  if(!(await safeEqual(await digestHex(parsed.secret),row.device_secret_hash||"")))return {required:true,valid:false};if(row.user_agent_hash&&!(await safeEqual(row.user_agent_hash,await userAgentHash(request))))return {required:true,valid:false};
  await env.DB.prepare("UPDATE user_devices SET last_ip_hash=?,last_seen_at=CURRENT_TIMESTAMP WHERE id=?").bind(await ipPrivacyHash(request,env),row.id).run().catch(()=>{});return {required:true,valid:true,deviceId:parsed.deviceId};
};

const enrollStaffDeviceIfNeeded = async (request,env,accountId) => {
  const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM user_devices WHERE account_id=? AND purpose='admin' AND status='trusted'").bind(accountId).first();if(Number(count?.n||0)>0)return null;
  const deviceId=crypto.randomUUID(),secret=randomToken(),secretHash=await digestHex(secret),ipHash=await ipPrivacyHash(request,env),uaHash=await userAgentHash(request);
  await env.DB.prepare("INSERT INTO user_devices(account_id,device_id,device_secret_hash,label,purpose,status,first_ip_hash,last_ip_hash,user_agent_hash) VALUES(?,?,?,?, 'admin','trusted',?,?,?)").bind(accountId,deviceId,secretHash,"ADM · navegador autorizado",ipHash,ipHash,uaHash).run();
  return {deviceToken:`${deviceId}.${secret}`,deviceId};
};

const clientOwnershipSql = `
  SELECT DISTINCT p.id FROM projects p
  LEFT JOIN sites s ON s.id=p.site_id
  LEFT JOIN project_people pp ON pp.project_id=p.id
  WHERE s.customer_id=? OR pp.person_id=?
`;


export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);
    const requestId = crypto.randomUUID();
    let failureStage = "routing";

    if (request.method === "OPTIONS") {
      if (!origin) return new Response(null, { status: 403, headers: securityHeaders });
      return new Response(null, { status: 204, headers: { ...securityHeaders, ...corsHeaders(origin) } });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true });
    }

    if (!origin) return json({ error: "Origem não autorizada." }, 403);
    const cors = corsHeaders(origin);
    if (!requireSecrets(env)) return json({ error: "Backend de segurança incompleto." }, 503, cors);

    if (url.pathname === "/portal/readiness" && request.method === "GET") {
      let database = false;
      let schemaReady = false;
      let kv = false;
      try {
        database = Boolean((await env.DB?.prepare("SELECT 1 AS ok").first())?.ok);
        if (database) {
          const row = await env.DB.prepare(
            "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('user_accounts','people','legal_acceptances')"
          ).first();
          schemaReady = Number(row?.n || 0) === 3;
        }
      } catch (_) {}
      try { if (env.AUTH_KV) { await env.AUTH_KV.get("health:probe"); kv = true; } } catch (_) {}
      const emailConfigured = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
      const ok = database && schemaReady && kv && emailConfigured;
      // Não expõe ao navegador quais componentes internos estão configurados.
      return json({ ok, code: ok ? "READY" : "SERVICE_UNAVAILABLE" }, ok ? 200 : 503, cors);
    }

    try {
      // ---------------------------------------------------------
      // Analytics com minimização de dados (somente após consentimento no front)
      // ---------------------------------------------------------
      if (url.pathname === "/analytics/event" && request.method === "POST") {
        if (!env.DB) return json({ ok: true }, 202, cors);
        const ip = clientIp(request);
        if (!(await consumeRate(env, `analytics:${ip}`, 90, 600))) return json({ ok: true }, 202, cors);
        const body = await parseJson(request);
        const allowedEvents = new Set([
          "visitou_site","visualizou_secao","clicou_servico","selecionou_plano","alterou_configurador",
          "salvou_projeto","solicitou_orcamento","clicou_whatsapp","abriu_area_cliente","iniciou_cadastro","concluiu_cadastro"
        ]);
        const eventType = str(body?.eventType, 60);
        if (!allowedEvents.has(eventType)) return json({ ok: true }, 202, cors);
        let accountId = null;
        const us = await getUserSession(request, env);
        if (us) accountId = Number(us.data.accountId || 0) || null;
        let referrerHost = "";
        try { referrerHost = body?.referrer ? new URL(String(body.referrer)).hostname.slice(0,160) : ""; } catch (_) {}
        const visitorHash = await visitorPrivacyHash(env, str(body?.visitorId, 120));
        await env.DB.prepare("INSERT INTO analytics_events(visitor_hash,account_id,event_type,page,target,category,referrer_host,device_class) VALUES(?,?,?,?,?,?,?,?)")
          .bind(visitorHash, accountId, eventType, str(body?.page,180), str(body?.target,120), str(body?.category,100), referrerHost, str(body?.deviceClass,30)).run().catch(()=>{});
        return json({ ok: true }, 202, cors);
      }

      // ---------------------------------------------------------
      // Cadastro público. Toda conta nasce como VISITANTE.
      // ---------------------------------------------------------
      if (url.pathname === "/portal/register/start" && request.method === "POST") {
        failureStage = "portal_register_precheck";
        if (!env.DB) return json({ error: "Serviço temporariamente indisponível." }, 503, cors);
        const ip = clientIp(request);
        failureStage = "portal_register_rate_limit";
        if (!(await consumeRate(env, `portal-register:${ip}`, 6, 900))) return json({ error: "Muitas tentativas de cadastro. Aguarde alguns minutos." }, 429, cors);
        failureStage = "portal_register_parse";
        const body = await parseJson(request);
        const name = str(body?.name, 120);
        const email = normalizeEmail(body?.email);
        const phone = str(body?.phone, 40);
        const password = String(body?.password || "");
        const acceptTerms = body?.acceptTerms === true;
        const acknowledgePrivacy = body?.acknowledgePrivacy === true;
        if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Nome e e-mail válidos são obrigatórios." }, 400, cors);
        if (password.length < 12 || password.length > 128) return json({ error: "A senha precisa ter entre 12 e 128 caracteres." }, 400, cors);
        if (!acceptTerms || !acknowledgePrivacy) return json({ error: "Leia e confirme os Termos de Uso e o Aviso de Privacidade para criar a conta." }, 400, cors);
        failureStage = "portal_register_account_lookup";
        const existing = await env.DB.prepare("SELECT id FROM user_accounts WHERE lower(email)=? LIMIT 1").bind(email).first();
        if (existing) return json({ error: "Já existe uma conta com este e-mail." }, 409, cors);

        const challengeId = crypto.randomUUID();
        const code = randomDigits(6);
        const salt = randomToken().slice(0, 32);
        const iterations = 310000;
        failureStage = "portal_register_password_hash";
        const passwordHash = await derivePasswordHash(password, salt, iterations);
        failureStage = "portal_register_challenge_mac";
        const codeMac = await hmacHex(env.AUTH_PEPPER, `${challengeId}|portal-register|${email}|${code}`);
        failureStage = "portal_register_challenge_store";
        await env.AUTH_KV.put(`portal-challenge:${challengeId}`, JSON.stringify({
          type: "register", name, email, phone, salt, passwordHash, iterations, codeMac,
          attempts: 0, uaHash: await userAgentHash(request), createdAt: Date.now(), expiresAt: Date.now() + 600000
        }), { expirationTtl: 600 });
        try {
          failureStage = "portal_register_email";
          await sendEmailTo(env, email, "Confirme sua conta G-Host", `Seu código de confirmação G-Host é: ${code}. Ele expira em 10 minutos. Se você não solicitou este cadastro, ignore esta mensagem.`);
        } catch (error) {
          await env.AUTH_KV.delete(`portal-challenge:${challengeId}`).catch(()=>{});
          console.error("portal_register_email_failed", { status: Number(error?.status || 0), providerCode: String(error?.providerCode || "").slice(0,80) });
          return json({
            error: "Não foi possível enviar o código de confirmação por e-mail. Tente novamente em alguns instantes.",
            code: "EMAIL_UNAVAILABLE"
          }, 503, cors);
        }
        failureStage = "portal_register_audit";
        await portalAudit(env, null, "register_started", "info", "Cadastro público iniciado", request, "", { emailHash: await hmacHex(env.AUTH_PEPPER, email) });
        return json({ ok: true, challengeId, maskedEmail: maskEmail(email), expiresIn: 600 }, 200, cors);
      }

      if (url.pathname === "/portal/register/verify" && request.method === "POST") {
        if (!env.DB) return json({ error: "Banco D1 não configurado." }, 503, cors);
        const ip = clientIp(request);
        if (!(await consumeRate(env, `portal-register-verify:${ip}`, 10, 900))) return json({ error: "Muitas tentativas. Aguarde alguns minutos." }, 429, cors);
        const body = await parseJson(request);
        const challengeId = str(body?.challengeId, 80);
        const code = String(body?.code || "").replace(/\D/g, "");
        if (!challengeId || !/^\d{6}$/.test(code)) return json({ error: "Código inválido." }, 400, cors);
        const key = `portal-challenge:${challengeId}`;
        const raw = await env.AUTH_KV.get(key);
        if (!raw) return json({ error: "Código expirado. Recomece o cadastro." }, 401, cors);
        const challenge = JSON.parse(raw);
        if (challenge.type !== "register" || Date.now() >= Number(challenge.expiresAt || 0)) {
          await env.AUTH_KV.delete(key); return json({ error: "Código expirado. Recomece o cadastro." }, 401, cors);
        }
        if (!(await safeEqual(challenge.uaHash || "", await userAgentHash(request)))) {
          await env.AUTH_KV.delete(key); return json({ error: "A confirmação mudou de navegador. Recomece o cadastro." }, 401, cors);
        }
        challenge.attempts = Number(challenge.attempts || 0) + 1;
        if (challenge.attempts > 7) { await env.AUTH_KV.delete(key); return json({ error: "Limite de tentativas excedido." }, 429, cors); }
        const expected = await hmacHex(env.AUTH_PEPPER, `${challengeId}|portal-register|${challenge.email}|${code}`);
        if (!(await safeEqual(expected, challenge.codeMac || ""))) {
          await env.AUTH_KV.put(key, JSON.stringify(challenge), { expirationTtl: 600 });
          return json({ error: "Código incorreto." }, 401, cors);
        }
        const duplicate = await env.DB.prepare("SELECT id FROM user_accounts WHERE lower(email)=? LIMIT 1").bind(challenge.email).first();
        if (duplicate) { await env.AUTH_KV.delete(key); return json({ error: "Esta conta já foi criada." }, 409, cors); }
        let person = await env.DB.prepare("SELECT id FROM people WHERE lower(email)=? AND active=1 ORDER BY id LIMIT 1").bind(challenge.email).first();
        let personId = Number(person?.id || 0);
        if (!personId) {
          const pr = await env.DB.prepare("INSERT INTO people(name,kind,phone,email,organization,document_ref,notes,updated_at) VALUES(?,'visitante',?,?, '', '', '', CURRENT_TIMESTAMP)")
            .bind(challenge.name, challenge.phone, challenge.email).run();
          personId = Number(pr.meta?.last_row_id || 0);
        }
        if (!personId) return json({ error: "Não foi possível criar o cadastro." }, 500, cors);
        const ar = await env.DB.prepare("INSERT INTO user_accounts(person_id,email,password_salt,password_hash,password_iterations,role,email_verified,active,updated_at) VALUES(?,?,?,?,?,'visitante',1,1,CURRENT_TIMESTAMP)")
          .bind(personId, challenge.email, challenge.salt, challenge.passwordHash, Number(challenge.iterations || 310000)).run();
        const accountId = Number(ar.meta?.last_row_id || 0);
        if (!accountId) return json({ error: "Não foi possível criar a conta." }, 500, cors);
        const ipHash = await ipPrivacyHash(request, env);
        await env.DB.batch([
          env.DB.prepare("INSERT INTO legal_acceptances(account_id,document_code,document_version,document_hash,ip_hash,evidence_json) VALUES(?,?,?,?,?,?)")
            .bind(accountId,"terms",LEGAL_VERSIONS.terms.version,LEGAL_VERSIONS.terms.hash,ipHash,JSON.stringify({method:"email_otp",ack:true})),
          env.DB.prepare("INSERT INTO legal_acceptances(account_id,document_code,document_version,document_hash,ip_hash,evidence_json) VALUES(?,?,?,?,?,?)")
            .bind(accountId,"privacy",LEGAL_VERSIONS.privacy.version,LEGAL_VERSIONS.privacy.hash,ipHash,JSON.stringify({method:"email_otp",acknowledged:true}))
        ]).catch(()=>{});
        const session = await createUserSession(request, env, { id: accountId, person_id: personId, email: challenge.email, role: "visitante" });
        await env.AUTH_KV.delete(key);
        await portalAudit(env, accountId, "register_completed", "info", "Conta criada e e-mail confirmado", request);
        return json({ ok: true, token: session.token, expiresAt: session.expiresAt, expiresIn: session.expiresIn, role: "visitante" }, 201, cors);
      }

      if (url.pathname === "/portal/login" && request.method === "POST") {
        if (!env.DB) return json({ error: "Banco D1 não configurado." }, 503, cors);
        const ip = clientIp(request);
        if (!(await consumeRate(env, `portal-login:${ip}`, 8, 600))) return json({ error: "Muitas tentativas. Aguarde alguns minutos." }, 429, cors);
        const body = await parseJson(request);
        const email = normalizeEmail(body?.email);
        const password = String(body?.password || "");
        const account = await env.DB.prepare("SELECT id,person_id,email,password_salt,password_hash,password_iterations,role,email_verified,active,auth_version FROM user_accounts WHERE lower(email)=? LIMIT 1")
          .bind(email).first();
        if (!account || !account.active || !account.email_verified) return json({ error: "E-mail ou senha inválidos." }, 401, cors);
        const candidate = await derivePasswordHash(password, account.password_salt, Number(account.password_iterations || 310000));
        if (!(await safeEqual(candidate, account.password_hash || ""))) {
          await portalAudit(env, Number(account.id), "login_failed", "warning", "Tentativa de login inválida", request);
          return json({ error: "E-mail ou senha inválidos." }, 401, cors);
        }
        const session = await createUserSession(request, env, account);
        await env.DB.prepare("UPDATE user_accounts SET last_login_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(account.id).run();
        await portalAudit(env, Number(account.id), "login_success", "info", "Login realizado", request);
        return json({ ok: true, token: session.token, expiresAt: session.expiresAt, expiresIn: session.expiresIn, role: account.role }, 200, cors);
      }

      if (url.pathname === "/portal/logout" && request.method === "POST") {
        const us = await getUserSession(request, env);
        if (us) await env.AUTH_KV.delete(`user-session:${us.hash}`);
        return json({ ok: true }, 200, cors);
      }

      if (url.pathname === "/portal/password/reset/start" && request.method === "POST") {
        if (!env.DB) return json({ ok: true }, 200, cors);
        const ip = clientIp(request);
        if (!(await consumeRate(env, `portal-reset:${ip}`, 5, 900))) return json({ error: "Muitas solicitações. Aguarde alguns minutos." }, 429, cors);
        const body = await parseJson(request);
        const email = normalizeEmail(body?.email);
        const account = await env.DB.prepare("SELECT id,email FROM user_accounts WHERE lower(email)=? AND active=1 LIMIT 1").bind(email).first();
        if (account) {
          const challengeId = crypto.randomUUID();
          const code = randomDigits(6);
          const codeMac = await hmacHex(env.AUTH_PEPPER, `${challengeId}|portal-reset|${account.id}|${code}`);
          await env.AUTH_KV.put(`portal-reset:${challengeId}`, JSON.stringify({ accountId:Number(account.id), email:account.email, codeMac, attempts:0, uaHash:await userAgentHash(request), expiresAt:Date.now()+600000 }), { expirationTtl:600 });
          try { await sendEmailTo(env, account.email, "Redefinição de senha G-Host", `Seu código para redefinir a senha é: ${code}. Ele expira em 10 minutos.`); } catch (_) {}
          return json({ ok: true, challengeId, maskedEmail: maskEmail(email), expiresIn: 600 }, 200, cors);
        }
        return json({ ok: true, challengeId: "", maskedEmail: maskEmail(email), expiresIn: 600 }, 200, cors);
      }

      if (url.pathname === "/portal/password/reset/verify" && request.method === "POST") {
        if (!env.DB) return json({ error: "Banco D1 não configurado." }, 503, cors);
        const body = await parseJson(request);
        const challengeId = str(body?.challengeId,80);
        const code = String(body?.code || "").replace(/\D/g,"");
        const password = String(body?.password || "");
        if (!challengeId || !/^\d{6}$/.test(code) || password.length < 12 || password.length > 128) return json({ error: "Dados de redefinição inválidos." }, 400, cors);
        const key=`portal-reset:${challengeId}`; const raw=await env.AUTH_KV.get(key); if(!raw)return json({error:"Código expirado."},401,cors);
        const c=JSON.parse(raw); if(Date.now()>=Number(c.expiresAt||0)||!(await safeEqual(c.uaHash||"",await userAgentHash(request)))){await env.AUTH_KV.delete(key);return json({error:"Código expirado."},401,cors)}
        c.attempts=Number(c.attempts||0)+1;if(c.attempts>7){await env.AUTH_KV.delete(key);return json({error:"Limite de tentativas excedido."},429,cors)}
        const expected=await hmacHex(env.AUTH_PEPPER,`${challengeId}|portal-reset|${c.accountId}|${code}`); if(!(await safeEqual(expected,c.codeMac||""))){await env.AUTH_KV.put(key,JSON.stringify(c),{expirationTtl:600});return json({error:"Código incorreto."},401,cors)}
        const salt=randomToken().slice(0,32),iterations=310000,hash=await derivePasswordHash(password,salt,iterations);
        await env.DB.prepare("UPDATE user_accounts SET password_salt=?,password_hash=?,password_iterations=?,auth_version=auth_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(salt,hash,iterations,c.accountId).run();
        await env.AUTH_KV.delete(key); await portalAudit(env,Number(c.accountId),"password_reset","warning","Senha redefinida",request); return json({ok:true},200,cors);
      }

      // ---------------------------------------------------------
      // Portal autenticado
      // ---------------------------------------------------------
      if (url.pathname === "/portal/me" && request.method === "GET") {
        const ctx = await getPortalAccount(request, env);
        if (!ctx) return json({ error: "Sessão inválida ou expirada." }, 401, cors);
        let permissions={}; try{permissions=JSON.parse(ctx.account.permissions_json||"{}")}catch(_){}
        return json({ ok:true, person:{ id:ctx.account.person_id,name:ctx.account.name,email:ctx.account.email,phone:ctx.account.phone,organization:ctx.account.organization }, role:ctx.account.role, permissions, cameraDeviceLimit:Number(ctx.account.camera_device_limit||2), expiresAt:ctx.session.data.expiresAt },200,cors);
      }

      if (url.pathname === "/portal/dashboard" && request.method === "GET") {
        const ctx=await getPortalAccount(request,env); if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);
        const personId=Number(ctx.account.person_id),accountId=Number(ctx.account.id);
        const configs=await env.DB.prepare("SELECT id,name,plan_id,status,created_at,updated_at FROM saved_configurations WHERE account_id=? ORDER BY updated_at DESC LIMIT 20").bind(accountId).all();
        const quotes=await env.DB.prepare("SELECT id,configuration_id,status,contact_preference,created_at,updated_at FROM quote_requests WHERE account_id=? ORDER BY created_at DESC LIMIT 20").bind(accountId).all();
        const notes=await env.DB.prepare("SELECT id,severity,title,body,action_url,created_at,read_at FROM notifications WHERE account_id=? ORDER BY created_at DESC LIMIT 30").bind(accountId).all();
        const tickets=await env.DB.prepare("SELECT id,category,priority,status,subject,description,created_at,updated_at FROM support_tickets WHERE account_id=? ORDER BY updated_at DESC LIMIT 30").bind(accountId).all();
        let projects={results:[]},sites={results:[]},assets={results:[]},services={results:[]};
        const contracts=await env.DB.prepare("SELECT id,code,plan_id,status,version,starts_at,ends_at,signed_at,updated_at FROM contracts WHERE person_id=? ORDER BY updated_at DESC LIMIT 50").bind(personId).all();
        if (["cliente","adm","dono"].includes(ctx.account.role)) {
          projects=await env.DB.prepare(`SELECT DISTINCT p.id,p.code,p.name,p.status,p.type,p.location,p.due_date,p.updated_at FROM projects p LEFT JOIN sites s ON s.id=p.site_id LEFT JOIN project_people pp ON pp.project_id=p.id WHERE s.customer_id=? OR pp.person_id=? ORDER BY p.updated_at DESC LIMIT 100`).bind(personId,personId).all();
          sites=await env.DB.prepare("SELECT id,name,address,city,state,property_type FROM sites WHERE customer_id=? AND active=1 ORDER BY name LIMIT 100").bind(personId).all();
          assets=await env.DB.prepare(`SELECT DISTINCT a.id,a.category,a.brand,a.model,a.location,a.warranty_until,a.status,p.name AS project_name FROM assets a JOIN projects p ON p.id=a.project_id LEFT JOIN sites s ON s.id=p.site_id LEFT JOIN project_people pp ON pp.project_id=p.id WHERE s.customer_id=? OR pp.person_id=? ORDER BY a.updated_at DESC LIMIT 300`).bind(personId,personId).all();
          services=await env.DB.prepare(`SELECT DISTINCT so.id,so.kind,so.status,so.next_maintenance_at,so.summary,p.name AS project_name,s.name AS site_name FROM service_orders so LEFT JOIN projects p ON p.id=so.project_id LEFT JOIN sites s ON s.id=COALESCE(so.site_id,p.site_id) LEFT JOIN project_people pp ON pp.project_id=p.id WHERE s.customer_id=? OR pp.person_id=? ORDER BY so.updated_at DESC LIMIT 150`).bind(personId,personId).all();
        }
        return json({ok:true,role:ctx.account.role,projects:projects.results||[],sites:sites.results||[],assets:assets.results||[],services:services.results||[],contracts:contracts.results||[],configurations:configs.results||[],quotes:quotes.results||[],notifications:notes.results||[],supportTickets:tickets.results||[]},200,cors);
      }

      if (url.pathname === "/portal/configurations" && request.method === "GET") {
        const ctx=await getPortalAccount(request,env); if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);
        const r=await env.DB.prepare("SELECT id,name,plan_id,items_json,totals_json,status,created_at,updated_at FROM saved_configurations WHERE account_id=? ORDER BY updated_at DESC LIMIT 50").bind(ctx.account.id).all();
        return json({ok:true,items:r.results||[]},200,cors);
      }

      if (url.pathname === "/portal/configurations" && request.method === "POST") {
        const ctx=await getPortalAccount(request,env); if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);
        if(!(await consumeRate(env,`portal-config:${ctx.account.id}`,30,600)))return json({error:"Muitas alterações em pouco tempo."},429,cors);
        const b=await parseJson(request),name=str(b?.name||"Meu projeto G-Host",120),planId=str(b?.planId,60),status=["rascunho","enviado"].includes(b?.status)?b.status:"rascunho";
        const items=(b?.items&&typeof b.items==="object"&&!Array.isArray(b.items))?b.items:{}; const totals=(b?.totals&&typeof b.totals==="object"&&!Array.isArray(b.totals))?b.totals:{};
        const itemsJson=JSON.stringify(items),totalsJson=JSON.stringify(totals); if(itemsJson.length>80000||totalsJson.length>10000)return json({error:"Configuração muito grande."},413,cors);
        const r=await env.DB.prepare("INSERT INTO saved_configurations(account_id,name,plan_id,items_json,totals_json,status,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(ctx.account.id,name,planId,itemsJson,totalsJson,status).run();
        await auditDb(env,"create","saved_configuration",String(r.meta?.last_row_id||""),`account:${ctx.account.id}`); return json({ok:true,id:r.meta?.last_row_id||null},201,cors);
      }

      const configMatch=/^\/portal\/configurations\/(\d+)$/.exec(url.pathname);
      if(configMatch && request.method==="DELETE"){
        const ctx=await getPortalAccount(request,env);if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);const id=intId(configMatch[1]);
        await env.DB.prepare("DELETE FROM saved_configurations WHERE id=? AND account_id=?").bind(id,ctx.account.id).run();return json({ok:true},200,cors);
      }

      if (url.pathname === "/portal/quotes" && request.method === "POST") {
        const ctx=await getPortalAccount(request,env); if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);
        if(!(await consumeRate(env,`portal-quote:${ctx.account.id}`,10,3600)))return json({error:"Muitas solicitações em pouco tempo."},429,cors);
        const b=await parseJson(request),configurationId=intId(b?.configurationId),preference=["whatsapp","email","telefone"].includes(b?.contactPreference)?b.contactPreference:"whatsapp",notes=str(b?.notes,1200);
        if(configurationId){const own=await env.DB.prepare("SELECT id FROM saved_configurations WHERE id=? AND account_id=?").bind(configurationId,ctx.account.id).first();if(!own)return json({error:"Projeto salvo não encontrado."},404,cors)}
        const r=await env.DB.prepare("INSERT INTO quote_requests(account_id,configuration_id,status,contact_preference,notes,updated_at) VALUES(?,?,'novo',?,?,CURRENT_TIMESTAMP)").bind(ctx.account.id,configurationId||null,preference,notes).run();
        await notifyAccount(env,ctx.account.id,"success","Solicitação recebida","Sua solicitação de proposta foi registrada. A G-Host poderá entrar em contato pelos dados cadastrados.","");
        await auditDb(env,"create","quote_request",String(r.meta?.last_row_id||""),`account:${ctx.account.id}`);return json({ok:true,id:r.meta?.last_row_id||null},201,cors);
      }

      if (url.pathname === "/portal/devices" && request.method === "GET") {
        const ctx=await getPortalAccount(request,env);if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);
        const r=await env.DB.prepare("SELECT id,device_id,label,purpose,status,created_at,last_seen_at,revoked_at FROM user_devices WHERE account_id=? ORDER BY last_seen_at DESC").bind(ctx.account.id).all();return json({ok:true,items:r.results||[],cameraDeviceLimit:Number(ctx.account.camera_device_limit||2)},200,cors);
      }

      if (url.pathname === "/portal/devices/register" && request.method === "POST") {
        const ctx=await getPortalAccount(request,env);if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);
        const b=await parseJson(request),deviceId=str(b?.deviceId,120),label=str(b?.label||"Meu aparelho",100),purpose=b?.purpose==="camera"?"camera":"portal";
        if(!/^[A-Za-z0-9_-]{8,120}$/.test(deviceId))return json({error:"Identificador do aparelho inválido."},400,cors);
        if(purpose==="camera" && !["cliente","adm","dono"].includes(ctx.account.role))return json({error:"O acesso CFTV é liberado somente para clientes autorizados."},403,cors);
        const existing=await env.DB.prepare("SELECT id,status,purpose FROM user_devices WHERE account_id=? AND device_id=? LIMIT 1").bind(ctx.account.id,deviceId).first();
        if(purpose==="camera" && !existing){
          const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM user_devices WHERE account_id=? AND purpose='camera' AND status='trusted'").bind(ctx.account.id).first();
          if(Number(count?.n||0)>=Number(ctx.account.camera_device_limit||2)){
            await portalAudit(env,ctx.account.id,"camera_device_limit","critical","Novo aparelho CFTV bloqueado: limite atingido",request,deviceId,{limit:Number(ctx.account.camera_device_limit||2)});
            await notifyAccount(env,ctx.account.id,"critical","Tentativa de novo aparelho bloqueada","Um novo aparelho tentou ser autorizado para visualizar as câmeras, mas o limite do contrato foi atingido.","cliente.html#devices");
            if (await consumeRate(env,`camera-alert-email:${ctx.account.id}`,3,3600)) { try { await sendEmailTo(env,ctx.account.email,"Alerta de segurança G-Host","Um novo aparelho tentou ser autorizado para visualizar suas câmeras, mas o limite permitido foi atingido. A tentativa foi bloqueada. Entre na Minha G-Host para revisar seus aparelhos autorizados."); } catch (_) {} }
            return json({error:"Limite de aparelhos autorizados para CFTV atingido.",code:"DEVICE_LIMIT"},403,cors);
          }
        }
        const secret=randomToken(),secretHash=await digestHex(secret),ipHash=await ipPrivacyHash(request,env),uaHash=await userAgentHash(request);
        if(existing){
          await env.DB.prepare("UPDATE user_devices SET device_secret_hash=?,label=?,purpose=?,status='trusted',last_ip_hash=?,user_agent_hash=?,last_seen_at=CURRENT_TIMESTAMP,revoked_at='' WHERE id=?")
            .bind(secretHash,label,purpose,ipHash,uaHash,existing.id).run();
        }else{
          await env.DB.prepare("INSERT INTO user_devices(account_id,device_id,device_secret_hash,label,purpose,status,first_ip_hash,last_ip_hash,user_agent_hash) VALUES(?,?,?,?,?,'trusted',?,?,?)")
            .bind(ctx.account.id,deviceId,secretHash,label,purpose,ipHash,ipHash,uaHash).run();
        }
        await portalAudit(env,ctx.account.id,"device_registered","info",`Aparelho autorizado para ${purpose}`,request,deviceId);
        return json({ok:true,deviceToken:`${deviceId}.${secret}`,purpose},201,cors);
      }

      const revokeDevice=/^\/portal\/devices\/(\d+)\/revoke$/.exec(url.pathname);
      if(revokeDevice && request.method==="POST"){
        const ctx=await getPortalAccount(request,env);if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);const id=intId(revokeDevice[1]);
        await env.DB.prepare("UPDATE user_devices SET status='revoked',revoked_at=CURRENT_TIMESTAMP WHERE id=? AND account_id=?").bind(id,ctx.account.id).run();await portalAudit(env,ctx.account.id,"device_revoked","warning","Aparelho revogado pelo usuário",request,String(id));return json({ok:true},200,cors);
      }

      if (url.pathname === "/portal/cameras" && request.method === "GET") {
        const ctx=await getPortalAccount(request,env);if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);
        if(!["cliente","adm","dono"].includes(ctx.account.role))return json({error:"CFTV ainda não está liberado para esta conta.",code:"NOT_CLIENT"},403,cors);
        const device=await verifyCameraDevice(request,env,ctx.account);
        if(!device){await portalAudit(env,ctx.account.id,"camera_access_blocked","critical","Acesso CFTV bloqueado por aparelho não autorizado",request,parseDeviceHeader(request)?.deviceId||"");await notifyAccount(env,ctx.account.id,"critical","Acesso às câmeras bloqueado","Uma tentativa de acesso às câmeras foi bloqueada porque o aparelho não está autorizado.","cliente.html#devices");if(await consumeRate(env,`camera-access-email:${ctx.account.id}`,3,3600)){try{await sendEmailTo(env,ctx.account.email,"Acesso CFTV bloqueado pela G-Host","Uma tentativa de acesso às câmeras da sua conta foi bloqueada porque o aparelho não está autorizado. Entre na Minha G-Host para revisar os dispositivos.");}catch(_){}}return json({error:"Este aparelho não está autorizado para visualizar as câmeras.",code:"DEVICE_REQUIRED"},403,cors)}
        const personId=Number(ctx.account.person_id);
        const r=await env.DB.prepare(`
          SELECT DISTINCT ci.id,ci.display_name,ci.provider,ci.monitoring_enabled,ci.health_status,ci.last_seen_at,
                 a.category,a.brand,a.model,a.location,p.name AS project_name,
                 COALESCE(ucp.can_view_live,1) AS can_view_live,COALESCE(ucp.can_view_history,0) AS can_view_history
          FROM camera_integrations ci
          JOIN assets a ON a.id=ci.asset_id JOIN projects p ON p.id=a.project_id
          LEFT JOIN sites s ON s.id=p.site_id LEFT JOIN project_people pp ON pp.project_id=p.id
          LEFT JOIN user_camera_permissions ucp ON ucp.camera_integration_id=ci.id AND ucp.account_id=?
          WHERE (s.customer_id=? OR pp.person_id=?) AND COALESCE(ucp.can_view_live,1)=1
          ORDER BY p.name,a.location,ci.id LIMIT 200
        `).bind(ctx.account.id,personId,personId).all();
        return json({ok:true,deviceId:device.deviceId,items:r.results||[],streamingAvailable:false,message:"Metadados autorizados. A transmissão ao vivo exige o Gateway CFTV G-Host e será liberada em fase própria."},200,cors);
      }

      const portalContract=/^\/portal\/contracts\/(\d+)$/.exec(url.pathname);
      if(portalContract && request.method==="GET"){
        const ctx=await getPortalAccount(request,env);if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);const id=intId(portalContract[1]);
        const c=await env.DB.prepare("SELECT id,code,person_id,project_id,plan_id,status,version,title,summary,body_text,amount,currency,document_hash,starts_at,ends_at,signed_at,created_at,updated_at FROM contracts WHERE id=? AND person_id=? LIMIT 1").bind(id,ctx.account.person_id).first();
        if(!c)return json({error:"Contrato não encontrado."},404,cors);return json({ok:true,contract:c},200,cors);
      }
      const portalContractAcceptStart=/^\/portal\/contracts\/(\d+)\/accept\/start$/.exec(url.pathname);
      if(portalContractAcceptStart && request.method==="POST"){
        const ctx=await getPortalAccount(request,env);if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);if(!(await consumeRate(env,`contract-accept:${ctx.account.id}`,5,900)))return json({error:"Muitas solicitações de aceite. Aguarde alguns minutos."},429,cors);
        const id=intId(portalContractAcceptStart[1]),b=await parseJson(request);if(b?.accept!==true)return json({error:"Confirme que leu o contrato para continuar."},400,cors);
        const c=await env.DB.prepare("SELECT id,code,person_id,status,version,document_hash,title FROM contracts WHERE id=? AND person_id=? LIMIT 1").bind(id,ctx.account.person_id).first();if(!c)return json({error:"Contrato não encontrado."},404,cors);if(c.status!=="pendente_aceite")return json({error:"Este contrato não está disponível para aceite."},409,cors);
        const challengeId=crypto.randomUUID(),code=randomDigits(6),codeMac=await hmacHex(env.AUTH_PEPPER,`${challengeId}|contract-accept|${ctx.account.id}|${id}|${code}`),key=`contract-accept:${challengeId}`;
        await env.AUTH_KV.put(key,JSON.stringify({accountId:Number(ctx.account.id),personId:Number(ctx.account.person_id),contractId:id,codeMac,attempts:0,uaHash:await userAgentHash(request),expiresAt:Date.now()+600000}),{expirationTtl:600});
        try{await sendEmailTo(env,ctx.account.email,"Confirmação de aceite G-Host",`Seu código para confirmar o aceite do contrato ${c.code} é: ${code}. Ele expira em 10 minutos.`);}catch(_){await env.AUTH_KV.delete(key);return json({error:"Não foi possível enviar o código de confirmação."},502,cors)}
        return json({ok:true,challengeId,maskedEmail:maskEmail(ctx.account.email),expiresIn:600},200,cors);
      }
      const portalContractAcceptVerify=/^\/portal\/contracts\/(\d+)\/accept\/verify$/.exec(url.pathname);
      if(portalContractAcceptVerify && request.method==="POST"){
        const ctx=await getPortalAccount(request,env);if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);const id=intId(portalContractAcceptVerify[1]),b=await parseJson(request),challengeId=str(b?.challengeId,80),code=String(b?.code||"").replace(/\D/g,"");if(b?.accept!==true||!challengeId||!/^\d{6}$/.test(code))return json({error:"Confirmação de aceite inválida."},400,cors);
        const key=`contract-accept:${challengeId}`,raw=await env.AUTH_KV.get(key);if(!raw)return json({error:"Código de aceite expirado."},401,cors);const ch=JSON.parse(raw);if(Number(ch.accountId)!==Number(ctx.account.id)||Number(ch.personId)!==Number(ctx.account.person_id)||Number(ch.contractId)!==id||Date.now()>=Number(ch.expiresAt||0)||!(await safeEqual(ch.uaHash||"",await userAgentHash(request)))){await env.AUTH_KV.delete(key);return json({error:"Confirmação de aceite expirada ou inválida."},401,cors)}
        ch.attempts=Number(ch.attempts||0)+1;if(ch.attempts>7){await env.AUTH_KV.delete(key);return json({error:"Limite de tentativas excedido."},429,cors)}const expected=await hmacHex(env.AUTH_PEPPER,`${challengeId}|contract-accept|${ctx.account.id}|${id}|${code}`);if(!(await safeEqual(expected,ch.codeMac||""))){await env.AUTH_KV.put(key,JSON.stringify(ch),{expirationTtl:600});return json({error:"Código de confirmação incorreto."},401,cors)}
        const c=await env.DB.prepare("SELECT id,code,person_id,status,version,document_hash,title FROM contracts WHERE id=? AND person_id=? LIMIT 1").bind(id,ctx.account.person_id).first();if(!c||c.status!=="pendente_aceite"){await env.AUTH_KV.delete(key);return json({error:"Este contrato não está mais disponível para aceite."},409,cors)}
        const device=parseDeviceHeader(request)?.deviceId||"",ipHash=await ipPrivacyHash(request,env),evidence=JSON.stringify({method:"authenticated_account+email_otp",accountId:Number(ctx.account.id),uaHash:await userAgentHash(request),accepted:true,challengeId}).slice(0,4000);
        await env.DB.batch([
          env.DB.prepare("UPDATE contracts SET status='ativo',signed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pendente_aceite'").bind(id),
          env.DB.prepare("INSERT INTO legal_acceptances(account_id,document_code,document_version,document_hash,ip_hash,device_id,evidence_json) VALUES(?,?,?,?,?,?,?)").bind(ctx.account.id,`contract:${c.code}`,c.version,c.document_hash||"",ipHash,device,evidence),
          env.DB.prepare("UPDATE user_accounts SET role='cliente',updated_at=CURRENT_TIMESTAMP WHERE id=? AND role='visitante'").bind(ctx.account.id),
          env.DB.prepare("UPDATE people SET kind='cliente',updated_at=CURRENT_TIMESTAMP WHERE id=? AND kind='visitante'").bind(ctx.account.person_id)
        ]);await env.AUTH_KV.delete(key);
        await notifyAccount(env,ctx.account.id,"success","Contrato aceito",`O contrato ${c.code} foi aceito eletronicamente com confirmação por e-mail e sua conta foi atualizada.`,"cliente.html#operacao");await auditDb(env,"contract_accept","contract",String(id),`account:${ctx.account.id}`);return json({ok:true,status:"ativo",role:"cliente"},200,cors);
      }
      const portalContractLegacyAccept=/^\/portal\/contracts\/(\d+)\/accept$/.exec(url.pathname);
      if(portalContractLegacyAccept && request.method==="POST")return json({error:"O aceite agora exige confirmação por código de e-mail.",code:"EMAIL_CONFIRMATION_REQUIRED"},409,cors);

      if (url.pathname === "/portal/guardian" && request.method === "GET") {
        const ctx=await getPortalAccount(request,env);if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);if(!["cliente","adm","dono"].includes(ctx.account.role))return json({ok:true,nodes:[],events:[]},200,cors);
        const personId=Number(ctx.account.person_id);
        const nodes=await env.DB.prepare("SELECT gn.id,gn.name,gn.status,gn.software_version,gn.last_seen_at,s.name AS site_name FROM guardian_nodes gn JOIN sites s ON s.id=gn.site_id WHERE s.customer_id=? ORDER BY s.name").bind(personId).all();
        const events=await env.DB.prepare(`SELECT ge.id,ge.source,ge.event_type,ge.severity,ge.summary,ge.occurred_at,p.name AS project_name FROM guardian_events ge LEFT JOIN projects p ON p.id=ge.project_id LEFT JOIN sites s ON s.id=p.site_id LEFT JOIN project_people pp ON pp.project_id=p.id WHERE s.customer_id=? OR pp.person_id=? ORDER BY ge.occurred_at DESC LIMIT 50`).bind(personId,personId).all();
        return json({ok:true,nodes:nodes.results||[],events:events.results||[]},200,cors);
      }

      if (url.pathname === "/portal/support" && request.method === "POST") {
        const ctx=await getPortalAccount(request,env);if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);if(!(await consumeRate(env,`portal-support:${ctx.account.id}`,12,3600)))return json({error:"Muitos chamados em pouco tempo."},429,cors);
        const b=await parseJson(request),projectId=intId(b?.projectId),category=str(b?.category||"suporte",60),priority=["baixa","normal","alta","urgente"].includes(b?.priority)?b.priority:"normal",subject=str(b?.subject,150),description=str(b?.description,3000);if(!subject||!description)return json({error:"Assunto e descrição são obrigatórios."},400,cors);
        const r=await env.DB.prepare("INSERT INTO support_tickets(account_id,project_id,category,priority,status,subject,description,updated_at) VALUES(?,?,?,?,'aberto',?,?,CURRENT_TIMESTAMP)").bind(ctx.account.id,projectId||null,category,priority,subject,description).run();await notifyAccount(env,ctx.account.id,"info","Chamado aberto",`Seu chamado #${r.meta?.last_row_id||""} foi registrado.`,"");return json({ok:true,id:r.meta?.last_row_id||null},201,cors);
      }

      if (url.pathname === "/portal/emergency-contacts" && request.method === "GET") {
        const ctx=await getPortalAccount(request,env);if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);const r=await env.DB.prepare("SELECT id,name,relation,phone,priority FROM emergency_contacts WHERE account_id=? AND active=1 ORDER BY priority,id").bind(ctx.account.id).all();return json({ok:true,items:r.results||[]},200,cors);
      }
      if (url.pathname === "/portal/emergency-contacts" && request.method === "POST") {
        const ctx=await getPortalAccount(request,env);if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);const b=await parseJson(request),name=str(b?.name,100),relation=str(b?.relation,80),phone=str(b?.phone,40),priority=Math.max(1,Math.min(10,Number(b?.priority||1)));if(!name||!phone)return json({error:"Nome e telefone são obrigatórios."},400,cors);const r=await env.DB.prepare("INSERT INTO emergency_contacts(account_id,name,relation,phone,priority,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)").bind(ctx.account.id,name,relation,phone,priority).run();return json({ok:true,id:r.meta?.last_row_id||null},201,cors);
      }
      const emergencyContact=/^\/portal\/emergency-contacts\/(\d+)$/.exec(url.pathname);
      if(emergencyContact && request.method==="DELETE"){
        const ctx=await getPortalAccount(request,env);if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);await env.DB.prepare("UPDATE emergency_contacts SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND account_id=?").bind(intId(emergencyContact[1]),ctx.account.id).run();return json({ok:true},200,cors);
      }

      if (url.pathname === "/portal/notifications/read" && request.method === "POST") {
        const ctx=await getPortalAccount(request,env);if(!ctx)return json({error:"Sessão inválida ou expirada."},401,cors);await env.DB.prepare("UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE account_id=? AND read_at='' ").bind(ctx.account.id).run();return json({ok:true},200,cors);
      }

      // ---------------------------------------------------------
      // Centro de controle do Dono — usuários, leads e inteligência
      // ---------------------------------------------------------
      if (url.pathname === "/admin/users" && request.method === "GET") {
        const owner=await getSession(request,env);if(!owner)return json({error:"Sessão do Dono inválida ou expirada."},401,cors);if(!env.DB)return json({error:"Banco D1 não configurado."},503,cors);
        const r=await env.DB.prepare(`SELECT ua.id,ua.person_id,ua.email,ua.role,ua.permissions_json,ua.email_verified,ua.active,ua.camera_device_limit,ua.created_at,ua.last_login_at,p.name,p.phone,p.organization,p.kind,(SELECT COUNT(*) FROM user_devices d WHERE d.account_id=ua.id AND d.status='trusted') AS trusted_devices FROM user_accounts ua JOIN people p ON p.id=ua.person_id ORDER BY ua.created_at DESC LIMIT 1000`).all();return json({ok:true,items:r.results||[]},200,cors);
      }
      const adminUser=/^\/admin\/users\/(\d+)$/.exec(url.pathname);
      if(adminUser && request.method==="PUT"){
        const owner=await getSession(request,env);if(!owner)return json({error:"Sessão do Dono inválida ou expirada."},401,cors);const id=intId(adminUser[1]),b=await parseJson(request),role=portalRoles.has(b?.role)?b.role:"visitante",active=b?.active!==false?1:0,limit=Math.max(1,Math.min(10,Number(b?.cameraDeviceLimit||2))),permissions=(b?.permissions&&typeof b.permissions==="object"&&!Array.isArray(b.permissions))?b.permissions:{};
        if(role==="dono")return json({error:"O perfil Dono não pode ser promovido por esta rota. Ele permanece protegido pela autenticação principal."},403,cors);
        await env.DB.prepare("UPDATE user_accounts SET role=?,permissions_json=?,active=?,camera_device_limit=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(role,JSON.stringify(permissions).slice(0,8000),active,limit,id).run();
        await env.DB.prepare("UPDATE people SET kind=CASE WHEN ?='cliente' THEN 'cliente' WHEN kind='visitante' AND ?<>'cliente' THEN 'visitante' ELSE kind END,updated_at=CURRENT_TIMESTAMP WHERE id=(SELECT person_id FROM user_accounts WHERE id=?)").bind(role,role,id).run().catch(()=>{});
        await auditDb(env,"role_update","user_account",String(id),role);return json({ok:true},200,cors);
      }

      const adminUserSecurity=/^\/admin\/users\/(\d+)\/reset-security$/.exec(url.pathname);
      if(adminUserSecurity && request.method==="POST"){
        const owner=await getSession(request,env);if(!owner)return json({error:"Somente o Dono pode redefinir a segurança de um ADM."},403,cors);const id=intId(adminUserSecurity[1]);const a=await env.DB.prepare("SELECT id,role,email FROM user_accounts WHERE id=? LIMIT 1").bind(id).first();if(!a)return json({error:"Conta não encontrada."},404,cors);if(a.role!=="adm")return json({error:"A redefinição de segurança desta rota é exclusiva para contas ADM."},400,cors);
        await Promise.all([env.AUTH_KV.delete(`staff:totp_secret:${id}`),env.AUTH_KV.delete(`staff:totp_enrolled:${id}`)]).catch(()=>{});
        await env.DB.prepare("UPDATE user_devices SET status='revoked',revoked_at=CURRENT_TIMESTAMP WHERE account_id=? AND purpose='admin' AND status='trusted'").bind(id).run().catch(()=>{});
        await env.DB.prepare("UPDATE user_accounts SET auth_version=auth_version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
        await auditDb(env,"security_reset","user_account",String(id),`account:${id}`);return json({ok:true,message:"MFA, navegador ADM e sessões administrativas foram invalidados. No próximo acesso o ADM fará novo cadastro do autenticador e do aparelho."},200,cors);
      }

      if (url.pathname === "/admin/client-options" && request.method === "GET") {
        const ctl=(await getControlSession(request,env,"legal"))||(await getControlSession(request,env,"crm"));if(!ctl)return json({error:"Sessão inválida ou sem permissão de CRM/Jurídico."},403,cors);
        const r=await env.DB.prepare("SELECT p.id AS person_id,p.name,p.email,p.phone,p.kind,ua.id AS account_id,ua.role FROM people p LEFT JOIN user_accounts ua ON ua.person_id=p.id WHERE p.active=1 ORDER BY p.name LIMIT 1000").all();return json({ok:true,items:r.results||[]},200,cors);
      }

      if (url.pathname === "/admin/quotes" && request.method === "GET") {
        const owner=await getControlSession(request,env,"crm");if(!owner)return json({error:"Sessão inválida ou sem permissão de CRM."},403,cors);const r=await env.DB.prepare(`SELECT q.id,q.status,q.contact_preference,q.notes,q.created_at,q.updated_at,ua.email,p.name,p.phone,sc.name AS configuration_name,sc.plan_id FROM quote_requests q JOIN user_accounts ua ON ua.id=q.account_id JOIN people p ON p.id=ua.person_id LEFT JOIN saved_configurations sc ON sc.id=q.configuration_id ORDER BY q.created_at DESC LIMIT 500`).all();return json({ok:true,items:r.results||[]},200,cors);
      }

      const adminQuoteStatus=/^\/admin\/quotes\/(\d+)\/status$/.exec(url.pathname);
      if(adminQuoteStatus && request.method==="PUT"){
        const ctl=await getControlSession(request,env,"crm");if(!ctl)return json({error:"Sessão inválida ou sem permissão de CRM."},403,cors);const id=intId(adminQuoteStatus[1]),b=await parseJson(request),allowed=["novo","em_analise","proposta_enviada","aprovado","recusado","convertido"],status=allowed.includes(b?.status)?b.status:"";if(!status)return json({error:"Status de proposta inválido."},400,cors);const q=await env.DB.prepare("SELECT account_id FROM quote_requests WHERE id=? LIMIT 1").bind(id).first();if(!q)return json({error:"Proposta não encontrada."},404,cors);await env.DB.prepare("UPDATE quote_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,id).run();await notifyAccount(env,q.account_id,"info","Atualização da proposta",`Sua proposta #${id} foi atualizada para: ${status.replace(/_/g," ")}.`,"cliente.html#projetos");await auditDb(env,"status","quote_request",String(id),status);return json({ok:true},200,cors);
      }

      if (url.pathname === "/admin/security-events" && request.method === "GET") {
        const owner=await getControlSession(request,env,"security");if(!owner)return json({error:"Sessão inválida ou sem permissão de segurança."},403,cors);const r=await env.DB.prepare(`SELECT se.id,se.event_type,se.severity,se.device_id,se.summary,se.created_at,ua.email,p.name FROM security_events se LEFT JOIN user_accounts ua ON ua.id=se.account_id LEFT JOIN people p ON p.id=ua.person_id ORDER BY se.created_at DESC LIMIT 500`).all();return json({ok:true,items:r.results||[]},200,cors);
      }

      if (url.pathname === "/admin/audit-log" && request.method === "GET") {
        const ctl=await getControlSession(request,env,"security");if(!ctl)return json({error:"Sessão inválida ou sem permissão de segurança."},403,cors);const r=await env.DB.prepare("SELECT id,action,entity_type,entity_id,details,created_at FROM audit_log ORDER BY id DESC LIMIT 1000").all();return json({ok:true,items:r.results||[]},200,cors);
      }

      if (url.pathname === "/admin/analytics/summary" && request.method === "GET") {
        const owner=await getControlSession(request,env,"analytics");if(!owner)return json({error:"Sessão inválida ou sem permissão de analytics."},403,cors);const days=Math.max(1,Math.min(90,Number(url.searchParams.get("days")||30)));
        const totals=await env.DB.prepare("SELECT COUNT(*) AS events,COUNT(DISTINCT visitor_hash) AS visitors,COUNT(DISTINCT account_id) AS identified_accounts FROM analytics_events WHERE created_at>=datetime('now', ?)").bind(`-${days} days`).first();
        const byType=await env.DB.prepare("SELECT event_type,COUNT(*) AS n FROM analytics_events WHERE created_at>=datetime('now', ?) GROUP BY event_type ORDER BY n DESC LIMIT 30").bind(`-${days} days`).all();
        const byTarget=await env.DB.prepare("SELECT target,COUNT(*) AS n FROM analytics_events WHERE created_at>=datetime('now', ?) AND target<>'' GROUP BY target ORDER BY n DESC LIMIT 30").bind(`-${days} days`).all();
        const leads=await env.DB.prepare("SELECT COUNT(*) AS n FROM quote_requests WHERE created_at>=datetime('now', ?)").bind(`-${days} days`).first();
        return json({ok:true,days,totals:{events:Number(totals?.events||0),visitors:Number(totals?.visitors||0),identifiedAccounts:Number(totals?.identified_accounts||0),quoteRequests:Number(leads?.n||0)},byType:byType.results||[],byTarget:byTarget.results||[]},200,cors);
      }


      if (url.pathname === "/admin/contracts" && request.method === "GET") {
        const owner=await getControlSession(request,env,"legal");if(!owner)return json({error:"Sessão inválida ou sem permissão jurídica."},403,cors);
        const r=await env.DB.prepare("SELECT c.id,c.code,c.person_id,c.project_id,c.plan_id,c.status,c.version,c.title,c.summary,c.amount,c.currency,c.document_hash,c.starts_at,c.ends_at,c.signed_at,c.created_at,c.updated_at,p.name,p.email,pr.code AS project_code,pr.name AS project_name FROM contracts c JOIN people p ON p.id=c.person_id LEFT JOIN projects pr ON pr.id=c.project_id ORDER BY c.created_at DESC LIMIT 500").all();return json({ok:true,items:r.results||[]},200,cors);
      }
      if (url.pathname === "/admin/contracts" && request.method === "POST") {
        const owner=await getControlSession(request,env,"legal");if(!owner)return json({error:"Sessão inválida ou sem permissão jurídica."},403,cors);const b=await parseJson(request),personId=intId(b?.personId),projectId=intId(b?.projectId),planId=str(b?.planId,60),version=str(b?.version||"1",30),title=str(b?.title||"Contrato de Prestação de Serviços G-Host",180),summary=str(b?.summary,2500),bodyText=str(b?.bodyText,30000),amount=nonneg(b?.amount),startsAt=dateOnly(b?.startsAt),endsAt=dateOnly(b?.endsAt),status=["rascunho","pendente_aceite"].includes(b?.status)?b.status:"rascunho";
        if(!personId||!title||!bodyText)return json({error:"Cliente, título e texto do contrato são obrigatórios."},400,cors);const person=await env.DB.prepare("SELECT id FROM people WHERE id=? AND active=1 LIMIT 1").bind(personId).first();if(!person)return json({error:"Cliente não encontrado."},404,cors);
        const code=str(b?.code,50).toUpperCase()||`GH-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${String(Date.now()).slice(-6)}`;const documentHash=await digestHex(`${code}|${version}|${title}|${bodyText}`);
        try{const r=await env.DB.prepare("INSERT INTO contracts(code,person_id,project_id,plan_id,status,version,title,summary,body_text,amount,currency,document_hash,starts_at,ends_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,'BRL',?,?,?,CURRENT_TIMESTAMP)").bind(code,personId,projectId||null,planId,status,version,title,summary,bodyText,amount,documentHash,startsAt,endsAt).run();const contractId=Number(r.meta?.last_row_id||0);if(status==="pendente_aceite"){const ua=await env.DB.prepare("SELECT id FROM user_accounts WHERE person_id=? AND active=1 LIMIT 1").bind(personId).first();if(ua)await notifyAccount(env,ua.id,"warning","Contrato disponível para aceite",`O contrato ${code} está disponível para leitura e confirmação na Minha G-Host.`,"cliente.html#operacao");}await auditDb(env,"create","contract",String(contractId||""),code);return json({ok:true,id:contractId||null,code,documentHash},201,cors);}catch(_){return json({error:"Código de contrato já existe ou os dados são inválidos."},409,cors)}
      }
      const adminContractStatus=/^\/admin\/contracts\/(\d+)\/status$/.exec(url.pathname);
      if(adminContractStatus && request.method==="PUT"){
        const owner=await getControlSession(request,env,"legal");if(!owner)return json({error:"Sessão inválida ou sem permissão jurídica."},403,cors);const id=intId(adminContractStatus[1]),b=await parseJson(request),status=["rascunho","pendente_aceite","cancelado","encerrado"].includes(b?.status)?b.status:"";if(!status)return json({error:"Status inválido."},400,cors);const c=await env.DB.prepare("SELECT status,signed_at FROM contracts WHERE id=? LIMIT 1").bind(id).first();if(!c)return json({error:"Contrato não encontrado."},404,cors);if(c.signed_at&&!["cancelado","encerrado"].includes(status))return json({error:"Contrato já aceito: o conteúdo e a versão não podem ser reabertos. Crie uma nova versão."},409,cors);await env.DB.prepare("UPDATE contracts SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,id).run();if(status==="pendente_aceite"){const ua=await env.DB.prepare("SELECT ua.id FROM user_accounts ua JOIN contracts c ON c.person_id=ua.person_id WHERE c.id=? LIMIT 1").bind(id).first();if(ua)await notifyAccount(env,ua.id,"warning","Contrato disponível para aceite",`O contrato #${id} está disponível para leitura e confirmação na Minha G-Host.`,"cliente.html#operacao");}await auditDb(env,"status","contract",String(id),status);return json({ok:true},200,cors);
      }

      if (url.pathname === "/admin/guardian" && request.method === "GET") {
        const owner=await getControlSession(request,env,"guardian");if(!owner)return json({error:"Sessão inválida ou sem permissão Guardião."},403,cors);
        const nodes=await env.DB.prepare("SELECT gn.id,gn.node_uuid,gn.name,gn.status,gn.software_version,gn.last_seen_at,s.name AS site_name FROM guardian_nodes gn JOIN sites s ON s.id=gn.site_id ORDER BY gn.last_seen_at DESC LIMIT 300").all();
        const events=await env.DB.prepare("SELECT ge.id,ge.source,ge.event_type,ge.severity,ge.summary,ge.occurred_at,p.code AS project_code,p.name AS project_name FROM guardian_events ge LEFT JOIN projects p ON p.id=ge.project_id ORDER BY ge.occurred_at DESC LIMIT 500").all();
        return json({ok:true,nodes:nodes.results||[],events:events.results||[]},200,cors);
      }

      if (url.pathname === "/admin/support" && request.method === "GET") {
        const owner=await getControlSession(request,env,"crm");if(!owner)return json({error:"Sessão inválida ou sem permissão de CRM."},403,cors);
        const r=await env.DB.prepare("SELECT st.id,st.category,st.priority,st.status,st.subject,st.description,st.created_at,st.updated_at,ua.email,p.name,pr.code AS project_code FROM support_tickets st JOIN user_accounts ua ON ua.id=st.account_id JOIN people p ON p.id=ua.person_id LEFT JOIN projects pr ON pr.id=st.project_id ORDER BY st.created_at DESC LIMIT 500").all();
        return json({ok:true,items:r.results||[]},200,cors);
      }

      const adminSupportStatus=/^\/admin\/support\/(\d+)\/status$/.exec(url.pathname);
      if(adminSupportStatus && request.method==="PUT"){
        const ctl=await getControlSession(request,env,"crm");if(!ctl)return json({error:"Sessão inválida ou sem permissão de CRM."},403,cors);const id=intId(adminSupportStatus[1]),b=await parseJson(request),allowed=["aberto","em_atendimento","aguardando_cliente","resolvido","cancelado"],status=allowed.includes(b?.status)?b.status:"";if(!status)return json({error:"Status de chamado inválido."},400,cors);const ticket=await env.DB.prepare("SELECT account_id FROM support_tickets WHERE id=? LIMIT 1").bind(id).first();if(!ticket)return json({error:"Chamado não encontrado."},404,cors);await env.DB.prepare("UPDATE support_tickets SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,id).run();await notifyAccount(env,ticket.account_id,status==="resolvido"?"success":"info","Atualização do chamado",`Seu chamado #${id} foi atualizado para: ${status.replace(/_/g," ")}.`,"cliente.html#suporte");await auditDb(env,"status","support_ticket",String(id),status);return json({ok:true},200,cors);
      }

      // ---------------------------------------------------------
      // Acesso de ADM — senha + e-mail + TOTP + navegador autorizado
      // ---------------------------------------------------------
      if (url.pathname === "/staff/password" && request.method === "POST") {
        if(!env.DB)return json({error:"Banco D1 não configurado."},503,cors);const ip=clientIp(request);if(!(await consumeRate(env,`staff-pwd:${ip}`,8,600)))return json({error:"Muitas tentativas. Aguarde alguns minutos."},429,cors);
        const b=await parseJson(request),email=normalizeEmail(b?.email),password=String(b?.password||"");const a=await env.DB.prepare("SELECT id,person_id,email,password_salt,password_hash,password_iterations,permissions_json,email_verified,active,role FROM user_accounts WHERE lower(email)=? AND role='adm' LIMIT 1").bind(email).first();
        if(!a||!a.active||!a.email_verified)return json({error:"Credenciais de ADM inválidas."},401,cors);const dev=await verifyAccountPurposeDevice(request,env,a.id,"admin");if(dev.required&&!dev.valid){await portalAudit(env,a.id,"staff_device_blocked","critical","Login de ADM bloqueado em aparelho não autorizado",request);return json({error:"Este aparelho não está autorizado para acessar o painel ADM.",code:"STAFF_DEVICE_REQUIRED"},403,cors)}
        const candidate=await derivePasswordHash(password,a.password_salt,Number(a.password_iterations||310000));if(!(await safeEqual(candidate,a.password_hash||""))){await portalAudit(env,a.id,"staff_login_failed","warning","Senha de ADM inválida",request);return json({error:"Credenciais de ADM inválidas."},401,cors)}
        const challengeId=crypto.randomUUID(),code=randomDigits(6),codeMac=await hmacHex(env.AUTH_PEPPER,`${challengeId}|staff-email|${a.id}|${code}`);await env.AUTH_KV.put(`staff-challenge:${challengeId}`,JSON.stringify({accountId:Number(a.id),personId:Number(a.person_id),email:a.email,permissionsJson:a.permissions_json||"{}",step:"email",codeMac,attempts:0,uaHash:await userAgentHash(request),expiresAt:Date.now()+600000}),{expirationTtl:600});
        try{await sendEmailTo(env,a.email,"Código de acesso ADM G-Host",`Seu código de acesso administrativo G-Host é: ${code}. Ele expira em 10 minutos.`);}catch(_){await env.AUTH_KV.delete(`staff-challenge:${challengeId}`);return json({error:"Não foi possível enviar o código de e-mail."},502,cors)}
        return json({ok:true,challengeId,maskedEmail:maskEmail(a.email),expiresIn:600},200,cors);
      }

      if (url.pathname === "/staff/email/verify" && request.method === "POST") {
        const b=await parseJson(request),id=str(b?.challengeId,80),code=String(b?.code||"").replace(/\D/g,"");if(!id||!/^\d{6}$/.test(code))return json({error:"Código inválido."},400,cors);const key=`staff-challenge:${id}`,raw=await env.AUTH_KV.get(key);if(!raw)return json({error:"Verificação expirada."},401,cors);const c=JSON.parse(raw);if(c.step!=="email"||Date.now()>=Number(c.expiresAt||0)||!(await safeEqual(c.uaHash||"",await userAgentHash(request)))){await env.AUTH_KV.delete(key);return json({error:"Verificação expirada."},401,cors)}c.attempts=Number(c.attempts||0)+1;if(c.attempts>7){await env.AUTH_KV.delete(key);return json({error:"Limite de tentativas excedido."},429,cors)}const expected=await hmacHex(env.AUTH_PEPPER,`${id}|staff-email|${c.accountId}|${code}`);if(!(await safeEqual(expected,c.codeMac||""))){await env.AUTH_KV.put(key,JSON.stringify(c),{expirationTtl:600});return json({error:"Código incorreto."},401,cors)}
        const totp=await getStaffTotpState(env,c.accountId);c.step="totp";c.attempts=0;c.expiresAt=Date.now()+600000;await env.AUTH_KV.put(key,JSON.stringify(c),{expirationTtl:600});const issuer="G-Host ADM",account=String(c.email||"adm"),otpauthUrl=`otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${encodeURIComponent(totp.secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
        return json({ok:true,enrolled:totp.enrolled,setupSecret:totp.enrolled?null:totp.secret,otpauthUrl:totp.enrolled?null:otpauthUrl,expiresIn:600},200,cors);
      }

      if (url.pathname === "/staff/totp/verify" && request.method === "POST") {
        const b=await parseJson(request),id=str(b?.challengeId,80),code=String(b?.code||"").replace(/\D/g,"");if(!id||!/^\d{6}$/.test(code))return json({error:"Código do autenticador inválido."},400,cors);const key=`staff-challenge:${id}`,raw=await env.AUTH_KV.get(key);if(!raw)return json({error:"Verificação expirada."},401,cors);const c=JSON.parse(raw);if(c.step!=="totp"||Date.now()>=Number(c.expiresAt||0)||!(await safeEqual(c.uaHash||"",await userAgentHash(request)))){await env.AUTH_KV.delete(key);return json({error:"Verificação expirada."},401,cors)}c.attempts=Number(c.attempts||0)+1;if(c.attempts>7){await env.AUTH_KV.delete(key);return json({error:"Limite de tentativas excedido."},429,cors)}const totp=await getStaffTotpState(env,c.accountId);if(!(await verifyTotp(totp.secret,code))){await env.AUTH_KV.put(key,JSON.stringify(c),{expirationTtl:600});return json({error:"Código do autenticador incorreto ou expirado."},401,cors)}if(!totp.enrolled)await env.AUTH_KV.put(totp.enrolledKey,"1");
        const account=await env.DB.prepare("SELECT id,person_id,email,role,permissions_json,auth_version FROM user_accounts WHERE id=? AND role='adm' AND active=1 LIMIT 1").bind(c.accountId).first();if(!account){await env.AUTH_KV.delete(key);return json({error:"Conta ADM não está mais ativa."},403,cors)}const session=await createStaffSession(request,env,account),device=await enrollStaffDeviceIfNeeded(request,env,account.id);await env.AUTH_KV.delete(key);await portalAudit(env,account.id,"staff_login_success","info","Login ADM concluído",request,device?.deviceId||"");let permissions={};try{permissions=JSON.parse(account.permissions_json||"{}")}catch(_){}return json({ok:true,token:session.token,expiresAt:session.expiresAt,expiresIn:session.expiresIn,permissions,role:"adm",staffDeviceToken:device?.deviceToken||null},200,cors);
      }

      if (url.pathname === "/staff/me" && request.method === "GET") {
        const s=await getStaffSession(request,env);if(!s)return json({error:"Sessão ADM inválida ou expirada."},401,cors);return json({ok:true,role:"adm",email:s.data.email,permissions:s.data.permissions,expiresAt:s.data.expiresAt},200,cors);
      }
      if (url.pathname === "/staff/logout" && request.method === "POST") {const s=await getStaffSession(request,env);if(s)await env.AUTH_KV.delete(`staff-session:${s.hash}`);return json({ok:true},200,cors);}

      if (url.pathname === "/auth/password" && request.method === "POST") {
        const ownerDevice = await verifyOwnerDevice(request, env);
        if (ownerDevice.required && !ownerDevice.valid) {
          await putAudit(env, "lastOwnerDeviceBlock", { at: Date.now(), deviceId: ownerDevice.deviceId || "unknown", ipHash: await ipPrivacyHash(request, env) });
          return json({ error: "Este aparelho não está autorizado para acessar o perfil Dono.", code: "OWNER_DEVICE_REQUIRED" }, 403, cors);
        }
        const ip = clientIp(request);
        if (!(await consumeRate(env, `pwd:${ip}`, 6, 600))) {
          await putAudit(env, "lastLockout", { at: Date.now(), type: "password", ipHash: await digestHex(ip) });
          return json({ error: "Muitas tentativas. Aguarde 10 minutos." }, 429, { ...cors, "Retry-After": "600" });
        }

        const payload = await parseJson(request);
        if (!payload.password || !(await safeEqual(String(payload.password), String(env.ADMIN_PASSWORD)))) {
          return json({ error: "Credencial inválida." }, 401, cors);
        }

        const challengeId = crypto.randomUUID();
        const code = randomDigits(6);
        const fingerprint = await requestFingerprint(request, env);
        const emailMac = await hmacHex(env.AUTH_PEPPER, `${challengeId}|email|${code}`);
        await env.AUTH_KV.put(`challenge:${challengeId}`, JSON.stringify({
          step: "email",
          emailMac,
          attempts: 0,
          createdAt: Date.now(),
          expiresAt: Date.now() + 600_000,
          fingerprint
        }), { expirationTtl: 600 });

        await sendEmailCode(env, code);
        return json({ ok: true, challengeId, maskedEmail: maskEmail(env.ADMIN_EMAIL), expiresIn: 600 }, 200, cors);
      }

      if (url.pathname === "/auth/email/verify" && request.method === "POST") {
        const ip = clientIp(request);
        if (!(await consumeRate(env, `email:${ip}`, 8, 600))) return json({ error: "Muitas tentativas. Aguarde alguns minutos." }, 429, cors);

        const payload = await parseJson(request);
        const id = String(payload.challengeId || "");
        const code = String(payload.code || "").replace(/\D/g, "");
        if (!id || code.length !== 6) return json({ error: "Código de e-mail inválido." }, 400, cors);

        const key = `challenge:${id}`;
        const raw = await env.AUTH_KV.get(key);
        if (!raw) return json({ error: "Verificação expirada. Recomece o acesso." }, 401, cors);
        const challenge = JSON.parse(raw);
        if (challenge.step !== "email" || Date.now() >= Number(challenge.expiresAt || 0)) {
          await env.AUTH_KV.delete(key);
          return json({ error: "Verificação expirada. Recomece o acesso." }, 401, cors);
        }
        if (!(await safeEqual(challenge.fingerprint || "", await requestFingerprint(request, env)))) {
          await env.AUTH_KV.delete(key);
          return json({ error: "A verificação mudou de dispositivo ou rede. Recomece o acesso." }, 401, cors);
        }

        challenge.attempts = Number(challenge.attempts || 0) + 1;
        if (challenge.attempts > 6) {
          await env.AUTH_KV.delete(key);
          return json({ error: "Limite de códigos excedido. Recomece o acesso." }, 429, cors);
        }

        const candidate = await hmacHex(env.AUTH_PEPPER, `${id}|email|${code}`);
        if (!(await safeEqual(candidate, challenge.emailMac || ""))) {
          await env.AUTH_KV.put(key, JSON.stringify(challenge), { expirationTtl: 600 });
          return json({ error: "Código do e-mail incorreto." }, 401, cors);
        }

        const totp = await getTotpState(env);

challenge.step = "totp";
delete challenge.emailMac;
challenge.attempts = 0;
challenge.expiresAt = Date.now() + 600_000;

await env.AUTH_KV.put(
  key,
  JSON.stringify(challenge),
  { expirationTtl: 600 }
);

const issuer = "G-Host";
const account = String(env.ADMIN_EMAIL || "admin");

const otpauthUrl =
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}` +
  `?secret=${encodeURIComponent(totp.secret)}` +
  `&issuer=${encodeURIComponent(issuer)}` +
  `&algorithm=SHA1&digits=6&period=30`;

return json({
  ok: true,
  enrolled: totp.enrolled,
  setupSecret: totp.enrolled ? null : totp.secret,
  otpauthUrl: totp.enrolled ? null : otpauthUrl,
  expiresIn: 600
}, 200, cors);
      }

            if (url.pathname === "/auth/totp/verify" && request.method === "POST") {
        const ip = clientIp(request);

        if (!(await consumeRate(env, `totp:${ip}`, 8, 600))) {
          return json(
            { error: "Muitas tentativas. Aguarde alguns minutos." },
            429,
            cors
          );
        }

        const payload = await parseJson(request);
        const id = String(payload.challengeId || "");
        const code = String(payload.code || "").replace(/\D/g, "");

        if (!id || code.length !== 6) {
          return json(
            { error: "Código do autenticador inválido." },
            400,
            cors
          );
        }

        const key = `challenge:${id}`;
        const raw = await env.AUTH_KV.get(key);

        if (!raw) {
          return json(
            { error: "Verificação expirada. Recomece o acesso." },
            401,
            cors
          );
        }

        const challenge = JSON.parse(raw);

        if (
          challenge.step !== "totp" ||
          Date.now() >= Number(challenge.expiresAt || 0)
        ) {
          await env.AUTH_KV.delete(key);

          return json(
            { error: "Verificação expirada. Recomece o acesso." },
            401,
            cors
          );
        }

        if (
          !(await safeEqual(
            challenge.fingerprint || "",
            await requestFingerprint(request, env)
          ))
        ) {
          await env.AUTH_KV.delete(key);

          return json(
            {
              error:
                "A verificação mudou de dispositivo ou rede. Recomece o acesso."
            },
            401,
            cors
          );
        }

        challenge.attempts = Number(challenge.attempts || 0) + 1;

        if (challenge.attempts > 6) {
          await env.AUTH_KV.delete(key);

          return json(
            { error: "Limite de códigos excedido. Recomece o acesso." },
            429,
            cors
          );
        }

        const totp = await getTotpState(env);
        const valid = await verifyTotp(totp.secret, code);

        if (!valid) {
          await env.AUTH_KV.put(
            key,
            JSON.stringify(challenge),
            { expirationTtl: 600 }
          );

          return json(
            { error: "Código do autenticador incorreto ou expirado." },
            401,
            cors
          );
        }

        if (!totp.enrolled) {
          await env.AUTH_KV.put("auth:totp_enrolled", "1");
        }

        const token = randomToken();
        const tokenHash = await digestHex(token);

        const ttl = Math.max(
          300,
          Math.min(3600, Number(env.SESSION_TTL_SECONDS || 1800))
        );

        const createdAt = Date.now();
        const expiresAt = createdAt + ttl * 1000;

        const sessionData = {
          createdAt,
          expiresAt,
          uaHash: await userAgentHash(request)
        };

        await env.AUTH_KV.put(
          `session:${tokenHash}`,
          JSON.stringify(sessionData),
          { expirationTtl: ttl }
        );

        await env.AUTH_KV.delete(key);

        await putAudit(env, "lastAuth", {
          at: createdAt,
          uaHash: sessionData.uaHash
        });

        const enrolledOwnerDevice = await enrollFirstOwnerDevice(request, env);

        return json(
          {
            ok: true,
            token,
            expiresIn: ttl,
            expiresAt,
            ownerDeviceToken: enrolledOwnerDevice?.deviceToken || null
          },
          200,
          cors
        );
      }

      if (url.pathname === "/auth/me" && request.method === "GET") {
        const session = await getControlSession(request, env, "prices");
        if (!session) return json({ error: "Sessão inválida, expirada ou sem permissão." }, 403, cors);
        const lastPublishRaw = await env.AUTH_KV.get("audit:lastPublish");
        let lastPublish = null;
        try { lastPublish = lastPublishRaw ? JSON.parse(lastPublishRaw) : null; } catch (_) {}
        return json({
          ok: true,
          authenticated: true,
          createdAt: session.data.createdAt,
          expiresAt: session.data.expiresAt,
          remainingSeconds: Math.max(0, Math.floor((session.data.expiresAt - Date.now()) / 1000)),
          lastPublishAt: lastPublish?.at || null
        }, 200, cors);
      }

      if (url.pathname === "/auth/logout" && request.method === "POST") {
        const session = await getSession(request, env);
        if (session) await env.AUTH_KV.delete(`session:${session.hash}`);
        return json({ ok: true }, 200, cors);
      }


      if (url.pathname.startsWith("/db/") && !env.DB) return json({ error: "Banco D1 não configurado no Worker." }, 503, cors);

      const requireDbSession = async () => getControlSession(request, env, "operations");

      if (url.pathname === "/db/people" && request.method === "GET") {
        if (!(await requireDbSession())) return json({ error: "Sessão inválida ou expirada." }, 401, cors);
        const q = str(url.searchParams.get("q"), 100), like = `%${q}%`;
        const stmt = q ? env.DB.prepare("SELECT * FROM people WHERE active=1 AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR organization LIKE ? OR kind LIKE ?) ORDER BY name LIMIT 500").bind(like,like,like,like,like) : env.DB.prepare("SELECT * FROM people WHERE active=1 ORDER BY name LIMIT 500");
        const res = await stmt.all(); return json({ ok:true, items:res.results||[] },200,cors);
      }
      if (url.pathname === "/db/people" && request.method === "POST") {
        if (!(await requireDbSession())) return json({ error:"Sessão inválida ou expirada." },401,cors); if (!(await dbWriteRate(request,env))) return json({error:"Muitas alterações em pouco tempo."},429,cors);
        const x=cleanPerson(await parseJson(request)); if(!x.name) return json({error:"Nome obrigatório."},400,cors);
        const r=await env.DB.prepare("INSERT INTO people(name,kind,phone,email,organization,document_ref,notes,updated_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(x.name,x.kind,x.phone,x.email,x.organization,x.documentRef,x.notes).run(); await auditDb(env,"create","person",String(r.meta?.last_row_id||""),x.name); return json({ok:true,id:r.meta?.last_row_id||null},201,cors);
      }
      const personMatch=/^\/db\/people\/(\d+)$/.exec(url.pathname);
      if(personMatch && request.method==="PUT"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); if (!(await dbWriteRate(request,env))) return json({error:"Muitas alterações em pouco tempo."},429,cors);
        const id=intId(personMatch[1]),x=cleanPerson(await parseJson(request)); if(!id||!x.name) return json({error:"Dados inválidos."},400,cors);
        await env.DB.prepare("UPDATE people SET name=?,kind=?,phone=?,email=?,organization=?,document_ref=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(x.name,x.kind,x.phone,x.email,x.organization,x.documentRef,x.notes,id).run(); await auditDb(env,"update","person",String(id),x.name); return json({ok:true},200,cors);
      }
      if(personMatch && request.method==="DELETE"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); if (!(await dbWriteRate(request,env))) return json({error:"Muitas alterações em pouco tempo."},429,cors); const id=intId(personMatch[1]);
        await env.DB.batch([env.DB.prepare("DELETE FROM project_people WHERE person_id=?").bind(id),env.DB.prepare("UPDATE sites SET customer_id=NULL WHERE customer_id=?").bind(id),env.DB.prepare("UPDATE materials SET supplier_id=NULL WHERE supplier_id=?").bind(id),env.DB.prepare("DELETE FROM people WHERE id=?").bind(id)]); await auditDb(env,"delete","person",String(id)); return json({ok:true},200,cors);
      }

      if(url.pathname==="/db/sites" && request.method==="GET"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const q=str(url.searchParams.get("q"),100),like=`%${q}%`;
        const base="SELECT s.*, p.name AS customer_name FROM sites s LEFT JOIN people p ON p.id=s.customer_id WHERE s.active=1";
        const stmt=q?env.DB.prepare(base+" AND (s.name LIKE ? OR s.address LIKE ? OR s.city LIKE ? OR s.property_type LIKE ? OR p.name LIKE ?) ORDER BY s.name LIMIT 500").bind(like,like,like,like,like):env.DB.prepare(base+" ORDER BY s.name LIMIT 500"); const r=await stmt.all(); return json({ok:true,items:r.results||[]},200,cors);
      }
      if(url.pathname==="/db/sites" && request.method==="POST"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); if (!(await dbWriteRate(request,env))) return json({error:"Muitas alterações em pouco tempo."},429,cors); const x=cleanSite(await parseJson(request)); if(!x.name)return json({error:"Nome do local obrigatório."},400,cors);
        const r=await env.DB.prepare("INSERT INTO sites(name,customer_id,address,city,state,postal_code,property_type,access_notes,infrastructure_notes,updated_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(x.name,x.customerId||null,x.address,x.city,x.state,x.postalCode,x.propertyType,x.accessNotes,x.infrastructureNotes).run(); await auditDb(env,"create","site",String(r.meta?.last_row_id||""),x.name); return json({ok:true,id:r.meta?.last_row_id||null},201,cors);
      }
      const siteMatch=/^\/db\/sites\/(\d+)$/.exec(url.pathname);
      if(siteMatch && request.method==="PUT"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); if (!(await dbWriteRate(request,env))) return json({error:"Muitas alterações em pouco tempo."},429,cors); const id=intId(siteMatch[1]),x=cleanSite(await parseJson(request)); if(!id||!x.name)return json({error:"Dados inválidos."},400,cors);
        await env.DB.prepare("UPDATE sites SET name=?,customer_id=?,address=?,city=?,state=?,postal_code=?,property_type=?,access_notes=?,infrastructure_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(x.name,x.customerId||null,x.address,x.city,x.state,x.postalCode,x.propertyType,x.accessNotes,x.infrastructureNotes,id).run(); await auditDb(env,"update","site",String(id),x.name); return json({ok:true},200,cors);
      }
      if(siteMatch && request.method==="DELETE"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); if (!(await dbWriteRate(request,env))) return json({error:"Muitas alterações em pouco tempo."},429,cors); const id=intId(siteMatch[1]); await env.DB.batch([env.DB.prepare("UPDATE projects SET site_id=NULL WHERE site_id=?").bind(id),env.DB.prepare("UPDATE service_orders SET site_id=NULL WHERE site_id=?").bind(id),env.DB.prepare("DELETE FROM sites WHERE id=?").bind(id)]); await auditDb(env,"delete","site",String(id)); return json({ok:true},200,cors);
      }

      if(url.pathname==="/db/projects" && request.method==="GET"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const q=str(url.searchParams.get("q"),100),like=`%${q}%`;
        const base="SELECT p.*, s.name AS site_name, (SELECT COUNT(*) FROM project_people pp WHERE pp.project_id=p.id) AS people_count, (SELECT COUNT(*) FROM project_systems ps WHERE ps.project_id=p.id) AS system_count FROM projects p LEFT JOIN sites s ON s.id=p.site_id";
        const stmt=q?env.DB.prepare(base+" WHERE p.code LIKE ? OR p.name LIKE ? OR p.status LIKE ? OR p.location LIKE ? OR p.type LIKE ? OR s.name LIKE ? ORDER BY p.updated_at DESC LIMIT 500").bind(like,like,like,like,like,like):env.DB.prepare(base+" ORDER BY p.updated_at DESC LIMIT 500"); const r=await stmt.all(); return json({ok:true,items:r.results||[]},200,cors);
      }
      if(url.pathname==="/db/projects" && request.method==="POST"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); if (!(await dbWriteRate(request,env))) return json({error:"Muitas alterações em pouco tempo."},429,cors); const x=cleanProject(await parseJson(request)); if(!x.code||!x.name)return json({error:"Código e nome são obrigatórios."},400,cors);
        try{const r=await env.DB.prepare("INSERT INTO projects(code,name,status,priority,type,site_id,location,start_date,due_date,completed_date,customer_request,scope_summary,description,quoted_value,approved_value,payment_status,notes,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(x.code,x.name,x.status,x.priority,x.type,x.siteId||null,x.location,x.startDate,x.dueDate,x.completedDate,x.customerRequest,x.scopeSummary,x.description,x.quotedValue,x.approvedValue,x.paymentStatus,x.notes).run(); await auditDb(env,"create","project",String(r.meta?.last_row_id||""),x.code); return json({ok:true,id:r.meta?.last_row_id||null},201,cors);}catch(_){return json({error:"Código de projeto já existe ou os dados são inválidos."},409,cors);}
      }
      const projectMatch=/^\/db\/projects\/(\d+)$/.exec(url.pathname);
      if(projectMatch && request.method==="PUT"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); if (!(await dbWriteRate(request,env))) return json({error:"Muitas alterações em pouco tempo."},429,cors); const id=intId(projectMatch[1]),x=cleanProject(await parseJson(request)); if(!id||!x.code||!x.name)return json({error:"Dados inválidos."},400,cors);
        try{await env.DB.prepare("UPDATE projects SET code=?,name=?,status=?,priority=?,type=?,site_id=?,location=?,start_date=?,due_date=?,completed_date=?,customer_request=?,scope_summary=?,description=?,quoted_value=?,approved_value=?,payment_status=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(x.code,x.name,x.status,x.priority,x.type,x.siteId||null,x.location,x.startDate,x.dueDate,x.completedDate,x.customerRequest,x.scopeSummary,x.description,x.quotedValue,x.approvedValue,x.paymentStatus,x.notes,id).run(); await auditDb(env,"update","project",String(id),x.code); return json({ok:true},200,cors);}catch(_){return json({error:"Código de projeto já existe ou os dados são inválidos."},409,cors);}
      }
      if(projectMatch && request.method==="DELETE"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); if (!(await dbWriteRate(request,env))) return json({error:"Muitas alterações em pouco tempo."},429,cors); const id=intId(projectMatch[1]); await env.DB.batch([env.DB.prepare("DELETE FROM project_people WHERE project_id=?").bind(id),env.DB.prepare("DELETE FROM assets WHERE project_id=?").bind(id),env.DB.prepare("DELETE FROM project_systems WHERE project_id=?").bind(id),env.DB.prepare("DELETE FROM project_records WHERE project_id=?").bind(id),env.DB.prepare("DELETE FROM project_materials WHERE project_id=?").bind(id),env.DB.prepare("UPDATE service_orders SET project_id=NULL WHERE project_id=?").bind(id),env.DB.prepare("DELETE FROM projects WHERE id=?").bind(id)]); await auditDb(env,"delete","project",String(id)); return json({ok:true},200,cors);
      }

      const projectPeople=/^\/db\/projects\/(\d+)\/people$/.exec(url.pathname);
      if(projectPeople && request.method==="GET"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const id=intId(projectPeople[1]); const r=await env.DB.prepare("SELECT p.id,p.name,p.kind,p.phone,p.email,p.organization,pp.role,pp.notes FROM project_people pp JOIN people p ON p.id=pp.person_id WHERE pp.project_id=? ORDER BY p.name").bind(id).all(); return json({ok:true,items:r.results||[]},200,cors);
      }
      if(projectPeople && request.method==="POST"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); if (!(await dbWriteRate(request,env))) return json({error:"Muitas alterações em pouco tempo."},429,cors); const projectId=intId(projectPeople[1]),b=await parseJson(request),personId=intId(b.personId),role=str(b.role,100),notes=str(b.notes,300); if(!projectId||!personId)return json({error:"Projeto ou pessoa inválidos."},400,cors); await env.DB.prepare("INSERT INTO project_people(project_id,person_id,role,notes) VALUES(?,?,?,?) ON CONFLICT(project_id,person_id) DO UPDATE SET role=excluded.role,notes=excluded.notes").bind(projectId,personId,role,notes).run(); await auditDb(env,"link","project_person",`${projectId}:${personId}`,role); return json({ok:true},200,cors);
      }
      const unlink=/^\/db\/projects\/(\d+)\/people\/(\d+)$/.exec(url.pathname);
      if(unlink && request.method==="DELETE"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const projectId=intId(unlink[1]),personId=intId(unlink[2]); await env.DB.prepare("DELETE FROM project_people WHERE project_id=? AND person_id=?").bind(projectId,personId).run(); await auditDb(env,"unlink","project_person",`${projectId}:${personId}`); return json({ok:true},200,cors);
      }

      if(url.pathname==="/db/systems" && request.method==="GET"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const projectId=intId(url.searchParams.get("projectId")); const stmt=projectId?env.DB.prepare("SELECT s.*,p.code AS project_code,p.name AS project_name FROM project_systems s JOIN projects p ON p.id=s.project_id WHERE s.project_id=? ORDER BY s.id DESC LIMIT 1000").bind(projectId):env.DB.prepare("SELECT s.*,p.code AS project_code,p.name AS project_name FROM project_systems s JOIN projects p ON p.id=s.project_id ORDER BY s.id DESC LIMIT 1000"); const r=await stmt.all(); return json({ok:true,items:r.results||[]},200,cors);
      }
      if(url.pathname==="/db/systems" && request.method==="POST"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); if (!(await dbWriteRate(request,env))) return json({error:"Muitas alterações em pouco tempo."},429,cors); const x=cleanSystem(await parseJson(request)); if(!x.projectId||!x.name)return json({error:"Projeto e nome do sistema são obrigatórios."},400,cors); const r=await env.DB.prepare("INSERT INTO project_systems(project_id,kind,name,area,status,description,specs,notes,updated_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(x.projectId,x.kind,x.name,x.area,x.status,x.description,x.specs,x.notes).run(); await auditDb(env,"create","system",String(r.meta?.last_row_id||""),x.name); return json({ok:true,id:r.meta?.last_row_id||null},201,cors);
      }
      const systemMatch=/^\/db\/systems\/(\d+)$/.exec(url.pathname);
      if(systemMatch && request.method==="PUT"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const id=intId(systemMatch[1]),x=cleanSystem(await parseJson(request)); if(!id||!x.projectId||!x.name)return json({error:"Dados inválidos."},400,cors); await env.DB.prepare("UPDATE project_systems SET project_id=?,kind=?,name=?,area=?,status=?,description=?,specs=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(x.projectId,x.kind,x.name,x.area,x.status,x.description,x.specs,x.notes,id).run(); await auditDb(env,"update","system",String(id),x.name); return json({ok:true},200,cors);
      }
      if(systemMatch && request.method==="DELETE"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const id=intId(systemMatch[1]); await env.DB.batch([env.DB.prepare("UPDATE assets SET system_id=NULL WHERE system_id=?").bind(id),env.DB.prepare("DELETE FROM project_systems WHERE id=?").bind(id)]); await auditDb(env,"delete","system",String(id)); return json({ok:true},200,cors);
      }

      if(url.pathname==="/db/assets" && request.method==="GET"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const r=await env.DB.prepare("SELECT a.*,p.code AS project_code,s.name AS system_name,s.kind AS system_kind FROM assets a JOIN projects p ON p.id=a.project_id LEFT JOIN project_systems s ON s.id=a.system_id ORDER BY a.updated_at DESC LIMIT 2000").all(); return json({ok:true,items:r.results||[]},200,cors);
      }
      if(url.pathname==="/db/assets" && request.method==="POST"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const x=cleanAsset(await parseJson(request)); if(!x.projectId||!x.category)return json({error:"Projeto e categoria são obrigatórios."},400,cors); const r=await env.DB.prepare("INSERT INTO assets(project_id,system_id,category,brand,model,serial_number,mac_address,ip_address,vlan,channel,location,firmware,power_source,installed_at,warranty_until,status,credential_ref,specs,notes,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(x.projectId,x.systemId||null,x.category,x.brand,x.model,x.serialNumber,x.macAddress,x.ipAddress,x.vlan,x.channel,x.location,x.firmware,x.powerSource,x.installedAt,x.warrantyUntil,x.status,x.credentialRef,x.specs,x.notes).run(); await auditDb(env,"create","asset",String(r.meta?.last_row_id||""),`${x.category} ${x.model}`); return json({ok:true,id:r.meta?.last_row_id||null},201,cors);
      }
      const assetMatch=/^\/db\/assets\/(\d+)$/.exec(url.pathname);
      if(assetMatch && request.method==="PUT"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const id=intId(assetMatch[1]),x=cleanAsset(await parseJson(request)); if(!id||!x.projectId||!x.category)return json({error:"Dados inválidos."},400,cors); await env.DB.prepare("UPDATE assets SET project_id=?,system_id=?,category=?,brand=?,model=?,serial_number=?,mac_address=?,ip_address=?,vlan=?,channel=?,location=?,firmware=?,power_source=?,installed_at=?,warranty_until=?,status=?,credential_ref=?,specs=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(x.projectId,x.systemId||null,x.category,x.brand,x.model,x.serialNumber,x.macAddress,x.ipAddress,x.vlan,x.channel,x.location,x.firmware,x.powerSource,x.installedAt,x.warrantyUntil,x.status,x.credentialRef,x.specs,x.notes,id).run(); await auditDb(env,"update","asset",String(id),`${x.category} ${x.model}`); return json({ok:true},200,cors);
      }
      if(assetMatch && request.method==="DELETE"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const id=intId(assetMatch[1]); await env.DB.prepare("DELETE FROM assets WHERE id=?").bind(id).run(); await auditDb(env,"delete","asset",String(id)); return json({ok:true},200,cors);
      }

      if(url.pathname==="/db/records" && request.method==="GET"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const r=await env.DB.prepare("SELECT r.*,p.code AS project_code,p.name AS project_name FROM project_records r JOIN projects p ON p.id=r.project_id ORDER BY COALESCE(NULLIF(r.record_date,''),r.created_at) DESC,r.id DESC LIMIT 3000").all(); return json({ok:true,items:r.results||[]},200,cors);
      }
      if(url.pathname==="/db/records" && request.method==="POST"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const x=cleanRecord(await parseJson(request)); if(!x.projectId||!x.title)return json({error:"Projeto e título são obrigatórios."},400,cors); const r=await env.DB.prepare("INSERT INTO project_records(project_id,category,title,status,record_date,area,details,reference_url,updated_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(x.projectId,x.category,x.title,x.status,x.recordDate,x.area,x.details,x.referenceUrl).run(); await auditDb(env,"create","record",String(r.meta?.last_row_id||""),x.title); return json({ok:true,id:r.meta?.last_row_id||null},201,cors);
      }
      const recordMatch=/^\/db\/records\/(\d+)$/.exec(url.pathname);
      if(recordMatch && request.method==="PUT"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const id=intId(recordMatch[1]),x=cleanRecord(await parseJson(request)); if(!id||!x.projectId||!x.title)return json({error:"Dados inválidos."},400,cors); await env.DB.prepare("UPDATE project_records SET project_id=?,category=?,title=?,status=?,record_date=?,area=?,details=?,reference_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(x.projectId,x.category,x.title,x.status,x.recordDate,x.area,x.details,x.referenceUrl,id).run(); await auditDb(env,"update","record",String(id),x.title); return json({ok:true},200,cors);
      }
      if(recordMatch && request.method==="DELETE"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const id=intId(recordMatch[1]); await env.DB.prepare("DELETE FROM project_records WHERE id=?").bind(id).run(); await auditDb(env,"delete","record",String(id)); return json({ok:true},200,cors);
      }

      if(url.pathname==="/db/materials" && request.method==="GET"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const r=await env.DB.prepare("SELECT m.*,p.name AS supplier_name FROM materials m LEFT JOIN people p ON p.id=m.supplier_id WHERE m.active=1 ORDER BY m.name LIMIT 2000").all(); return json({ok:true,items:r.results||[]},200,cors);
      }
      if(url.pathname==="/db/materials" && request.method==="POST"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const x=cleanMaterial(await parseJson(request)); if(!x.name)return json({error:"Nome do material obrigatório."},400,cors); const r=await env.DB.prepare("INSERT INTO materials(sku,name,category,brand,model,unit,current_stock,min_stock,unit_cost,supplier_id,notes,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(x.sku,x.name,x.category,x.brand,x.model,x.unit,x.currentStock,x.minStock,x.unitCost,x.supplierId||null,x.notes).run(); await auditDb(env,"create","material",String(r.meta?.last_row_id||""),x.name); return json({ok:true,id:r.meta?.last_row_id||null},201,cors);
      }
      const materialMatch=/^\/db\/materials\/(\d+)$/.exec(url.pathname);
      if(materialMatch && request.method==="PUT"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const id=intId(materialMatch[1]),x=cleanMaterial(await parseJson(request)); if(!id||!x.name)return json({error:"Dados inválidos."},400,cors); await env.DB.prepare("UPDATE materials SET sku=?,name=?,category=?,brand=?,model=?,unit=?,current_stock=?,min_stock=?,unit_cost=?,supplier_id=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(x.sku,x.name,x.category,x.brand,x.model,x.unit,x.currentStock,x.minStock,x.unitCost,x.supplierId||null,x.notes,id).run(); await auditDb(env,"update","material",String(id),x.name); return json({ok:true},200,cors);
      }
      if(materialMatch && request.method==="DELETE"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const id=intId(materialMatch[1]); await env.DB.batch([env.DB.prepare("DELETE FROM project_materials WHERE material_id=?").bind(id),env.DB.prepare("DELETE FROM materials WHERE id=?").bind(id)]); await auditDb(env,"delete","material",String(id)); return json({ok:true},200,cors);
      }
      const projectMaterials=/^\/db\/projects\/(\d+)\/materials$/.exec(url.pathname);
      if(projectMaterials && request.method==="GET"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const id=intId(projectMaterials[1]); const r=await env.DB.prepare("SELECT m.id,m.sku,m.name,m.category,m.unit,pm.planned_qty,pm.used_qty,pm.notes FROM project_materials pm JOIN materials m ON m.id=pm.material_id WHERE pm.project_id=? ORDER BY m.name").bind(id).all(); return json({ok:true,items:r.results||[]},200,cors);
      }
      if(projectMaterials && request.method==="POST"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const projectId=intId(projectMaterials[1]),b=await parseJson(request),materialId=intId(b.materialId),planned=nonneg(b.plannedQty),used=nonneg(b.usedQty),notes=str(b.notes,300); if(!projectId||!materialId)return json({error:"Projeto ou material inválido."},400,cors); await env.DB.prepare("INSERT INTO project_materials(project_id,material_id,planned_qty,used_qty,notes) VALUES(?,?,?,?,?) ON CONFLICT(project_id,material_id) DO UPDATE SET planned_qty=excluded.planned_qty,used_qty=excluded.used_qty,notes=excluded.notes").bind(projectId,materialId,planned,used,notes).run(); await auditDb(env,"link","project_material",`${projectId}:${materialId}`); return json({ok:true},200,cors);
      }
      const unlinkMaterial=/^\/db\/projects\/(\d+)\/materials\/(\d+)$/.exec(url.pathname);
      if(unlinkMaterial && request.method==="DELETE"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const projectId=intId(unlinkMaterial[1]),materialId=intId(unlinkMaterial[2]); await env.DB.prepare("DELETE FROM project_materials WHERE project_id=? AND material_id=?").bind(projectId,materialId).run(); await auditDb(env,"unlink","project_material",`${projectId}:${materialId}`); return json({ok:true},200,cors);
      }

      if(url.pathname==="/db/services" && request.method==="GET"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const r=await env.DB.prepare("SELECT so.*,p.code AS project_code,p.name AS project_name,s.name AS site_name FROM service_orders so LEFT JOIN projects p ON p.id=so.project_id LEFT JOIN sites s ON s.id=so.site_id ORDER BY COALESCE(NULLIF(so.scheduled_at,''),so.created_at) DESC LIMIT 2000").all(); return json({ok:true,items:r.results||[]},200,cors);
      }
      if(url.pathname==="/db/services" && request.method==="POST"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const x=cleanService(await parseJson(request)); const r=await env.DB.prepare("INSERT INTO service_orders(project_id,site_id,kind,status,scheduled_at,started_at,finished_at,next_maintenance_at,summary,technician_notes,customer_notes,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(x.projectId||null,x.siteId||null,x.kind,x.status,x.scheduledAt,x.startedAt,x.finishedAt,x.nextMaintenanceAt,x.summary,x.technicianNotes,x.customerNotes).run(); await auditDb(env,"create","service",String(r.meta?.last_row_id||""),x.kind); return json({ok:true,id:r.meta?.last_row_id||null},201,cors);
      }
      const serviceMatch=/^\/db\/services\/(\d+)$/.exec(url.pathname);
      if(serviceMatch && request.method==="PUT"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const id=intId(serviceMatch[1]),x=cleanService(await parseJson(request)); if(!id)return json({error:"ID inválido."},400,cors); await env.DB.prepare("UPDATE service_orders SET project_id=?,site_id=?,kind=?,status=?,scheduled_at=?,started_at=?,finished_at=?,next_maintenance_at=?,summary=?,technician_notes=?,customer_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(x.projectId||null,x.siteId||null,x.kind,x.status,x.scheduledAt,x.startedAt,x.finishedAt,x.nextMaintenanceAt,x.summary,x.technicianNotes,x.customerNotes,id).run(); await auditDb(env,"update","service",String(id),x.kind); return json({ok:true},200,cors);
      }
      if(serviceMatch && request.method==="DELETE"){
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors); const id=intId(serviceMatch[1]); await env.DB.prepare("DELETE FROM service_orders WHERE id=?").bind(id).run(); await auditDb(env,"delete","service",String(id)); return json({ok:true},200,cors);
      }

      if(url.pathname==="/db/export" && request.method==="GET"){
        const exportSession=await getControlSession(request,env,"data_export");if(!exportSession)return json({error:"Sessão inválida ou sem permissão para exportar dados."},403,cors);
        const queries = {
          people: "SELECT * FROM people ORDER BY id",
          sites: "SELECT * FROM sites ORDER BY id",
          projects: "SELECT * FROM projects ORDER BY id",
          project_people: "SELECT * FROM project_people ORDER BY project_id, person_id",
          project_systems: "SELECT * FROM project_systems ORDER BY id",
          assets: "SELECT * FROM assets ORDER BY id",
          project_records: "SELECT * FROM project_records ORDER BY id",
          materials: "SELECT * FROM materials ORDER BY id",
          project_materials: "SELECT * FROM project_materials ORDER BY project_id, material_id",
          service_orders: "SELECT * FROM service_orders ORDER BY id",
          audit_log: "SELECT * FROM audit_log ORDER BY id"
        };
        const out={ok:true,exportedAt:new Date().toISOString()};
        for(const [name,sql] of Object.entries(queries)){const r=await env.DB.prepare(sql).all().catch(()=>({results:[]})); out[name]=r.results||[];} return json(out,200,cors);
      }




      if (url.pathname === "/publish-visibility" && request.method === "POST") {
        if (!env.GITHUB_TOKEN) return json({error:"Token de publicação do GitHub não configurado."},503,cors);
        const session = await getControlSession(request, env, "site_visibility"); if (!session) return json({error:"Sessão inválida, expirada ou sem permissão."},403,cors);
        if (!(await consumeRate(env, `publish-visibility:${clientIp(request)}`, 20, 600))) return json({error:"Muitas publicações em pouco tempo."},429,cors);
        const payload=await parseJson(request); let cleanData; try{cleanData=normalizeVisibilityData(payload.data)}catch(_){return json({error:"Dados de visibilidade inválidos."},400,cors)}
        const owner=env.GITHUB_OWNER,repo=env.GITHUB_REPO,branch=env.GITHUB_BRANCH||"main",path="visibility-data.js"; if(!owner||!repo)return json({error:"Repositório não configurado."},500,cors);
        const content=`window.GHOST_VISIBILITY = ${safeJsonForJs(cleanData)};\n`; const apiUrl=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${encodeURIComponent(branch)}`; const current=await fetch(apiUrl,{headers:githubHeaders(env.GITHUB_TOKEN)}); if(!current.ok)return json({error:`Não foi possível ler ${path} no GitHub.`},502,cors); const currentFile=await current.json();
        const update=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`,{method:"PUT",headers:{...githubHeaders(env.GITHUB_TOKEN),"Content-Type":"application/json"},body:JSON.stringify({message:"Atualiza visibilidade do site pelo painel G-Host",content:encodeBase64Utf8(content),sha:currentFile.sha,branch})}); const result=await update.json().catch(()=>({})); if(!update.ok)return json({error:result.message||"O GitHub recusou a atualização."},502,cors); return json({ok:true,message:"Visibilidade publicada com sucesso."},200,cors);
      }

      if (url.pathname === "/publish-catalog" && request.method === "POST") {
        if (!env.GITHUB_TOKEN) return json({error:"Token de publicação do GitHub não configurado."},503,cors);
        const session = await getControlSession(request, env, "prices"); if (!session) return json({error:"Sessão inválida, expirada ou sem permissão."},403,cors);
        if (!(await consumeRate(env, `publish-catalog:${clientIp(request)}`, 20, 600))) return json({error:"Muitas publicações em pouco tempo."},429,cors);
        const payload=await parseJson(request); let cleanData; try{cleanData=normalizeCatalogData(payload.data)}catch(error){return json({error:error?.message==="PAYLOAD_TOO_LARGE"?"Catálogo excede o limite permitido.":"Dados do catálogo inválidos."},400,cors)}
        const owner=env.GITHUB_OWNER,repo=env.GITHUB_REPO,branch=env.GITHUB_BRANCH||"main",path="catalog-data.js"; if(!owner||!repo)return json({error:"Repositório não configurado."},500,cors);
        const content=`window.GHOST_CATALOG = ${safeJsonForJs(cleanData)};\n`; const apiUrl=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${encodeURIComponent(branch)}`; const current=await fetch(apiUrl,{headers:githubHeaders(env.GITHUB_TOKEN)}); if(!current.ok)return json({error:`Não foi possível ler ${path} no GitHub.`},502,cors); const currentFile=await current.json();
        const update=await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`,{method:"PUT",headers:{...githubHeaders(env.GITHUB_TOKEN),"Content-Type":"application/json"},body:JSON.stringify({message:"Atualiza catálogo e autoatendimento pelo painel G-Host",content:encodeBase64Utf8(content),sha:currentFile.sha,branch})}); const result=await update.json().catch(()=>({})); if(!update.ok)return json({error:result.message||"O GitHub recusou a atualização."},502,cors); return json({ok:true,message:"Catálogo publicado com sucesso."},200,cors);
      }

      if (url.pathname === "/publish-plans" && request.method === "POST") {
        if (!env.GITHUB_TOKEN) return json({error:"Token de publicação do GitHub não configurado."},503,cors);
        const session = await getControlSession(request, env, "prices");
        if (!session) return json({ error: "Sessão inválida, expirada ou sem permissão para planos/preços." }, 403, cors);
        const ip = clientIp(request);
        if (!(await consumeRate(env, `publish-plans:${ip}`, 20, 600))) return json({ error: "Muitas publicações em pouco tempo. Aguarde alguns minutos." }, 429, cors);

        const payload = await parseJson(request);
        let cleanData;
        try { cleanData = normalizePlansData(payload.data); }
        catch (error) {
          if (error?.message === "PAYLOAD_TOO_LARGE") return json({ error: "Conteúdo dos planos excede o limite permitido." }, 413, cors);
          return json({ error: "Dados dos planos inválidos." }, 400, cors);
        }

        const owner = env.GITHUB_OWNER;
        const repo = env.GITHUB_REPO;
        const branch = env.GITHUB_BRANCH || "main";
        const path = "plans-data.js";
        if (!owner || !repo) return json({ error: "Repositório não configurado no servidor." }, 500, cors);

        const content = `window.GHOST_PLANS = ${safeJsonForJs(cleanData)};\n`;
        const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${encodeURIComponent(branch)}`;
        const current = await fetch(apiUrl, { headers: githubHeaders(env.GITHUB_TOKEN) });
        if (!current.ok) return json({ error: `Não foi possível ler ${path} no GitHub.` }, 502, cors);
        const currentFile = await current.json();

        const updateUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;
        const update = await fetch(updateUrl, {
          method: "PUT",
          headers: { ...githubHeaders(env.GITHUB_TOKEN), "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "Atualiza planos e promoções pelo painel G-Host",
            content: encodeBase64Utf8(content),
            sha: currentFile.sha,
            branch
          })
        });
        const result = await update.json().catch(() => ({}));
        if (!update.ok) return json({ error: result.message || "O GitHub recusou a atualização dos planos." }, update.status < 500 ? 400 : 502, cors);

        await putAudit(env, "lastPlansPublish", { at: Date.now(), commit: result.commit?.sha || null, uaHash: session.data.uaHash });
        return json({ ok: true, message: "Planos e promoções publicados com sucesso.", commit: result.commit?.sha || null }, 200, cors);
      }

      if (url.pathname === "/publish" && request.method === "POST") {
        if (!env.GITHUB_TOKEN) return json({error:"Token de publicação do GitHub não configurado."},503,cors);
        const session = await getControlSession(request, env, "site_edit");
        if (!session) return json({ error: "Sessão inválida, expirada ou sem permissão para editar o site." }, 403, cors);
        const ip = clientIp(request);
        if (!(await consumeRate(env, `publish:${ip}`, 20, 600))) return json({ error: "Muitas publicações em pouco tempo. Aguarde alguns minutos." }, 429, cors);

        const payload = await parseJson(request);
        let cleanData;
        try { cleanData = normalizeSiteData(payload.data); }
        catch (error) {
          if (error?.message === "PAYLOAD_TOO_LARGE") return json({ error: "Conteúdo excede o limite permitido." }, 413, cors);
          return json({ error: "Dados do site inválidos." }, 400, cors);
        }

        const owner = env.GITHUB_OWNER;
        const repo = env.GITHUB_REPO;
        const branch = env.GITHUB_BRANCH || "main";
        const path = "site-data.js";
        if (!owner || !repo) return json({ error: "Repositório não configurado no servidor." }, 500, cors);

        const content = `window.SITE_DATA = ${safeJsonForJs(cleanData)};\n`;
        const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}?ref=${encodeURIComponent(branch)}`;
        const current = await fetch(apiUrl, { headers: githubHeaders(env.GITHUB_TOKEN) });
        if (!current.ok) return json({ error: `Não foi possível ler ${path} no GitHub.` }, 502, cors);
        const currentFile = await current.json();

        const updateUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`;
        const update = await fetch(updateUrl, {
          method: "PUT",
          headers: { ...githubHeaders(env.GITHUB_TOKEN), "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "Atualiza conteúdo do site pelo painel G-Host",
            content: encodeBase64Utf8(content),
            sha: currentFile.sha,
            branch
          })
        });

        const result = await update.json().catch(() => ({}));
        if (!update.ok) return json({ error: result.message || "O GitHub recusou a atualização." }, update.status < 500 ? 400 : 502, cors);

        await putAudit(env, "lastPublish", { at: Date.now(), commit: result.commit?.sha || null });
        return json({
          ok: true,
          message: "Alterações salvas com segurança. O GitHub Pages está publicando a nova versão.",
          commit: result.commit?.html_url || null,
          site: env.SITE_URL || null,
          updatedAt: cleanData._meta.updatedAt
        }, 200, cors);
      }

      return json({ error: "Rota não encontrada." }, 404, cors);
    } catch (error) {
      if (error?.message === "PAYLOAD_TOO_LARGE") return json({ error: "Requisição muito grande." }, 413, cors);
      if (error?.message === "INVALID_JSON") return json({ error: "JSON inválido." }, 400, cors);
      console.error("worker_internal_error", {
        requestId,
        method: request.method,
        path: url.pathname,
        stage: failureStage,
        errorName: String(error?.name || "Error").slice(0, 60),
        errorCode: String(error?.code || "").slice(0, 80),
        message: sanitizeLogText(error?.message || "")
      });
      return json({
        error: "Falha interna de segurança. Tente novamente.",
        code: "INTERNAL_ERROR",
        requestId
      }, 500, { ...cors, "X-Request-Id": requestId });
    }
  }
};
