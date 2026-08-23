(function () {
  const API_BASE = 'https://aarwitz-site-api.aaronhorowits97.workers.dev';
  const STORAGE = { session: 'aarwitz.api.session.v1' };
  const ADMIN_EMAIL = 'aaron@lidisolutions.ai';
  const LISTING_PAGES = new Set(['', 'index.html', 'blog.html', 'essays.html', 'projects.html', 'about.html', 'Notes.html', 'admin.html']);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72) || 'untitled';
  }

  function pageName() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  function pageKey() {
    if (pageName() === 'post.html') {
      const slug = new URLSearchParams(window.location.search).get('slug') || '';
      return `/posts/${slug}`;
    }
    return window.location.pathname || '/';
  }

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.session) || 'null');
    } catch {
      return null;
    }
  }

  function writeSession(session) {
    localStorage.setItem(STORAGE.session, JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem(STORAGE.session);
  }

  function activeUser() {
    return readSession()?.user || null;
  }

  function authHeaders() {
    const token = readSession()?.token;
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...authHeaders(),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  }

  function isAdmin(user = activeUser()) {
    return Boolean(user && user.email === ADMIN_EMAIL && user.role === 'admin');
  }

  function showStatus(text, error = false) {
    const status = $('#site-auth-status');
    if (!status) return;
    status.textContent = text;
    status.style.color = error ? 'var(--site-red)' : 'var(--site-muted)';
  }

  function ensureModal() {
    if ($('#site-auth-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'site-auth-modal';
    modal.className = 'site-modal-backdrop';
    modal.innerHTML = `
      <div class="site-modal" role="dialog" aria-modal="true" aria-labelledby="site-auth-title">
        <div class="site-modal-header">
          <h2 id="site-auth-title" class="text-xl font-bold text-white">Account</h2>
          <button type="button" class="site-shell-button" data-auth-close aria-label="Close account dialog">Close</button>
        </div>
        <div class="site-modal-body site-form-grid">
          <div class="site-auth-tabs" role="tablist">
            <button type="button" class="site-auth-tab active" data-auth-tab="login">Log in</button>
            <button type="button" class="site-auth-tab" data-auth-tab="signup">Create account</button>
          </div>
          <form id="site-login-form" class="site-form-grid">
            <label class="site-form-label">Email
              <input class="site-shell-input" name="email" type="email" autocomplete="email" required>
            </label>
            <label class="site-form-label">Password
              <input class="site-shell-input" name="password" type="password" autocomplete="current-password" required>
            </label>
            <button class="site-shell-button primary" type="submit">Log in</button>
          </form>
          <form id="site-signup-form" class="site-form-grid" hidden>
            <label class="site-form-label">Name
              <input class="site-shell-input" name="name" autocomplete="name" required>
            </label>
            <label class="site-form-label">Email
              <input class="site-shell-input" name="email" type="email" autocomplete="email" required>
            </label>
            <label class="site-form-label">Password
              <input class="site-shell-input" name="password" type="password" autocomplete="new-password" minlength="12" required>
              <span class="site-field-note">Passwords and sessions are handled by the site API.</span>
            </label>
            <button class="site-shell-button primary" type="submit">Create account</button>
          </form>
          <p id="site-auth-status" class="site-field-note"></p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    $('[data-auth-close]', modal).addEventListener('click', closeAuth);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeAuth();
    });

    $$('[data-auth-tab]', modal).forEach((button) => {
      button.addEventListener('click', () => {
        $$('[data-auth-tab]', modal).forEach((tab) => tab.classList.toggle('active', tab === button));
        $('#site-login-form').hidden = button.dataset.authTab !== 'login';
        $('#site-signup-form').hidden = button.dataset.authTab !== 'signup';
        showStatus('');
      });
    });

    $('#site-login-form').addEventListener('submit', handleLogin);
    $('#site-signup-form').addEventListener('submit', handleSignup);
  }

  function openAuth() {
    ensureModal();
    $('#site-auth-modal').classList.add('open');
    $('#site-login-form input[name="email"]')?.focus();
  }

  function closeAuth() {
    $('#site-auth-modal')?.classList.remove('open');
  }

  async function handleLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    showStatus('Logging in...');
    try {
      const session = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: form.elements.email.value.trim(),
          password: form.elements.password.value
        })
      });
      writeSession(session);
      closeAuth();
      await refreshAll();
    } catch (error) {
      showStatus(error.message, true);
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    const form = event.currentTarget;
    showStatus('Creating account...');
    try {
      const session = await api('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          name: form.elements.name.value.trim(),
          email: form.elements.email.value.trim(),
          password: form.elements.password.value
        })
      });
      writeSession(session);
      closeAuth();
      await refreshAll();
    } catch (error) {
      showStatus(error.message, true);
    }
  }

  async function signOut() {
    try {
      await api('/auth/logout', { method: 'POST', body: '{}' });
    } catch {
      // Local session removal is the important user-visible action.
    }
    clearSession();
    await refreshAll();
  }

  function renderAccountBar() {
    const header = $('#site-header header');
    if (!header) return;
    let bar = $('#site-account-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'site-account-bar';
      bar.className = 'site-account-bar';
      header.appendChild(bar);
    }

    const user = activeUser();
    if (!user) {
      bar.innerHTML = '<button type="button" class="site-shell-button" data-open-auth>Log in / Create account</button>';
      $('[data-open-auth]', bar).addEventListener('click', openAuth);
      return;
    }

    bar.innerHTML = `
      <span>Signed in as <strong class="text-white">${escapeHtml(user.name || user.email)}</strong></span>
      ${isAdmin(user) ? '<a class="site-shell-button primary" href="admin.html">Compose</a>' : ''}
      <button type="button" class="site-shell-button" data-sign-out>Sign out</button>
    `;
    $('[data-sign-out]', bar).addEventListener('click', signOut);
  }

  async function verifySession() {
    if (!readSession()?.token) return;
    try {
      const data = await api('/me');
      if (data.user) {
        writeSession({ ...readSession(), user: data.user });
      } else {
        clearSession();
      }
    } catch {
      clearSession();
    }
  }

  async function renderComments() {
    const name = pageName();
    if (LISTING_PAGES.has(name)) return;
    const main = $('main') || $('article') || $('.max-w-5xl');
    if (!main) return;

    let panel = $('#site-comments');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'site-comments';
      panel.className = 'site-comment-panel';
      main.insertAdjacentElement(main.matches('main') ? 'afterend' : 'beforeend', panel);
    }

    const user = activeUser();
    let comments = [];
    let error = '';
    try {
      comments = (await api(`/comments?page=${encodeURIComponent(pageKey())}`)).comments || [];
    } catch (err) {
      error = err.message;
    }

    panel.innerHTML = `
      <div class="site-comment-header">
        <div>
          <h2 class="text-xl font-bold text-white">Comments</h2>
          <p class="site-field-note">${error ? escapeHtml(error) : `${comments.length} public comment${comments.length === 1 ? '' : 's'}.`}</p>
        </div>
        ${user ? '' : '<button type="button" class="site-shell-button" data-open-auth>Log in to comment</button>'}
      </div>
      ${user ? `
        <form id="site-comment-form" class="site-form-grid">
          <label class="site-form-label">Add a comment
            <textarea class="site-shell-textarea" name="comment" rows="4" maxlength="2000" required></textarea>
          </label>
          <button class="site-shell-button primary" type="submit">Post comment</button>
        </form>
      ` : ''}
      <div class="site-comment-list">
        ${comments.length ? comments.map((comment) => `
          <article class="site-comment">
            <div class="site-comment-meta">
              <span class="site-comment-author">${escapeHtml(comment.authorName)}</span>
              <span>${new Date(comment.createdAt).toLocaleString()}</span>
            </div>
            <p>${escapeHtml(comment.body).replace(/\n/g, '<br>')}</p>
            ${comment.canDelete ? `<button type="button" class="site-shell-button danger" data-delete-comment="${comment.id}">Delete</button>` : ''}
          </article>
        `).join('') : '<p class="site-field-note">No comments yet.</p>'}
      </div>
    `;

    $('[data-open-auth]', panel)?.addEventListener('click', openAuth);
    $('#site-comment-form', panel)?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = event.currentTarget.elements.comment.value.trim();
      if (!body) return;
      await api('/comments', { method: 'POST', body: JSON.stringify({ pageKey: pageKey(), body }) });
      await renderComments();
    });
    $$('[data-delete-comment]', panel).forEach((button) => {
      button.addEventListener('click', async () => {
        await api(`/comments/${button.dataset.deleteComment}`, { method: 'DELETE' });
        await renderComments();
      });
    });
  }

  function buildArticleHtml(post) {
    return `
      <p class="text-sm font-semibold uppercase tracking-wide text-blue-400 mb-2">${escapeHtml(post.type || 'post')}</p>
      <h1 class="text-2xl sm:text-4xl font-bold mb-2 text-white">${escapeHtml(post.title)}</h1>
      <p class="text-sm text-gray-400 mb-6">${post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : 'Draft'} &bull; Aaron</p>
      ${post.heroUrl ? `<img src="${escapeHtml(post.heroUrl)}" alt="${escapeHtml(post.title)}" class="w-full rounded-lg border border-gray-700 mb-6">` : ''}
      <div class="dynamic-post-body">${post.bodyHtml || ''}</div>
    `;
  }

  function buildCard(post) {
    const date = post.publishedAt ? new Date(post.publishedAt).toLocaleDateString() : 'Draft';
    return `
      <a href="post.html?slug=${encodeURIComponent(post.slug)}" class="block group" data-api-post="${escapeHtml(post.type)}">
        <article class="bg-[#161b22] rounded-lg shadow-lg p-6 sm:p-8 transition transform group-hover:scale-[1.02] group-hover:shadow-xl cursor-pointer">
          <h2 class="text-2xl sm:text-3xl font-bold mb-2 text-white group-hover:text-blue-400 transition">${escapeHtml(post.title)}</h2>
          <p class="text-gray-400 text-sm mb-4">Published on ${escapeHtml(date)}</p>
          <div class="relative h-24 overflow-hidden">
            <div class="prose max-w-none text-gray-300"><p>${escapeHtml(post.summary)}</p></div>
            <div class="absolute bottom-0 left-0 w-full h-10 bg-gradient-to-t from-[#161b22] to-transparent pointer-events-none"></div>
          </div>
        </article>
      </a>
    `;
  }

  async function renderApiPostsOnListing() {
    const name = pageName();
    const type = name === 'blog.html' ? 'blog' : name === 'essays.html' ? 'essay' : name === 'projects.html' ? 'project' : null;
    if (!type) return;
    const main = $('main');
    if (!main) return;
    $$('[data-api-post]', main).forEach((item) => item.remove());
    try {
      const posts = (await api(`/posts?type=${type}`)).posts || [];
      posts.reverse().forEach((post) => main.insertAdjacentHTML('afterbegin', buildCard(post)));
    } catch {
      // Existing hand-coded posts remain available if the API is unreachable.
    }
  }

  async function renderDynamicPost() {
    if (pageName() !== 'post.html') return;
    const slug = new URLSearchParams(window.location.search).get('slug');
    const target = $('#dynamic-post');
    if (!slug || !target) return;
    try {
      const { post } = await api(`/posts/${encodeURIComponent(slug)}`);
      document.title = `${post.title} - Aaron Horowitz`;
      target.innerHTML = buildArticleHtml(post);
    } catch (error) {
      target.innerHTML = `<h1 class="text-2xl font-bold text-white mb-2">Post unavailable</h1><p class="text-gray-400">${escapeHtml(error.message)}</p>`;
    }
  }

  function draftFromForm() {
    const form = $('#composer-form');
    if (!form) return null;
    return {
      type: form.elements.type.value,
      title: form.elements.title.value.trim(),
      slug: slugify(form.elements.slug.value || form.elements.title.value),
      category: form.elements.category.value.trim(),
      tags: form.elements.tags.value.split(',').map((tag) => tag.trim()).filter(Boolean),
      heroUrl: form.elements.hero.value.trim(),
      summary: form.elements.summary.value.trim(),
      bodyMarkdown: form.elements.content.value.trim(),
      status: form.elements.status.value
    };
  }

  function fillComposer(post = {}) {
    const form = $('#composer-form');
    if (!form) return;
    form.elements.type.value = post.type || 'blog';
    form.elements.title.value = post.title || '';
    form.elements.slug.value = post.slug || slugify(post.title);
    form.elements.category.value = post.category || '';
    form.elements.tags.value = Array.isArray(post.tags) ? post.tags.join(', ') : (post.tags || '');
    form.elements.hero.value = post.heroUrl || '';
    form.elements.summary.value = post.summary || '';
    form.elements.content.value = post.bodyMarkdown || '';
    form.elements.status.value = post.status || 'draft';
    updateComposerPreview();
  }

  function updateComposerPreview() {
    const draft = draftFromForm();
    if (!draft) return;
    const preview = $('#composer-preview');
    if (!preview) return;
    preview.innerHTML = `
      <article>
        <p class="text-sm font-semibold uppercase tracking-wide text-blue-400 mb-2">${escapeHtml(draft.status)} ${escapeHtml(draft.type)}</p>
        <h1>${escapeHtml(draft.title || 'Untitled')}</h1>
        ${draft.summary ? `<p class="text-gray-400">${escapeHtml(draft.summary)}</p>` : ''}
        <div>${window.AarwitzSite.markdownToHtml(draft.bodyMarkdown)}</div>
      </article>
    `;
  }

  async function renderAdminPosts() {
    const target = $('#composer-drafts');
    if (!target || !isAdmin()) return;
    try {
      const posts = (await api('/admin/posts')).posts || [];
      target.innerHTML = posts.length ? posts.map((post) => `
        <div class="site-comment">
          <div class="site-comment-meta">
            <span class="site-comment-author">${escapeHtml(post.title)}</span>
            <span>${escapeHtml(post.type)}</span>
            <span>${escapeHtml(post.status)}</span>
          </div>
          <p class="site-field-note">${escapeHtml(post.summary || 'No summary')}</p>
          <div class="composer-actions">
            <button class="site-shell-button" type="button" data-load-post="${escapeHtml(post.slug)}">Load</button>
            <a class="site-shell-button" href="post.html?slug=${encodeURIComponent(post.slug)}">View</a>
            <button class="site-shell-button danger" type="button" data-delete-post="${escapeHtml(post.slug)}">Delete</button>
          </div>
        </div>
      `).join('') : '<p class="site-field-note">No server-side posts yet.</p>';
      $$('[data-load-post]', target).forEach((button) => button.addEventListener('click', async () => {
        const { post } = await api(`/admin/posts/${encodeURIComponent(button.dataset.loadPost)}`);
        fillComposer(post);
      }));
      $$('[data-delete-post]', target).forEach((button) => button.addEventListener('click', async () => {
        await api(`/admin/posts/${encodeURIComponent(button.dataset.deletePost)}`, { method: 'DELETE' });
        await renderAdminPosts();
      }));
    } catch (error) {
      target.innerHTML = `<p class="site-field-note">${escapeHtml(error.message)}</p>`;
    }
  }

  async function initComposer() {
    if (pageName() !== 'admin.html') return;
    const guard = $('#composer-guard');
    const app = $('#composer-app');
    if (!isAdmin()) {
      if (guard) guard.hidden = false;
      if (app) app.hidden = true;
      $('#composer-login')?.addEventListener('click', openAuth);
      return;
    }

    if (guard) guard.hidden = true;
    if (app) app.hidden = false;
    const form = $('#composer-form');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = 'true';
    fillComposer({ type: 'blog', status: 'draft', bodyMarkdown: '# Section title\n\nWrite the first paragraph here.' });

    form.addEventListener('input', () => {
      if (form.elements.title.value && !form.elements.slug.dataset.touched) {
        form.elements.slug.value = slugify(form.elements.title.value);
      }
      updateComposerPreview();
    });
    form.elements.slug.addEventListener('input', () => {
      form.elements.slug.dataset.touched = 'true';
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const draft = draftFromForm();
      const method = 'POST';
      const data = await api('/admin/posts', { method, body: JSON.stringify(draft) });
      fillComposer(data.post);
      $('#composer-status').textContent = `${draft.status === 'published' ? 'Published' : 'Saved'}: ${data.post.title}`;
      await renderAdminPosts();
    });
    $('#composer-reset')?.addEventListener('click', () => {
      fillComposer({ type: 'blog', status: 'draft', bodyMarkdown: '' });
      $('#composer-status').textContent = 'Started a new post.';
    });
    $('#composer-copy-html')?.addEventListener('click', async () => {
      const draft = draftFromForm();
      await navigator.clipboard.writeText(window.AarwitzSite.markdownToHtml(draft.bodyMarkdown));
      $('#composer-status').textContent = 'Copied body HTML.';
    });
    $('#composer-copy-snippet')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(buildCard({ ...draftFromForm(), publishedAt: new Date().toISOString() }));
      $('#composer-status').textContent = 'Copied listing card.';
    });
    $('#composer-download')?.addEventListener('click', () => {
      $('#composer-status').textContent = 'Server publishing is active. Use Save/Publish instead.';
    });
    await renderAdminPosts();
  }

  async function refreshAll() {
    renderAccountBar();
    await renderDynamicPost();
    await renderApiPostsOnListing();
    await renderComments();
    await initComposer();
  }

  window.AarwitzSite = {
    api,
    slugify,
    markdownToHtml(markdown) {
      const escape = escapeHtml;
      return String(markdown || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map((block) => {
        const trimmed = block.trim();
        if (!trimmed) return '';
        const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          const level = Math.min(heading[1].length + 1, 4);
          return `<h${level}>${escape(heading[2])}</h${level}>`;
        }
        if (/^[-*]\s+/m.test(trimmed)) {
          return `<ul>${trimmed.split('\n').map((line) => line.replace(/^[-*]\s+/, '')).map((line) => `<li>${escape(line)}</li>`).join('')}</ul>`;
        }
        if (/^\d+\.\s+/m.test(trimmed)) {
          return `<ol>${trimmed.split('\n').map((line) => line.replace(/^\d+\.\s+/, '')).map((line) => `<li>${escape(line)}</li>`).join('')}</ol>`;
        }
        return `<p>${escape(trimmed).replace(/\n/g, ' ')}</p>`;
      }).join('\n');
    }
  };

  async function boot() {
    ensureModal();
    await verifySession();
    await refreshAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
