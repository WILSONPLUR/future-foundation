
const crypto = require("crypto");

function safeCompare(expected, actual) {
  const a = Buffer.from(String(expected || ""));
  const b = Buffer.from(String(actual || ""));
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeJarId(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/send\.monobank\.ua\/jar\//i, "")
    .replace(/^jar\//i, "");
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9а-яіїєґ]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

module.exports = { safeCompare, normalizeText, normalizeJarId, slugify };
