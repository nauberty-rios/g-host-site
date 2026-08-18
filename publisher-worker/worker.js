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
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "600",
  "Vary": "Origin"
});

const clientIp = request => request.headers.get("CF-Connecting-IP") || "unknown";
const userAgent = request => (request.headers.get("User-Agent") || "unknown").slice(0, 300);

const requestFingerprint = async request => digestHex(`${clientIp(request)}|${userAgent(request)}`);
const userAgentHash = async request => digestHex(userAgent(request));

const consumeRate = async (env, key, limit, ttl) => {
  const full = `rate:${key}`;
  const current = Number(await env.AUTH_KV.get(full) || 0);
  if (current >= limit) return false;
  await env.AUTH_KV.put(full, String(current + 1), { expirationTtl: ttl });
  return true;
};

const maskEmail = email => {
  const [local = "", domain = ""] = String(email).split("@");
  if (!domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
};

const maskPhone = phone => {
  const digits = String(phone).replace(/\D/g, "");
  return digits.length >= 4 ? `+${digits.slice(0, 2)} •••••• ${digits.slice(-4)}` : "••••";
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

const twilioAuth = env => `Basic ${btoa(`${env.TWILIO_API_KEY_SID}:${env.TWILIO_API_KEY_SECRET}`)}`;

const startSms = async env => {
  const sid = encodeURIComponent(env.TWILIO_VERIFY_SERVICE_SID);
  const body = new URLSearchParams({ To: env.ADMIN_PHONE, Channel: "sms" });
  const response = await fetch(`https://verify.twilio.com/v2/Services/${sid}/Verifications`, {
    method: "POST",
    headers: { "Authorization": twilioAuth(env), "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) throw new Error("Não foi possível enviar o código por SMS.");
};

const checkSms = async (env, code) => {
  const sid = encodeURIComponent(env.TWILIO_VERIFY_SERVICE_SID);
  const body = new URLSearchParams({ To: env.ADMIN_PHONE, Code: code });
  const response = await fetch(`https://verify.twilio.com/v2/Services/${sid}/VerificationCheck`, {
    method: "POST",
    headers: { "Authorization": twilioAuth(env), "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const result = await response.json().catch(() => ({}));
  return response.ok && result.status === "approved";
};

const requireSecrets = env => [
  "GITHUB_TOKEN", "ADMIN_PASSWORD", "ADMIN_EMAIL", "ADMIN_PHONE", "RESEND_API_KEY",
  "TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET", "TWILIO_VERIFY_SERVICE_SID", "AUTH_PEPPER"
].every(k => Boolean(env[k])) && Boolean(env.AUTH_KV) && Boolean(env.EMAIL_FROM);

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

const parseJson = async request => {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 220_000) throw new Error("PAYLOAD_TOO_LARGE");
  return request.json();
};

const putAudit = async (env, key, data) => {
  try { await env.AUTH_KV.put(`audit:${key}`, JSON.stringify(data), { expirationTtl: 60 * 60 * 24 * 30 }); } catch (_) {}
};

const personKinds = new Set(["cliente", "contato", "fornecedor", "equipe", "outro"]);
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
  try { await env.DB.prepare("INSERT INTO audit_log(action, entity_type, entity_id, details) VALUES(?,?,?,?)").bind(str(action, 80), str(entityType, 80), str(entityId, 80), str(details, 1000)).run(); } catch (_) {}
};
const dbWriteRate = async (request, env) => consumeRate(env, `dbw:${clientIp(request)}`, 120, 600);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      if (!origin) return new Response(null, { status: 403, headers: securityHeaders });
      return new Response(null, { status: 204, headers: { ...securityHeaders, ...corsHeaders(origin) } });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "g-host-secure" });
    }

    if (!origin) return json({ error: "Origem não autorizada." }, 403);
    const cors = corsHeaders(origin);
    if (!requireSecrets(env)) return json({ error: "Backend de segurança incompleto." }, 503, cors);

    try {
      if (url.pathname === "/auth/password" && request.method === "POST") {
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
        const fingerprint = await requestFingerprint(request);
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
        if (!(await safeEqual(challenge.fingerprint || "", await requestFingerprint(request)))) {
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

        await startSms(env);
        challenge.step = "sms";
        delete challenge.emailMac;
        challenge.attempts = 0;
        challenge.expiresAt = Date.now() + 600_000;
        await env.AUTH_KV.put(key, JSON.stringify(challenge), { expirationTtl: 600 });
        return json({ ok: true, maskedPhone: maskPhone(env.ADMIN_PHONE), expiresIn: 600 }, 200, cors);
      }

      if (url.pathname === "/auth/sms/verify" && request.method === "POST") {
        const ip = clientIp(request);
        if (!(await consumeRate(env, `sms:${ip}`, 8, 600))) return json({ error: "Muitas tentativas de SMS. Aguarde alguns minutos." }, 429, cors);

        const payload = await parseJson(request);
        const id = String(payload.challengeId || "");
        const code = String(payload.code || "").replace(/\D/g, "");
        if (!id || code.length < 4 || code.length > 10) return json({ error: "Código SMS inválido." }, 400, cors);

        const key = `challenge:${id}`;
        const raw = await env.AUTH_KV.get(key);
        if (!raw) return json({ error: "Verificação expirada. Recomece o acesso." }, 401, cors);
        const challenge = JSON.parse(raw);
        if (challenge.step !== "sms" || Date.now() >= Number(challenge.expiresAt || 0)) {
          await env.AUTH_KV.delete(key);
          return json({ error: "Verificação expirada. Recomece o acesso." }, 401, cors);
        }
        if (!(await safeEqual(challenge.fingerprint || "", await requestFingerprint(request)))) {
          await env.AUTH_KV.delete(key);
          return json({ error: "A verificação mudou de dispositivo ou rede. Recomece o acesso." }, 401, cors);
        }

        challenge.attempts = Number(challenge.attempts || 0) + 1;
        if (challenge.attempts > 6) {
          await env.AUTH_KV.delete(key);
          return json({ error: "Limite de códigos excedido. Recomece o acesso." }, 429, cors);
        }
        await env.AUTH_KV.put(key, JSON.stringify(challenge), { expirationTtl: 600 });

        if (!(await checkSms(env, code))) return json({ error: "Código SMS incorreto ou expirado." }, 401, cors);

        const token = randomToken();
        const tokenHash = await digestHex(token);
        const ttl = Math.max(300, Math.min(3600, Number(env.SESSION_TTL_SECONDS || 1800)));
        const createdAt = Date.now();
        const expiresAt = createdAt + ttl * 1000;
        const sessionData = { createdAt, expiresAt, uaHash: await userAgentHash(request) };
        await env.AUTH_KV.put(`session:${tokenHash}`, JSON.stringify(sessionData), { expirationTtl: ttl });
        await env.AUTH_KV.delete(key);
        await putAudit(env, "lastAuth", { at: createdAt, uaHash: sessionData.uaHash });

        return json({ ok: true, token, expiresIn: ttl, expiresAt }, 200, cors);
      }

      if (url.pathname === "/auth/me" && request.method === "GET") {
        const session = await getSession(request, env);
        if (!session) return json({ error: "Sessão inválida ou expirada." }, 401, cors);
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

      const requireDbSession = async () => {
        const session = await getSession(request, env);
        return session || null;
      };

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
        if (!(await requireDbSession())) return json({error:"Sessão inválida ou expirada."},401,cors);
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


      if (url.pathname === "/publish" && request.method === "POST") {
        const session = await getSession(request, env);
        if (!session) return json({ error: "Sessão inválida ou expirada." }, 401, cors);
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
      return json({ error: "Falha interna de segurança. Tente novamente." }, 500, cors);
    }
  }
};
