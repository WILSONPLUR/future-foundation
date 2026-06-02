const crypto = require('crypto');
const {
  COMMENT_REACTION_LIST,
  COMMENT_SESSION_TTL_HOURS,
} = require('./constants');
const {
  validateActorPayload,
  validateCommentPayload,
  validateReactionPayload,
  normalizeText,
} = require('./validators');
const {
  buildStructuredError,
  canEditComment,
  ensureParentComment,
  getThread,
} = require('./service');

function createCommentController({ prisma, logger, commentCookieName, cookieOptions }) {
  async function createOrRefreshActor(req, res) {
    const parsed = validateActorPayload(req.body);
    if (parsed.error) return res.status(400).json(buildStructuredError('VALIDATION_ERROR', parsed.error));

    const actorId = req.commentActor?.actorId || `actor_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + COMMENT_SESSION_TTL_HOURS * 60 * 60 * 1000);

    const session = await prisma.commentActorSession.upsert({
      where: { actorId },
      update: {
        displayName: parsed.name,
        email: parsed.email,
        verifiedAt: new Date(),
        verificationCodeHash: null,
        expiresAt,
      },
      create: {
        actorId,
        displayName: parsed.name,
        email: parsed.email,
        verifiedAt: new Date(),
        expiresAt,
      },
    });

    res.cookie(commentCookieName, actorId, cookieOptions(req.secure));

    return res.json({
      ok: true,
      actor: {
        actorId: session.actorId,
        displayName: session.displayName,
        email: session.email,
        verifiedAt: session.verifiedAt,
      },
    });
  }

  async function getActor(req, res) {
    const actorId = req.commentActor?.actorId;
    if (!actorId) return res.json({ ok: true, actor: null });

    const session = await prisma.commentActorSession.findUnique({ where: { actorId } });
    if (!session || session.expiresAt < new Date()) {
      res.clearCookie(commentCookieName);
      return res.json({ ok: true, actor: null });
    }

    return res.json({
      ok: true,
      actor: {
        actorId: session.actorId,
        displayName: session.displayName,
        email: session.email,
        verifiedAt: session.verifiedAt,
      },
    });
  }

  async function logoutActor(req, res) {
    const actorId = req.commentActor?.actorId;
    if (actorId) {
      await prisma.commentActorSession.deleteMany({ where: { actorId } });
    }
    res.clearCookie(commentCookieName);
    return res.json({ ok: true });
  }

  async function getComments(req, res) {
    const result = await getThread(prisma, {
      page: req.query.page,
      limit: req.query.limit,
      actorId: req.commentActor?.actorId || null,
    });

    return res.json({ ok: true, ...result });
  }

  async function createComment(req, res) {
    const parsed = validateCommentPayload(req.body);
    if (parsed.error) return res.status(400).json(buildStructuredError('VALIDATION_ERROR', parsed.error));

    const parentIdRaw = req.body?.parentId;
    const parentId = parentIdRaw == null || parentIdRaw === '' ? null : Number(parentIdRaw);

    let parent = null;
    if (parentId != null) {
      const parentCheck = await ensureParentComment(prisma, parentId);
      if (parentCheck.error) return res.status(404).json(parentCheck.error);
      parent = parentCheck.parent;
    }

    const actorSession = req.commentActor?.session;
    const authorName = actorSession?.displayName || 'Гість';
    const authorEmail = actorSession?.email || null;

    const created = await prisma.comment.create({
      data: {
        authorName,
        authorEmail,
        actorId: req.commentActor.actorId,
        content: parsed.content,
        mediaUrl: parsed.mediaUrl,
        mediaType: parsed.mediaType,
        parentId,
        depth: parent ? parent.depth + 1 : 0,
      },
    });

    logger(`[AUDIT] comment:create actor=${req.commentActor.actorId} id=${created.id} parent=${parentId || 'root'}`);

    return res.status(201).json({ ok: true, item: created });
  }

  async function updateComment(req, res) {
    const id = Number(req.params.id);
    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) return res.status(404).json(buildStructuredError('NOT_FOUND', 'Коментар не знайдено'));

    if (!canEditComment(comment, req.commentActor.actorId)) {
      return res.status(403).json(buildStructuredError('FORBIDDEN', 'Немає прав на редагування'));
    }

    const parsed = validateCommentPayload(req.body);
    if (parsed.error) return res.status(400).json(buildStructuredError('VALIDATION_ERROR', parsed.error));

    const updated = await prisma.comment.update({
      where: { id },
      data: {
        content: parsed.content,
        mediaUrl: parsed.mediaUrl,
        mediaType: parsed.mediaType,
        isEdited: true,
      },
    });

    logger(`[AUDIT] comment:update actor=${req.commentActor.actorId} id=${id}`);

    return res.json({ ok: true, item: updated });
  }

  async function deleteComment(req, res) {
    const id = Number(req.params.id);
    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment) return res.status(404).json(buildStructuredError('NOT_FOUND', 'Коментар не знайдено'));

    const isAdmin = req.authUser?.role === 'admin';
    if (!isAdmin && comment.actorId !== req.commentActor.actorId) {
      return res.status(403).json(buildStructuredError('FORBIDDEN', 'Немає прав на видалення'));
    }

    await prisma.comment.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        content: '[deleted]',
        mediaUrl: null,
        mediaType: null,
      },
    });

    logger(`[AUDIT] comment:delete actor=${req.commentActor.actorId || 'admin'} id=${id}`);

    return res.json({ ok: true });
  }

  async function reactToComment(req, res) {
    const id = Number(req.params.id);
    const comment = await prisma.comment.findUnique({ where: { id } });
    if (!comment || comment.isDeleted) {
      return res.status(404).json(buildStructuredError('NOT_FOUND', 'Коментар не знайдено'));
    }

    const parsed = validateReactionPayload(req.body);
    if (parsed.error) return res.status(400).json(buildStructuredError('VALIDATION_ERROR', parsed.error));

    const actorId = req.commentActor.actorId;
    const existing = await prisma.commentReaction.findUnique({
      where: { commentId_actorId: { commentId: id, actorId } },
    });

    if (parsed.reaction === 'none') {
      if (existing) {
        await prisma.commentReaction.delete({ where: { commentId_actorId: { commentId: id, actorId } } });
      }
    } else if (!existing) {
      await prisma.commentReaction.create({
        data: { commentId: id, actorId, reaction: parsed.reaction },
      });
    } else if (existing.reaction === parsed.reaction) {
      await prisma.commentReaction.delete({ where: { commentId_actorId: { commentId: id, actorId } } });
    } else {
      await prisma.commentReaction.update({
        where: { commentId_actorId: { commentId: id, actorId } },
        data: { reaction: parsed.reaction },
      });
    }

    const agg = await prisma.commentReaction.groupBy({
      by: ['reaction'],
      where: { commentId: id },
      _count: { _all: true },
    });

    const counts = COMMENT_REACTION_LIST.reduce((acc, key) => {
      acc[key] = agg.find((a) => a.reaction === key)?._count._all || 0;
      return acc;
    }, {});

    const current = await prisma.commentReaction.findUnique({
      where: { commentId_actorId: { commentId: id, actorId } },
      select: { reaction: true },
    });

    logger(`[AUDIT] comment:react actor=${actorId} comment=${id} reaction=${normalizeText(parsed.reaction)}`);

    return res.json({
      ok: true,
      reactions: {
        counts,
        currentUserReaction: current?.reaction || null,
      },
    });
  }

  return {
    createOrRefreshActor,
    getActor,
    logoutActor,
    getComments,
    createComment,
    updateComment,
    deleteComment,
    reactToComment,
  };
}

module.exports = { createCommentController };
