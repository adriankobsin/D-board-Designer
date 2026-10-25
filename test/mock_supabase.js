/* TEST-ONLY stand-in for Supabase, used to exercise the Worker and browser flows without real credentials.
   It is never part of the deployed app. It imitates the small slice of GoTrue + PostgREST the app uses.
   It does NOT prove Row Level Security (that is tested against real Postgres in pgtest/) or real email delivery. */
const http = require('http'), crypto = require('crypto');
const SERVICE = 'test-service-role-key', ANON = 'test-anon-key';
const db = {users: [], profiles: [], projects: [], feedback: [], usage_events: [], admin_actions: [], outbox: [], settings: {plans_enforced: false}};
const limitsOn = () => db.settings.plans_enforced === true || (!!db.settings.plans_start_at && new Date(db.settings.plans_start_at) <= new Date());
const fullAccess = uid => { if (!limitsOn()) return true; const p = db.profiles.find(x => x.id === uid); return !!p && (p.role === 'admin' || ((p.plan === 'free' || p.plan === 'paid') && (!p.plan_until || new Date(p.plan_until) > new Date()))); };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const mkTok = (u, kind = 'a') => `${b64({alg: 'none'})}.${b64({sub: u.id, kind, n: crypto.randomUUID()})}.sig`;
const tokens = new Map();   // token -> {uid, kind}
const userOut = u => ({id: u.id, email: u.email, email_confirmed_at: u.confirmed ? u.confirmed_at : null, user_metadata: u.meta, identities: [{}], created_at: u.created_at, banned_until: u.banned ? 'infinity' : null});
const session = u => { const a = mkTok(u), r = mkTok(u, 'r'); tokens.set(a, {uid: u.id, kind: 'a'}); tokens.set(r, {uid: u.id, kind: 'r'}); return {access_token: a, refresh_token: r, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: userOut(u)}; };
const send = (res, code, obj, h = {}) => { res.writeHead(code, Object.assign({'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*'}, h)); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
const authErr = (res, code, ec, msg) => send(res, code, {code, error_code: ec, msg, message: msg});
const pw = {};   // email -> password
function whoami(req){
  const h = req.headers.authorization || '', t = h.replace(/^Bearer\s+/, '');
  if (t === SERVICE) return {service: true};
  const rec = tokens.get(t); if (!rec) return null;
  const u = db.users.find(x => x.id === rec.uid); return u ? {user: u, kind: rec.kind} : null;
}
function applyFilters(rows, q){
  for (const [k, v] of q){
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
    let m;
    if ((m = /^eq\.(.*)$/.exec(v))) rows = rows.filter(r => String(r[k]) === m[1]);
    else if ((m = /^neq\.(.*)$/.exec(v))) rows = rows.filter(r => String(r[k]) !== m[1]);
    else if ((m = /^gte\.(.*)$/.exec(v))) rows = rows.filter(r => String(r[k]) >= m[1]);
    else if ((m = /^in\.\((.*)\)$/.exec(v))) { const s = m[1].split(','); rows = rows.filter(r => s.includes(String(r[k]))); }
  }
  const o = q.get('order'); if (o){ const [c, d] = o.split('.'); rows = rows.slice().sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (d === 'desc' ? -1 : 1)); }
  const off = parseInt(q.get('offset') || '0', 10), lim = q.get('limit') ? parseInt(q.get('limit'), 10) : rows.length; return rows.slice(off, off + lim);
}
const pick = (r, sel) => { if (!sel || sel === '*') return r; const o = {}; sel.split(',').forEach(c => { if (c in r) o[c] = r[c]; }); return o; };
let tick = 0; const now = () => new Date(Date.now() + (tick++)).toISOString().replace('Z', '000Z');

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204);
  const url = new URL(req.url, 'http://x'), path = url.pathname, q = url.searchParams; let raw = '';
  req.on('data', d => raw += d); req.on('end', () => {
    let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (e) {}
    const m = req.method;
    /* ---- test hooks ---- */
    if (path === '/__test/confirm'){ const u = db.users.find(x => x.email === body.email); if (u){ u.confirmed = true; u.confirmed_at = now(); } return send(res, 200, {ok: !!u}); }
    if (path === '/__test/reset'){ Object.keys(db).forEach(k => db[k] = []); tokens.clear(); Object.keys(pw).forEach(k => delete pw[k]); return send(res, 200, {ok: true}); }
    if (path === '/__test/state') return send(res, 200, {users: db.users.length, outbox: db.outbox, usage: db.usage_events, projects: db.projects.length, admin_actions: db.admin_actions});
    if (path === '/__test/make_admin'){ const p = db.profiles.find(x => x.email === body.email); if (p) p.role = 'admin'; return send(res, 200, {ok: !!p}); }
    /* ---- auth ---- */
    if (path === '/auth/v1/signup' && m === 'POST'){
      const email = String(body.email || '').toLowerCase();
      if (db.users.some(u => u.email === email)) { return send(res, 200, Object.assign(userOut({id: crypto.randomUUID(), email, meta: {}, created_at: now()}), {identities: []})); }
      if (String(body.password || '').length < 6) return authErr(res, 422, 'weak_password', 'Password should be at least 6 characters.');
      const u = {id: crypto.randomUUID(), email, meta: (body.data || {}), confirmed: false, created_at: now()}; db.users.push(u); pw[email] = body.password;
      const md = body.data || {};
      db.profiles.push({id: u.id, email, first_name: md.first_name || '', last_name: md.last_name || '', company: md.company || null, country: md.country || null, occupation: md.occupation || null, role: 'user', status: 'active', plan: 'demo', plan_until: null, plan_note: null, created_at: u.created_at, last_seen_at: null, accepted_terms_at: md.accepted_terms === 'true' ? now() : null});
      db.outbox.push({to: email, kind: 'confirm'});
      return send(res, 200, userOut(u));
    }
    if (path === '/auth/v1/token' && m === 'POST'){
      if (q.get('grant_type') === 'password'){
        const u = db.users.find(x => x.email === String(body.email).toLowerCase());
        if (!u || pw[u.email] !== body.password) return authErr(res, 400, 'invalid_credentials', 'Invalid login credentials');
        if (!u.confirmed) return authErr(res, 400, 'email_not_confirmed', 'Email not confirmed');
        if (u.banned) return authErr(res, 400, 'user_banned', 'User is banned');
        return send(res, 200, session(u));
      }
      if (q.get('grant_type') === 'refresh_token'){ const r = tokens.get(body.refresh_token); const u = r && db.users.find(x => x.id === r.uid); if (!u || u.banned) return authErr(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token'); return send(res, 200, session(u)); }
    }
    if (path === '/auth/v1/user' && m === 'GET'){ const w = whoami(req); if (!w || !w.user) return authErr(res, 401, 'bad_jwt', 'invalid JWT'); return send(res, 200, userOut(w.user)); }
    if (path === '/auth/v1/user' && m === 'PUT'){ const w = whoami(req); if (!w || !w.user) return authErr(res, 401, 'bad_jwt', 'invalid JWT'); if (body.password){ if (body.password === pw[w.user.email]) return authErr(res, 422, 'same_password', 'New password should be different from the old password.'); pw[w.user.email] = body.password; } return send(res, 200, userOut(w.user)); }
    if (path === '/auth/v1/logout') return send(res, 204);
    if (path === '/auth/v1/recover'){ db.outbox.push({to: body.email, kind: 'recover'}); return send(res, 200, {}); }
    if (path === '/auth/v1/resend'){ db.outbox.push({to: body.email, kind: 'resend'}); return send(res, 200, {}); }
    let mm = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(path);
    if (mm){ const w = whoami(req); if (!w || !w.service) return authErr(res, 401, 'not_admin', 'not admin'); const u = db.users.find(x => x.id === mm[1]); if (!u) return authErr(res, 404, 'user_not_found', 'not found');
      if (m === 'DELETE'){ db.users = db.users.filter(x => x !== u); db.profiles = db.profiles.filter(x => x.id !== u.id); db.projects = db.projects.filter(x => x.owner_id !== u.id); return send(res, 200, {}); }
      if (m === 'PUT'){ u.banned = body.ban_duration && body.ban_duration !== 'none'; return send(res, 200, userOut(u)); } }
    /* ---- rest ---- */
    if (path.startsWith('/rest/v1/')){
      const w = whoami(req); if (!w) return send(res, 401, {message: 'JWT invalid'});
      const t = path.slice('/rest/v1/'.length), uid = w.user && w.user.id, single = /pgrst\.object/.test(req.headers.accept || ''), wantRep = /return=representation/.test(req.headers.prefer || '');
      const out = rows => single ? (rows.length === 1 ? send(res, 200, rows[0]) : rows.length === 0 ? send(res, 406, {code: 'PGRST116', message: 'no rows'}) : send(res, 406, {code: 'PGRST116', message: 'many rows'})) : send(res, 200, rows);
      const mine = (tbl, key) => db[tbl].filter(r => w.service || r[key] === uid);
      if (t === 'rpc/touch_last_seen'){ const p = db.profiles.find(x => x.id === uid); if (p) p.last_seen_at = now(); return send(res, 200, null); }
      if (t === 'rpc/admin_stats'){ if (!w.service) return send(res, 403, {message: 'permission denied'});
        return send(res, 200, {users_total: db.profiles.length, users_verified: db.users.filter(u => u.confirmed).length, users_suspended: db.profiles.filter(p => p.status === 'suspended').length, users_new_7d: db.profiles.length, users_new_30d: db.profiles.length, users_active_7d: new Set(db.usage_events.map(e => e.user_id)).size, projects_total: db.projects.length, projects_new_7d: db.projects.length, feedback_new: db.feedback.filter(f => f.status === 'new').length, signups_by_day: [{day: '2026-10-14', count: db.profiles.length}], events_30d: db.usage_events.reduce((a, e) => (a[e.event] = (a[e.event] || 0) + 1, a), {}), countries: [{country: 'Romania', count: 1}]}); }
      if (t === 'rpc/admin_list_users'){ if (!w.service) return send(res, 403, {message: 'permission denied'});
        let rows = db.profiles.map(p => { const u = db.users.find(x => x.id === p.id); return Object.assign({}, p, {email_confirmed_at: u && u.confirmed ? u.confirmed_at : null, project_count: db.projects.filter(x => x.owner_id === p.id).length}); });
        const s = (body.p_search || '').toLowerCase(); if (s) rows = rows.filter(r => [r.email, r.first_name, r.last_name, r.company].join(' ').toLowerCase().includes(s));
        if (body.p_status) rows = rows.filter(r => r.status === body.p_status); if (body.p_plan) rows = rows.filter(r => r.plan === body.p_plan); if (body.p_verified === 'yes') rows = rows.filter(r => r.email_confirmed_at); if (body.p_verified === 'no') rows = rows.filter(r => !r.email_confirmed_at);
        const total = rows.length; rows = rows.slice(body.p_offset || 0, (body.p_offset || 0) + (body.p_limit || 25)).map(r => Object.assign(r, {total_count: total})); return send(res, 200, rows); }
      if (t === 'rpc/has_full_access'){ return send(res, 200, fullAccess(body.p_uid || uid)); }
      if (t.startsWith('app_settings')){
        if (m === 'GET') return send(res, 200, Object.keys(db.settings).map(k => ({key: k, value: db.settings[k]})));
        if (m === 'POST' && w.service){ [].concat(body).forEach(r => { db.settings[r.key] = r.value; }); return send(res, 201); }
        return send(res, 403, {message: 'permission denied'});
      }
      if (t === 'profiles'){
        if (m === 'GET') return out(applyFilters(mine('profiles', 'id'), q).map(r => pick(r, q.get('select'))));
        if (m === 'PATCH'){ const rows = applyFilters(mine('profiles', 'id'), q); rows.forEach(r => { const allowed = w.service ? Object.keys(body) : ['first_name', 'last_name', 'company', 'country', 'occupation']; allowed.forEach(k => { if (k in body) r[k] = body[k]; }); }); return wantRep ? send(res, 200, rows) : send(res, 204); }
      }
      if (t === 'projects'){
        if (w.user && w.user.banned) return send(res, 403, {message: 'suspended'});
        if (m === 'GET') return out(applyFilters(mine('projects', 'owner_id'), q).map(r => pick(r, q.get('select'))));
        if (m === 'POST'){ if (!fullAccess(uid) && db.projects.filter(x => x.owner_id === uid).length >= 1) return send(res, 400, {code: 'P0001', message: 'PLAN_LIMIT_PROJECTS'}); const r = Object.assign({id: crypto.randomUUID(), owner_id: uid, meta: {}, created_at: now(), updated_at: now(), last_opened_at: null}, body, {owner_id: uid}); db.projects.push(r); return wantRep ? out([pick(r, q.get('select'))]) : send(res, 201); }
        if (m === 'PATCH'){ const rows = applyFilters(mine('projects', 'owner_id'), q); rows.forEach(r => { const touched = 'data' in body || 'name' in body; Object.assign(r, body); if (touched) r.updated_at = now(); }); return wantRep ? send(res, 200, rows.map(r => pick(r, q.get('select')))) : send(res, 204); }
        if (m === 'DELETE'){ const rows = applyFilters(mine('projects', 'owner_id'), q); db.projects = db.projects.filter(r => !rows.includes(r)); return send(res, 204); }
      }
      if (t === 'feedback'){
        if (m === 'POST'){ db.feedback.push(Object.assign({id: crypto.randomUUID(), user_id: uid, status: 'new', created_at: now()}, body)); return send(res, 201); }
        if (m === 'GET'){ const rows = applyFilters(w.service ? db.feedback : db.feedback.filter(f => f.user_id === uid), q); return send(res, 200, rows, {'Content-Range': `0-${rows.length}/${db.feedback.length}`}); }
        if (m === 'PATCH'){ applyFilters(db.feedback, q).forEach(r => Object.assign(r, body)); return send(res, 204); }
      }
      if (t === 'usage_events' && m === 'GET') return send(res, 200, applyFilters(db.usage_events, q).map(r => pick(r, q.get('select'))));
      if (t === 'usage_events' && m === 'POST'){ db.usage_events.push(Object.assign({user_id: uid, created_at: now()}, body)); return send(res, 201); }
      if (t === 'admin_actions' && m === 'POST'){ db.admin_actions.push(body); return send(res, 201); }
    }
    send(res, 404, {message: 'mock: not found ' + m + ' ' + path});
  });
}).listen(+process.env.PORT || 54321, () => console.log('mock supabase up'));
