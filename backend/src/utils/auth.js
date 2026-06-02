
const jwt = require("jsonwebtoken");
const env = require("../config/env");

function signAuthToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, name: user.name },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

function getBearerToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

function getAuthToken(req) {
  return getBearerToken(req) || req.cookies?.ff_auth_token || null;
}

module.exports = { signAuthToken, getBearerToken, getAuthToken };
