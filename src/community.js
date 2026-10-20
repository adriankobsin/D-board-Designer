/**
 * Community API: private chats, group chats with email invitations, and project sharing.
 * Everything here needs to look up other members by email address, which the browser is not allowed to do,
 * so it runs in the Worker with the service role key. Reading and posting messages happens directly from the
 * browser under Row Level Security (see supabase/migrations/0004_community.sql).
 *
 * Optional secrets/variables for invitation emails:
 *   RESEND_API_KEY   API key from resend.com (secret)
 *   MAIL_FROM        e.g. "DBoard Designer <noreply@your-domain.com>" (the domain must be verified in Resend)
 *   APP_URL          public address used in the email links (defaults to the address the request came to)
 * Without RESEND_API_KEY everything still works; people are notified on their dashboard only.
 *
 * People can be chosen by email address or, from the member directory, by member id (user_id / user_ids).
 * Only members who show in the directory can be reached by id; anyone active can be reached by exact email.
 */

const EMAIL = /^[^\s@,()"'<>;]{1,64}@[^\s@,()"'<>;]+\.[^\s@,()"'<>;]{2,}$/;
const DAILY_CAP = 60;   // invitations plus shares one person can send per 24 hours

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cl = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

export async function sendMail(env, to, subject, lines, link, cta) {
  if (!env.RESEND_API_KEY) return false;
  const from = env.MAIL_FROM || 'DBoard Designer <onboarding@resend.dev>';
  const text = lines.join('\n\n') + `\n\n${cta}: ${link}\n\nYou received this because you have a DBoard Designer account.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#15202A">`
    + `<h2 style="margin:0 0 12px;font-size:20px">${esc(subject)}</h2>`
    + lines.map(l => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px">${esc(l)}</p>`).join('')
    + `<p style="margin:20px 0"><a href="${esc(link)}" style="background:#0B6B8E;color:#fff;padding:10px 18px;border-radius:5px;text-decoration:none;font-weight:600">${esc(cta)}</a></p>`
    + `<p style="font-size:12px;color:#5b6772">You received this because you have a DBoard Designer account.</p></div>`;
  try {
    const r = await fetch(env.RESEND_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    return r.ok;
  } catch { return false; }
}

export async function community(request, env, url, h) {
  const { sr, authUser, profileOf, json, fail, UUID } = h;
  const path = url.pathname, method = request.method;
  if (method !== 'POST') return fail(405, 'Use POST.');
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return fail(503, 'Community features need the SUPABASE_SERVICE_ROLE_KEY secret on the Worker.');
  const user = await authUser(request, env);
  if (!user) return fail(401, 'Sign in again.');
  if (!user.email_confirmed_at) return fail(403, 'Verify your email first.');
  const me = await profileOf(env, user.id);
  if (!me || me.status !== 'active') return fail(403, 'This account cannot use community features.');
  const body = await request.json().catch(() => ({}));
  const myName = (`${me.first_name || ''} ${me.last_name || ''}`.trim()) || String(me.email || '').split('@')[0] || 'A member';
  const appUrl = String(env.APP_URL || url.origin).replace(/\/$/, '') + '/';

  /* ----- helpers ----- */
  const parseEmails = v => {
    const list = Array.isArray(v) ? v : String(v || '').split(/[\s,;]+/);
    const seen = new Set(), out = [], bad = [];
    for (const raw of list) {
      const e = String(raw || '').trim().toLowerCase();
      if (!e || seen.has(e)) continue;
      seen.add(e);
      if (EMAIL.test(e) && e.length <= 254) out.push(e); else bad.push(e.slice(0, 80));
    }
    return { emails: out.slice(0, 20), bad, tooMany: out.length > 20 };
  };
  const findMembers = async emails => {
    if (!emails.length) return {};
    const r = await sr(env, `/rest/v1/profiles?status=eq.active&email=in.(${emails.map(e => `"${e}"`).join(',')})&select=id,email,first_name,last_name`);
    if (!r.ok) throw new Error('lookup');
    const map = {};
    (await r.json()).forEach(p => { map[String(p.email).toLowerCase()] = p; });
    return map;
  };
  const findByIds = async ids => {
    const list = [...new Set((Array.isArray(ids) ? ids : [ids]).map(x => String(x || '').toLowerCase()).filter(x => UUID.test(x)))].slice(0, 20);
    if (!list.length) return { list, map: {} };
    const r = await sr(env, '/rest/v1/rpc/directory_members', { method: 'POST', body: JSON.stringify({ ids: list }) });
    if (!r.ok) throw new Error('lookup');
    const map = {};
    (await r.json()).forEach(p => { map[p.id] = p; });
    return { list, map };
  };
  /* Everyone named in a request, by email and by member id: [{key, p}] plus what was skipped and why. */
  const resolve = async (emailsVal, idsVal) => {
    const pe = parseEmails(emailsVal), skipped = [];
    pe.bad.forEach(e => skipped.push({ email: e, reason: 'invalid' }));
    if (pe.tooMany) skipped.push({ email: '', reason: 'limit' });
    const [byEmail, byId] = await Promise.all([findMembers(pe.emails), findByIds(idsVal || [])]);
    const out = [], seen = new Set();
    const add = (key, p, id) => {
      if (!p) { skipped.push(id ? { email: '', id: key, reason: 'not_found' } : { email: key, reason: 'not_registered' }); return; }
      if (seen.has(p.id)) return;
      seen.add(p.id); out.push({ key, p });
    };
    pe.emails.forEach(e => add(e, byEmail[e], false));
    byId.list.forEach(id => add(id, byId.map[id], true));
    return { list: out, skipped };
  };
  /* Everyone with a block (either way) between them and me. Blocked people cannot be messaged, invited or shared with. */
  let blockCache = null;
  const blocks = async () => {
    if (blockCache) return blockCache;
    const r = await sr(env, `/rest/v1/user_blocks?or=(blocker_id.eq.${user.id},blocked_id.eq.${user.id})&select=blocker_id,blocked_id`);
    const rows = r.ok ? await r.json() : [];
    blockCache = { mine: new Set(rows.filter(x => x.blocker_id === user.id).map(x => x.blocked_id)), theirs: new Set(rows.filter(x => x.blocked_id === user.id).map(x => x.blocker_id)) };
    blockCache.any = id => blockCache.mine.has(id) || blockCache.theirs.has(id);
    return blockCache;
  };
  const nameOf = p => (`${p.first_name || ''} ${p.last_name || ''}`.trim()) || String(p.email || '').split('@')[0];
  const overCap = async () => {
    const since = encodeURIComponent(new Date(Date.now() - 86400000).toISOString());
    const [a, b] = await Promise.all([
      sr(env, `/rest/v1/project_shares?owner_id=eq.${user.id}&chat_id=is.null&created_at=gte.${since}&select=id&limit=${DAILY_CAP}`),
      sr(env, `/rest/v1/chat_members?invited_by=eq.${user.id}&invited_at=gte.${since}&select=chat_id&limit=${DAILY_CAP}`),
    ]);
    const n = (a.ok ? (await a.json()).length : 0) + (b.ok ? (await b.json()).length : 0);
    return n >= DAILY_CAP;
  };

  /* ----- start or open a private chat ----- */
  if (path === '/api/community/direct') {
    let found;
    if (body.user_id != null) {
      if (String(body.user_id).toLowerCase() === user.id) return fail(400, 'You cannot start a chat with yourself.');
      found = (await findByIds([body.user_id])).map[String(body.user_id).toLowerCase()];
      if (!found) return fail(404, 'That member is not available.');
    } else {
      const { emails } = parseEmails(body.email);
      if (emails.length !== 1) return fail(400, 'Enter one valid email address.');
      if (emails[0] === String(user.email || '').toLowerCase()) return fail(400, 'That is your own address.');
      found = (await findMembers(emails))[emails[0]];
      if (!found) return fail(404, 'No registered member uses that email address.');
    }
    const bl = await blocks();
    if (bl.mine.has(found.id)) return fail(403, 'You have blocked this member. Unblock them in Account settings first.');
    if (bl.theirs.has(found.id)) return fail(404, 'That member is not available.');
    const key = [user.id, found.id].sort().join(':');
    const find = async () => { const r = await sr(env, `/rest/v1/chats?direct_key=eq.${key}&select=id`); const rows = r.ok ? await r.json() : []; return rows[0] ? rows[0].id : null; };
    let id = await find();
    if (!id) {
      const c = await sr(env, '/rest/v1/chats', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ kind: 'direct', direct_key: key, created_by: user.id }) });
      if (c.ok) {
        id = (await c.json())[0].id;
        const now = new Date().toISOString();
        const m = await sr(env, '/rest/v1/chat_members', { method: 'POST', body: JSON.stringify([
          { chat_id: id, user_id: user.id, role: 'owner', status: 'joined', joined_at: now },
          { chat_id: id, user_id: found.id, role: 'member', status: 'joined', joined_at: now }]) });
        if (!m.ok) { await sr(env, `/rest/v1/chats?id=eq.${id}`, { method: 'DELETE' }); return fail(502, 'Could not start the chat.'); }
      } else { id = await find(); if (!id) return fail(502, 'Could not start the chat.'); }
    }
    return json({ ok: true, chat_id: id, with: nameOf(found) });
  }

  /* ----- invite people into a group (used by create and invite) ----- */
  const inviteInto = async (chat, v, ids) => {
    const res = { invited: [], skipped: [], emailed: 0, mail: Boolean(env.RESEND_API_KEY) };
    if (!v && !(Array.isArray(ids) && ids.length)) return res;
    if (await overCap()) { res.skipped.push({ email: '', reason: 'daily_limit' }); return res; }
    const t = await resolve(v, ids);
    res.skipped.push(...t.skipped);
    const ex = await sr(env, `/rest/v1/chat_members?chat_id=eq.${chat.id}&select=user_id`);
    const existing = new Set((ex.ok ? await ex.json() : []).map(x => x.user_id));
    const rows = [], mails = [];
    for (const { key, p } of t.list) {
      const e = UUID.test(key) ? '' : key;
      if (p.id === user.id || existing.has(p.id)) { res.skipped.push({ email: e, id: p.id, reason: 'already' }); continue; }
      if ((await blocks()).any(p.id)) { res.skipped.push({ email: e, id: p.id, reason: 'not_found' }); continue; }
      rows.push({ chat_id: chat.id, user_id: p.id, role: 'member', status: 'invited', invited_by: user.id });
      mails.push(p);
    }
    if (rows.length) {
      const ins = await sr(env, '/rest/v1/chat_members', { method: 'POST', body: JSON.stringify(rows) });
      if (!ins.ok) { res.skipped.push({ email: '', reason: 'failed' }); return res; }
      for (const p of mails) {
        res.invited.push({ id: p.id, name: nameOf(p) });
        const ok = await sendMail(env, p.email, `${myName} invited you to a group chat`,
          [`${myName} invited you to join the group "${chat.title}" on DBoard Designer.`, 'Sign in and open Community on your dashboard to accept or decline the invitation.'],
          appUrl, 'Open DBoard Designer');
        if (ok) res.emailed++;
      }
    }
    return res;
  };

  if (path === '/api/community/group') {
    const title = cl(body.title, 100);
    if (!title) return fail(400, 'Give the group a name.');
    const c = await sr(env, '/rest/v1/chats', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ kind: 'group', title, created_by: user.id }) });
    if (!c.ok) return fail(502, 'Could not create the group.');
    const chat = (await c.json())[0];
    const m = await sr(env, '/rest/v1/chat_members', { method: 'POST', body: JSON.stringify({ chat_id: chat.id, user_id: user.id, role: 'owner', status: 'joined', joined_at: new Date().toISOString() }) });
    if (!m.ok) { await sr(env, `/rest/v1/chats?id=eq.${chat.id}`, { method: 'DELETE' }); return fail(502, 'Could not create the group.'); }
    const res = await inviteInto(chat, body.emails, body.user_ids);
    return json({ ok: true, chat_id: chat.id, ...res });
  }

  if (path === '/api/community/invite') {
    if (!UUID.test(String(body.chat_id || ''))) return fail(400, 'Invalid chat.');
    const r = await sr(env, `/rest/v1/chat_members?chat_id=eq.${body.chat_id}&user_id=eq.${user.id}&role=eq.owner&status=eq.joined&select=chat_id,chats(id,kind,title)`);
    const row = r.ok ? (await r.json())[0] : null;
    if (!row || !row.chats || row.chats.kind !== 'group') return fail(403, 'Only the owner of a group can invite people.');
    const res = await inviteInto(row.chats, body.emails, body.user_ids);
    return json({ ok: true, chat_id: body.chat_id, ...res });
  }

  /* ----- share a saved project with other members, or with everyone in a chat ----- */
  if (path === '/api/community/share') {
    if (!UUID.test(String(body.project_id || ''))) return fail(400, 'Invalid project.');
    const pr = await sr(env, `/rest/v1/projects?id=eq.${body.project_id}&owner_id=eq.${user.id}&select=id,name`);
    const proj = pr.ok ? (await pr.json())[0] : null;
    if (!proj) return fail(404, 'Project not found.');
    const note = cl(body.note, 500) || null;
    const res = { shared: [], skipped: [], emailed: 0, mail: Boolean(env.RESEND_API_KEY) };
    const insShare = async (p, chatId) => {
      const ins = await sr(env, '/rest/v1/project_shares?on_conflict=project_id,recipient_id', {
        method: 'POST', headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
        body: JSON.stringify({ project_id: proj.id, owner_id: user.id, recipient_id: p.id, project_name: proj.name, note, chat_id: chatId || null }),
      });
      if (!ins.ok) return 'failed';
      return (await ins.json().catch(() => [])).length ? 'new' : 'already';
    };

    if (body.chat_id != null) {
      if (!UUID.test(String(body.chat_id))) return fail(400, 'Invalid chat.');
      const mr = await sr(env, `/rest/v1/chat_members?chat_id=eq.${body.chat_id}&status=eq.joined&select=user_id`);
      const mem = mr.ok ? (await mr.json()).map(m => m.user_id) : [];
      if (!mem.includes(user.id)) return fail(403, 'You are not in this chat.');
      const others = mem.filter(id => id !== user.id);
      const pr2 = others.length ? await sr(env, `/rest/v1/profiles?status=eq.active&id=in.(${others.join(',')})&select=id,email,first_name,last_name`) : null;
      if (pr2 && !pr2.ok) throw new Error('lookup');
      const bl = await blocks();
      for (const p of (pr2 ? await pr2.json() : [])) {
        if (bl.any(p.id)) continue;
        const st = await insShare(p, body.chat_id);
        if (st === 'failed') res.skipped.push({ email: '', id: p.id, reason: 'failed' }); else res.shared.push({ id: p.id, name: nameOf(p) });
      }
      const msg = await sr(env, '/rest/v1/chat_messages', { method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ chat_id: body.chat_id, sender_id: user.id, body: note || '', project_id: proj.id, project_name: proj.name }) });
      if (!msg.ok) {
        const t = await msg.text().catch(() => '');
        return fail(/too quickly/i.test(t) ? 429 : 502, /too quickly/i.test(t) ? 'You are sending messages too quickly. Wait a moment.' : 'The project could not be posted in the chat.');
      }
      return json({ ok: true, chat_id: body.chat_id, message: (await msg.json())[0], ...res });
    }

    if (!body.emails && !(Array.isArray(body.user_ids) && body.user_ids.length)) return fail(400, 'Choose at least one member, or enter an email address.');
    if (await overCap()) { res.skipped.push({ email: '', reason: 'daily_limit' }); return json({ ok: true, ...res }); }
    const t = await resolve(body.emails, body.user_ids);
    res.skipped.push(...t.skipped);
    if (!t.list.length && !res.skipped.length) return fail(400, 'Enter at least one valid email address.');
    for (const { key, p } of t.list) {
      const e = UUID.test(key) ? '' : key;
      if (p.id === user.id) { res.skipped.push({ email: e, reason: 'self' }); continue; }
      if ((await blocks()).any(p.id)) { res.skipped.push({ email: e, id: p.id, reason: 'not_found' }); continue; }
      const st = await insShare(p, null);
      if (st !== 'new') { res.skipped.push({ email: e, id: p.id, reason: st }); continue; }
      res.shared.push({ id: p.id, name: nameOf(p) });
      const ok = await sendMail(env, p.email, `${myName} shared a project with you`,
        [`${myName} shared the project "${proj.name}" with you on DBoard Designer.`].concat(note ? [`Message: ${note}`] : [], 'Sign in and open Community, then Shared projects, to view it or save your own copy.'),
        appUrl, 'Open DBoard Designer');
      if (ok) res.emailed++;
    }
    return json({ ok: true, ...res });
  }

  /* ----- report a message or a member to the administrators ----- */
  if (path === '/api/community/report') {
    const REASONS = ['spam', 'harassment', 'inappropriate', 'impersonation', 'other'];
    const reason = REASONS.includes(body.reason) ? body.reason : null;
    if (!reason) return fail(400, 'Choose a reason.');
    const details = cl(body.details, 1000) || null;
    const since = encodeURIComponent(new Date(Date.now() - 86400000).toISOString());
    const recent = await sr(env, `/rest/v1/content_reports?reporter_id=eq.${user.id}&created_at=gte.${since}&select=id&limit=20`);
    if (recent.ok && (await recent.json()).length >= 20) return fail(429, 'You have sent many reports today. Try again tomorrow.');
    const row = { reporter_id: user.id, reason, details };
    if (body.message_id != null) {
      const mid = parseInt(body.message_id, 10);
      if (!Number.isSafeInteger(mid) || mid < 1) return fail(400, 'Invalid message.');
      const mr = await sr(env, `/rest/v1/chat_messages?id=eq.${mid}&select=id,chat_id,sender_id,body,attachment,project_name`);
      const msg = mr.ok ? (await mr.json())[0] : null;
      if (!msg) return fail(404, 'That message no longer exists.');
      const mem = await sr(env, `/rest/v1/chat_members?chat_id=eq.${msg.chat_id}&user_id=eq.${user.id}&status=eq.joined&select=user_id`);
      if (!mem.ok || !(await mem.json()).length) return fail(403, 'You are not in this chat.');
      if (msg.sender_id === user.id) return fail(400, 'You cannot report your own message.');
      Object.assign(row, { message_id: msg.id, chat_id: msg.chat_id, target_user_id: msg.sender_id,
        message_body: [msg.body, msg.attachment && msg.attachment.name ? `[file: ${msg.attachment.name}]` : '', msg.project_name ? `[project: ${msg.project_name}]` : ''].filter(Boolean).join('\n').slice(0, 2200) });
    } else {
      const uid = String(body.user_id || '').toLowerCase();
      if (!UUID.test(uid) || uid === user.id) return fail(400, 'Invalid member.');
      const pr = await sr(env, `/rest/v1/profiles?id=eq.${uid}&select=id`);
      if (!pr.ok || !(await pr.json()).length) return fail(404, 'That member is not available.');
      row.target_user_id = uid;
    }
    const ins = await sr(env, '/rest/v1/content_reports', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row) });
    if (!ins.ok) return fail(502, 'The report could not be sent. Try again.');
    const rep = (await ins.json())[0];
    let blocked = false;
    if (body.block && row.target_user_id) {
      const b = await sr(env, '/rest/v1/user_blocks?on_conflict=blocker_id,blocked_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ blocker_id: user.id, blocked_id: row.target_user_id }) });
      blocked = b.ok;
    }
    // Tell every administrator: a notification on their dashboard and, if email is set up, an email.
    const tp = row.target_user_id ? await profileOf(env, row.target_user_id) : null;
    const who = tp ? nameOf(tp) : 'a member';
    const ad = await sr(env, '/rest/v1/profiles?role=eq.admin&status=eq.active&select=id,email');
    const admins = ad.ok ? await ad.json() : [];
    if (admins.length) {
      await sr(env, '/rest/v1/notifications', { method: 'POST', body: JSON.stringify(admins.map(a => ({ user_id: a.id, kind: 'report', ref_id: rep.id, title: 'New report: ' + reason, body: `${myName} reported ${who}.`.slice(0, 400) }))) });
      for (const a of admins) await sendMail(env, a.email, `New report on DBoard Designer: ${reason}`,
        [`${myName} reported ${who} (${reason}).`].concat(details ? [`Details: ${details}`] : [], row.message_body ? [`Reported message: ${row.message_body}`] : [], 'Open Admin, then Reports, to review it, delete the message or suspend the account.'),
        appUrl, 'Open DBoard Designer');
    }
    return json({ ok: true, id: rep.id, blocked });
  }

  return fail(404, 'Unknown community endpoint.');
}
