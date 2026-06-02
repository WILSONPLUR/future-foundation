const crypto = require('crypto');
const { COMMENT_ACTOR_COOKIE, COMMENT_SESSION_TTL_HOURS } = require('./constants');
const { normalizeText } = require('./validators');

const memoryBuckets = new Map();

function getIp(req) {
  return normalizeText(req.headers['x-forwarded-for'] || '').split(',')[0] || req.ip || 'unknown';
}

function buildRateKey(req, suffix = '') {
  const actorId = req.commentActor?.actorId || 'guest';
  return `${getIp(req)}:${actorId}:${suffix}`;
}

function rateLimit({ limit, windowMs, keySuffix }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = buildRateKey(req, keySuffix);
    const bucket = memoryBuckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    memoryBuckets.set(key, bucket);

    if (bucket.count > limit) {
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Забагато запитів. Спробуйте трохи пізніше.',
          retryInMs: bucket.resetAt - now,
        },
      });
    }

    return next();
  };
}

function generateActorId() {
  return `actor_${crypto.randomUUID()}`;
}

function commentActorResolver(prisma) {
  return async (req, res, next) => {
    const actorIdFromCookie = normalizeText(req.cookies?.[COMMENT_ACTOR_COOKIE]);

    if (!actorIdFromCookie) {
      req.commentActor = { actorId: null, verified: false, session: null };
      return next();
    }

    const session = await prisma.commentActorSession.findUnique({ where: { actorId: actorIdFromCookie } });
    if (!session || session.expiresAt < new Date()) {
      res.clearCookie(COMMENT_ACTOR_COOKIE);
      req.commentActor = { actorId: null, verified: false, session: null };
      return next();
    }

    req.commentActor = {
      actorId: session.actorId,
      verified: Boolean(session.verifiedAt),
      session,
    };

    return next();
  };
}

function requireCommentActor(req, res, next) {
  if (!req.commentActor?.actorId || !req.commentActor?.verified) {
    return res.status(401).json({
      error: {
        code: 'COMMENT_AUTH_REQUIRED',
        message: 'Підтвердіть імʼя/пошту для дій з коментарями.',
      },
    });
  }
  return next();
}

function commentSessionCookieOptions(isSecure) {
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    maxAge: COMMENT_SESSION_TTL_HOURS * 60 * 60 * 1000,
    path: '/',
  };
}

module.exports = {
  rateLimit,
  commentActorResolver,
  requireCommentActor,
  generateActorId,
  commentSessionCookieOptions,
};
