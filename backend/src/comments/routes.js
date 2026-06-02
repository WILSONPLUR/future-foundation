const express = require('express');
const { createCommentController } = require('./controller');
const {
  rateLimit,
  commentActorResolver,
  requireCommentActor,
  commentSessionCookieOptions,
} = require('./middleware');
const { COMMENT_ACTOR_COOKIE } = require('./constants');

function createCommentRouter({ prisma, requireAuth, logger = console.log }) {
  const router = express.Router();
  const controller = createCommentController({
    prisma,
    logger,
    commentCookieName: COMMENT_ACTOR_COOKIE,
    cookieOptions: commentSessionCookieOptions,
  });

  router.use(commentActorResolver(prisma));

  router.get('/auth/me', controller.getActor);
  router.post('/auth/session', rateLimit({ limit: 20, windowMs: 60_000, keySuffix: 'comment_auth' }), controller.createOrRefreshActor);
  router.post('/auth/logout', controller.logoutActor);

  router.get('/', controller.getComments);

  router.post(
    '/',
    requireCommentActor,
    rateLimit({ limit: 12, windowMs: 60_000, keySuffix: 'comment_create' }),
    controller.createComment,
  );

  router.patch(
    '/:id',
    requireCommentActor,
    rateLimit({ limit: 20, windowMs: 60_000, keySuffix: 'comment_update' }),
    controller.updateComment,
  );

  router.delete(
    '/:id',
    rateLimit({ limit: 20, windowMs: 60_000, keySuffix: 'comment_delete' }),
    controller.deleteComment,
  );

  router.patch(
    '/:id/reaction',
    requireCommentActor,
    rateLimit({ limit: 35, windowMs: 60_000, keySuffix: 'comment_reaction' }),
    controller.reactToComment,
  );

  // Optional admin-protected moderation endpoint alias.
  router.delete('/:id/moderate', requireAuth, controller.deleteComment);

  return router;
}

module.exports = { createCommentRouter };
