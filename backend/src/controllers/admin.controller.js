
const prisma = require("../config/db");
const { normalizeText } = require("../utils/helpers");
const { validatePostPayload } = require("../utils/validators");

exports.getPosts = async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));
  const skip = (page - 1) * limit;
  const search = normalizeText(req.query.search || "");
  const status = normalizeText(req.query.status || "");

  const where = {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(search ? { title: { contains: search, mode: "insensitive" } } : {}),
    ...(req.authUser.role === "editor" ? { authorId: req.authUser.id } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip,
      take: limit,
      include: {
        author: { select: { id: true, name: true, email: true } },
        updatedBy: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.post.count({ where }),
  ]);

  res.json({ items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
};

exports.getPostById = async (req, res) => {
  const id = Number(req.params.id);
  const post = await prisma.post.findUnique({ where: { id }, include: { author: true, updatedBy: true } });
  if (!post || post.deletedAt) return res.status(404).json({ error: "Post not found" });
  if (req.authUser.role === "editor" && post.authorId !== req.authUser.id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json(post);
};

exports.createPost = async (req, res) => {
  const parsed = validatePostPayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const status = req.authUser.role === "admin" ? parsed.status : parsed.status === "published" ? "review" : parsed.status;

  const existing = await prisma.post.findUnique({ where: { slug: parsed.slug } });
  if (existing) return res.status(409).json({ error: "Slug already exists" });

  const created = await prisma.post.create({
    data: {
      title: parsed.title,
      slug: parsed.slug,
      excerpt: parsed.excerpt,
      content: parsed.content,
      coverImage: parsed.coverImage,
      status,
      publishedAt: status === "published" ? new Date() : null,
      authorId: req.authUser.id,
      updatedById: req.authUser.id,
    },
  });

  console.log(`[AUDIT] ${req.authUser.email} created post ${created.id}`);
  res.status(201).json(created);
};

exports.updatePost = async (req, res) => {
  const id = Number(req.params.id);
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post || post.deletedAt) return res.status(404).json({ error: "Post not found" });
  if (req.authUser.role === "editor" && post.authorId !== req.authUser.id) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const parsed = validatePostPayload(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const slugConflict = await prisma.post.findFirst({ where: { slug: parsed.slug, NOT: { id } } });
  if (slugConflict) return res.status(409).json({ error: "Slug already exists" });

  const status = req.authUser.role === "admin" ? parsed.status : parsed.status === "published" ? "review" : parsed.status;

  const updated = await prisma.post.update({
    where: { id },
    data: {
      title: parsed.title,
      slug: parsed.slug,
      excerpt: parsed.excerpt,
      content: parsed.content,
      coverImage: parsed.coverImage,
      status,
      publishedAt: status === "published" ? new Date() : null,
      updatedById: req.authUser.id,
    },
  });

  console.log(`[AUDIT] ${req.authUser.email} updated post ${id}`);
  res.json(updated);
};

exports.updatePostStatus = async (req, res) => {
  const id = Number(req.params.id);
  const status = normalizeText(req.body?.status || "").toLowerCase();
  const allowed = new Set(["draft", "review", "published"]);
  if (!allowed.has(status)) return res.status(400).json({ error: "Invalid status" });

  const post = await prisma.post.findUnique({ where: { id } });
  if (!post || post.deletedAt) return res.status(404).json({ error: "Post not found" });

  if (req.authUser.role === "editor") {
    if (post.authorId !== req.authUser.id) return res.status(403).json({ error: "Forbidden" });
    if (status === "published") return res.status(403).json({ error: "Editor cannot publish" });
  }

  const updated = await prisma.post.update({
    where: { id },
    data: {
      status,
      publishedAt: status === "published" ? new Date() : null,
      updatedById: req.authUser.id,
    },
  });

  console.log(`[AUDIT] ${req.authUser.email} changed status ${status} for post ${id}`);
  res.json(updated);
};

exports.deletePost = async (req, res) => {
  const id = Number(req.params.id);
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post || post.deletedAt) return res.status(404).json({ error: "Post not found" });

  await prisma.post.update({
    where: { id },
    data: { deletedAt: new Date(), updatedById: req.authUser.id },
  });

  console.log(`[AUDIT] ${req.authUser.email} soft deleted post ${id}`);
  res.json({ ok: true });
};
