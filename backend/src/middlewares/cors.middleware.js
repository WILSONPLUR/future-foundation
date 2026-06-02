
const env = require("../config/env");

const configuredOrigins = new Set(
  String(env.ALLOWED_ORIGIN || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);

function corsMiddleware(req, res, next) {
  const reqOrigin = req.headers.origin;
  const localAllowedOrigins = new Set([
    "http://127.0.0.1:9000",
    "http://localhost:9000",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
  ]);

  if (configuredOrigins.has("*")) {
    if (reqOrigin && localAllowedOrigins.has(reqOrigin)) {
      res.header("Access-Control-Allow-Origin", reqOrigin);
      res.header("Vary", "Origin");
    } else {
      res.header("Access-Control-Allow-Origin", "*");
    }
  } else if (reqOrigin && (configuredOrigins.has(reqOrigin) || localAllowedOrigins.has(reqOrigin))) {
    res.header("Access-Control-Allow-Origin", reqOrigin);
    res.header("Vary", "Origin");
  } else {
    const fallbackOrigin = [...configuredOrigins][0];
    if (fallbackOrigin) {
      res.header("Access-Control-Allow-Origin", fallbackOrigin);
    }
  }

  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}

module.exports = corsMiddleware;
