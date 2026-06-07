function getApiBase() {
  const configuredApiBase =
    (typeof __FF_API_BASE__ !== 'undefined' && __FF_API_BASE__) ||
    window.FF_API_BASE ||
    '';
  const normalizedApiBase = String(configuredApiBase).trim().replace(/\/+$/, '');
  if (normalizedApiBase) return normalizedApiBase;

  const isLocalDevHost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  return isLocalDevHost
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : '';
}

const API_BASE = getApiBase();
const AUTH_KEY = 'ff_admin_token';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/;
const UNSAFE_INPUT_RE = /<[^>]*>|javascript:|data:text\/html|on\w+\s*=|<\/script/i;

function normalizeSingleLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isSuspiciousInput(value) {
  return CONTROL_CHAR_RE.test(String(value || '')) || UNSAFE_INPUT_RE.test(String(value || ''));
}

function setFieldError(field, message) {
  if (!field) return;
  field.setCustomValidity(message || '');
  field.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function getToken() {
  return localStorage.getItem(AUTH_KEY);
}

function setToken(token) {
  localStorage.setItem(AUTH_KEY, token);
}

function clearToken() {
  localStorage.removeItem(AUTH_KEY);
}

function api(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  }).then(async (res) => {
    if (!res.ok) {
      let msg = 'Request failed';
      try {
        const data = await res.json();
        msg = data.error || msg;
      } catch {}
      throw new Error(msg);
    }
    return res.json();
  });
}

async function ensureAuthOrRedirect() {
  const token = getToken();
  if (!token) {
    window.location.href = 'admin-login.html';
    return null;
  }

  try {
    const me = await api('/api/auth/me');
    return me.user;
  } catch {
    clearToken();
    window.location.href = 'admin-login.html';
    return null;
  }
}

function bindLogoutButton() {
  const logoutBtn = document.getElementById('admin-logout-btn');
  if (!logoutBtn) return;
  logoutBtn.addEventListener('click', async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // no-op
    } finally {
      clearToken();
      window.location.href = 'admin-login.html';
    }
  });
}

function parseEditorMode() {
  const url = new URL(window.location.href);
  const idFromQuery = Number(url.searchParams.get('id'));
  if (Number.isInteger(idFromQuery) && idFromQuery > 0) {
    return { mode: 'edit', id: idFromQuery };
  }

  const pathname = window.location.pathname;
  const editMatch = pathname.match(/\/admin\/dashboard\/posts\/(\d+)\/edit$/);
  if (editMatch) return { mode: 'edit', id: Number(editMatch[1]) };
  return { mode: 'new', id: null };
}

async function initLoginPage() {
  const form = document.getElementById('admin-login-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.getElementById('admin-login-status');
    const emailField = document.getElementById('email');
    const passwordField = document.getElementById('password');
    const fd = new FormData(form);
    const payload = {
      email: normalizeSingleLine(fd.get('email')).toLowerCase(),
      password: String(fd.get('password') || ''),
    };
    setFieldError(emailField, '');
    setFieldError(passwordField, '');
    if (status) status.textContent = '';

    if (!payload.email || !EMAIL_RE.test(payload.email) || payload.email.length > 160 || isSuspiciousInput(payload.email)) {
      const message = 'Вкажіть коректний email.';
      setFieldError(emailField, message);
      if (status) status.textContent = message;
      emailField?.reportValidity();
      return;
    }
    if (!payload.password || payload.password.length > 128 || CONTROL_CHAR_RE.test(payload.password) || UNSAFE_INPUT_RE.test(payload.password)) {
      const message = 'Пароль містить недопустимі символи або має некоректну довжину.';
      setFieldError(passwordField, message);
      if (status) status.textContent = message;
      passwordField?.reportValidity();
      return;
    }

    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setToken(res.token);
      window.location.href = 'admin-posts.html';
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  });
}

async function initPostsListPage() {
  const list = document.getElementById('admin-post-list');
  if (!list) return;
  const user = await ensureAuthOrRedirect();
  if (!user) return;

  bindLogoutButton();

  const searchInput = document.getElementById('admin-post-search');
  const statusInput = document.getElementById('admin-post-status-filter');
  const filterBtn = document.getElementById('admin-post-filter-btn');
  const meta = document.getElementById('admin-post-list-meta');

  async function load() {
    const params = new URLSearchParams();
    if (searchInput?.value.trim()) params.set('search', searchInput.value.trim());
    if (statusInput?.value) params.set('status', statusInput.value);

    const data = await api(`/api/admin/posts?${params.toString()}`);
    if (meta) meta.textContent = `Сторінка ${data.page}/${data.totalPages}, всього: ${data.total}`;

    if (!data.items.length) {
      list.innerHTML = '<article class="admin-post-row">Пости не знайдено</article>';
      return;
    }

    list.innerHTML = data.items.map((item) => {
      const canDelete = user.role === 'admin';
      const publishBtn = item.status === 'published'
        ? ''
        : (user.role === 'admin'
          ? `<button class="btn btn--primary" data-action="publish" data-id="${item.id}">Опублікувати</button>`
          : `<button class="btn btn--primary" data-action="review" data-id="${item.id}">На ревʼю</button>`);

      return `
        <article class="admin-post-row">
          <strong>${item.title}</strong>
          <span class="admin-status">${item.status}</span>
          <p class="admin-post-meta">slug: ${item.slug}</p>
          <div class="admin-actions">
            <a class="btn btn--secondary" href="admin-post-editor.html?id=${item.id}">Редагувати</a>
            ${publishBtn}
            ${canDelete ? `<button class="btn btn--secondary" data-action="delete" data-id="${item.id}">Видалити</button>` : ''}
          </div>
        </article>
      `;
    }).join('');
  }

  list.addEventListener('click', async (event) => {
    const target = event.target.closest('button[data-action]');
    if (!target) return;
    const id = Number(target.getAttribute('data-id'));
    const action = target.getAttribute('data-action');

    try {
      if (action === 'publish') {
        await api(`/api/admin/posts/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'published' }) });
      } else if (action === 'review') {
        await api(`/api/admin/posts/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'review' }) });
      } else if (action === 'delete') {
        await api(`/api/admin/posts/${id}`, { method: 'DELETE' });
      }
      if (meta) meta.textContent = 'Оновлено успішно.';
      await load();
    } catch (error) {
      if (meta) meta.textContent = error.message;
    }
  });

  filterBtn?.addEventListener('click', load);
  await load();
}

async function initPostEditorPage() {
  const form = document.getElementById('admin-post-form');
  if (!form) return;
  const user = await ensureAuthOrRedirect();
  if (!user) return;

  bindLogoutButton();

  const modeInfo = parseEditorMode();
  const status = document.getElementById('admin-post-form-status');
  const titleEl = document.getElementById('admin-editor-title');
  const deleteBtn = document.getElementById('admin-delete-btn');
  const statusSelect = document.getElementById('post-status');
  const coverFileInput = document.getElementById('post-cover-file');
  const coverFileStatus = document.getElementById('post-cover-file-status');
  const coverPreviewWrap = document.getElementById('post-cover-preview-wrap');
  let coverImageDataUrl = '';

  function setCoverPreview(src) {
    if (!coverPreviewWrap) return;
    if (!src) {
      coverPreviewWrap.innerHTML = '';
      return;
    }
    coverPreviewWrap.innerHTML = `<img src="${src}" alt="Cover preview" style="max-width: 320px; border: 1px solid #000; border-radius: 10px; display: block;" />`;
  }

  coverFileInput?.addEventListener('change', async () => {
    const file = coverFileInput.files?.[0];
    if (!file) {
      coverImageDataUrl = '';
      if (coverFileStatus) coverFileStatus.textContent = '';
      setCoverPreview('');
      return;
    }

    const allowed = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);
    if (!allowed.has(file.type)) {
      if (coverFileStatus) coverFileStatus.textContent = 'Дозволені формати: PNG/JPG/WEBP/AVIF.';
      coverFileInput.value = '';
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      if (coverFileStatus) coverFileStatus.textContent = 'Файл завеликий. Максимум 3MB.';
      coverFileInput.value = '';
      return;
    }

    coverImageDataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(file);
    });

    if (coverFileStatus) coverFileStatus.textContent = `Файл готовий: ${file.name}`;
    setCoverPreview(coverImageDataUrl);
  });

  if (modeInfo.mode === 'new') {
    if (deleteBtn) deleteBtn.style.display = 'none';
  } else {
    if (titleEl) titleEl.textContent = `Редагування поста #${modeInfo.id}`;
    const post = await api(`/api/admin/posts/${modeInfo.id}`);
    form.title.value = post.title || '';
    form.slug.value = post.slug || '';
    form.excerpt.value = post.excerpt || '';
    form.content.value = post.content || '';
    coverImageDataUrl = post.coverImage || '';
    setCoverPreview(coverImageDataUrl);
    form.status.value = post.status || 'draft';
    if (user.role === 'editor') {
      deleteBtn.style.display = 'none';
      if (form.status.value === 'published') form.status.value = 'review';
      const publishedOption = statusSelect?.querySelector("option[value='published']");
      if (publishedOption) publishedOption.remove();
    }
  }

  if (modeInfo.mode === 'new' && user.role === 'editor') {
    const publishedOption = statusSelect?.querySelector("option[value='published']");
    if (publishedOption) publishedOption.remove();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = {
      title: String(form.title.value || '').trim(),
      slug: String(form.slug.value || '').trim(),
      excerpt: String(form.excerpt.value || '').trim(),
      content: String(form.content.value || '').trim(),
      coverImage: coverImageDataUrl || null,
      status: String(form.status.value || 'draft').trim(),
    };

    try {
      if (modeInfo.mode === 'new') {
        await api('/api/admin/posts', { method: 'POST', body: JSON.stringify(payload) });
      } else {
        await api(`/api/admin/posts/${modeInfo.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      }
      if (status) status.textContent = 'Збережено';
      setTimeout(() => {
        window.location.href = 'admin-posts.html';
      }, 500);
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  });

  deleteBtn?.addEventListener('click', async () => {
    if (!modeInfo.id) return;
    if (!confirm('Видалити пост?')) return;
    try {
      await api(`/api/admin/posts/${modeInfo.id}`, { method: 'DELETE' });
      window.location.href = 'admin-posts.html';
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  });
}

(async function bootstrapAdmin() {
  await initLoginPage();
  await initPostsListPage();
  await initPostEditorPage();
})();
