
const prisma = require("../config/db");
const { validateRequestPayload } = require("../utils/validators");

exports.createRequest = async (req, res, forcedType = null) => {
  const payload = forcedType ? { ...req.body, type: forcedType } : req.body;
  const parsed = validateRequestPayload(payload);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const created = await prisma.request.create({ data: parsed });
  return res.status(201).json({ ok: true, id: created.id });
};
