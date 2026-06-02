const { COMMENT_MEDIA_TYPE, COMMENT_REACTION_LIST } = require('./constants');

function normalizeText(value) {
  return String(value || '').trim();
}

function sanitizeContent(value) {
  return String(value || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '')
    .trim();
}

function isValidEmail(value) {
  const email = normalizeText(value).toLowerCase();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function detectMediaType(urlString) {
  const lower = String(urlString || '').toLowerCase();
  if (
    /\.(gif)(\?|#|$)/.test(lower) ||
    /giphy\.com/.test(lower) ||
    /giphyusercontent\.com/.test(lower) ||
    /tenor\.com/.test(lower)
  ) {
    return COMMENT_MEDIA_TYPE.GIF;
  }
  if (/\.(jpg|jpeg|png|webp|avif)(\?|#|$)/.test(lower)) {
    return COMMENT_MEDIA_TYPE.IMAGE;
  }
  return null;
}

function validateMediaUrl(urlValue) {
  const mediaUrl = normalizeText(urlValue);
  if (!mediaUrl) return { mediaUrl: null, mediaType: null };

  const dataUrlMatch = mediaUrl.match(/^data:image\/(png|jpe?g|webp|gif);base64,/i);
  if (dataUrlMatch) {
    if (mediaUrl.length > 2_500_000) {
      return { error: 'Файл занадто великий (макс 2MB)' };
    }
    const ext = dataUrlMatch[1].toLowerCase();
    const mediaType = ext === 'gif' ? COMMENT_MEDIA_TYPE.GIF : COMMENT_MEDIA_TYPE.IMAGE;
    return { mediaUrl, mediaType };
  }

  let parsed;
  try {
    parsed = new URL(mediaUrl);
  } catch {
    return { error: 'Некоректний media URL' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { error: 'Дозволені лише http/https media URL' };
  }

  const mediaType = detectMediaType(mediaUrl);
  if (!mediaType) {
    return { error: 'Підтримуються лише image/gif URL' };
  }

  if (mediaUrl.length > 4096) {
    return { error: 'Media URL занадто довгий' };
  }

  return { mediaUrl, mediaType };
}

function validateActorPayload(payload) {
  const name = normalizeText(payload?.name);
  const email = normalizeText(payload?.email).toLowerCase();

  if (name.length < 2 || name.length > 80) {
    return { error: 'Імʼя має бути 2..80 символів' };
  }

  if (email && !isValidEmail(email)) {
    return { error: 'Некоректний email' };
  }

  return { name, email: email || null };
}

function validateCommentPayload(payload) {
  const content = sanitizeContent(payload?.content || payload?.text);
  if (content.length < 2 || content.length > 1500) {
    return { error: 'Коментар має бути 2..1500 символів' };
  }

  const media = validateMediaUrl(payload?.mediaUrl);
  if (media.error) return media;

  return { content, ...media };
}

function validateReactionPayload(payload) {
  const reaction = normalizeText(payload?.reaction).toLowerCase();
  if (![...COMMENT_REACTION_LIST, 'none'].includes(reaction)) {
    return { error: 'Некоректна реакція' };
  }
  return { reaction };
}

module.exports = {
  normalizeText,
  sanitizeContent,
  validateActorPayload,
  validateCommentPayload,
  validateReactionPayload,
};
