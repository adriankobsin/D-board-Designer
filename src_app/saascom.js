/* ---------- community: private and group chats, project sharing, notifications ---------- */
SA.com = {chats: [], shares: [], tab: 'chats', active: null, msgs: [], names: {}, err: null, loaded: false, poll: null, tpoll: null, lastId: 0, sending: false};
SA.notif = {list: [], err: null, open: false};

const saComOn = () => !!(SA.cfg && SA.cfg.communityEnabled !== false);
const saUnread = () => SA.notif.list.filter(n => !n.read_at).length;
function saBadge(){
  const n = saUnread();
  document.querySelectorAll('[data-nbadge]').forEach(e => { e.textContent = n > 99 ? '99+' : String(n); e.hidden = !n; });
}
async function saNotifLoad(){
  if (!SA.sb || !SA.user || !SA.user.email_confirmed_at) return;
  const {data, error} = await SA.sb.from('notifications').select('id,kind,ref_id,title,body,count,created_at,read_at').order('created_at', {ascending: false}).limit(40);
  if (error){ SA.notif.err = error.message; return; }
  SA.notif.err = null; SA.notif.list = data || []; saBadge();
  if (SA.notif.open) saBellPaint();
}
function saChatName(c){
  if (c.kind === 'group') return c.title || T('Group chat');
  const o = (c.members || []).find(m => m.id !== SA.user.id);
  return (o && o.name) || T('Private chat');
}
async function saComLoad(){
  const [a, b] = await Promise.all([SA.sb.rpc('my_chats'), SA.sb.rpc('my_shares')]);
  if (a.error || b.error){ SA.com.err = (a.error || b.error).message; SA.com.loaded = true; return false; }
  SA.com.err = null; SA.com.chats = a.data || []; SA.com.shares = b.data || []; SA.com.loaded = true; return true;
}

/* ----- bell ----- */
function saBellPaint(){
  const box = sa$('#saBell'); if (!box) return;
  const items = SA.notif.list;
  const icon = k => k === 'project_share' ? '⇪' : k === 'chat_invite' ? '+' : '✉';
  box.innerHTML = `<div class="hd"><b>${saEsc(T('Notifications'))}</b>${saUnread() ? `<button class="sa-link" data-sa="nreadall">${saEsc(T('Mark all as read'))}</button>` : ''}</div>`
    + (items.length ? items.map(n => `<button class="ni ${n.read_at ? '' : 'un'}" data-sa="nitem" data-id="${n.id}"><span class="ic" aria-hidden="true">${icon(n.kind)}</span><span class="tx"><b data-nt>${saEsc(n.title)}${n.count > 1 && n.kind === 'chat_message' ? ` · ${n.count}` : ''}</b><span data-nt>${saEsc(n.body)}</span><em>${saEsc(saRel(n.created_at))}</em></span></button>`).join('') : `<div class="sa-empty" style="margin:10px;padding:18px">${saEsc(T('Nothing new. Invitations, replies and shared projects show up here.'))}</div>`);
}
function saBellToggle(btn){
  const old = sa$('#saBell'); if (old){ old.remove(); SA.notif.open = false; btn.setAttribute('aria-expanded', 'false'); return; }
  const d = document.createElement('div'); d.id = 'saBell'; d.className = 'sa-bell'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', T('Notifications'));
  btn.closest('.sa-bw').appendChild(d); SA.notif.open = true; btn.setAttribute('aria-expanded', 'true'); saBellPaint(); saNotifLoad();
}
async function saNotifRead(ids){
  if (!ids.length) return;
  const now = new Date().toISOString();
  SA.notif.list.forEach(n => { if (ids.includes(n.id)) n.read_at = now; });
  saBadge();
  await SA.sb.from('notifications').update({read_at: now}).in('id', ids).then(() => {}, () => {});
}
async function saNotifGo(id){
  const n = SA.notif.list.find(x => x.id === id); if (!n) return;
  await saNotifRead([id]);
  const br = sa$('#saBell'); if (br){ br.remove(); SA.notif.open = false; }
  if (n.kind === 'project_share'){ SA.com.tab = 'shared'; SA.com.active = null; }
  else { SA.com.tab = 'chats'; SA.com.active = n.ref_id; }
  saGo('community');
}

/* ----- community page ----- */
async function saViewCommunity(el){
  clearInterval(SA.com.poll); clearInterval(SA.com.tpoll);
  el.innerHTML = saFrame('community', `<div class="sa-splash">${saEsc(T('Loading…'))}</div>`);
  const ok = await saComLoad(); if (SA.view !== 'community') return;
  if (!ok){
    const missing = /my_chats|schema cache|does not exist|function/i.test(SA.com.err || '');
    el.innerHTML = saFrame('community', `<h1 class="sa-h1">${saEsc(T('Community'))}</h1><div class="sa-msg warn">${saEsc(T(missing ? 'Community is not set up yet. The site owner needs to run the 0004_community.sql migration in Supabase.' : 'Community could not be loaded. Check your connection and try again.'))}</div>`);
    return;
  }
  const shared = SA.com.shares.filter(s => s.direction === 'received' && !s.seen_at).length;
  const invites = SA.com.chats.filter(c => c.my_status === 'invited').length;
  const unreadChats = SA.com.chats.reduce((a, c) => a + (+c.unread || 0), 0);
  const tab = (t, l, n) => `<button role="tab" data-sa="ctab" data-t="${t}" ${SA.com.tab === t ? 'aria-current="page"' : ''}>${saEsc(T(l))}${n ? ` <span class="sa-pill">${n}</span>` : ''}</button>`;
  el.innerHTML = saFrame('community', `<h1 class="sa-h1">${saEsc(T('Community'))}</h1><p class="sa-sub">${saEsc(T('Chat with other members, work in groups and share saved boards.'))}</p>${saMsgHtml()}
    <div class="sa-nav" role="tablist" style="margin-bottom:14px">${tab('chats', 'Chats', invites + unreadChats)}${tab('shared', 'Shared projects', shared)}</div><div id="saComBody"></div>`);
  if (SA.com.tab === 'shared') saShared(); else saChats();
  SA.com.poll = setInterval(async () => { if (SA.view !== 'community' || document.visibilityState !== 'visible') return; if (await saComLoad()) { if (SA.com.tab === 'chats') saChatListPaint(); } }, 12000);
}
function saChats(){
  const b = sa$('#saComBody'); if (!b) return;
  b.innerHTML = `<div class="sa-com ${SA.com.active ? 'open' : ''}"><aside class="sa-clist"><div class="sa-row" style="margin-bottom:10px"><button class="sa-btn pri sm" data-sa="cdirect">${saEsc(T('New private chat'))}</button><button class="sa-btn sm" data-sa="cgroup">${saEsc(T('New group'))}</button></div><div id="saCList"></div></aside><section class="sa-cthread" id="saCThread"></section></div>`;
  saChatListPaint(); saThreadOpen(SA.com.active, true);
}
function saChatListPaint(){
  const l = sa$('#saCList'); if (!l) return;
  const inv = SA.com.chats.filter(c => c.my_status === 'invited'), joined = SA.com.chats.filter(c => c.my_status === 'joined');
  let h = '';
  if (inv.length) h += `<h3 class="sa-ch">${saEsc(T('Invitations'))}</h3>` + inv.map(c => { const by = (c.members || []).find(m => m.role === 'owner'); return `<div class="sa-inv"><b data-nt>${saEsc(c.title || T('Group chat'))}</b><span class="mt">${saEsc(T('Group'))} · ${(c.members || []).length} ${saEsc(T('members'))}${by ? ` · ${saEsc(T('from'))} <span data-nt>${saEsc(by.name)}</span>` : ''}</span><span class="sa-row"><button class="sa-btn pri sm" data-sa="cacc" data-id="${c.id}">${saEsc(T('Accept'))}</button><button class="sa-btn sm" data-sa="cdec" data-id="${c.id}">${saEsc(T('Decline'))}</button></span></div>`; }).join('');
  h += `<h3 class="sa-ch">${saEsc(T('Conversations'))}</h3>`;
  h += joined.length ? joined.map(c => `<button class="sa-ci ${SA.com.active === c.id ? 'on' : ''}" data-sa="chat" data-id="${c.id}"><span class="sa-cav" aria-hidden="true">${c.kind === 'group' ? '#' : saEsc((saChatName(c)[0] || '?').toUpperCase())}</span><span class="tx"><b data-nt>${saEsc(saChatName(c))}</b><span data-nt>${c.last_body ? saEsc((c.last_sender ? c.last_sender + ': ' : '') + c.last_body) : saEsc(T('No messages yet'))}</span></span>${+c.unread ? `<span class="sa-pill">${c.unread}</span>` : ''}</button>`).join('') : `<div class="sa-empty" style="padding:18px">${saEsc(T('No conversations yet. Start a private chat with a member, or create a group.'))}</div>`;
  l.innerHTML = h;
}
const saChatById = id => SA.com.chats.find(c => c.id === id);
async function saThreadOpen(id, keep){
  clearInterval(SA.com.tpoll);
  const t = sa$('#saCThread'); if (!t) return;
  const c = id && saChatById(id);
  if (!c || c.my_status !== 'joined'){ SA.com.active = null; t.innerHTML = `<div class="sa-empty sa-cnone">${saEsc(T('Choose a conversation, or start a new one.'))}</div>`; const w = sa$('.sa-com'); if (w) w.classList.remove('open'); return; }
  SA.com.active = id; SA.com.msgs = []; SA.com.lastId = 0;
  const w = sa$('.sa-com'); if (w) w.classList.add('open');
  const mem = c.members || [], names = {}; mem.forEach(m => { names[m.id] = m.name; });
  SA.com.names = names;
  const own = c.kind === 'group' && mem.some(m => m.id === SA.user.id && m.role === 'owner');
  t.innerHTML = `<header class="sa-chd"><button class="sa-btn sm sa-back" data-sa="cback" aria-label="${saEsc(T('Back to conversations'))}">←</button><div class="tt"><b data-nt>${saEsc(saChatName(c))}</b><span data-nt>${c.kind === 'group' ? mem.filter(m => m.status === 'joined').length + ' ' + saEsc(T('members')) + (mem.some(m => m.status === 'invited') ? ' · ' + mem.filter(m => m.status === 'invited').length + ' ' + saEsc(T('invited')) : '') : saEsc(T('Private chat'))}</span></div><span class="sa-row">${c.kind === 'group' ? `<button class="sa-btn sm" data-sa="cmembers">${saEsc(T('Members'))}</button>` : ''}${own ? `<button class="sa-btn sm" data-sa="cinvite">${saEsc(T('Invite'))}</button>` : ''}<button class="sa-btn sm bad" data-sa="cleave">${saEsc(T(c.kind === 'group' ? 'Leave' : 'Leave chat'))}</button></span></header>
  <div class="sa-msgs" id="saMsgs" tabindex="0" aria-live="polite"></div>
  <form class="sa-comp" id="saSend"><label class="sr" for="saMsgIn">${saEsc(T('Message'))}</label><textarea id="saMsgIn" rows="2" maxlength="2000" placeholder="${saEsc(T('Write a message. Enter sends, Shift+Enter adds a line.'))}"></textarea><button class="sa-btn pri" type="submit">${saEsc(T('Send'))}</button></form>`;
  await saMsgFetch(true);
  SA.com.tpoll = setInterval(() => { if (SA.view === 'community' && SA.com.active === id && document.visibilityState === 'visible') saMsgFetch(false); }, 4000);
  if (!keep){ const i = sa$('#saMsgIn'); if (i) i.focus(); }
}
async function saMsgFetch(first){
  const id = SA.com.active; if (!id) return;
  let q = SA.sb.from('chat_messages').select('id,sender_id,body,created_at').eq('chat_id', id);
  q = first ? q.order('id', {ascending: false}).limit(150) : q.gt('id', SA.com.lastId).order('id', {ascending: true}).limit(150);
  const {data, error} = await q;
  if (SA.com.active !== id) return;
  if (error){ if (first){ const m = sa$('#saMsgs'); if (m) m.innerHTML = `<div class="sa-msg bad">${saEsc(T('Messages could not be loaded.'))}</div>`; } return; }
  let rows = data || []; if (first) rows = rows.slice().reverse();
  if (!rows.length && !first) return;
  const unknown = rows.some(r => !(r.sender_id in SA.com.names) && r.sender_id !== SA.user.id);
  if (unknown){ const s = await SA.sb.rpc('chat_senders', {cid: id}); (s.data || []).forEach(x => { if (!(x.user_id in SA.com.names)) SA.com.names[x.user_id] = x.name; }); }
  if (first) SA.com.msgs = rows; else SA.com.msgs = SA.com.msgs.concat(rows.filter(r => !SA.com.msgs.some(m => m.id === r.id)));
  if (SA.com.msgs.length) SA.com.lastId = SA.com.msgs[SA.com.msgs.length - 1].id;
  saMsgPaint(first || rows.length > 0);
  if (first || rows.some(r => r.sender_id !== SA.user.id)) saChatRead(id);
}
function saMsgPaint(stick){
  const box = sa$('#saMsgs'); if (!box) return;
  const c = saChatById(SA.com.active), grp = c && c.kind === 'group';
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  let prev = null, day = '';
  box.innerHTML = SA.com.msgs.length ? SA.com.msgs.map(m => {
    const mine = m.sender_id === SA.user.id, d = new Date(m.created_at).toDateString();
    const sep = d !== day ? `<div class="sa-day">${saEsc(saDate(m.created_at))}</div>` : ''; day = d;
    const first = prev !== m.sender_id || sep; prev = m.sender_id;
    return `${sep}<div class="sa-m ${mine ? 'me' : ''}">${grp && !mine && first ? `<span class="who" data-nt>${saEsc(SA.com.names[m.sender_id] || T('Former member'))}</span>` : ''}<div class="bb" data-nt>${saEsc(m.body)}<time>${saEsc(new Date(m.created_at).toLocaleTimeString(saLang(), {hour: '2-digit', minute: '2-digit'}))}</time></div></div>`;
  }).join('') : `<div class="sa-empty sa-cnone">${saEsc(T('No messages yet. Say hello.'))}</div>`;
  if (stick || near) box.scrollTop = box.scrollHeight;
}
async function saChatRead(id){
  await SA.sb.rpc('mark_chat_read', {cid: id});
  const c = saChatById(id); if (c){ c.unread = 0; saChatListPaint(); }
  const ids = SA.notif.list.filter(n => n.kind === 'chat_message' && n.ref_id === id && !n.read_at).map(n => n.id);
  if (ids.length) saNotifRead(ids);
}
async function saSendMsg(){
  const i = sa$('#saMsgIn'); if (!i || SA.com.sending || !SA.com.active) return;
  const body = i.value.trim(); if (!body) return;
  SA.com.sending = true; i.disabled = true;
  const {data, error} = await SA.sb.from('chat_messages').insert({chat_id: SA.com.active, body}).select('id,sender_id,body,created_at').single();
  SA.com.sending = false; i.disabled = false;
  if (error){ toast(/too quickly/i.test(error.message || '') ? T('You are sending messages too quickly. Wait a moment.') : T('The message could not be sent. Try again.')); i.focus(); return; }
  i.value = '';
  if (!SA.com.msgs.some(m => m.id === data.id)){ SA.com.msgs.push(data); SA.com.lastId = Math.max(SA.com.lastId, data.id); }
  saMsgPaint(true); i.focus();
  const c = saChatById(SA.com.active); if (c){ c.last_body = body; c.last_sender = saName(); saChatListPaint(); }
}

/* ----- dialogs ----- */
function saResultHtml(r, verb){
  const why = {not_registered: 'is not a registered member', already: 'is already included', invalid: 'is not a valid email address', self: 'is your own address', limit: 'was left out (20 addresses at a time)', daily_limit: 'Daily invitation limit reached. Try again tomorrow.', failed: 'could not be added'};
  const done = r.invited || r.shared || [];
  let h = '';
  if (done.length) h += `<div class="sa-msg ok" style="margin-bottom:8px">${saEsc(T(verb))}: ${done.map(x => `<b data-nt>${saEsc(x.name)}</b>`).join(', ')}.${r.mail ? (r.emailed ? ` ${saEsc(T('Email sent to'))} ${r.emailed}.` : ` ${saEsc(T('The email could not be sent. They will still see it on their dashboard.'))}`) : ` ${saEsc(T('They will see it on their dashboard.'))}`}</div>`;
  const sk = (r.skipped || []);
  if (sk.length) h += `<div class="sa-msg warn">${sk.map(x => x.email ? `<span data-nt>${saEsc(x.email)}</span> ${saEsc(T(why[x.reason] || why.failed))}` : saEsc(T(why[x.reason] || why.failed))).join('<br>')}</div>`;
  return h;
}
function saComDialog(kind, extra){
  const c = kind === 'cinvite' ? saChatById(SA.com.active) : null;
  const f = {
    cdirect: [T('New private chat'), `<label class="sa-field"><span>${saEsc(T('Email address of a registered member'))}</span><input id="saCEmail" type="email" autocomplete="off" maxlength="254" required></label>`, T('Start chat')],
    cgroup: [T('New group'), `<label class="sa-field"><span>${saEsc(T('Group name'))}</span><input id="saCTitle" type="text" maxlength="100" required></label><label class="sa-field"><span>${saEsc(T('Invite members by email'))}</span><textarea id="saCEmails" rows="3" placeholder="name@example.com, other@example.com"></textarea><small>${saEsc(T('Separate addresses with commas or new lines. Invited members get an email and a notification, and join when they accept.'))}</small></label>`, T('Create group')],
    cinvite: [T('Invite to') + ' ' + (c ? saChatName(c) : ''), `<label class="sa-field"><span>${saEsc(T('Invite members by email'))}</span><textarea id="saCEmails" rows="3" placeholder="name@example.com"></textarea></label>`, T('Send invitations')],
    cshare: [T('Share project'), `<p class="sa-sub" style="margin:0 0 8px">${saEsc(T('Registered members can view the board and save their own copy. Only you can change the original.'))}</p><label class="sa-field"><span>${saEsc(T('Share with (email addresses)'))}</span><textarea id="saCEmails" rows="2" placeholder="name@example.com"></textarea></label><label class="sa-field"><span>${saEsc(T('Message (optional)'))}</span><input id="saCNote" type="text" maxlength="500"></label>`, T('Share')],
  }[kind];
  saModal(`<h2 data-nt>${saEsc(f[0])}</h2><form id="saCForm" data-k="${kind}" data-x="${saEsc(extra || '')}">${f[1]}<div id="saCRes" style="margin-top:10px"></div><div class="sa-row" style="margin-top:14px;justify-content:flex-end"><button type="button" class="sa-btn" data-sa="close">${saEsc(T('Close'))}</button><button class="sa-btn pri" type="submit" id="saCGo">${saEsc(f[2])}</button></div></form>`);
}
async function saComSubmit(form){
  const kind = form.dataset.k, go = sa$('#saCGo'), res = sa$('#saCRes'), v = id => ((sa$('#' + id) || {}).value || '').trim();
  go.disabled = true; res.innerHTML = '';
  try {
    if (kind === 'cdirect'){
      const r = await saApi('/api/community/direct', {method: 'POST', body: JSON.stringify({email: v('saCEmail')})});
      saModalClose(); SA.com.tab = 'chats'; SA.com.active = r.chat_id; await saComLoad(); saViewCommunity(sa$('#saas')); return;
    }
    if (kind === 'cgroup'){
      if (!v('saCTitle')){ res.innerHTML = `<div class="sa-msg bad">${saEsc(T('Give the group a name.'))}</div>`; go.disabled = false; return; }
      const r = await saApi('/api/community/group', {method: 'POST', body: JSON.stringify({title: v('saCTitle'), emails: v('saCEmails')})});
      SA.com.active = r.chat_id; SA.com.tab = 'chats';
      if ((r.invited || []).length || (r.skipped || []).length){ res.innerHTML = saResultHtml(r, 'Invited'); go.hidden = true; const cl = form.querySelector('[data-sa=close]'); cl.textContent = T('Open group'); cl.className = 'sa-btn pri'; cl.dataset.sa = 'cgo'; }
      else { saModalClose(); await saComLoad(); saViewCommunity(sa$('#saas')); }
      return;
    }
    if (kind === 'cinvite'){
      const r = await saApi('/api/community/invite', {method: 'POST', body: JSON.stringify({chat_id: SA.com.active, emails: v('saCEmails')})});
      res.innerHTML = saResultHtml(r, 'Invited'); go.disabled = false; if ((r.invited || []).length){ sa$('#saCEmails').value = ''; saComLoad().then(() => { if (SA.com.active) saThreadOpen(SA.com.active, true); }); } return;
    }
    if (kind === 'cshare'){
      const r = await saApi('/api/community/share', {method: 'POST', body: JSON.stringify({project_id: form.dataset.x, emails: v('saCEmails'), note: v('saCNote')})});
      res.innerHTML = saResultHtml(r, 'Shared with'); go.disabled = false; if ((r.shared || []).length){ sa$('#saCEmails').value = ''; saComLoad(); } return;
    }
  } catch (e) { res.innerHTML = `<div class="sa-msg bad">${saEsc(T(e.message || 'Request failed'))}</div>`; go.disabled = false; }
}
function saMembersDialog(){
  const c = saChatById(SA.com.active); if (!c) return;
  const mem = c.members || [], own = mem.some(m => m.id === SA.user.id && m.role === 'owner');
  saModal(`<h2 data-nt>${saEsc(saChatName(c))}</h2><ul class="sa-mem">${mem.map(m => `<li><span data-nt><b>${saEsc(m.name)}</b>${m.id === SA.user.id ? ` (${saEsc(T('you'))})` : ''}</span><span class="sa-sub" style="margin:0">${saEsc(T(m.role === 'owner' ? 'Owner' : m.status === 'invited' ? 'Invited' : 'Member'))}</span>${own && m.id !== SA.user.id ? `<button class="sa-btn sm bad" data-sa="crm" data-id="${m.id}">${saEsc(T(m.status === 'invited' ? 'Cancel invite' : 'Remove'))}</button>` : ''}</li>`).join('')}</ul><div class="sa-row" style="justify-content:flex-end;margin-top:14px"><button class="sa-btn" data-sa="close">${saEsc(T('Close'))}</button></div>`);
}

/* ----- shared projects ----- */
function saShared(){
  const b = sa$('#saComBody'); if (!b) return;
  const rec = SA.com.shares.filter(s => s.direction === 'received'), sent = SA.com.shares.filter(s => s.direction === 'sent');
  const card = (s, r) => `<article class="sa-card sa-proj ${r && !s.seen_at ? 'new' : ''}"><h3 data-nt>${saEsc(s.project_name || T('Untitled board'))}</h3><div class="meta"><span>${saEsc(T(r ? 'From' : 'To'))} <b data-nt>${saEsc(s.other_name)}</b></span><span>${saEsc(saRel(s.created_at))}</span></div>${s.note ? `<p class="sa-note" data-nt>“${saEsc(s.note)}”</p>` : ''}<div class="acts">${r ? `<button class="sa-btn pri sm" data-sa="shopen" data-id="${s.id}">${saEsc(T('Open a copy'))}</button><button class="sa-btn sm bad" data-sa="shrm" data-id="${s.id}">${saEsc(T('Remove'))}</button>` : `<button class="sa-btn sm bad" data-sa="shrm" data-id="${s.id}">${saEsc(T('Stop sharing'))}</button>`}</div></article>`;
  b.innerHTML = `<h2 style="margin:0 0 10px">${saEsc(T('Shared with me'))}</h2>${rec.length ? `<div class="sa-grid c3" style="margin-bottom:22px">${rec.map(s => card(s, true)).join('')}</div>` : `<div class="sa-empty" style="margin-bottom:22px">${saEsc(T('Nothing has been shared with you yet.'))}</div>`}<h2 style="margin:0 0 10px">${saEsc(T('Shared by me'))}</h2>${sent.length ? `<div class="sa-grid c3">${sent.map(s => card(s, false)).join('')}</div>` : `<div class="sa-empty">${saEsc(T('You have not shared a project. Use Share on any project in your dashboard.'))}</div>`}`;
  const unseen = rec.filter(s => !s.seen_at).map(s => s.id);
  if (unseen.length){
    SA.sb.from('project_shares').update({seen_at: new Date().toISOString()}).in('id', unseen).then(() => {}, () => {});
    const ids = SA.notif.list.filter(n => n.kind === 'project_share' && !n.read_at && unseen.includes(n.ref_id)).map(n => n.id); if (ids.length) saNotifRead(ids);
    rec.forEach(s => { s.seen_at = s.seen_at || new Date().toISOString(); });
  }
}
async function saShareOpen(id){
  const s = SA.com.shares.find(x => x.id === id); if (!s) return;
  const {data, error} = await SA.sb.from('projects').select('name,data').eq('id', s.project_id).maybeSingle();
  if (error || !data){ toast(T('That project is no longer shared with you.')); return; }
  const p = data.data;
  if (!p || !p.circuits || !p.modules || !STD[p.std]){ toast(T('This project could not be read.')); return; }
  try {
    const row = await saCreateProject(p, (data.name + ' (from ' + s.other_name + ')').slice(0, 200));
    await saOpenProject(row.id);
  } catch (e) { toast(saErr(e)); }
}

/* ----- events ----- */
document.addEventListener('click', async ev => {
  const bell = ev.target.closest('[data-bell]');
  if (bell){ saBellToggle(bell); return; }
  const op = sa$('#saBell'); if (op && !ev.target.closest('.sa-bw')){ op.remove(); SA.notif.open = false; }
  const b = ev.target.closest('[data-sa]'); if (!b) return;
  const a = b.dataset.sa, id = b.dataset.id;
  if (a === 'community'){ SA.com.tab = 'chats'; saGo('community'); }
  else if (a === 'ctab'){ SA.com.tab = b.dataset.t; saViewCommunity(sa$('#saas')); }
  else if (a === 'chat'){ SA.com.active = id; saChatListPaint(); saThreadOpen(id); }
  else if (a === 'cback'){ SA.com.active = null; clearInterval(SA.com.tpoll); saChatListPaint(); saThreadOpen(null); }
  else if (a === 'cdirect' || a === 'cgroup' || a === 'cinvite') saComDialog(a);
  else if (a === 'cgo'){ saModalClose(); await saComLoad(); saViewCommunity(sa$('#saas')); }
  else if (a === 'share'){ saComDialog('cshare', id); }
  else if (a === 'cmembers') saMembersDialog();
  else if (a === 'cacc'){ b.disabled = true; const {error} = await SA.sb.from('chat_members').update({status: 'joined'}).eq('chat_id', id).eq('user_id', SA.user.id); if (error){ toast(T('Could not accept the invitation.')); b.disabled = false; return; } SA.com.active = id; const ids = SA.notif.list.filter(n => n.kind === 'chat_invite' && n.ref_id === id && !n.read_at).map(n => n.id); saNotifRead(ids); saViewCommunity(sa$('#saas')); }
  else if (a === 'cdec'){ b.disabled = true; await SA.sb.from('chat_members').delete().eq('chat_id', id).eq('user_id', SA.user.id); const ids = SA.notif.list.filter(n => n.kind === 'chat_invite' && n.ref_id === id && !n.read_at).map(n => n.id); saNotifRead(ids); await saComLoad(); saChatListPaint(); }
  else if (a === 'cleave'){
    if (b.dataset.sure !== '1'){ b.dataset.sure = '1'; b.textContent = T('Click again to leave'); setTimeout(() => { if (b.isConnected){ b.dataset.sure = ''; b.textContent = T('Leave'); } }, 4000); return; }
    await SA.sb.from('chat_members').delete().eq('chat_id', SA.com.active).eq('user_id', SA.user.id); SA.com.active = null; await saComLoad(); saChats();
  }
  else if (a === 'crm'){ const cid = SA.com.active; await SA.sb.from('chat_members').delete().eq('chat_id', cid).eq('user_id', id); await saComLoad(); saMembersDialog(); saChatListPaint(); if (SA.com.active === cid) saThreadOpen(cid, true); }
  else if (a === 'shopen'){ b.disabled = true; await saShareOpen(id); b.disabled = false; }
  else if (a === 'shrm'){
    if (b.dataset.sure !== '1'){ b.dataset.sure = '1'; const o = b.textContent; b.textContent = T('Click again to confirm'); setTimeout(() => { if (b.isConnected){ b.dataset.sure = ''; b.textContent = o; } }, 4000); return; }
    await SA.sb.from('project_shares').delete().eq('id', id); await saComLoad(); saShared();
  }
  else if (a === 'nitem') saNotifGo(id);
  else if (a === 'nreadall') saNotifRead(SA.notif.list.filter(n => !n.read_at).map(n => n.id)).then(saBellPaint);
});
document.addEventListener('submit', ev => {
  if (ev.target.id === 'saCForm'){ ev.preventDefault(); saComSubmit(ev.target); }
  else if (ev.target.id === 'saSend'){ ev.preventDefault(); saSendMsg(); }
});
document.addEventListener('keydown', ev => {
  if (ev.target.id === 'saMsgIn' && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing){ ev.preventDefault(); saSendMsg(); }
  if (ev.key === 'Escape'){ const op = sa$('#saBell'); if (op){ op.remove(); SA.notif.open = false; } }
});
/* notifications refresh while the page is open and visible */
setInterval(() => { if (SA.user && SA.user.email_confirmed_at && SA.cfg && SA.cfg.communityEnabled !== false && document.visibilityState === 'visible') saNotifLoad(); }, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && SA.user) saNotifLoad(); });
