const {
  COMMENT_DEPTH_MAX,
  COMMENT_PAGE_SIZE_DEFAULT,
  COMMENT_PAGE_SIZE_MAX,
  COMMENT_EDIT_WINDOW_MS,
  COMMENT_REACTION_LIST,
} = require('./constants');

function buildStructuredError(code, message, details = null) {
  return { error: { code, message, details } };
}

function canEditComment(comment, actorId) {
  if (!comment || !actorId) return false;
  if (comment.actorId !== actorId) return false;
  if (comment.isDeleted) return false;
  return Date.now() - new Date(comment.createdAt).getTime() <= COMMENT_EDIT_WINDOW_MS;
}

async function ensureParentComment(prisma, parentId) {
  if (!parentId) return null;
  const parent = await prisma.comment.findUnique({ where: { id: parentId } });
  if (!parent || parent.isDeleted) {
    return { error: buildStructuredError('COMMENT_NOT_FOUND', 'Батьківський коментар не знайдено') };
  }
  if (parent.depth >= COMMENT_DEPTH_MAX) {
    return { error: buildStructuredError('MAX_DEPTH_REACHED', `Максимальна глибина відповіді: ${COMMENT_DEPTH_MAX}`) };
  }
  return { parent };
}

function toCommentDto(comment, currentActorId, reactionMap, childrenMap) {
  const reaction = reactionMap.get(comment.id) || null;
  const rawReplies = childrenMap.get(comment.id) || [];

  return {
    id: comment.id,
    parentId: comment.parentId,
    depth: comment.depth,
    authorName: comment.authorName,
    content: comment.content,
    mediaUrl: comment.mediaUrl,
    mediaType: comment.mediaType,
    isEdited: comment.isEdited,
    isDeleted: comment.isDeleted,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    permissions: {
      canReply: true,
      canEdit: comment.actorId === currentActorId,
      canDelete: comment.actorId === currentActorId,
    },
    reactions: {
      counts: comment.reactionCounts || {},
      currentUserReaction: reaction,
    },
    replies: rawReplies.map((reply) => toCommentDto(reply, currentActorId, reactionMap, childrenMap)),
  };
}

async function getThread(prisma, { page, limit, actorId }) {
  const safePage = Math.max(1, Number(page || 1));
  const safeLimit = Math.min(COMMENT_PAGE_SIZE_MAX, Math.max(1, Number(limit || COMMENT_PAGE_SIZE_DEFAULT)));
  const skip = (safePage - 1) * safeLimit;

  const topWhere = { parentId: null, isDeleted: false };
  const [totalTop, topComments] = await Promise.all([
    prisma.comment.count({ where: topWhere }),
    prisma.comment.findMany({
      where: topWhere,
      orderBy: { createdAt: 'desc' },
      skip,
      take: safeLimit,
    }),
  ]);

  const topIds = topComments.map((c) => c.id);
  const replies = topIds.length
    ? await prisma.comment.findMany({
        where: { parentId: { in: topIds }, isDeleted: false },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  const nestedIds = replies.map((r) => r.id);
  const secondLevel = nestedIds.length
    ? await prisma.comment.findMany({
        where: { parentId: { in: nestedIds }, isDeleted: false },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  const all = [...topComments, ...replies, ...secondLevel];
  const allIds = all.map((c) => c.id);

  const reactionAgg = allIds.length
    ? await prisma.commentReaction.groupBy({
        by: ['commentId', 'reaction'],
        where: { commentId: { in: allIds } },
        _count: { _all: true },
      })
    : [];

  const reactionRows = actorId && allIds.length
    ? await prisma.commentReaction.findMany({ where: { commentId: { in: allIds }, actorId } })
    : [];

  const reactionMap = new Map();
  reactionRows.forEach((row) => reactionMap.set(row.commentId, row.reaction));

  const countsMap = new Map();
  for (const row of reactionAgg) {
    const item = countsMap.get(row.commentId) || {};
    item[row.reaction] = row._count._all;
    countsMap.set(row.commentId, item);
  }

  all.forEach((comment) => {
    const agg = countsMap.get(comment.id) || {};
    comment.reactionCounts = COMMENT_REACTION_LIST.reduce((acc, key) => {
      acc[key] = Number(agg[key] || 0);
      return acc;
    }, {});
  });

  const childrenMap = new Map();
  all.forEach((comment) => {
    if (comment.parentId == null) return;
    const arr = childrenMap.get(comment.parentId) || [];
    arr.push(comment);
    childrenMap.set(comment.parentId, arr);
  });

  return {
    items: topComments.map((top) => toCommentDto(top, actorId, reactionMap, childrenMap)),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: totalTop,
      totalPages: Math.max(1, Math.ceil(totalTop / safeLimit)),
      hasMore: skip + safeLimit < totalTop,
    },
  };
}

module.exports = {
  buildStructuredError,
  canEditComment,
  ensureParentComment,
  getThread,
};
