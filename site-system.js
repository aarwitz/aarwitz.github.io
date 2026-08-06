(function () {
  const STORAGE = {
    users: 'aarwitz.users.v1',
    session: 'aarwitz.session.v1',
    comments: 'aarwitz.comments.v1',
    drafts: 'aarwitz.drafts.v1'
  };

  const ADMIN_EMAIL = 'aaron@lidisolutions.ai';
  const ADMIN_PASSWORD = 'Lemonade';
  const LISTING_PAGES = new Set(['', 'index.html', 'blog.html', 'essays.html', 'projects.html', 'about.html', 'Notes.html', 'admin.html']);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

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

  function users() {
    const stored = readJson(STORAGE.users, []);
    if (!stored.some((user) => user.email === ADMIN_EMAIL)) {
      stored.push({
        id: 'admin-aaron',
        name: 'Aaron',
        email: ADMIN_EMAIL,
        role: 'admin',
        createdAt: '2026-08-06T00:00:00.000Z'
      });
      writeJson(STORAGE.users, stored);
    }
    return stored;
  }

  function session() {
    const active = readJson(STORAGE.session, null);
    if (!active) return null;
    return users().find((user) => user.id === active.userId) || null;
  }

  function setSession(user) {
    writeJson(STORAGE.session, { userId: user.id, email: user.email, at: new Date().toISOString() });
  }

  function clearSession() {
    localStorage.removeItem(STORAGE.session);
  }

  function isAdmin(user) {
    return Boolean(user && user.email === ADMIN_EMAIL && user.role === 'admin');
  }

  function showStatus(text, error = false) {
    let status = $('#site-auth-status');
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
              <input class="site-shell-input" name="password" type="password" autocomplete="new-password" minlength="4" required>
              <span class="site-field-note">Accounts are stored in this browser for this static site.</span>
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
    const email = $('#site-login-form input[name="email"]');
    if (email) email.focus();
  }

  function closeAuth() {
    const modal = $('#site-auth-modal');
    if (modal) modal.classList.remove('open');
  }

  function handleLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.elements.email.value.trim().toLowerCase();
    const password = form.elements.password.value;
    const user = users().find((item) => item.email.toLowerCase() === email);

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      setSession(user);
      closeAuth();
      renderAccountBar();
      renderComments();
      initComposer();
      return;
    }

    const storedPassword = localStorage.getItem(`aarwitz.password.${email}`);
    if (user && storedPassword && password === storedPassword) {
      setSession(user);
      closeAuth();
      renderAccountBar();
      renderComments();
      initComposer();
      return;
    }

    showStatus('Email or password did not match this browser.', true);
  }

  function handleSignup(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.elements.email.value.trim().toLowerCase();
    const allUsers = users();
    if (allUsers.some((user) => user.email.toLowerCase() === email)) {
      showStatus('That email already has an account in this browser.', true);
      return;
    }

    const user = {
      id: `user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: form.elements.name.value.trim(),
      email,
      role: 'reader',
      createdAt: new Date().toISOString()
    };
    allUsers.push(user);
    writeJson(STORAGE.users, allUsers);
    localStorage.setItem(`aarwitz.password.${email}`, form.elements.password.value);
    setSession(user);
    closeAuth();
    renderAccountBar();
    renderComments();
    initComposer();
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

    const active = session();
    if (!active) {
      bar.innerHTML = `<button type="button" class="site-shell-button" data-open-auth>Log in / Create account</button>`;
      $('[data-open-auth]', bar).addEventListener('click', openAuth);
      return;
    }

    bar.innerHTML = `
      <span>Signed in as <strong class="text-white">${escapeHtml(active.name || active.email)}</strong></span>
      ${isAdmin(active) ? '<a class="site-shell-button primary" href="admin.html">Compose</a>' : ''}
      <button type="button" class="site-shell-button" data-sign-out>Sign out</button>
    `;
    $('[data-sign-out]', bar).addEventListener('click', () => {
      clearSession();
      renderAccountBar();
      renderComments();
    });
  }

  function commentsForPage() {
    const all = readJson(STORAGE.comments, {});
    return all[window.location.pathname] || [];
  }

  function saveComment(text) {
    const active = session();
    if (!active) return;
    const all = readJson(STORAGE.comments, {});
    const key = window.location.pathname;
    const list = all[key] || [];
    list.push({
      id: `comment-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      authorName: active.name || active.email,
      authorEmail: active.email,
      body: text,
      createdAt: new Date().toISOString()
    });
    all[key] = list;
    writeJson(STORAGE.comments, all);
  }

  function deleteComment(id) {
    const all = readJson(STORAGE.comments, {});
    const key = window.location.pathname;
    all[key] = (all[key] || []).filter((comment) => comment.id !== id);
    writeJson(STORAGE.comments, all);
  }

  function renderComments() {
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

    const active = session();
    const comments = commentsForPage();
    panel.innerHTML = `
      <div class="site-comment-header">
        <div>
          <h2 class="text-xl font-bold text-white">Comments</h2>
          <p class="site-field-note">${comments.length} saved in this browser for this page.</p>
        </div>
        ${active ? '' : '<button type="button" class="site-shell-button" data-open-auth>Log in to comment</button>'}
      </div>
      ${active ? `
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
            ${active && (active.email === comment.authorEmail || isAdmin(active)) ? `<button type="button" class="site-shell-button danger" data-delete-comment="${comment.id}">Delete</button>` : ''}
          </article>
        `).join('') : '<p class="site-field-note">No comments yet.</p>'}
      </div>
    `;

    const open = $('[data-open-auth]', panel);
    if (open) open.addEventListener('click', openAuth);

    const form = $('#site-comment-form', panel);
    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const text = form.elements.comment.value.trim();
        if (!text) return;
        saveComment(text);
        renderComments();
      });
    }

    $$('[data-delete-comment]', panel).forEach((button) => {
      button.addEventListener('click', () => {
        deleteComment(button.dataset.deleteComment);
        renderComments();
      });
    });
  }

  function markdownToHtml(markdown) {
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    const html = [];
    let paragraph = [];
    let list = null;

    function flushParagraph() {
      if (!paragraph.length) return;
      html.push(`<p>${paragraph.map(escapeHtml).join(' ')}</p>`);
      paragraph = [];
    }

    function closeList() {
      if (!list) return;
      html.push(`</${list}>`);
      list = null;
    }

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        closeList();
        return;
      }
      const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        closeList();
        const level = heading[1].length + 1;
        html.push(`<h${level} class="text-xl font-bold mt-6 mb-2">${escapeHtml(heading[2])}</h${level}>`);
        return;
      }
      const bullet = trimmed.match(/^[-*]\s+(.+)$/);
      if (bullet) {
        flushParagraph();
        if (list !== 'ul') {
          closeList();
          list = 'ul';
          html.push('<ul class="list-disc pl-6 space-y-2">');
        }
        html.push(`<li>${escapeHtml(bullet[1])}</li>`);
        return;
      }
      const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
      if (numbered) {
        flushParagraph();
        if (list !== 'ol') {
          closeList();
          list = 'ol';
          html.push('<ol class="list-decimal pl-6 space-y-2">');
        }
        html.push(`<li>${escapeHtml(numbered[1])}</li>`);
        return;
      }
      closeList();
      paragraph.push(trimmed);
    });

    flushParagraph();
    closeList();
    return html.join('\n');
  }

  function buildArticleHtml(draft) {
    const title = escapeHtml(draft.title);
    const date = escapeHtml(draft.date || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
    const typeLabel = escapeHtml(draft.type || 'blog');
    const body = markdownToHtml(draft.content);
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta http-equiv="cache-control" content="no-cache">
    <meta http-equiv="expires" content="0">
    <meta http-equiv="pragma" content="no-cache">
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Aaron Horowitz</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: 'Optima'; background:#0d1117; color:#c9d1d9; font-size:17px; line-height:1.7; -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; }
        article p { margin-bottom: 1rem; }
    </style>
</head>
<body class="p-4">
    <div class="max-w-3xl mx-auto sm:p-4 lg:p-8">
        <div id="site-header"></div>
        <article class="bg-[#161b22] rounded-lg shadow-lg p-6 sm:p-8">
            <p class="text-sm font-semibold uppercase tracking-wide text-blue-400 mb-2">${typeLabel}</p>
            <h1 class="text-2xl sm:text-4xl font-bold mb-2 text-white">${title}</h1>
            <p class="text-sm text-gray-400 mb-6">${date} &bull; Aaron</p>
            ${draft.hero ? `<img src="${escapeHtml(draft.hero)}" alt="${title}" class="w-full rounded-lg border border-gray-700 mb-6">` : ''}
            ${body}
        </article>
    </div>
    <script src="include_header.js" defer></script>
</body>
</html>`;
  }

  function buildCardSnippet(draft) {
    const target = `${slugify(draft.slug || draft.title)}.html`;
    const typeClass = draft.type === 'project' ? 'project-item' : draft.type === 'essay' ? 'essay-item' : 'blog-item';
    return `<a href="${target}" class="${typeClass} block group"${draft.category ? ` data-category="${escapeHtml(slugify(draft.category))}"` : ''}>
    <article class="bg-[#161b22] rounded-lg shadow-lg p-6 sm:p-8 transition transform group-hover:scale-[1.02] group-hover:shadow-xl cursor-pointer">
        <h2 class="text-2xl sm:text-3xl font-bold mb-2 text-white group-hover:text-blue-400 transition">${escapeHtml(draft.title)}</h2>
        <p class="text-gray-400 text-sm mb-4">Published on ${escapeHtml(draft.date || '')}</p>
        <div class="relative h-24 overflow-hidden">
            <div class="prose max-w-none text-gray-300">
                <p>${escapeHtml(draft.summary || '')}</p>
            </div>
            <div class="absolute bottom-0 left-0 w-full h-10 bg-gradient-to-t from-[#161b22] to-transparent pointer-events-none"></div>
        </div>
    </article>
</a>`;
  }

  function draftFromForm() {
    const form = $('#composer-form');
    if (!form) return null;
    return {
      id: form.elements.draftId.value || `draft-${Date.now()}`,
      type: form.elements.type.value,
      title: form.elements.title.value.trim(),
      slug: slugify(form.elements.slug.value || form.elements.title.value),
      date: form.elements.date.value,
      category: form.elements.category.value.trim(),
      tags: form.elements.tags.value.trim(),
      hero: form.elements.hero.value.trim(),
      summary: form.elements.summary.value.trim(),
      content: form.elements.content.value.trim(),
      updatedAt: new Date().toISOString()
    };
  }

  function fillComposer(draft) {
    const form = $('#composer-form');
    if (!form || !draft) return;
    form.elements.draftId.value = draft.id || '';
    form.elements.type.value = draft.type || 'blog';
    form.elements.title.value = draft.title || '';
    form.elements.slug.value = draft.slug || slugify(draft.title);
    form.elements.date.value = draft.date || new Date().toISOString().slice(0, 10);
    form.elements.category.value = draft.category || '';
    form.elements.tags.value = draft.tags || '';
    form.elements.hero.value = draft.hero || '';
    form.elements.summary.value = draft.summary || '';
    form.elements.content.value = draft.content || '';
    updateComposerOutput();
  }

  function allDrafts() {
    return readJson(STORAGE.drafts, []);
  }

  function saveDraft(draft) {
    const drafts = allDrafts();
    const existing = drafts.findIndex((item) => item.id === draft.id);
    if (existing >= 0) drafts[existing] = draft;
    else drafts.unshift(draft);
    writeJson(STORAGE.drafts, drafts);
  }

  function deleteDraft(id) {
    writeJson(STORAGE.drafts, allDrafts().filter((draft) => draft.id !== id));
  }

  function renderDraftList() {
    const target = $('#composer-drafts');
    if (!target) return;
    const drafts = allDrafts();
    target.innerHTML = drafts.length ? drafts.map((draft) => `
      <div class="site-comment">
        <div class="site-comment-meta">
          <span class="site-comment-author">${escapeHtml(draft.title || 'Untitled')}</span>
          <span>${escapeHtml(draft.type)}</span>
        </div>
        <p class="site-field-note">${escapeHtml(draft.summary || 'No summary')}</p>
        <div class="composer-actions">
          <button class="site-shell-button" type="button" data-load-draft="${draft.id}">Load</button>
          <button class="site-shell-button danger" type="button" data-delete-draft="${draft.id}">Delete</button>
        </div>
      </div>
    `).join('') : '<p class="site-field-note">No saved drafts in this browser.</p>';

    $$('[data-load-draft]', target).forEach((button) => {
      button.addEventListener('click', () => fillComposer(allDrafts().find((draft) => draft.id === button.dataset.loadDraft)));
    });
    $$('[data-delete-draft]', target).forEach((button) => {
      button.addEventListener('click', () => {
        deleteDraft(button.dataset.deleteDraft);
        renderDraftList();
      });
    });
  }

  function updateComposerOutput() {
    const draft = draftFromForm();
    if (!draft) return;
    if (!draft.title && !draft.content) return;
    const html = buildArticleHtml(draft);
    const snippet = buildCardSnippet(draft);
    const preview = $('#composer-preview');
    const output = $('#composer-output');
    const snippetOutput = $('#composer-snippet');
    if (preview) preview.innerHTML = html.match(/<article[\s\S]*<\/article>/)?.[0] || '';
    if (output) output.value = html;
    if (snippetOutput) snippetOutput.value = snippet;
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function initComposer() {
    if (pageName() !== 'admin.html') return;
    const active = session();
    const guard = $('#composer-guard');
    const app = $('#composer-app');
    if (!isAdmin(active)) {
      if (guard) guard.hidden = false;
      if (app) app.hidden = true;
      const login = $('#composer-login');
      if (login) login.addEventListener('click', openAuth);
      return;
    }

    if (guard) guard.hidden = true;
    if (app) app.hidden = false;
    const form = $('#composer-form');
    if (!form) return;
    fillComposer({
      type: 'blog',
      date: new Date().toISOString().slice(0, 10),
      content: '# Section title\n\nWrite the first paragraph here.\n\n- Bullet point\n- Another bullet point'
    });

    form.addEventListener('input', () => {
      if (form.elements.title.value && !form.elements.slug.dataset.touched) form.elements.slug.value = slugify(form.elements.title.value);
      updateComposerOutput();
    });
    form.elements.slug.addEventListener('input', () => {
      form.elements.slug.dataset.touched = 'true';
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const draft = draftFromForm();
      saveDraft(draft);
      form.elements.draftId.value = draft.id;
      renderDraftList();
      const status = $('#composer-status');
      if (status) status.textContent = `Saved draft: ${draft.title}`;
    });

    $('#composer-download')?.addEventListener('click', () => {
      const draft = draftFromForm();
      downloadText(`${draft.slug}.html`, buildArticleHtml(draft));
    });
    $('#composer-copy-html')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText($('#composer-output').value);
      $('#composer-status').textContent = 'Copied page HTML.';
    });
    $('#composer-copy-snippet')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText($('#composer-snippet').value);
      $('#composer-status').textContent = 'Copied listing snippet.';
    });
    $('#composer-reset')?.addEventListener('click', () => {
      fillComposer({ type: 'blog', date: new Date().toISOString().slice(0, 10), content: '' });
      $('#composer-status').textContent = 'Started a new draft.';
    });

    renderDraftList();
  }

  function renderLocalDraftCards() {
    const name = pageName();
    const type = name === 'blog.html' ? 'blog' : name === 'essays.html' ? 'essay' : name === 'projects.html' ? 'project' : null;
    if (!type) return;
    const main = $('main');
    if (!main) return;
    const drafts = allDrafts().filter((draft) => draft.type === type);
    drafts.forEach((draft) => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = buildCardSnippet(draft);
      const card = wrapper.firstElementChild;
      card.classList.add('site-local-draft');
      card.querySelector('article').insertAdjacentHTML('afterbegin', '<span class="site-local-draft-badge">Browser draft</span>');
      main.prepend(card);
    });
  }

  window.AarwitzSite = {
    buildArticleHtml,
    buildCardSnippet,
    markdownToHtml,
    slugify
  };

  function boot() {
    users();
    ensureModal();
    renderAccountBar();
    renderLocalDraftCards();
    renderComments();
    initComposer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
