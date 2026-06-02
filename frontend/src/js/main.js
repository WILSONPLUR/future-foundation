const header = document.querySelector('.header');
const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.navigation');
const revealItems = document.querySelectorAll('.reveal');
const contactForm = document.querySelector('.contacts__form');
const progressAmount = document.querySelector('.progress-bar__amount');
const progressTotal = document.querySelector('.progress-bar__total');
const progressFill = document.querySelector('.progress-bar__fill');

const currentCampaignTitle = document.getElementById('current-campaign-title');
const currentCampaignText = document.getElementById('current-campagin-text');
const AUTH_STORAGE_KEY = 'ff_admin_token';

const isLocalDevHost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

const configuredApiBase =
  (typeof __FF_API_BASE__ !== 'undefined' && __FF_API_BASE__) ||
  window.FF_API_BASE ||
  '';

const API_BASE =
  configuredApiBase ||
  (isLocalDevHost
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : `${window.location.protocol}//${window.location.hostname}`);
let campaignsRefreshPromise = null;
let publicAuthUser = null;

async function initCustomCursor() {
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if (isTouch) return;
  if (window.Cursorjs) return;

  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/gh/phucbm/cursorjs@latest/dist/cursorjs.min.js';
  script.async = true;

  script.onload = () => {
    if (!window.Cursorjs) return;
    window.Cursorjs.create({
      id: 'my-cursor',
      innerHTML: '<i class="icon-cursor"></i>',
      speed: 0.3,
      cursorCSS: {
        border: '2.1px solid black',
        boxShadow: 'none',
      },
      hover: [
        { selectors: '.btn--primary, .link, .nav__list a, .nav__submenu a', className: 'cursor-hover-primary' },
        { selectors: '.btn--secondary, .card, .quote', className: 'cursor-hover-secondary' },
      ],
    });
  };

  document.head.appendChild(script);
}

function formatMoney(value) {
  return Math.round(Number(value || 0)).toLocaleString('uk-UA');
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatReviewRole(role) {
  const map = {
    volunteer: 'волонтер',
    participant: 'учасник',
    partner: 'партнер',
  };
  return map[role] || 'учасник';
}

function formatRequestTypeLabel(type) {
  const map = {
    volunteer: 'Волонтерство',
    financial_support: 'Фінансова підтримка',
    partnership: 'Партнерство',
  };
  return map[type] || 'Долучитися';
}

const CONTACT_NAME_RE = /^[\p{L}\p{M}'’`\-\s]{2,80}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s()\-]{10,24}$/;
const UNSAFE_INPUT_RE = /<[^>]*>|javascript:|data:text\/html|on\w+\s*=|<\/script/i;
const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/;

function normalizeSingleLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeMultiline(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function isSuspiciousInput(value) {
  return CONTROL_CHAR_RE.test(String(value || '')) || UNSAFE_INPUT_RE.test(String(value || ''));
}

function setFieldError(field, message) {
  if (!field) return;
  field.setCustomValidity(message || '');
  field.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function validateContactPayload(payload) {
  if (!payload.name || !CONTACT_NAME_RE.test(payload.name) || isSuspiciousInput(payload.name)) {
    return { field: 'name', message: 'Вкажіть коректне імʼя без HTML або службових символів.' };
  }
  if (!payload.email || !EMAIL_RE.test(payload.email) || payload.email.length > 160 || isSuspiciousInput(payload.email)) {
    return { field: 'email', message: 'Вкажіть коректний email.' };
  }
  if (!payload.phone || !PHONE_RE.test(payload.phone) || isSuspiciousInput(payload.phone)) {
    return { field: 'phone', message: 'Вкажіть коректний номер телефону.' };
  }
  if (!['volunteer', 'financial_support', 'partnership'].includes(payload.type)) {
    return { field: 'type', message: 'Оберіть коректний тип запиту.' };
  }
  if (!payload.message) {
    return { field: 'message', message: 'Повідомлення є обовʼязковим.' };
  }
  if (payload.message.length > 1000 || isSuspiciousInput(payload.message)) {
    return { field: 'message', message: 'Повідомлення містить недопустимі символи або занадто довге.' };
  }
  return null;
}

async function fetchJson(path, options) {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    credentials: 'include',
    ...options,
  });
  if (!response.ok) {
    throw new Error(`API failed: ${path} (${response.status})`);
  }
  return response.json();
}

function getStoredAuthToken() {
  return localStorage.getItem(AUTH_STORAGE_KEY) || '';
}

async function fetchCurrentUser() {
  const token = getStoredAuthToken();
  if (!token) return null;

  try {
    const result = await fetchJson('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return result?.user || null;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function renderPublicAuthSlot(user) {
  publicAuthUser = user || null;
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  const navWrap = document.querySelector('.header__nav-wrap');
  const navList = document.querySelector('.nav__list');
  const brand = navWrap?.querySelector('.brand');
  if (!navWrap || !brand || !navList) return;

  document.querySelectorAll('.nav-auth-item').forEach((node) => node.remove());

  const item = document.createElement('li');
  item.className = 'nav-auth-item';

  if (!user) {
    item.innerHTML = '<a class="nav__login-link" href="admin-login.html">Увійти</a>';
    if (isMobile) {
      brand.insertAdjacentElement('afterend', item);
    } else {
      navList.appendChild(item);
    }
    return;
  }

  item.classList.add('nav-auth-dropdown');
  item.innerHTML = `
    <button class="nav__user-toggle" type="button" aria-expanded="false" aria-haspopup="true">
      <img class="nav__user-avatar" src="images/icons/user.png" alt="" />
      <span class="nav__user-label">Адмінка</span>
      <span class="visually-hidden">Профіль користувача</span>
    </button>
    <div class="nav__user-menu" hidden>
      <p class="nav__user-meta">${escapeHtml(user.name || user.email)}</p>
      <p class="nav__user-role">${escapeHtml(user.role)}</p>
      <a class="nav__user-link" href="admin-posts.html">Адмін-панель</a>
      <button class="nav__user-logout" type="button">Вийти</button>
    </div>
  `;
  if (isMobile) {
    brand.insertAdjacentElement('afterend', item);
  } else {
    navList.appendChild(item);
  }
}

function bindPublicAuthInteractions() {
  const authDropdown = document.querySelector('.nav-auth-dropdown');
  if (!authDropdown) return;

  const toggle = authDropdown.querySelector('.nav__user-toggle');
  const menu = authDropdown.querySelector('.nav__user-menu');
  const logoutBtn = authDropdown.querySelector('.nav__user-logout');
  if (!toggle || !menu || !logoutBtn) return;

  const closeMenu = () => {
    toggle.setAttribute('aria-expanded', 'false');
    menu.hidden = true;
    authDropdown.classList.remove('is-open');
  };

  toggle.addEventListener('click', () => {
    const isOpen = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!isOpen));
    menu.hidden = isOpen;
    authDropdown.classList.toggle('is-open', !isOpen);
  });

  document.addEventListener('click', (event) => {
    if (!authDropdown.contains(event.target)) {
      closeMenu();
    }
  });

  logoutBtn.addEventListener('click', async () => {
    const token = getStoredAuthToken();
    try {
      await fetchJson('/api/auth/logout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // no-op
    } finally {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      closeMenu();
      renderPublicAuthSlot(null);
    }
  });
}

async function initPublicAuthUi() {
  const user = await fetchCurrentUser();
  renderPublicAuthSlot(user);
  bindPublicAuthInteractions();
}

async function refreshCampaignsBackendOnce() {
  if (campaignsRefreshPromise) {
    return campaignsRefreshPromise;
  }

  campaignsRefreshPromise = fetchJson('/api/campaigns/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
    .then(() => undefined)
    .catch((error) => {
      console.warn('Campaign refresh skipped:', error.message);
      return undefined;
    })
    .finally(() => {
      setTimeout(() => {
        campaignsRefreshPromise = null;
      }, 5000);
    });

  return campaignsRefreshPromise;
}

function updateProgress(balance, goal, campaign) {
  if (!progressAmount || !progressTotal || !progressFill) return;

  const safeGoal = goal > 0 ? goal : 1;
  const percent = (balance / safeGoal) * 100;
  const displayPercent = percent < 2 ? 2 : Math.min(percent, 100);

  if (currentCampaignTitle && campaign?.title) {
    currentCampaignTitle.textContent = campaign.title;
  }
  if (currentCampaignText && campaign?.shortDesc) {
    currentCampaignText.textContent = campaign.shortDesc;
  }

  progressAmount.textContent = formatMoney(balance);
  progressTotal.textContent = formatMoney(goal);
  progressFill.style.width = '0%';

  requestAnimationFrame(() => {
    progressFill.style.width = `${displayPercent}%`;
  });
}

function animateProgressBars(scope = document) {
  scope.querySelectorAll('.progress-bar__fill[data-progress]').forEach((fill, index) => {
    const targetWidth = Number(fill.getAttribute('data-progress') || 0);
    fill.style.width = '0%';

    requestAnimationFrame(() => {
      setTimeout(() => {
        fill.style.width = `${targetWidth}%`;
      }, index * 120);
    });
  });
}

function renderCampaignCards(items, targetId) {
  const container = document.getElementById(targetId);
  if (!container) return;
  if (!Array.isArray(items) || !items.length) {
    container.innerHTML = '<article class="card">Дані поки відсутні.</article>';
    return;
  }

  container.innerHTML = items
    .map((campaign) => {
      const raised = Number(campaign.raisedAmount || 0);
      const goal = Number(campaign.goalAmount || 0);
      const percent = goal > 0 ? Math.min(100, (raised / goal) * 100) : 0;
      const visiblePercent = raised > 0 ? Math.max(percent, 2) : 0;
      return `
        <article class="card reveal is-visible">
          <h3>${escapeHtml(campaign.title)}</h3>
          <p>${escapeHtml(campaign.shortDesc || '')}</p>
          <div class="progress-bar">
            <span
              class="progress-bar__fill"
              style="width:0%"
              data-progress="${visiblePercent}"
              aria-label="Прогрес збору ${percent.toFixed(2)}%"
              title="Прогрес: ${percent.toFixed(2)}%"
            ></span>
          </div>
          <p class="muted">${formatMoney(raised)} / ${formatMoney(goal)} ${escapeHtml(campaign.currency || 'UAH')}</p>
          <a class="btn btn--secondary" href="${escapeHtml(campaign.monoJarUrl)}" target="_blank" rel="noopener noreferrer">Підтримати</a>
        </article>
      `;
    })
    .join('');

  animateProgressBars(container);
}

function renderSimpleCards(items, targetId, mapper) {
  const container = document.getElementById(targetId);
  if (!container) return;
  if (!Array.isArray(items) || !items.length) {
    container.innerHTML = '<article class="card">Дані поки відсутні.</article>';
    return;
  }
  container.innerHTML = items.map(mapper).join('');
}

function fallbackPostImage(title) {
  const encoded = encodeURIComponent(title || 'Future Foundation');
  return `https://placehold.co/960x540/e9ecf3/111111?text=${encoded}`;
}

async function loadFeaturedCampaignProgress() {
  if (!progressAmount || !progressTotal || !progressFill) return;

  try {
    await refreshCampaignsBackendOnce();
    const campaigns = await fetchJson('/api/campaigns?featured=true');
    const featured = Array.isArray(campaigns) && campaigns.length ? campaigns[0] : null;
    if (!featured) return;

    updateProgress(
      Number(featured.raisedAmount || 0),
      Number(featured.goalAmount || 0),
      featured,
    );

    const donateButtons = document.querySelectorAll('[data-donate-featured]');
    donateButtons.forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        if (featured.monoJarUrl) {
          window.open(featured.monoJarUrl, '_blank', 'noopener,noreferrer');
        }
      });
    });
  } catch (error) {
    console.error('Failed to load featured campaign:', error);
  }
}

async function hydrateDynamicSections() {
  try {
    if (document.getElementById('activities-grid-home')) {
      const activities = await fetchJson('/api/activities');
      renderSimpleCards(activities, 'activities-grid-home', (item) => `
        <article class="card stat reveal is-visible">
          <h3>${escapeHtml(item.value)}</h3>
          <p>${escapeHtml(item.label)}</p>
        </article>
      `);
    }

    if (document.getElementById('help-options-grid-home')) {
      const helpOptions = await fetchJson('/api/help-options');
      renderSimpleCards(helpOptions, 'help-options-grid-home', (item) => `
        <article class="card reveal is-visible">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.description)}</p>
          <a href="#contacts" class="link help-option-link" data-request-type="${escapeHtml(item.requestType)}">
            ${escapeHtml(item.ctaText || formatRequestTypeLabel(item.requestType))}
          </a>
        </article>
      `);
    }

    if (document.getElementById('campaigns-grid-home') || document.getElementById('campaigns-grid-page')) {
      await refreshCampaignsBackendOnce();
      const campaigns = await fetchJson('/api/campaigns');
      renderCampaignCards(campaigns, 'campaigns-grid-home');
      renderCampaignCards(campaigns, 'campaigns-grid-page');
    }

    if (document.getElementById('partners-grid-home') || document.getElementById('partners-grid-page')) {
      const partners = await fetchJson('/api/partners');
      const mapper = (item) => `
        <article class="card reveal is-visible">
          <h3>${escapeHtml(item.name)}</h3>
          <p class="muted">${escapeHtml(item.type || '')}</p>
          ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
          ${item.websiteUrl ? `<a class="link" href="${escapeHtml(item.websiteUrl)}" target="_blank" rel="noopener noreferrer">Сайт партнера</a>` : ''}
        </article>
      `;
      renderSimpleCards(partners, 'partners-grid-home', mapper);
      renderSimpleCards(partners, 'partners-grid-page', mapper);
    }

    if (document.getElementById('reports-grid-home') || document.getElementById('reports-grid-page')) {
      const reports = await fetchJson('/api/reports');
      const mapper = (item) => `
        <article class="card reveal is-visible">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.summary || '')}</p>
          <p class="muted">Надійшло: ${formatMoney(item.totalIn)} UAH | Витрачено: ${formatMoney(item.totalOut)} UAH</p>
          ${item.pdfUrl ? `<a class="link" href="${escapeHtml(item.pdfUrl)}" target="_blank" rel="noopener noreferrer">Відкрити PDF</a>` : ''}
        </article>
      `;
      renderSimpleCards(reports, 'reports-grid-home', mapper);
      renderSimpleCards(reports, 'reports-grid-page', mapper);
    }

    if (document.getElementById('posts-grid-page')) {
      const posts = await fetchJson('/api/posts');
      renderSimpleCards(posts, 'posts-grid-page', (item) => `
        <article class="card reveal is-visible post-card">
          <a class="post-card__link" href="post.html?slug=${encodeURIComponent(item.slug)}" aria-label="Відкрити новину ${escapeHtml(item.title)}">
            <img
              class="post-card__image"
              src="${escapeHtml(item.coverImage || fallbackPostImage(item.title))}"
              alt="${escapeHtml(item.title)}"
              loading="lazy"
            />
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.excerpt || '')}</p>
            <p class="muted">${item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('uk-UA') : ''}</p>
          </a>
        </article>
      `);
    }

    if (document.getElementById('cases-grid-page')) {
      const casesData = await fetchJson('/api/cases');
      renderSimpleCards(casesData, 'cases-grid-page', (item) => `
        <article class="card reveal is-visible">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.summary || '')}</p>
          ${item.location ? `<p class="muted">Локація: ${escapeHtml(item.location)}</p>` : ''}
          ${item.resultText ? `<p>${escapeHtml(item.resultText)}</p>` : ''}
        </article>
      `);
    }

    if (document.getElementById('faq-grid-page')) {
      const faqs = await fetchJson('/api/faqs');
      renderSimpleCards(faqs, 'faq-grid-page', (item) => `
        <article class="faq__item card reveal is-visible">
          <button class="faq__question" type="button">${escapeHtml(item.question)}</button>
          <div class="faq__answer"><p>${escapeHtml(item.answer)}</p></div>
        </article>
      `);
      bindFaqToggles();
    }

    if (document.getElementById('reviews-grid-home')) {
      const reviews = await fetchJson('/api/reviews');
      renderSimpleCards(reviews, 'reviews-grid-home', (item) => `
        <blockquote class="card reveal quote is-visible">
          “${escapeHtml(item.text)}”
          <cite>— ${escapeHtml(item.name)}, ${escapeHtml(formatReviewRole(item.role))}</cite>
        </blockquote>
      `);
    }
  } catch (error) {
    console.error('Dynamic section hydration failed:', error);
  }
}

async function loadPostDetailPage() {
  const postTitle = document.getElementById('post-detail-title');
  const postDate = document.getElementById('post-detail-date');
  const postImage = document.getElementById('post-detail__image');
  const postExcerpt = document.getElementById('post-detail__excerpt');
  const postContent = document.getElementById('post-detail__content');
  if (!postTitle || !postContent) return;

  const slug = new URLSearchParams(window.location.search).get('slug');
  if (!slug) {
    postTitle.textContent = 'Новину не знайдено';
    postContent.textContent = 'Вказано некоректне посилання.';
    return;
  }

  try {
    const post = await fetchJson(`/api/posts/${encodeURIComponent(slug)}`);
    document.title = `${post.title} — Future Foundation`;
    postTitle.textContent = post.title;
    if (postDate) {
      postDate.textContent = post.publishedAt
        ? new Date(post.publishedAt).toLocaleDateString('uk-UA')
        : '';
    }
    if (postImage) {
      postImage.src = post.coverImage || fallbackPostImage(post.title);
      postImage.alt = post.title;
    }
    if (postExcerpt) {
      postExcerpt.textContent = post.excerpt || '';
    }
    postContent.textContent = post.content || '';
  } catch {
    postTitle.textContent = 'Новину не знайдено';
    postContent.textContent = 'Матеріал відсутній або ще не опублікований.';
  }
}

function bindFaqToggles() {
  const buttons = document.querySelectorAll('.faq__question');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const item = button.closest('.faq__item');
      if (!item) return;
      item.classList.toggle('is-open');
    });
  });
}

let commentPage = 1;
let commentHasMore = false;
let commentActor = null;
let uploadedCommentMediaDataUrl = '';
const COMMENT_REACTIONS = [
  { key: 'heart', emoji: '❤️' },
  { key: 'thumbs_up', emoji: '👍' },
  { key: 'eyes', emoji: '👀' },
  { key: 'melt', emoji: '🫠' },
  { key: 'question', emoji: '❓' },
];

function renderCommentMedia(mediaUrl, mediaType, altText) {
  if (!mediaUrl || !mediaType) return '';
  return `<img class="comment-item-media" src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(altText || 'media')}" loading="lazy" />`;
}

function renderThreadItem(comment) {
  const deletedClass = comment.isDeleted ? ' is-deleted' : '';
  const editedMark = comment.isEdited ? '<span class="muted"> (ред.)</span>' : '';
  const reactionPills = COMMENT_REACTIONS
    .filter((r) => Number(comment.reactions?.counts?.[r.key] || 0) > 0)
    .map((r) => {
      const isActive = comment.reactions.currentUserReaction === r.key ? 'is-active' : '';
      return `<button class="comment-reaction-pill ${isActive}" data-action="react" data-reaction="${r.key}" type="button">${r.emoji} ${Number(comment.reactions.counts[r.key] || 0)}</button>`;
    })
    .join('');

  return `
    <article class="card comment-item${deletedClass}" data-comment-id="${comment.id}">
      <div class="comment-item-head">
        <h3 class="comment-item-name">${escapeHtml(comment.authorName)}</h3>
        <p class="comment-item-date">${new Date(comment.createdAt).toLocaleString('uk-UA')}${editedMark}</p>
      </div>
      <p class="comment-item-text">${escapeHtml(comment.content)}</p>
      ${renderCommentMedia(comment.mediaUrl, comment.mediaType, comment.authorName)}
      <div class="comment-reactions">
        <div class="comment-reaction-summary">${reactionPills || ''}</div>
        <button class="comment-react-open" data-action="open-reactions" type="button" aria-label="Додати реакцію">+</button>
        <div class="comment-reaction-menu" hidden>
          ${COMMENT_REACTIONS.map((r) => {
            const isActive = comment.reactions.currentUserReaction === r.key ? 'is-active' : '';
            return `<button class="comment-react-btn ${isActive}" data-action="react" data-reaction="${r.key}" type="button" aria-label="Реакція ${r.emoji}">${r.emoji}</button>`;
          }).join('')}
        </div>
      </div>
      <div class="comment-item-controls">
        ${comment.permissions.canReply ? '<button class="btn btn--secondary" data-action="reply" type="button">Відповісти</button>' : ''}
        ${comment.permissions.canEdit ? '<button class="btn btn--secondary" data-action="edit" type="button">Редагувати</button>' : ''}
        ${comment.permissions.canDelete ? '<button class="btn btn--secondary" data-action="delete" type="button">Видалити</button>' : ''}
      </div>
      <div class="comment-inline-slot"></div>
      ${
        comment.replies?.length
          ? `<div class="comment-replies">${comment.replies.map((reply) => renderThreadItem(reply)).join('')}</div>`
          : ''
      }
    </article>
  `;
}

async function fetchCommentThread({ append = false } = {}) {
  const list = document.getElementById('comment-list');
  if (!list) return;

  try {
    const data = await fetchJson(`/api/comments?page=${commentPage}&limit=8`);
    const items = Array.isArray(data.items) ? data.items : [];

    if (!items.length && !append) {
      list.innerHTML = '<article class="card comment-item">Поки немає коментарів. Будьте першим.</article>';
    } else {
      const markup = items.map((item) => renderThreadItem(item)).join('');
      list.innerHTML = append ? `${list.innerHTML}${markup}` : markup;
    }

    commentHasMore = Boolean(data.pagination?.hasMore);
    const loadMoreBtn = document.getElementById('comment-load-more-btn');
    if (loadMoreBtn) loadMoreBtn.style.display = commentHasMore ? 'inline-block' : 'none';
  } catch (error) {
    console.error('Failed to render comments:', error);
    list.innerHTML = '<article class="card comment-item">Не вдалося завантажити коментарі.</article>';
  }
}

async function loadCommentActor() {
  try {
    const data = await fetchJson('/api/comments/auth/me');
    commentActor = data.actor || null;
  } catch {
    commentActor = null;
  }
}

async function ensureCommentActorSession() {
  const nameInput = document.getElementById('comment-name');
  const emailInput = document.getElementById('comment-email');
  const authStatus = document.getElementById('comment-auth-status');
  if (!nameInput) return false;

  const payload = {
    name: String(nameInput.value || '').trim(),
    email: String(emailInput?.value || '').trim(),
  };

  if (!payload.name || payload.name.length < 2) {
    if (authStatus) authStatus.textContent = 'Вкажіть імʼя (мінімум 2 символи).';
    return false;
  }

  try {
    const response = await fetchJson('/api/comments/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    commentActor = response.actor;
    if (authStatus) authStatus.textContent = `Профіль підтверджено: ${response.actor.displayName}`;
    return true;
  } catch (error) {
    if (authStatus) authStatus.textContent = 'Не вдалося підтвердити профіль.';
    return false;
  }
}

async function submitComment(payload) {
  await fetchJson('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function bindCommentForm() {
  const form = document.getElementById('comment-form');
  const status = document.getElementById('comment-form-status');
  const authBtn = document.getElementById('comment-auth-btn');
  const fileInput = document.getElementById('comment-file');
  const fileStatus = document.getElementById('comment-file-status');
  const mediaPreview = document.getElementById('comment-media-preview');
  const loadMoreBtn = document.getElementById('comment-load-more-btn');
  const list = document.getElementById('comment-list');
  if (!form || !list) return;

  authBtn?.addEventListener('click', async () => {
    await ensureCommentActorSession();
  });

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      uploadedCommentMediaDataUrl = '';
      mediaPreview.innerHTML = '';
      if (fileStatus) fileStatus.textContent = '';
      return;
    }

    const allowed = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    if (!allowed.has(file.type)) {
      if (fileStatus) fileStatus.textContent = 'Дозволені лише PNG/JPG/WEBP/GIF.';
      fileInput.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      if (fileStatus) fileStatus.textContent = 'Файл завеликий. Максимум 2MB.';
      fileInput.value = '';
      return;
    }

    uploadedCommentMediaDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });

    if (fileStatus) fileStatus.textContent = `Файл готовий: ${file.name}`;
    mediaPreview.innerHTML = `<img src="${escapeHtml(uploadedCommentMediaDataUrl)}" alt="preview" loading="lazy" />`;
  });

  loadMoreBtn?.addEventListener('click', async () => {
    if (!commentHasMore) return;
    commentPage += 1;
    await fetchCommentThread({ append: true });
  });

  list.addEventListener('click', async (event) => {
    const article = event.target.closest('[data-comment-id]');
    if (!article) return;
    const commentId = Number(article.getAttribute('data-comment-id'));
    const actionBtn = event.target.closest('[data-action]');
    if (!actionBtn) return;

    if (!commentActor) {
      const ok = await ensureCommentActorSession();
      if (!ok) return;
    }

    const action = actionBtn.getAttribute('data-action');
    const slot = article.querySelector('.comment-inline-slot');

    if (action === 'reply') {
      slot.innerHTML = `
        <form class="comment-reply-form">
          <textarea name="content" rows="3" maxlength="1500" required placeholder="Ваша відповідь"></textarea>
          <label class="comment-reply-upload">
            <span>Завантажити файл</span>
            <input name="mediaFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
          </label>
          <p class="comment-file-status" data-role="reply-file-status"></p>
          <div class="comment-media-preview" data-role="reply-preview"></div>
          <div class="admin-actions">
            <button class="btn btn--primary" type="submit">Надіслати</button>
            <button class="btn btn--secondary" type="button" data-action=\"cancel-inline\">Скасувати</button>
          </div>
        </form>
      `;
      const replyForm = slot.querySelector('form');
      const textarea = slot.querySelector('textarea');
      const replyFile = slot.querySelector('input[name="mediaFile"]');
      const replyPreview = slot.querySelector('[data-role="reply-preview"]');
      const replyFileStatus = slot.querySelector('[data-role="reply-file-status"]');
      let replyDataUrl = '';
      textarea?.focus();
      replyFile?.addEventListener('change', async () => {
        const file = replyFile.files?.[0];
        if (!file) {
          replyDataUrl = '';
          replyPreview.innerHTML = '';
          replyFileStatus.textContent = '';
          return;
        }
        const allowed = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
        if (!allowed.has(file.type) || file.size > 2 * 1024 * 1024) {
          replyFileStatus.textContent = 'Допустимі файли: PNG/JPG/WEBP/GIF до 2MB.';
          replyFile.value = '';
          return;
        }
        replyDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });
        replyFileStatus.textContent = `Файл готовий: ${file.name}`;
        replyPreview.innerHTML = `<img src="${escapeHtml(replyDataUrl)}" alt="preview" loading="lazy" />`;
      });
      replyForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(replyForm);
        await submitComment({
          content: String(fd.get('content') || '').trim(),
          mediaUrl: replyDataUrl,
          parentId: commentId,
        });
        slot.innerHTML = '';
        commentPage = 1;
        await fetchCommentThread();
        document.querySelector(`[data-comment-id="${commentId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }

    if (action === 'edit') {
      const contentText = article.querySelector('.comment-item-text')?.textContent || '';
      slot.innerHTML = `
        <form class="comment-reply-form">
          <textarea name="content" rows="3" maxlength="1500" required>${escapeHtml(contentText)}</textarea>
          <label class="comment-reply-upload">
            <span>Замінити файл</span>
            <input name="mediaFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif" />
          </label>
          <p class="comment-file-status" data-role="reply-file-status"></p>
          <div class="comment-media-preview" data-role="reply-preview"></div>
          <div class="admin-actions">
            <button class="btn btn--primary" type="submit">Зберегти</button>
            <button class="btn btn--secondary" type="button" data-action=\"cancel-inline\">Скасувати</button>
          </div>
        </form>
      `;
      const editForm = slot.querySelector('form');
      const editFile = slot.querySelector('input[name="mediaFile"]');
      const editPreview = slot.querySelector('[data-role="reply-preview"]');
      const editFileStatus = slot.querySelector('[data-role="reply-file-status"]');
      let editDataUrl = '';
      editFile?.addEventListener('change', async () => {
        const file = editFile.files?.[0];
        if (!file) {
          editDataUrl = '';
          editPreview.innerHTML = '';
          editFileStatus.textContent = '';
          return;
        }
        const allowed = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
        if (!allowed.has(file.type) || file.size > 2 * 1024 * 1024) {
          editFileStatus.textContent = 'Допустимі файли: PNG/JPG/WEBP/GIF до 2MB.';
          editFile.value = '';
          return;
        }
        editDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });
        editFileStatus.textContent = `Файл готовий: ${file.name}`;
        editPreview.innerHTML = `<img src="${escapeHtml(editDataUrl)}" alt="preview" loading="lazy" />`;
      });
      editForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(editForm);
        await fetchJson(`/api/comments/${commentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: String(fd.get('content') || '').trim(),
            mediaUrl: editDataUrl || null,
          }),
        });
        slot.innerHTML = '';
        commentPage = 1;
        await fetchCommentThread();
      });
      return;
    }

    if (action === 'delete') {
      await fetchJson(`/api/comments/${commentId}`, { method: 'DELETE' });
      commentPage = 1;
      list.innerHTML = '';
      await fetchCommentThread({ append: false });
      return;
    }

    if (action === 'open-reactions') {
      const menu = article.querySelector('.comment-reaction-menu');
      if (!menu) return;
      list.querySelectorAll('.comment-reaction-menu').forEach((item) => {
        if (item !== menu) item.hidden = true;
      });
      menu.hidden = !menu.hidden;
      return;
    }

    if (action === 'react') {
      const reaction = actionBtn.getAttribute('data-reaction');
      await fetchJson(`/api/comments/${commentId}/reaction`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction }),
      });
      await fetchCommentThread();
      return;
    }

    if (action === 'cancel-inline') {
      slot.innerHTML = '';
    }
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('.comment-reactions')) return;
    list.querySelectorAll('.comment-reaction-menu').forEach((menu) => {
      menu.hidden = true;
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type='submit']");
    const formData = new FormData(form);
    const payload = {
      content: String(formData.get('content') || '').trim(),
      mediaUrl: uploadedCommentMediaDataUrl || null,
    };

    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Надсилаємо...';
      }
      if (status) status.textContent = '';

      if (!commentActor) {
        const ok = await ensureCommentActorSession();
        if (!ok) {
          throw new Error('Потрібно підтвердити профіль перед відправкою.');
        }
      }

      await submitComment(payload);
      if (status) status.textContent = 'Коментар додано.';
      form.reset();
      const preview = document.getElementById('comment-media-preview');
      if (preview) preview.innerHTML = '';
      uploadedCommentMediaDataUrl = '';
      if (fileStatus) fileStatus.textContent = '';
      commentPage = 1;
      await fetchCommentThread();
      const firstComment = document.querySelector('.comment-list [data-comment-id]');
      firstComment?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      console.error('Failed to submit comment:', error);
      if (status) status.textContent = 'Помилка. Перевірте поля і спробуйте ще.';
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Надіслати коментар';
      }
    }
  });
}

if (menuToggle && header) {
  menuToggle.addEventListener('click', () => {
    const isOpen = header.classList.toggle('is-open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    document.body.classList.toggle('menu-open', isOpen);
    if (navigation) navigation.classList.toggle('is-open', isOpen);
    menuToggle.setAttribute(
      'aria-label',
      isOpen ? 'Закрити меню' : 'Відкрити меню',
    );
  });
}

if (navigation) {
  navigation.addEventListener('click', (event) => {
    if (!event.target.closest('a')) return;
    if (header) header.classList.remove('is-open');
    document.body.classList.remove('menu-open');
    navigation.classList.remove('is-open');
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
    if (menuToggle) menuToggle.setAttribute('aria-label', 'Відкрити меню');
  });
}

window.addEventListener('resize', () => {
  if (window.innerWidth > 768) {
    if (header) header.classList.remove('is-open');
    if (navigation) navigation.classList.remove('is-open');
    if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
    if (menuToggle) menuToggle.setAttribute('aria-label', 'Відкрити меню');
    document.body.classList.remove('menu-open');
  }
  renderPublicAuthSlot(publicAuthUser);
  bindPublicAuthInteractions();
});

if (revealItems.length) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 },
  );

  revealItems.forEach((item) => revealObserver.observe(item));
}

if (contactForm) {
  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(contactForm);
    const status = document.getElementById('contact-form-status');
    const nameField = contactForm.querySelector('#name');
    const emailField = contactForm.querySelector('#email');
    const phoneField = contactForm.querySelector('#phone');
    const typeField = contactForm.querySelector('#request-type');
    const messageField = contactForm.querySelector('#message');
    const payload = {
      name: normalizeSingleLine(formData.get('name')),
      email: normalizeSingleLine(formData.get('email')).toLowerCase(),
      phone: normalizeSingleLine(formData.get('phone')),
      type: String(formData.get('type') || 'volunteer').trim(),
      message: normalizeMultiline(formData.get('message')),
    };

    const button = contactForm.querySelector("button[type='submit']");
    const originalText = button ? button.textContent : '';
    [nameField, emailField, phoneField, typeField, messageField].forEach((field) => setFieldError(field, ''));
    if (status) status.textContent = '';

    const validationResult = validateContactPayload(payload);
    if (validationResult) {
      const fieldMap = {
        name: nameField,
        email: emailField,
        phone: phoneField,
        type: typeField,
        message: messageField,
      };
      const invalidField = fieldMap[validationResult.field];
      setFieldError(invalidField, validationResult.message);
      if (status) status.textContent = validationResult.message;
      invalidField?.reportValidity();
      return;
    }

    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Надсилаємо...';
      }

      const response = await fetch(`${API_BASE}/api/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`Failed ${response.status}`);

      if (button) button.textContent = 'Дякуємо! Надіслано';
      if (status) status.textContent = 'Форму успішно надіслано.';
      contactForm.reset();
    } catch (error) {
      console.error('Failed to submit form:', error);
      if (button) button.textContent = 'Помилка. Спробуйте ще раз';
      if (status) status.textContent = 'Не вдалося надіслати форму. Спробуйте ще раз.';
    } finally {
      if (button) {
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
        }, 2200);
      }
    }
  });
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('.help-option-link');
  if (!target) return;
  const type = target.getAttribute('data-request-type');
  const select = document.getElementById('request-type');
  if (select && type) {
    select.value = type;
  }
});

bindFaqToggles();
bindCommentForm();
if (document.getElementById('comment-list')) {
  loadCommentActor().then(() => fetchCommentThread());
}
loadFeaturedCampaignProgress();
hydrateDynamicSections();
loadPostDetailPage();
initCustomCursor();
initPublicAuthUi();

const scrollDownBtn = document.getElementById('scroll-down');
if (scrollDownBtn) {
  scrollDownBtn.addEventListener('click', () => {
    const commentsSection = document.querySelector('.comments');
    if (commentsSection) {
      commentsSection.scrollIntoView({ behavior: 'smooth' });
    }
  });
}
