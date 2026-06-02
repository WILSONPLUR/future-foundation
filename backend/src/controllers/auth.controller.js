
const bcrypt = require("bcryptjs");
const prisma = require("../config/db");
const { signAuthToken } = require("../utils/auth");
const { validateLoginPayload } = require("../utils/validators");

exports.login = async (req, res) => {
  const parsed = validateLoginPayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { email, password } = parsed;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signAuthToken(user);
  res.json({ ok: true, token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
};

exports.logout = (req, res) => {
  res.json({ ok: true });
};

exports.getMe = async (req, res) => {
  res.json({
    ok: true,
    user: {
      id: req.authUser.id,
      email: req.authUser.email,
      role: req.authUser.role,
      name: req.authUser.name,
    },
  });
};
