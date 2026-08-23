const SESSION_DAYS = 30;

function json(data, status = 200, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders(request, env)
    }
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean);
  return {
    'access-control-allow-origin': allowed.includes(origin) ? origin : allowed[0] || '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-max-age': '86400'
  };
}

function textEncoder() {
  return new TextEncoder();
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes = 32) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value) {
  return bytesToHex(await crypto.subtle.digest('SHA-256', textEncoder().encode(value)));
}

async function passwordHash(password, salt) {
  return sha256(`${salt}:${password}`);
}

function id(prefix) {
  return `${prefix}_${randomHex(16)}`;
}

function now() {
  return new Date().toISOString();
}

function requireString(value, name, max = 1000) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${name} is required`);
  if (text.length > max) throw new Error(`${name} is too long`);
  return text;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.created_at
  };
}

function publicPost(post, includeBody = true) {
  const data = {
    id: post.id,
    slug: post.slug,
    type: post.type,
    title: post.title,
    summary: post.summary,
    category: post.category,
    tags: post.tags ? post.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
    heroUrl: post.hero_url,
    status: post.status,
    publishedAt: post.published_at,
    createdAt: post.created_at,
    updatedAt: post.updated_at
  };
  if (includeBody) {
    data.bodyMarkdown = post.body_markdown;
    data.bodyHtml = post.body_html;
  }
  return data;
}

function markdownToHtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let list = null;

  const escape = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${paragraph.map(escape).join(' ')}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!list) return;
    html.push(`</${list}>`);
    list = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(heading[1].length + 1, 4);
      html.push(`<h${level}>${escape(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (list !== 'ul') {
        closeList();
        list = 'ul';
        html.push('<ul>');
      }
      html.push(`<li>${escape(bullet[1])}</li>`);
      continue;
    }
    const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      if (list !== 'ol') {
        closeList();
        list = 'ol';
        html.push('<ol>');
      }
      html.push(`<li>${escape(numbered[1])}</li>`);
      continue;
    }
    closeList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();
  return html.join('\n');
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    throw new Error('Invalid JSON body');
  }
}

async function userByEmail(env, email) {
  return env.DB.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').bind(email).first();
}

async function createUser(env, { email, name, password, role = 'reader' }) {
  const createdAt = now();
  const user = {
    id: id('user'),
    email: email.toLowerCase(),
    name,
    role,
    created_at: createdAt,
    updated_at: createdAt
  };
  const salt = randomHex(16);
  const hash = await passwordHash(password, salt);
  await env.DB.prepare(
    'INSERT INTO users (id, email, name, password_hash, password_salt, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(user.id, user.email, user.name, hash, salt, user.role, user.created_at, user.updated_at).run();
  return user;
}

async function createSession(env, userId) {
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const createdAt = now();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id('session'), userId, tokenHash, expiresAt, createdAt)
    .run();
  return { token, expiresAt };
}

async function authUser(request, env) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT users.* FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ?`
  ).bind(tokenHash, now()).first();
  return row || null;
}

async function requireAuth(request, env) {
  const user = await authUser(request, env);
  if (!user) throw Object.assign(new Error('Authentication required'), { status: 401 });
  return user;
}

async function requireAdmin(request, env) {
  const user = await requireAuth(request, env);
  if (user.role !== 'admin') throw Object.assign(new Error('Admin access required'), { status: 403 });
  return user;
}

async function handleSignup(request, env) {
  const body = await readBody(request);
  const email = requireString(body.email, 'email', 254).toLowerCase();
  const name = requireString(body.name, 'name', 100);
  const password = requireString(body.password, 'password', 256);
  if (password.length < 8) throw new Error('password must be at least 8 characters');
  if (await userByEmail(env, email)) throw Object.assign(new Error('An account already exists for that email'), { status: 409 });
  const user = await createUser(env, { email, name, password });
  const session = await createSession(env, user.id);
  return { user: publicUser(user), ...session };
}

async function handleLogin(request, env) {
  const body = await readBody(request);
  const email = requireString(body.email, 'email', 254).toLowerCase();
  const password = requireString(body.password, 'password', 256);
  let user = await userByEmail(env, email);

  if (!user && email === String(env.ADMIN_EMAIL || '').toLowerCase() && password === env.ADMIN_PASSWORD) {
    user = await createUser(env, { email, name: 'Aaron', password, role: 'admin' });
  }

  if (!user) throw Object.assign(new Error('Email or password did not match'), { status: 401 });
  const hash = await passwordHash(password, user.password_salt);
  if (hash !== user.password_hash) throw Object.assign(new Error('Email or password did not match'), { status: 401 });

  if (email === String(env.ADMIN_EMAIL || '').toLowerCase() && user.role !== 'admin') {
    await env.DB.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').bind('admin', now(), user.id).run();
    user.role = 'admin';
  }

  const session = await createSession(env, user.id);
  return { user: publicUser(user), ...session };
}

async function handleLogout(request, env) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return { ok: true };
}

async function listComments(request, env) {
  const url = new URL(request.url);
  const pageKey = requireString(url.searchParams.get('page'), 'page', 500);
  const rows = await env.DB.prepare(
    `SELECT comments.id, comments.body, comments.created_at, comments.updated_at, users.name AS author_name, users.email AS author_email
     FROM comments JOIN users ON users.id = comments.user_id
     WHERE comments.page_key = ? AND comments.deleted_at IS NULL
     ORDER BY comments.created_at ASC LIMIT 200`
  ).bind(pageKey).all();
  return { comments: rows.results.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    authorName: row.author_name,
    authorEmail: row.author_email
  })) };
}

async function createComment(request, env) {
  const user = await requireAuth(request, env);
  const body = await readBody(request);
  const pageKey = requireString(body.pageKey, 'pageKey', 500);
  const comment = requireString(body.body, 'comment', 2000);
  const createdAt = now();
  const commentId = id('comment');
  await env.DB.prepare('INSERT INTO comments (id, page_key, user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(commentId, pageKey, user.id, comment, createdAt, createdAt)
    .run();
  return { id: commentId, pageKey, body: comment, createdAt, updatedAt: createdAt, authorName: user.name, authorEmail: user.email };
}

async function deleteComment(request, env, commentId) {
  const user = await requireAuth(request, env);
  const comment = await env.DB.prepare('SELECT * FROM comments WHERE id = ? AND deleted_at IS NULL').bind(commentId).first();
  if (!comment) throw Object.assign(new Error('Comment not found'), { status: 404 });
  if (comment.user_id !== user.id && user.role !== 'admin') throw Object.assign(new Error('Not allowed'), { status: 403 });
  await env.DB.prepare('UPDATE comments SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(now(), now(), commentId).run();
  return { ok: true };
}

async function listPosts(request, env, admin = false) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const status = admin ? (url.searchParams.get('status') || null) : 'published';
  const clauses = [];
  const params = [];
  if (type) {
    clauses.push('type = ?');
    params.push(type);
  }
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await env.DB.prepare(`SELECT * FROM posts ${where} ORDER BY COALESCE(published_at, updated_at) DESC LIMIT 200`).bind(...params).all();
  return { posts: rows.results.map((post) => publicPost(post, admin)) };
}

async function getPost(request, env, slug, admin = false) {
  const post = await env.DB.prepare('SELECT * FROM posts WHERE slug = ?').bind(slug).first();
  if (!post || (!admin && post.status !== 'published')) throw Object.assign(new Error('Post not found'), { status: 404 });
  return { post: publicPost(post, true) };
}

function cleanPostInput(body) {
  const title = requireString(body.title, 'title', 200);
  const slug = requireString(body.slug || title, 'slug', 100).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  const type = requireString(body.type || 'blog', 'type', 20);
  if (!['blog', 'essay', 'project'].includes(type)) throw new Error('type must be blog, essay, or project');
  const status = body.status === 'published' ? 'published' : 'draft';
  const bodyMarkdown = String(body.bodyMarkdown || body.content || '').trim();
  return {
    slug,
    type,
    title,
    summary: String(body.summary || '').trim().slice(0, 1000),
    bodyMarkdown,
    bodyHtml: markdownToHtml(bodyMarkdown),
    category: String(body.category || '').trim().slice(0, 100),
    tags: Array.isArray(body.tags) ? body.tags.join(', ') : String(body.tags || '').trim().slice(0, 300),
    heroUrl: String(body.heroUrl || body.hero || '').trim().slice(0, 500),
    status
  };
}

async function upsertPost(request, env, slug = null) {
  const user = await requireAdmin(request, env);
  const data = cleanPostInput(await readBody(request));
  const targetSlug = slug || data.slug;
  const existing = await env.DB.prepare('SELECT * FROM posts WHERE slug = ?').bind(targetSlug).first();
  const updatedAt = now();
  const publishedAt = data.status === 'published' ? (existing?.published_at || updatedAt) : null;

  if (existing) {
    await env.DB.prepare(
      `UPDATE posts SET slug = ?, type = ?, title = ?, summary = ?, body_markdown = ?, body_html = ?, category = ?, tags = ?, hero_url = ?, status = ?, published_at = ?, updated_at = ? WHERE id = ?`
    ).bind(data.slug, data.type, data.title, data.summary, data.bodyMarkdown, data.bodyHtml, data.category, data.tags, data.heroUrl, data.status, publishedAt, updatedAt, existing.id).run();
    return getPost(request, env, data.slug, true);
  }

  const createdAt = updatedAt;
  await env.DB.prepare(
    `INSERT INTO posts (id, slug, type, title, summary, body_markdown, body_html, category, tags, hero_url, status, published_at, created_at, updated_at, author_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id('post'), data.slug, data.type, data.title, data.summary, data.bodyMarkdown, data.bodyHtml, data.category, data.tags, data.heroUrl, data.status, publishedAt, createdAt, updatedAt, user.id).run();
  return getPost(request, env, data.slug, true);
}

async function deletePost(request, env, slug) {
  await requireAdmin(request, env);
  await env.DB.prepare('DELETE FROM posts WHERE slug = ?').bind(slug).run();
  return { ok: true };
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(request, env) });
  if (path === '/health') return { ok: true, service: 'aarwitz-site-api' };
  if (path === '/auth/signup' && request.method === 'POST') return handleSignup(request, env);
  if (path === '/auth/login' && request.method === 'POST') return handleLogin(request, env);
  if (path === '/auth/logout' && request.method === 'POST') return handleLogout(request, env);
  if (path === '/me' && request.method === 'GET') return { user: publicUser(await authUser(request, env)) };
  if (path === '/comments' && request.method === 'GET') return listComments(request, env);
  if (path === '/comments' && request.method === 'POST') return createComment(request, env);
  if (path.startsWith('/comments/') && request.method === 'DELETE') return deleteComment(request, env, path.split('/')[2]);
  if (path === '/posts' && request.method === 'GET') return listPosts(request, env, false);
  if (path === '/admin/posts' && request.method === 'GET') {
    await requireAdmin(request, env);
    return listPosts(request, env, true);
  }
  if (path === '/admin/posts' && request.method === 'POST') return upsertPost(request, env);
  if (path.startsWith('/posts/') && request.method === 'GET') return getPost(request, env, path.split('/')[2], false);
  if (path.startsWith('/admin/posts/') && request.method === 'GET') {
    await requireAdmin(request, env);
    return getPost(request, env, path.split('/')[3], true);
  }
  if (path.startsWith('/admin/posts/') && request.method === 'PUT') return upsertPost(request, env, path.split('/')[3]);
  if (path.startsWith('/admin/posts/') && request.method === 'DELETE') return deletePost(request, env, path.split('/')[3]);

  throw Object.assign(new Error('Not found'), { status: 404 });
}

export default {
  async fetch(request, env) {
    try {
      const data = await route(request, env);
      return data instanceof Response ? data : json(data, 200, request, env);
    } catch (error) {
      return json({ error: error.message || 'Unexpected error' }, error.status || 400, request, env);
    }
  }
};
