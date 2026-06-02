
const { normalizeText, slugify } = require("./helpers");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s()\-]{10,24}$/;
const NAME_RE = /^[\p{L}\p{M}'’`\-\s]{2,80}$/u;
const UNSAFE_INPUT_RE = /<[^>]*>|javascript:|data:text\/html|on\w+\s*=|<\/script/i;
const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/;

function normalizeSingleLine(value) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function normalizeMultiline(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function isSuspiciousInput(value) {
  return CONTROL_CHAR_RE.test(String(value || "")) || UNSAFE_INPUT_RE.test(String(value || ""));
}

function normalizeRequestType(value) {
  const input = String(value || "").trim().toLowerCase();
  const allowed = new Set(["volunteer", "financial_support", "partnership"]);
  return allowed.has(input) ? input : null;
}

function validateRequestPayload(payload) {
  const name = normalizeSingleLine(payload?.name);
  const email = normalizeSingleLine(payload?.email).toLowerCase();
  const phone = normalizeSingleLine(payload?.phone);
  const message = normalizeMultiline(payload?.message);
  const type = normalizeRequestType(payload?.type);
  if (!name || !email || !type) return { error: "name, email and type are required" };
  if (!NAME_RE.test(name) || isSuspiciousInput(name)) return { error: "invalid name" };
  if (!EMAIL_RE.test(email) || email.length > 160 || isSuspiciousInput(email)) return { error: "invalid email" };
  if (phone && (!PHONE_RE.test(phone) || isSuspiciousInput(phone))) return { error: "invalid phone" };
  if (!message) return { error: "message is required" };
  if (message.length > 1000 || isSuspiciousInput(message)) return { error: "invalid message" };
  return { name, email, phone: phone || null, message: message || null, type };
}

function validateLoginPayload(payload) {
  const email = normalizeSingleLine(payload?.email).toLowerCase();
  const password = String(payload?.password || "");

  if (!email || !password) return { error: "email and password required" };
  if (!EMAIL_RE.test(email) || email.length > 160 || isSuspiciousInput(email)) return { error: "invalid email" };
  if (password.length > 128 || CONTROL_CHAR_RE.test(password) || UNSAFE_INPUT_RE.test(password)) {
    return { error: "invalid password" };
  }

  return { email, password };
}

function validatePostPayload(payload) {
  const title = normalizeText(payload?.title);
  const excerpt = normalizeText(payload?.excerpt);
  const content = normalizeText(payload?.content);
  const coverImage = normalizeText(payload?.coverImage);
  const requestedStatus = normalizeText(payload?.status || "draft").toLowerCase();
  const allowed = new Set(["draft", "review", "published"]);

  if (!title || !excerpt || !content) return { error: "title, excerpt, content are required" };
  if (!allowed.has(requestedStatus)) return { error: "invalid status" };

  const slugRaw = normalizeText(payload?.slug || title);
  const slug = slugify(slugRaw);
  if (!slug) return { error: "invalid slug" };

  return { title, excerpt, content, coverImage: coverImage || null, slug, status: requestedStatus };
}

module.exports = { validateRequestPayload, validatePostPayload, validateLoginPayload };
