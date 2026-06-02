
const jwt = require("jsonwebtoken");
const prisma = require("../config/db");
const env = require("../config/env");
const { getAuthToken, getBearerToken } = require("../utils/auth");
const { safeCompare } = require("../utils/helpers");

async function requireAuth(req, res, next) {
  try {
    const token = getAuthToken(req);
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: Number(decoded.sub) } });
    if (!user || !user.isActive) return res.status(401).json({ error: "Unauthorized" });

    req.authUser = user;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });
    if (!roles.includes(req.authUser.role)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

function requireInternalToken(req, res, next) {
  const internalToken = env.INTERNAL_API_TOKEN;
  const provided = getBearerToken(req) || "";
  if (!safeCompare(internalToken, provided)) return res.status(401).json({ error: "Unauthorized" });
  next();
}

module.exports = { requireAuth, requireRole, requireInternalToken };
