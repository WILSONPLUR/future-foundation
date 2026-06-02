
require("dotenv").config();

module.exports = {
  PORT: Number(process.env.PORT || 3000),
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || "*",
  JWT_SECRET: process.env.JWT_SECRET || "future-foundation-dev-secret",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "12h",
  MONO_SYNC_MIN_INTERVAL_MS: Number(process.env.MONO_SYNC_MIN_INTERVAL_MS || 5 * 60 * 1000),
  MONO_PUBLIC_REFRESH_MIN_INTERVAL_MS: Number(process.env.MONO_PUBLIC_REFRESH_MIN_INTERVAL_MS || 30 * 1000),
  MONO_TOKEN: process.env.MONO_TOKEN,
  DATABASE_URL: process.env.DATABASE_URL,
  INTERNAL_API_TOKEN: process.env.INTERNAL_API_TOKEN
};
