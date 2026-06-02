
const { syncCampaignProgressFromMono } = require("../services/mono.service");

exports.syncMono = async (_req, res) => {
  const result = await syncCampaignProgressFromMono();
  res.json({ ok: true, ...result });
};

exports.getHealth = (_req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
};
