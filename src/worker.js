/**
 * DBoard Designer: Cloudflare Worker
 *
 * 1. Serves the app (static assets) with security headers.
 * 2. GET /api/config           public Supabase settings for the browser (URL + anon key, both safe to expose).
 * 3. /api/admin/*              administrator API. Every call is verified on the server:
 *                              the caller's Supabase access token is validated, then profiles.role = 'admin'
 *                              and status = 'active' are checked with the service role key.
 * 4. POST /api/me/delete       lets a signed-in user delete their own account and all of their data.
 *
 * 5. /api/community/*          private and group chats, email invitations and project sharing (see community.js).
 *
 * Secrets (never in browser code):  SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY (panel import), RESEND_API_KEY (invitation emails)
 * Variables:                        SUPABASE_URL, SUPABASE_ANON_KEY, REQUIRE_LOGIN ("true" | "false"),
 *                                   optional: ANTHROPIC_MODEL, IMPORT_DAILY_LIMIT, MAIL_FROM, APP_URL
 */

import { buildContent, callModel, LIMITS } from './importer.js';
import { community } from './community.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), { status, headers: { ...JSON_HEADERS, ...extra } });
const fail = (status, error) => json({ error }, status);

function configured(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
}
function supaOrigin(env) {
  try { return new URL(env.SUPABASE_URL).origin; } catch { return ''; }
}

/* ---------- Supabase helpers (service role: server only) ---------- */
function sr(env, path, init = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

/** Validate the caller's access token with Supabase Auth. Returns the auth user or null. */
async function authUser(request, env) {
  const h = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+([\w-]+\.[\w-]+\.[\w-]+)$/.exec(h);
  if (!m) return null;
  let r;
  try {
    r = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${m[1]}` },
    });
  } catch { return null; }
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && u.id && UUID.test(u.id) ? u : null;
}

async function profileOf(env, id) {
  const r = await sr(env, `/rest/v1/profiles?id=eq.${id}&select=id,email,role,status,first_name,last_name`);
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  return rows[0] || null;
}

/** Returns { user, profile } for a verified, active administrator, or a Response to send back. */
async function requireAdmin(request, env) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return fail(503, 'Administrator API is not configured (missing service role secret).');
  const user = await authUser(request, env);
  if (!user) return fail(401, 'Sign in again.');
  if (!user.email_confirmed_at) return fail(403, 'Verify your email first.');
  const profile = await profileOf(env, user.id);
  if (!profile || profile.role !== 'admin' || profile.status !== 'active') return fail(403, 'Administrator access required.');
  return { user, profile };
}

async function audit(env, adminId, targetId, action, detail = {}) {
  try {
    await sr(env, '/rest/v1/admin_actions', { method: 'POST', body: JSON.stringify({ admin_id: adminId, target_id: targetId, action, detail }) });
  } catch { /* never block the action on logging */ }
}

const int = (v, d, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const clean = (v, max = 100) => String(v == null ? '' : v).slice(0, max);

/* ---------- API routes ---------- */
async function api(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (path === '/api/health') return json({ ok: true, configured: configured(env), admin: Boolean(env.SUPABASE_SERVICE_ROLE_KEY), anthropic: Boolean(env.ANTHROPIC_API_KEY), mail: Boolean(env.RESEND_API_KEY) });

  if (path === '/api/config' && method === 'GET') {
    if (!configured(env)) return json({ configured: false, requireLogin: false });
    return json({
      configured: true,
      supabaseUrl: env.SUPABASE_URL,
      anonKey: env.SUPABASE_ANON_KEY,
      requireLogin: String(env.REQUIRE_LOGIN || 'true').toLowerCase() !== 'false',
      importEnabled: Boolean(env.ANTHROPIC_API_KEY && env.SUPABASE_SERVICE_ROLE_KEY),
      communityEnabled: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      mailEnabled: Boolean(env.RESEND_API_KEY),
    });
  }

  if (!configured(env)) return fail(503, 'Supabase is not configured.');

  /* ----- self-service account deletion ----- */
  if (path === '/api/me/delete' && method === 'POST') {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) return fail(503, 'Account deletion is not configured.');
    const user = await authUser(request, env);
    if (!user) return fail(401, 'Sign in again.');
    const body = await request.json().catch(() => ({}));
    if (String(body.email || '').trim().toLowerCase() !== String(user.email || '').toLowerCase()) return fail(400, 'Type your email address to confirm.');
    const profile = await profileOf(env, user.id);
    if (profile && profile.role === 'admin') {
      const r = await sr(env, '/rest/v1/profiles?role=eq.admin&status=eq.active&select=id');
      const admins = r.ok ? await r.json() : [];
      if (admins.length <= 1) return fail(409, 'You are the only administrator. Promote another administrator first.');
    }
    const del = await sr(env, `/auth/v1/admin/users/${user.id}`, { method: 'DELETE' });
    if (!del.ok) return fail(502, 'The account could not be deleted. Try again later.');
    return json({ ok: true });
  }

  /* ----- panel import: read a photo or PDF with the vision model ----- */
  if (path === '/api/import/analyze' && method === 'POST') {
    if (!env.ANTHROPIC_API_KEY) return fail(503, 'Panel import is not configured. Add the ANTHROPIC_API_KEY secret to the Worker.');
    if (!env.SUPABASE_SERVICE_ROLE_KEY) return fail(503, 'Panel import needs the SUPABASE_SERVICE_ROLE_KEY secret for usage limits.');
    const user = await authUser(request, env);
    if (!user) return fail(401, 'Sign in again.');
    if (!user.email_confirmed_at) return fail(403, 'Verify your email first.');
    const profile = await profileOf(env, user.id);
    if (!profile || profile.status !== 'active') return fail(403, 'This account cannot use import.');
    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > LIMITS.body) return fail(413, 'The upload is too large. Use smaller photos or a smaller PDF.');
    const limit = Math.max(1, parseInt(env.IMPORT_DAILY_LIMIT || '20', 10) || 20);
    const since = new Date(Date.now() - 86400000).toISOString();
    const used = await sr(env, `/rest/v1/usage_events?user_id=eq.${user.id}&event=eq.import_analyzed&created_at=gte.${encodeURIComponent(since)}&select=id&limit=${limit}`);
    if (used.ok && (await used.json().catch(() => [])).length >= limit) return fail(429, `Daily import limit reached (${limit}). Try again tomorrow.`);
    const body = await request.json().catch(() => null);
    const built = buildContent(body);
    if (built.error) return fail(400, built.error);
    const out = await callModel(env, built.content);
    if (out.error) return fail(out.status || 502, out.error);
    await sr(env, '/rest/v1/usage_events', { method: 'POST', body: JSON.stringify({ user_id: user.id, event: 'import_analyzed', meta: { kind: built.kind, devices: out.panel.devices.length } }) });
    return json({ ok: true, kind: built.kind, panel: out.panel, truncated: !!out.truncated });
  }

  /* ----- community: private and group chats, invitations, project sharing ----- */
  if (path.startsWith('/api/community/')) {
    try { return await community(request, env, url, { sr, authUser, profileOf, json, fail, UUID }); }
    catch (e) { return fail(502, 'Member lookup failed. If the site was just updated, the owner needs to run the latest database migration.'); }
  }

  /* ----- administrator API ----- */
  if (path.startsWith('/api/admin/')) {
    const gate = await requireAdmin(request, env);
    if (gate instanceof Response) return gate;
    const { user: admin } = gate;

    if (path === '/api/admin/me' && method === 'GET') return json({ ok: true, email: admin.email });

    if (path === '/api/admin/stats' && method === 'GET') {
      const r = await sr(env, '/rest/v1/rpc/admin_stats', { method: 'POST', body: '{}' });
      if (!r.ok) return fail(502, 'Could not load statistics.');
      return json(await r.json());
    }

    if (path === '/api/admin/users' && method === 'GET') {
      const q = url.searchParams;
      const status = ['active', 'suspended'].includes(q.get('status')) ? q.get('status') : null;
      const verified = ['yes', 'no'].includes(q.get('verified')) ? q.get('verified') : null;
      const size = int(q.get('size'), 25, 1, 100), page = int(q.get('page'), 1, 1, 100000);
      const r = await sr(env, '/rest/v1/rpc/admin_list_users', {
        method: 'POST',
        body: JSON.stringify({ p_search: clean(q.get('search'), 80) || null, p_status: status, p_verified: verified, p_limit: size, p_offset: (page - 1) * size }),
      });
      if (!r.ok) return fail(502, 'Could not load users.');
      const rows = await r.json();
      return json({ users: rows, total: rows.length ? Number(rows[0].total_count) : 0, page, size });
    }

    let m = /^\/api\/admin\/users\/([^/]+)\/status$/.exec(path);
    if (m && method === 'POST') {
      const id = m[1];
      if (!UUID.test(id)) return fail(400, 'Invalid user id.');
      const body = await request.json().catch(() => ({}));
      if (!['active', 'suspended'].includes(body.status)) return fail(400, 'Status must be active or suspended.');
      if (id === admin.id) return fail(400, 'You cannot change your own account status.');
      const target = await profileOf(env, id);
      if (!target) return fail(404, 'User not found.');
      if (target.role === 'admin' && body.status === 'suspended') return fail(409, 'Administrators cannot be suspended here. Demote the account first.');
      const up = await sr(env, `/rest/v1/profiles?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: body.status }) });
      if (!up.ok) return fail(502, 'Could not update the account.');
      // Also block (or unblock) sign-in at the Auth level so existing sessions stop refreshing.
      const ban = await sr(env, `/auth/v1/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ ban_duration: body.status === 'suspended' ? '876000h' : 'none' }) });
      await audit(env, admin.id, id, body.status === 'suspended' ? 'suspend' : 'reactivate', { auth_ban_ok: ban.ok });
      return json({ ok: true, status: body.status, authUpdated: ban.ok });
    }

    if (path === '/api/admin/feedback' && method === 'GET') {
      const q = url.searchParams, size = int(q.get('size'), 25, 1, 100), page = int(q.get('page'), 1, 1, 100000);
      const status = ['new', 'reviewed'].includes(q.get('status')) ? `&status=eq.${q.get('status')}` : '';
      const r = await sr(env, `/rest/v1/feedback?select=id,user_id,message,rating,page,status,created_at&order=created_at.desc&limit=${size}&offset=${(page - 1) * size}${status}`, { headers: { Prefer: 'count=exact' } });
      if (!r.ok) return fail(502, 'Could not load feedback.');
      const rows = await r.json();
      const total = Number((r.headers.get('content-range') || '').split('/')[1]) || rows.length;
      const ids = [...new Set(rows.map(x => x.user_id).filter(x => x && UUID.test(x)))];
      let emails = {};
      if (ids.length) {
        const pr = await sr(env, `/rest/v1/profiles?id=in.(${ids.join(',')})&select=id,email,first_name,last_name`);
        if (pr.ok) (await pr.json()).forEach(p => { emails[p.id] = { email: p.email, name: `${p.first_name} ${p.last_name}`.trim() }; });
      }
      return json({ feedback: rows.map(x => ({ ...x, from: emails[x.user_id] || null })), total, page, size });
    }

    m = /^\/api\/admin\/feedback\/([^/]+)\/status$/.exec(path);
    if (m && method === 'POST') {
      if (!UUID.test(m[1])) return fail(400, 'Invalid id.');
      const body = await request.json().catch(() => ({}));
      if (!['new', 'reviewed'].includes(body.status)) return fail(400, 'Invalid status.');
      const up = await sr(env, `/rest/v1/feedback?id=eq.${m[1]}`, { method: 'PATCH', body: JSON.stringify({ status: body.status }) });
      if (!up.ok) return fail(502, 'Could not update feedback.');
      await audit(env, admin.id, null, 'feedback_' + body.status, { id: m[1] });
      return json({ ok: true });
    }

    return fail(404, 'Unknown administrator endpoint.');
  }

  return fail(404, 'Not found.');
}

/* ---------- security headers ---------- */
function secure(response, env) {
  const h = new Headers(response.headers);
  const supa = supaOrigin(env);
  const connect = ["'self'", supa, supa.replace(/^https/, 'wss')].filter(Boolean).join(' ');
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('X-Frame-Options', 'DENY');
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if ((h.get('Content-Type') || '').includes('text/html')) {
    h.set('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      `img-src 'self' data: blob: ${supa}`.trim(),
      "frame-src blob:",
      "object-src blob:",
      `connect-src ${connect}`,
      "worker-src 'self'",
      "manifest-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '));
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return secure(await api(request, env, url), env); }
      catch (e) { return secure(fail(500, 'Unexpected server error.'), env); }
    }
    const res = await env.ASSETS.fetch(request);
    // Never cache the service worker or the HTML shell at the edge so updates arrive immediately.
    const out = secure(res, env);
    if (url.pathname === '/sw.js' || url.pathname === '/' || url.pathname.endsWith('.html')) out.headers.set('Cache-Control', 'no-cache');
    return out;
  },
};
