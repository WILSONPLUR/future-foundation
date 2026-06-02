
const prisma = require("../config/db");
const env = require("../config/env");
const { normalizeJarId } = require("../utils/helpers");

let monoLastSyncAt = 0;
let monoSyncInFlight = null;
let monoLastPublicRefreshAt = 0;

async function fetchMonobankClientInfo() {
  const token = env.MONO_TOKEN;
  if (!token) throw new Error("MONO_TOKEN is missing");

  const response = await fetch("https://api.monobank.ua/personal/client-info", {
    headers: { "X-Token": token },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Monobank API failed: ${response.status} ${body}`);
  }
  return response.json();
}

async function syncCampaignProgressFromMono() {
  const data = await fetchMonobankClientInfo();
  const jars = Array.isArray(data.jars) ? data.jars : [];

  const campaigns = await prisma.campaign.findMany({
    where: { status: { in: ["active", "completed"] }, monoJarId: { not: null } },
    select: { id: true, monoJarId: true },
  });

  let synced = 0;
  for (const campaign of campaigns) {
    const campaignJarId = normalizeJarId(campaign.monoJarId);
    const jar = jars.find((item) => normalizeJarId(item.sendId) === campaignJarId);
    if (!jar) continue;

    const balance = Number((jar.balance || 0) / 100);
    const goal = Number((jar.goal || 0) / 100);
    const percent = goal > 0 ? (balance / goal) * 100 : 0;

    await prisma.$transaction([
      prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          raisedAmount: balance,
          goalAmount: goal > 0 ? goal : undefined,
        },
      }),
      prisma.campaignProgressSnapshot.create({
        data: {
          campaignId: campaign.id,
          balance,
          goal: goal > 0 ? goal : balance,
          percent,
        },
      }),
    ]);
    synced += 1;
  }

  return { synced, jars: jars.length };
}

async function syncCampaignProgressIfNeeded() {
  const now = Date.now();
  if (!env.MONO_TOKEN) return;

  if (monoSyncInFlight) {
    await monoSyncInFlight;
    return;
  }

  if (now - monoLastSyncAt < env.MONO_SYNC_MIN_INTERVAL_MS) return;

  monoSyncInFlight = syncCampaignProgressFromMono()
    .then(() => {
      monoLastSyncAt = Date.now();
    })
    .catch((error) => {
      monoLastSyncAt = Date.now();
      console.warn("Monobank sync skipped on GET:", error.message);
    })
    .finally(() => {
      monoSyncInFlight = null;
    });

  await monoSyncInFlight;
}

async function syncCampaignProgressForce() {
  if (!env.MONO_TOKEN) return { ok: false, skipped: true, reason: "MONO_TOKEN missing" };

  if (monoSyncInFlight) {
    await monoSyncInFlight;
    return { ok: true, skipped: false, reason: "joined in-flight sync" };
  }

  monoSyncInFlight = syncCampaignProgressFromMono()
    .then((result) => {
      monoLastSyncAt = Date.now();
      return result;
    })
    .finally(() => {
      monoSyncInFlight = null;
    });

  const result = await monoSyncInFlight;
  return { ok: true, skipped: false, ...result };
}

function getMonoPublicRefreshState() {
  return { monoLastPublicRefreshAt };
}

function setMonoPublicRefreshState(time) {
  monoLastPublicRefreshAt = time;
}

module.exports = {
  syncCampaignProgressFromMono,
  syncCampaignProgressIfNeeded,
  syncCampaignProgressForce,
  getMonoPublicRefreshState,
  setMonoPublicRefreshState
};
