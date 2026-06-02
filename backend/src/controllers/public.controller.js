
const prisma = require("../config/db");
const env = require("../config/env");
const { syncCampaignProgressIfNeeded, syncCampaignProgressForce, getMonoPublicRefreshState, setMonoPublicRefreshState } = require("../services/mono.service");

function toPublicCampaign(c) {
  const goal = Number(c.goalAmount || 0);
  const raised = Number(c.raisedAmount || 0);
  const progressPercent = goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    shortDesc: c.shortDesc,
    content: c.content,
    monoJarUrl: c.monoJarUrl,
    goalAmount: goal,
    raisedAmount: raised,
    progressPercent,
    currency: c.currency,
    status: c.status,
    isFeatured: c.isFeatured,
    coverImage: c.coverImage,
    publishedAt: c.publishedAt,
  };
}

exports.getCampaigns = async (req, res) => {
  const featuredOnly = req.query.featured === "true";
  await syncCampaignProgressIfNeeded();
  res.set("Cache-Control", "no-store");

  const campaigns = await prisma.campaign.findMany({
    where: {
      status: { in: ["active", "completed"] },
      ...(featuredOnly ? { isFeatured: true } : {}),
    },
    orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
  });
  res.json(campaigns.map(toPublicCampaign));
};

exports.getCampaignBySlug = async (req, res) => {
  await syncCampaignProgressIfNeeded();
  res.set("Cache-Control", "no-store");
  const campaign = await prisma.campaign.findFirst({
    where: { slug: req.params.slug, status: { in: ["active", "completed"] } },
  });
  if (!campaign) return res.status(404).json({ error: "Campaign not found" });
  res.json(toPublicCampaign(campaign));
};

exports.refreshCampaigns = async (_req, res) => {
  const now = Date.now();
  const { monoLastPublicRefreshAt } = getMonoPublicRefreshState();
  if (now - monoLastPublicRefreshAt < env.MONO_PUBLIC_REFRESH_MIN_INTERVAL_MS) {
    return res.status(202).json({
      ok: true,
      skipped: true,
      reason: "cooldown",
      retryInMs: env.MONO_PUBLIC_REFRESH_MIN_INTERVAL_MS - (now - monoLastPublicRefreshAt),
    });
  }
  try {
    const result = await syncCampaignProgressForce();
    setMonoPublicRefreshState(Date.now());
    return res.json(result);
  } catch {
    return res.status(500).json({ ok: false, error: "Failed to refresh campaigns" });
  }
};

exports.getPartners = async (_req, res) => {
  const partners = await prisma.partner.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  res.json(partners);
};

exports.getFaqs = async (_req, res) => {
  const faqs = await prisma.faq.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  res.json(faqs);
};

exports.getCases = async (_req, res) => {
  const cases = await prisma.case.findMany({
    where: { status: "published" },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });
  res.json(cases);
};

exports.getCaseBySlug = async (req, res) => {
  const item = await prisma.case.findFirst({
    where: { slug: req.params.slug, status: "published" },
  });
  if (!item) return res.status(404).json({ error: "Case not found" });
  res.json(item);
};

exports.getPosts = async (_req, res) => {
  const posts = await prisma.post.findMany({
    where: { status: "published", deletedAt: null },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });
  res.json(posts);
};

exports.getPostBySlug = async (req, res) => {
  const post = await prisma.post.findFirst({
    where: { slug: req.params.slug, status: "published", deletedAt: null },
  });
  if (!post) return res.status(404).json({ error: "Post not found" });
  res.json(post);
};

exports.getReports = async (_req, res) => {
  const reports = await prisma.report.findMany({
    where: { status: "published" },
    orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
  });
  res.json(reports);
};

exports.getActivities = async (_req, res) => {
  const activities = await prisma.activity.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  res.json(activities);
};

exports.getHelpOptions = async (_req, res) => {
  const options = await prisma.helpOption.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  res.json(options);
};

exports.getReviews = async (_req, res) => {
  const reviews = await prisma.review.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  res.json(reviews);
};
