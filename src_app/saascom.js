/* ---------- community: private and group chats, project sharing, notifications ---------- */
SA.com = {chats: [], shares: [], tab: 'chats', active: null, msgs: [], names: {}, err: null, loaded: false, poll: null, tpoll: null, lastId: 0, sending: false,
  dir: {q: '', rows: [], total: 0, loading: false, err: null, seq: 0}, sel: new Map(), who: {}, urls: {}, uploads: []};
const SA_FILE_MAX = 25 * 1024 * 1024;
const SA_MSG_COLS = ['id,sender_id,body,created_at,attachment,project_id,project_name,call', 'id,sender_id,body,created_at,attachment,project_id,project_name', 'id,sender_id,body,created_at'];
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
  SA.com.err = null; SA.com.chats = a.data || []; SA.com.shares = b.data || []; SA.com.loaded = true;
  const bl = await SA.sb.from('user_blocks').select('blocked_id');   // missing before 0006: then nobody is blocked
  SA.com.blocked = new Set(bl.error ? [] : (bl.data || []).map(x => x.blocked_id));
  return true;
}

/* ----- bell ----- */
function saBellPaint(){
  const box = sa$('#saBell'); if (!box) return;
  const items = SA.notif.list;
  const icon = k => k === 'project_share' ? '⇪' : k === 'chat_invite' ? '+' : k === 'report' ? '!' : k === 'call' ? '☏' : '✉';
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
  if (n.kind === 'report'){ SA.adminTab = 'reports'; saGo('admin'); return; }
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
  el.innerHTML = saFrame('community', `<h1 class="sa-h1">${saEsc(T('Community'))}</h1><p class="sa-sub">${saEsc(T('Find other members, chat, work in groups and share saved boards and files.'))}</p>${saMsgHtml()}
    <div class="sa-nav" role="tablist" style="margin-bottom:14px">${tab('chats', 'Chats', invites + unreadChats)}${tab('members', 'Members', 0)}${tab('shared', 'Shared projects', shared)}</div><div id="saComBody"></div>`);
  if (SA.com.tab === 'shared') saShared(); else if (SA.com.tab === 'members') saMembers(); else saChats();
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
  t.innerHTML = `<header class="sa-chd"><button class="sa-btn sm sa-back" data-sa="cback" aria-label="${saEsc(T('Back to conversations'))}">←</button><div class="tt"><b data-nt>${saEsc(saChatName(c))}</b><span data-nt>${c.kind === 'group' ? mem.filter(m => m.status === 'joined').length + ' ' + saEsc(T('members')) + (mem.some(m => m.status === 'invited') ? ' · ' + mem.filter(m => m.status === 'invited').length + ' ' + saEsc(T('invited')) : '') : saEsc(T('Private chat'))}</span></div><span class="sa-row">${c.kind === 'group' ? `<button class="sa-btn sm" data-sa="cmembers">${saEsc(T('Members'))}</button>` : ''}${own ? `<button class="sa-btn sm" data-sa="cinvite">${saEsc(T('Invite'))}</button>` : ''}${SA.cfg && SA.cfg.callsEnabled ? `<button class="sa-btn sm sa-callb" data-sa="callstart" data-v="0" aria-label="${saEsc(T('Audio call'))}" title="${saEsc(T('Audio call'))}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg></button><button class="sa-btn sm sa-callb" data-sa="callstart" data-v="1" aria-label="${saEsc(T('Video call'))}" title="${saEsc(T('Video call'))}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg></button>` : ''}${c.kind === 'direct' ? (() => { const o = mem.find(m => m.id !== SA.user.id); return o ? `<button class="sa-btn sm" data-sa="mopts" data-id="${o.id}" aria-label="${saEsc(T('Report or block'))}" title="${saEsc(T('Report or block'))}">⋯</button>` : ''; })() : ''}<button class="sa-btn sm bad" data-sa="cleave">${saEsc(T(c.kind === 'group' ? 'Leave' : 'Leave chat'))}</button></span></header>
  <div class="sa-msgs" id="saMsgs" tabindex="0" aria-live="polite"></div>
  <div class="sa-ups" id="saUps" aria-live="polite"></div>
  <form class="sa-comp" id="saSend"><span class="sa-ctools"><button type="button" class="sa-ib" data-sa="cattach" title="${saEsc(T('Attach files'))}" aria-label="${saEsc(T('Attach files'))}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5 12.6 19.9a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8"/></svg></button><button type="button" class="sa-ib" data-sa="cproj" title="${saEsc(T('Share a project in this chat'))}" aria-label="${saEsc(T('Share a project in this chat'))}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="1.5"/><path d="M3.5 9h17M8 9v11M12 12.5h5M12 16h5"/></svg></button><input type="file" id="saFileIn" multiple hidden></span><label class="sr" for="saMsgIn">${saEsc(T('Message'))}</label><textarea id="saMsgIn" rows="2" maxlength="2000" placeholder="${saEsc(T('Write a message. Enter sends, Shift+Enter adds a line.'))}"></textarea><button class="sa-btn pri" type="submit">${saEsc(T('Send'))}</button></form>`;
  saUpPaint();
  if (matchMedia('(max-width:760px), (max-height:500px) and (max-width:1024px)').matches){   // phones: bring the chat to the top, under the header
    const bar = sa$('.sa-bar'), hh = bar ? bar.offsetHeight : 0; document.documentElement.style.setProperty('--sa-hdr', hh + 'px');
    window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - hh - 6);
  }
  await saMsgFetch(true);
  SA.com.tpoll = setInterval(() => { if (SA.view === 'community' && SA.com.active === id && document.visibilityState === 'visible') saMsgFetch(false); }, 4000);
  if (!keep){ const i = sa$('#saMsgIn'); if (i) i.focus(); }
}
async function saMsgFetch(first){
  const id = SA.com.active; if (!id) return;
  let q = SA.sb.from('chat_messages').select(SA.com.cols || SA_MSG_COLS[0]).eq('chat_id', id);
  q = first ? q.order('id', {ascending: false}).limit(150) : q.gt('id', SA.com.lastId).order('id', {ascending: true}).limit(150);
  let {data, error} = await q;
  if (error && /column|does not exist/i.test(error.message || '')){   // older database (0005/0007 not run yet): ask for fewer columns
    const k = SA_MSG_COLS.indexOf(SA.com.cols || SA_MSG_COLS[0]); if (k >= 0 && k < SA_MSG_COLS.length - 1){ SA.com.cols = SA_MSG_COLS[k + 1]; return saMsgFetch(first); }
  }
  if (SA.com.active !== id) return;
  if (error){ if (first){ const m = sa$('#saMsgs'); if (m) m.innerHTML = `<div class="sa-msg bad">${saEsc(T('Messages could not be loaded.'))}</div>`; } return; }
  let rows = data || []; if (first) rows = rows.slice().reverse();
  if (!rows.length && !first) return;
  const unknown = rows.some(r => !(r.sender_id in SA.com.names) && r.sender_id !== SA.user.id);
  if (unknown){ const s = await SA.sb.rpc('chat_senders', {cid: id}); (s.data || []).forEach(x => { if (!(x.user_id in SA.com.names)) SA.com.names[x.user_id] = x.name; }); }
  if (first) SA.com.msgs = rows; else SA.com.msgs = SA.com.msgs.concat(rows.filter(r => !SA.com.msgs.some(m => m.id === r.id)));
  if (SA.com.msgs.length) SA.com.lastId = SA.com.msgs[SA.com.msgs.length - 1].id;
  saSign(SA.com.msgs);
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
    if (!mine && SA.com.blocked && SA.com.blocked.has(m.sender_id)) return `${sep}<div class="sa-m sa-mhid"><div class="bb">${saEsc(T('Message from a member you blocked'))}</div></div>`;
    const extra = (m.attachment ? saFileHtml(m) : '') + (m.project_name ? saProjMsgHtml(m, mine) : '') + (m.call ? saCallMsgHtml(m, mine) : '');
    const rep = mine ? '' : `<button class="sa-mrep" data-sa="mrep" data-id="${m.id}" data-u="${m.sender_id}" aria-label="${saEsc(T('Report message'))}" title="${saEsc(T('Report message'))}">⚑</button>`;
    return `${sep}<div class="sa-m ${mine ? 'me' : ''}">${grp && !mine && first ? `<span class="who" data-nt>${saEsc(SA.com.names[m.sender_id] || T('Former member'))}</span>` : ''}<div class="bb ${extra ? 'has-x' : ''}" data-nt>${extra}${m.body ? `<span class="tx">${saEsc(m.body)}</span>` : ''}<time>${rep}${saEsc(new Date(m.created_at).toLocaleTimeString(saLang(), {hour: '2-digit', minute: '2-digit'}))}</time></div></div>`;
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
  if (error){ toast(/too quickly/i.test(error.message || '') ? T('You are sending messages too quickly. Wait a moment.') : /row-level security|policy/i.test(error.message || '') ? T('You can no longer send messages in this chat.') : T('The message could not be sent. Try again.')); i.focus(); return; }
  i.value = '';
  if (!SA.com.msgs.some(m => m.id === data.id)){ SA.com.msgs.push(data); SA.com.lastId = Math.max(SA.com.lastId, data.id); }
  saMsgPaint(true); i.focus();
  const c = saChatById(SA.com.active); if (c){ c.last_body = body; c.last_sender = saName(); saChatListPaint(); }
}

/* ----- report and block (required by the app stores for apps with chat) ----- */
const SA_REASONS = [['spam', 'Spam or advertising'], ['harassment', 'Harassment or threats'], ['inappropriate', 'Offensive or inappropriate content'], ['impersonation', 'Pretending to be someone else'], ['other', 'Something else']];
function saOptsDialog(uid){
  const name = SA.com.who[uid] || SA.com.names[uid] || T('A member'), blocked = SA.com.blocked && SA.com.blocked.has(uid);
  saModal(`<h2 data-nt>${saEsc(name)}</h2><div class="sa-col" style="display:flex;flex-direction:column;gap:8px"><button class="sa-btn" data-sa="mreport" data-u="${uid}">${saEsc(T('Report this member'))}</button>${blocked ? `<button class="sa-btn" data-sa="munblock" data-id="${uid}">${saEsc(T('Unblock'))}</button>` : `<button class="sa-btn bad" data-sa="mblock" data-id="${uid}">${saEsc(T('Block this member'))}</button><p class="sa-fine" style="margin:0;color:var(--ink-2)">${saEsc(T('Blocked members cannot message you, invite you or share with you, and you will not see their messages. They are not told.'))}</p>`}</div><div class="sa-row" style="justify-content:flex-end;margin-top:14px"><button class="sa-btn" data-sa="close">${saEsc(T('Close'))}</button></div>`);
}
function saReportDialog(uid, mid){
  const name = SA.com.who[uid] || SA.com.names[uid] || T('A member');
  saModal(`<h2>${saEsc(T(mid ? 'Report message' : 'Report this member'))}</h2><p class="sa-sub" style="margin:0 0 10px" data-nt>${saEsc(name)}</p><form id="saRepF" data-u="${uid}" data-m="${mid || ''}"><fieldset class="sa-rr"><legend class="sr">${saEsc(T('Reason'))}</legend>${SA_REASONS.map((r, i) => `<label><input type="radio" name="saRR" value="${r[0]}"> ${saEsc(T(r[1]))}</label>`).join('')}</fieldset><label class="sa-field"><span>${saEsc(T('Details (optional)'))}</span><textarea id="saRepD" rows="3" maxlength="1000"></textarea></label><label class="sa-chk"><input type="checkbox" id="saRepB" ${SA.com.blocked && SA.com.blocked.has(uid) ? 'checked disabled' : ''}><span>${saEsc(T('Also block this member'))}</span></label><p class="sa-fine" style="color:var(--ink-2)">${saEsc(T('An administrator reviews every report, usually within 24 hours.'))}${mid ? ' ' + saEsc(T('A copy of the message is included.')) : ''}</p><div id="saRepRes"></div><div class="sa-row" style="justify-content:flex-end;margin-top:10px"><button type="button" class="sa-btn" data-sa="close">${saEsc(T('Cancel'))}</button><button class="sa-btn pri" type="submit" id="saRepGo">${saEsc(T('Send report'))}</button></div></form>`);
}
async function saReportSubmit(f){
  const go = sa$('#saRepGo'), res = sa$('#saRepRes'), r = f.querySelector('input[name=saRR]:checked');
  if (!r){ res.innerHTML = `<div class="sa-msg bad">${saEsc(T('Choose a reason.'))}</div>`; return; }
  go.disabled = true;
  try {
    const body = {reason: r.value, details: sa$('#saRepD').value.trim(), block: sa$('#saRepB').checked && !sa$('#saRepB').disabled};
    if (f.dataset.m) body.message_id = +f.dataset.m; else body.user_id = f.dataset.u;
    const out = await saApi('/api/community/report', {method: 'POST', body: JSON.stringify(body)});
    if (out.blocked) await saAfterBlock(f.dataset.u, true);
    f.innerHTML = `<div class="sa-msg ok">${saEsc(T('Thank you. Your report was sent to the administrators.'))}${out.blocked ? ' ' + saEsc(T('You have blocked this member.')) : ''}</div><div class="sa-row" style="justify-content:flex-end;margin-top:12px"><button type="button" class="sa-btn pri" data-sa="close">${saEsc(T('Close'))}</button></div>`;
  } catch (e) { res.innerHTML = `<div class="sa-msg bad">${saEsc(T(e.message || 'Request failed'))}</div>`; go.disabled = false; }
}
async function saAfterBlock(uid, on){
  SA.com.blocked = SA.com.blocked || new Set(); if (on) SA.com.blocked.add(uid); else SA.com.blocked.delete(uid);
  SA.com.sel.delete(uid);
  if (SA.view === 'community'){
    if (SA.com.tab === 'members'){ SA.com.dir.rows = SA.com.dir.rows.filter(r => !on || r.id !== uid); if (on) SA.com.dir.total = Math.max(0, SA.com.dir.total - 1); saDirPaint(); saSelPaint(); }
    if (SA.com.active) saMsgPaint(false);
  }
}
async function saBlock(uid, on){
  const q = on ? SA.sb.from('user_blocks').insert({blocker_id: SA.user.id, blocked_id: uid}) : SA.sb.from('user_blocks').delete().eq('blocker_id', SA.user.id).eq('blocked_id', uid);
  const {error} = await q;
  if (error && !/duplicate/i.test(error.message || '')){ toast(T(on ? 'Could not block this member.' : 'Could not unblock this member.')); return false; }
  await saAfterBlock(uid, on); toast(T(on ? 'Member blocked.' : 'Member unblocked.')); return true;
}
async function saBlockedList(){
  const box = sa$('#saBlocked'); if (!box) return;
  const {data, error} = await SA.sb.rpc('my_blocks');
  if (error){ box.innerHTML = `<p class="sa-sub">${saEsc(T('Not available yet.'))}</p>`; return; }
  box.innerHTML = (data || []).length ? `<ul class="sa-mem">${data.map(b => `<li><span data-nt><b>${saEsc(b.name)}</b></span><span class="sa-fine" style="color:var(--ink-2)">${saEsc(saDate(b.created_at))}</span><button class="sa-btn sm" data-sa="munblock" data-id="${b.id}">${saEsc(T('Unblock'))}</button></li>`).join('')}</ul>` : `<p class="sa-sub" style="margin:0">${saEsc(T('You have not blocked anyone.'))}</p>`;
}

/* ----- dialogs ----- */
function saResultHtml(r, verb){
  const why = {not_registered: 'is not a registered member', not_found: 'is not available', already: 'is already included', invalid: 'is not a valid email address', self: 'is your own address', limit: 'was left out (20 addresses at a time)', daily_limit: 'Daily invitation limit reached. Try again tomorrow.', failed: 'could not be added'};
  const done = r.invited || r.shared || [];
  let h = '';
  if (done.length) h += `<div class="sa-msg ok" style="margin-bottom:8px">${saEsc(T(verb))}: ${done.map(x => `<b data-nt>${saEsc(x.name)}</b>`).join(', ')}.${r.mail ? (r.emailed ? ` ${saEsc(T('Email sent to'))} ${r.emailed}.` : ` ${saEsc(T('The email could not be sent. They will still see it on their dashboard.'))}`) : ` ${saEsc(T('They will see it on their dashboard.'))}`}</div>`;
  const sk = (r.skipped || []);
  const lab = x => x.email || (x.id && SA.com.who[x.id]) || (x.id ? T('A member') : '');
  if (sk.length) h += `<div class="sa-msg warn">${sk.map(x => lab(x) ? `<span data-nt>${saEsc(lab(x))}</span> ${saEsc(T(why[x.reason] || why.failed))}` : saEsc(T(why[x.reason] || why.failed))).join('<br>')}</div>`;
  return h;
}
function saComDialog(kind, extra, opts){
  const c = kind === 'cinvite' || kind === 'cproj' ? saChatById(SA.com.active) : null;
  const ids = String(extra || '').split(',').filter(Boolean), who = ids.map(i => SA.com.who[i] || T('A member'));
  const people = `<p class="sa-sub" style="margin:0 0 10px" data-nt>${saEsc(who.slice(0, 6).join(', ') + (who.length > 6 ? ' +' + (who.length - 6) : ''))}</p>`;
  const projSel = opts ? `<label class="sa-field"><span>${saEsc(T('Project'))}</span><select id="saCProj" required>${opts}</select></label><label class="sa-field"><span>${saEsc(T('Message (optional)'))}</span><input id="saCNote" type="text" maxlength="500"></label>` : `<div class="sa-msg warn">${saEsc(T('You have no saved projects yet. Save a board to your account first.'))}</div>`;
  const groups = SA.com.chats.filter(g => g.kind === 'group' && g.my_status === 'joined' && g.my_role === 'owner');
  const f = {
    mshare: [ids.length > 1 ? T('Share a project with') + ' ' + ids.length + ' ' + T('members') : T('Share a project with') + ' ' + who[0], `${ids.length > 1 ? people : ''}<p class="sa-sub" style="margin:0 0 8px">${saEsc(T('They can view the board and save their own copy. Only you can change the original.'))}</p>${projSel}`, T('Share')],
    cproj: [T('Share a project in this chat'), `<p class="sa-sub" style="margin:0 0 8px">${saEsc(T('Everyone in this chat can view the board and save their own copy. Only you can change the original.'))}</p>${projSel}`, T('Share')],
    mgroup: [T('Start a group chat'), `${people}<label class="sa-field"><span>${saEsc(T('Group name'))}</span><input id="saCTitle" type="text" maxlength="100" required></label><p class="sa-fine" style="margin:0">${saEsc(T('The selected members get an invitation and join when they accept.'))}</p>`, T('Create group')],
    madd: [T('Add to my group'), `${people}<label class="sa-field"><span>${saEsc(T('Group'))}</span><select id="saCGroup">${groups.map(g => `<option value="${g.id}">${saEsc(g.title || T('Group chat'))}</option>`).join('')}</select></label>`, T('Send invitations')],
    cdirect: [T('New private chat'), `<label class="sa-field"><span>${saEsc(T('Email address of a registered member'))}</span><input id="saCEmail" type="email" autocomplete="off" maxlength="254" required></label>`, T('Start chat')],
    cgroup: [T('New group'), `<label class="sa-field"><span>${saEsc(T('Group name'))}</span><input id="saCTitle" type="text" maxlength="100" required></label><label class="sa-field"><span>${saEsc(T('Invite members by email'))}</span><textarea id="saCEmails" rows="3" placeholder="name@example.com, other@example.com"></textarea><small>${saEsc(T('Separate addresses with commas or new lines. Invited members get an email and a notification, and join when they accept.'))}</small></label>`, T('Create group')],
    cinvite: [T('Invite to') + ' ' + (c ? saChatName(c) : ''), `<label class="sa-field"><span>${saEsc(T('Invite members by email'))}</span><textarea id="saCEmails" rows="3" placeholder="name@example.com"></textarea></label>`, T('Send invitations')],
    cshare: [T('Share project'), `<p class="sa-sub" style="margin:0 0 8px">${saEsc(T('Registered members can view the board and save their own copy. Only you can change the original.'))}</p><label class="sa-field"><span>${saEsc(T('Share with (email addresses)'))}</span><textarea id="saCEmails" rows="2" placeholder="name@example.com"></textarea></label><label class="sa-field"><span>${saEsc(T('Message (optional)'))}</span><input id="saCNote" type="text" maxlength="500"></label>`, T('Share')],
  }[kind];
  const noProj = (kind === 'mshare' || kind === 'cproj') && !opts;
  saModal(`<h2 data-nt>${saEsc(f[0])}</h2><form id="saCForm" data-k="${kind}" data-x="${saEsc(extra || '')}">${f[1]}<div id="saCRes" style="margin-top:10px"></div><div class="sa-row" style="margin-top:14px;justify-content:flex-end"><button type="button" class="sa-btn" data-sa="close">${saEsc(T('Close'))}</button>${noProj ? '' : `<button class="sa-btn pri" type="submit" id="saCGo">${saEsc(f[2])}</button>`}</div></form>`);
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
    const ids = String(form.dataset.x || '').split(',').filter(Boolean);
    if (kind === 'mshare'){
      const r = await saApi('/api/community/share', {method: 'POST', body: JSON.stringify({project_id: v('saCProj'), user_ids: ids, note: v('saCNote')})});
      res.innerHTML = saResultHtml(r, 'Shared with'); go.disabled = false; if ((r.shared || []).length) saComLoad(); return;
    }
    if (kind === 'cproj'){
      const cid = SA.com.active;
      const r = await saApi('/api/community/share', {method: 'POST', body: JSON.stringify({project_id: v('saCProj'), chat_id: cid, note: v('saCNote')})});
      saModalClose();
      if (r.message && SA.com.active === cid && !SA.com.msgs.some(m => m.id === r.message.id)){ SA.com.msgs.push(r.message); SA.com.lastId = Math.max(SA.com.lastId, r.message.id); saMsgPaint(true); }
      const c = saChatById(cid); if (c && r.message){ c.last_body = r.message.body || '▦ ' + r.message.project_name; c.last_sender = saName(); saChatListPaint(); }
      saComLoad(); return;
    }
    if (kind === 'mgroup'){
      if (!v('saCTitle')){ res.innerHTML = `<div class="sa-msg bad">${saEsc(T('Give the group a name.'))}</div>`; go.disabled = false; return; }
      const r = await saApi('/api/community/group', {method: 'POST', body: JSON.stringify({title: v('saCTitle'), user_ids: ids})});
      SA.com.sel.clear(); SA.com.active = r.chat_id; SA.com.tab = 'chats';
      res.innerHTML = saResultHtml(r, 'Invited'); go.hidden = true; const cl = form.querySelector('[data-sa=close]'); cl.textContent = T('Open group'); cl.className = 'sa-btn pri'; cl.dataset.sa = 'cgo';
      return;
    }
    if (kind === 'madd'){
      const r = await saApi('/api/community/invite', {method: 'POST', body: JSON.stringify({chat_id: v('saCGroup'), user_ids: ids})});
      res.innerHTML = saResultHtml(r, 'Invited'); go.disabled = false; if ((r.invited || []).length){ SA.com.sel.clear(); saDirPaint(); saSelPaint(); saComLoad(); } return;
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

/* ----- member directory ----- */
const saSelIds = () => [...SA.com.sel.keys()];
function saMembers(){
  const b = sa$('#saComBody'); if (!b) return;
  b.innerHTML = `<div class="sa-row sa-dirhd"><label class="sr" for="saDirQ">${saEsc(T('Search members'))}</label><input class="sa-in" id="saDirQ" type="search" autocomplete="off" placeholder="${saEsc(T('Search by name, company, country or occupation'))}" value="${saEsc(SA.com.dir.q)}"><span class="sa-sub" id="saDirN" style="margin:0"></span></div>
  <p class="sa-fine sa-dirnote">${saEsc(T('Tick members to start a group, share a project or add them to one of your groups. Email addresses are never shown.'))}</p>
  <div id="saDirList" class="sa-dir"></div><div id="saDirMore" style="margin-top:12px;text-align:center"></div><div id="saSelBar" class="sa-selbar" role="region" aria-label="${saEsc(T('Selected members'))}" hidden></div>`;
  saDirLoad(true); saSelPaint();
}
async function saDirLoad(reset){
  const d = SA.com.dir, seq = ++d.seq;
  if (reset){ d.rows = []; d.total = 0; }
  d.loading = true; saDirPaint();
  const {data, error} = await SA.sb.rpc('member_directory', {q: d.q, lim: 60, off: d.rows.length});
  if (seq !== d.seq || SA.com.tab !== 'members') return;
  d.loading = false;
  if (error){ d.err = /member_directory|schema cache|does not exist|function/i.test(error.message || '') ? 'The member list is not set up yet. The site owner needs to run the 0005_members_files.sql migration in Supabase.' : 'Members could not be loaded. Check your connection and try again.'; saDirPaint(); return; }
  d.err = null; const rows = data || [];
  rows.forEach(r => { SA.com.who[r.id] = r.name; });
  d.rows = d.rows.concat(rows.filter(r => !d.rows.some(x => x.id === r.id)));
  d.total = rows.length ? +rows[0].total : (reset ? 0 : d.total);
  saDirPaint();
}
function saMemberCard(m){
  const on = SA.com.sel.has(m.id), ini = m.name.split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?';
  const line1 = [m.occupation ? T(m.occupation) : '', m.company].filter(Boolean).join(' · ');
  const line2 = [m.country, T('Member since') + ' ' + saDate(m.member_since)].filter(Boolean).join(' · ');
  return `<article class="sa-mcard ${on ? 'on' : ''}"><label class="sa-mchk"><input type="checkbox" data-sa="msel" data-id="${m.id}" ${on ? 'checked' : ''} aria-label="${saEsc(T('Select') + ' ' + m.name)}"></label><span class="sa-cav" aria-hidden="true" data-nt>${saEsc(ini)}</span><div class="tx"><b data-nt>${saEsc(m.name)}</b>${line1 ? `<span data-nt>${saEsc(line1)}</span>` : ''}<span data-nt>${saEsc(line2)}</span></div><div class="acts"><button class="sa-btn pri sm" data-sa="mchat" data-id="${m.id}">${saEsc(T('Message'))}</button><button class="sa-btn sm" data-sa="mshare" data-id="${m.id}">${saEsc(T('Share project'))}</button><button class="sa-btn sm" data-sa="mfile" data-id="${m.id}">${saEsc(T('Send file'))}</button><button class="sa-btn sm sa-mopt" data-sa="mopts" data-id="${m.id}" aria-label="${saEsc(T('Report or block') + ': ' + m.name)}" title="${saEsc(T('Report or block'))}">⋯</button></div></article>`;
}
function saDirPaint(){
  const l = sa$('#saDirList'), n = sa$('#saDirN'), more = sa$('#saDirMore'), d = SA.com.dir; if (!l) return;
  if (d.err){ l.innerHTML = `<div class="sa-msg warn">${saEsc(T(d.err))}</div>`; n.textContent = ''; more.innerHTML = ''; return; }
  if (!d.rows.length){ l.innerHTML = `<div class="sa-empty">${saEsc(T(d.loading ? 'Loading…' : d.q ? 'No members match your search.' : 'No other members yet.'))}</div>`; n.textContent = ''; more.innerHTML = ''; return; }
  l.innerHTML = d.rows.map(saMemberCard).join('');
  n.textContent = d.total + ' ' + T(d.total === 1 ? 'member' : 'members');
  more.innerHTML = d.rows.length < d.total ? `<button class="sa-btn" data-sa="mmore" ${d.loading ? 'disabled' : ''}>${saEsc(T(d.loading ? 'Loading…' : 'Show more members'))}</button>` : '';
}
function saSelPaint(){
  const bar = sa$('#saSelBar'); if (!bar) return;
  const n = SA.com.sel.size; bar.hidden = !n; if (!n) return;
  const owned = SA.com.chats.filter(c => c.kind === 'group' && c.my_status === 'joined' && c.my_role === 'owner').length;
  bar.innerHTML = `<b>${n} ${saEsc(T('selected'))}</b><span class="sa-row">${n === 1 ? `<button class="sa-btn pri sm" data-sa="mchat" data-id="${saSelIds()[0]}">${saEsc(T('Message'))}</button>` : ''}<button class="sa-btn ${n > 1 ? 'pri' : ''} sm" data-sa="mgroup">${saEsc(T('Start a group chat'))}</button><button class="sa-btn sm" data-sa="mshare">${saEsc(T('Share project'))}</button>${owned ? `<button class="sa-btn sm" data-sa="madd">${saEsc(T('Add to my group'))}</button>` : ''}<button class="sa-btn sm" data-sa="mclear">${saEsc(T('Clear'))}</button></span>`;
}
async function saOpenDirect(uid){
  const r = await saApi('/api/community/direct', {method: 'POST', body: JSON.stringify({user_id: uid})});
  SA.com.tab = 'chats'; SA.com.active = r.chat_id; await saComLoad(); await saViewCommunity(sa$('#saas'));
  return r.chat_id;
}
async function saProjOptions(){
  if (!SA.projects || !SA.projects.length) await saListProjects();
  return (SA.projects || []).map(p => `<option value="${p.id}">${saEsc(p.name)}</option>`).join('');
}

/* ----- files and projects inside chats ----- */
const saImg = t => /^image\/(png|jpe?g|gif|webp)$/i.test(t || '');
const saSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : (n || 0) + ' B';
async function saSign(msgs){
  const now = Date.now(), need = {v: [], d: []};
  msgs.forEach(m => { const a = m.attachment; if (!a || !a.path) return;
    const k = saImg(a.type) ? 'v' : 'd', c = SA.com.urls[a.path + '|' + k]; if (!c || c.exp < now) need[k].push(a.path); });
  let changed = false;
  for (const k of ['v', 'd']){
    if (!need[k].length) continue;
    const {data, error} = await SA.sb.storage.from('chat-files').createSignedUrls([...new Set(need[k])], 3600, k === 'd' ? {download: true} : undefined);
    if (error || !data) continue;
    data.forEach(x => { if (x.signedUrl && x.path) { SA.com.urls[x.path + '|' + k] = {u: x.signedUrl, exp: now + 3300000}; changed = true; } });
  }
  if (changed) saMsgPaint(false);
}
function saFileHtml(m){
  const a = m.attachment, img = saImg(a.type), u = SA.com.urls[a.path + '|' + (img ? 'v' : 'd')];
  const ext = ((a.name || '').match(/\.([a-z0-9]{1,5})$/i) || ['', T('File')])[1].toUpperCase();
  if (img) return `<a class="sa-fimg" ${u ? `href="${saEsc(u.u)}"` : ''} target="_blank" rel="noopener" title="${saEsc(a.name)}">${u ? `<img src="${saEsc(u.u)}" alt="${saEsc(a.name)}" loading="lazy">` : `<span>${saEsc(T('Loading…'))}</span>`}</a>`;
  return `<a class="sa-file" ${u ? `href="${saEsc(u.u)}"` : 'aria-disabled="true"'} target="_blank" rel="noopener" download="${saEsc(a.name)}"><span class="ic" aria-hidden="true">${saEsc(ext)}</span><span class="nm"><b>${saEsc(a.name)}</b><em>${saEsc(saSize(a.size))} · ${saEsc(T('Download'))}</em></span></a>`;
}
function saProjMsgHtml(m, mine){
  const act = !m.project_id ? `<em>${saEsc(T('No longer available'))}</em>` : mine ? `<button class="sa-btn sm" data-sa="popen" data-id="${m.project_id}">${saEsc(T('Open'))}</button>` : `<button class="sa-btn sm pri" data-sa="pcopy" data-id="${m.project_id}" data-from="${saEsc(SA.com.names[m.sender_id] || '')}">${saEsc(T('Open a copy'))}</button>`;
  return `<span class="sa-pcard"><span class="ic" aria-hidden="true">▦</span><span class="nm"><b>${saEsc(m.project_name)}</b><em>${saEsc(T('Shared project'))}</em></span>${act}</span>`;
}
function saUpPaint(){
  const b = sa$('#saUps'); if (!b) return;
  const list = SA.com.uploads.filter(u => u.chat === SA.com.active);
  b.innerHTML = list.map(u => `<div class="sa-up ${u.err ? 'bad' : ''}"><span data-nt>${saEsc(u.name)}</span><em>${saEsc(u.err ? T(u.err) : T('Uploading…'))}</em>${u.err ? `<button class="sa-link" data-sa="updismiss" data-id="${u.id}">${saEsc(T('Dismiss'))}</button>` : ''}</div>`).join('');
}
async function saUpload(files, chatId){
  chatId = chatId || SA.com.active; if (!chatId) return;
  for (const f of [...files].slice(0, 10)){
    const u = {id: crypto.randomUUID(), chat: chatId, name: f.name || 'file', err: null}; SA.com.uploads.push(u); saUpPaint();
    if (f.size > SA_FILE_MAX){ u.err = 'Larger than 25 MB, not sent.'; saUpPaint(); continue; }
    if (!f.size){ u.err = 'The file is empty.'; saUpPaint(); continue; }
    const safe = (u.name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').replace(/^[._]+/, '') || 'file').slice(-120);
    const path = `${chatId}/${crypto.randomUUID()}/${safe}`;
    const up = await SA.sb.storage.from('chat-files').upload(path, f, {contentType: f.type || 'application/octet-stream', upsert: false});
    if (up.error){ u.err = /not found|bucket/i.test(up.error.message || '') ? 'File sharing is not set up yet.' : /size|large|413/i.test(up.error.message || '') ? 'Larger than 25 MB, not sent.' : 'Upload failed. Try again.'; saUpPaint(); continue; }
    const {data, error} = await SA.sb.from('chat_messages').insert({chat_id: chatId, body: '', attachment: {path, name: u.name.slice(0, 180), size: f.size, type: f.type || ''}}).select('id,sender_id,body,created_at,attachment,project_id,project_name').single();
    if (error){ SA.sb.storage.from('chat-files').remove([path]).then(() => {}, () => {}); u.err = /Daily file limit/i.test(error.message || '') ? 'Daily file limit reached. Try again tomorrow.' : /too quickly/i.test(error.message || '') ? 'You are sending messages too quickly. Wait a moment.' : 'The file could not be sent.'; saUpPaint(); continue; }
    SA.com.uploads = SA.com.uploads.filter(x => x !== u); saUpPaint();
    if (SA.com.active === chatId && !SA.com.msgs.some(m => m.id === data.id)){ SA.com.msgs.push(data); SA.com.lastId = Math.max(SA.com.lastId, data.id); await saSign([data]); saMsgPaint(true); }
    const c = saChatById(chatId); if (c){ c.last_body = '📎 ' + data.attachment.name; c.last_sender = saName(); saChatListPaint(); }
  }
}
function saPickFiles(then){
  const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.style.display = 'none';
  i.addEventListener('change', () => { const f = [...i.files]; i.remove(); if (f.length) then(f); });
  document.body.appendChild(i); i.click();
}
async function saCopyShared(pid, from){
  const {data, error} = await SA.sb.from('projects').select('name,data').eq('id', pid).maybeSingle();
  if (error || !data){ toast(T('That project is no longer shared with you.')); return; }
  const p = data.data;
  if (!p || !p.circuits || !p.modules || !STD[p.std]){ toast(T('This project could not be read.')); return; }
  try { const row = await saCreateProject(p, (data.name + (from ? ' (from ' + from + ')' : ' (copy)')).slice(0, 200)); await saOpenProject(row.id); } catch (e) { toast(saErr(e)); }
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
  await saCopyShared(s.project_id, s.other_name);
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
  else if (a === 'msel'){ if (b.checked) SA.com.sel.set(id, SA.com.who[id] || ''); else SA.com.sel.delete(id); const card = b.closest('.sa-mcard'); if (card) card.classList.toggle('on', b.checked); saSelPaint(); }
  else if (a === 'mclear'){ SA.com.sel.clear(); saDirPaint(); saSelPaint(); }
  else if (a === 'mmore'){ saDirLoad(false); }
  else if (a === 'mchat'){ b.disabled = true; try { await saOpenDirect(id); } catch (e) { toast(T(e.message || 'Request failed')); b.disabled = false; } }
  else if (a === 'mfile'){ saPickFiles(async files => { try { const cid = await saOpenDirect(id); await saUpload(files, cid); } catch (e) { toast(T(e.message || 'Request failed')); } }); }
  else if (a === 'mshare'){ const ids = id ? [id] : saSelIds(); if (!ids.length) return; b.disabled = true; const o = await saProjOptions().catch(() => ''); b.disabled = false; saComDialog('mshare', ids.join(','), o); }
  else if (a === 'mgroup'){ if (SA.com.sel.size) saComDialog('mgroup', saSelIds().join(',')); }
  else if (a === 'madd'){ if (SA.com.sel.size) saComDialog('madd', saSelIds().join(',')); }
  else if (a === 'cattach'){ const i = sa$('#saFileIn'); if (i) i.click(); }
  else if (a === 'cproj'){ b.disabled = true; const o = await saProjOptions().catch(() => ''); b.disabled = false; saComDialog('cproj', '', o); }
  else if (a === 'popen'){ b.disabled = true; try { await saOpenProject(id); } catch (e) { toast(saErr(e)); } b.disabled = false; }
  else if (a === 'pcopy'){ b.disabled = true; await saCopyShared(id, b.dataset.from); b.disabled = false; }
  else if (a === 'mopts'){ saOptsDialog(id); }
  else if (a === 'mreport'){ saReportDialog(b.dataset.u); }
  else if (a === 'mrep'){ saReportDialog(b.dataset.u, id); }
  else if (a === 'mblock'){
    if (b.dataset.sure !== '1'){ b.dataset.sure = '1'; b.textContent = T('Click again to block'); return; }
    b.disabled = true; if (await saBlock(id, true)) saModalClose(); else b.disabled = false;
  }
  else if (a === 'munblock'){ b.disabled = true; if (await saBlock(id, false)){ if (sa$('#saModal')) saModalClose(); saBlockedList(); } else b.disabled = false; }
  else if (a === 'updismiss'){ SA.com.uploads = SA.com.uploads.filter(u => u.id !== id); saUpPaint(); }
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
  else if (ev.target.id === 'saRepF'){ ev.preventDefault(); saReportSubmit(ev.target); }
  else if (ev.target.id === 'saSend'){ ev.preventDefault(); saSendMsg(); }
});
document.addEventListener('change', ev => {
  if (ev.target.id === 'saFileIn'){ const f = [...ev.target.files]; ev.target.value = ''; if (f.length) saUpload(f); }
});
document.addEventListener('input', ev => {
  if (ev.target.id !== 'saDirQ') return;
  clearTimeout(SA.com.dir.t); const q = ev.target.value.trim().slice(0, 80);
  SA.com.dir.t = setTimeout(() => { if (q !== SA.com.dir.q){ SA.com.dir.q = q; saDirLoad(true); } }, 300);
});
/* drag files onto an open chat */
['dragenter', 'dragover'].forEach(t => document.addEventListener(t, ev => { const th = ev.target.closest && ev.target.closest('#saCThread'); if (!th || !SA.com.active || !(ev.dataTransfer && [...ev.dataTransfer.types].includes('Files'))) return; ev.preventDefault(); th.classList.add('drop'); }));
['dragleave', 'drop'].forEach(t => document.addEventListener(t, ev => { const th = ev.target.closest && ev.target.closest('#saCThread'); if (!th) return; if (t === 'dragleave' && th.contains(ev.relatedTarget)) return; th.classList.remove('drop'); if (t === 'drop' && SA.com.active && ev.dataTransfer && ev.dataTransfer.files.length){ ev.preventDefault(); saUpload(ev.dataTransfer.files); } }));
document.addEventListener('paste', ev => { if (ev.target.id !== 'saMsgIn' || !SA.com.active) return; const f = [...((ev.clipboardData && ev.clipboardData.files) || [])]; if (f.length){ ev.preventDefault(); saUpload(f); } });
document.addEventListener('keydown', ev => {
  if (ev.target.id === 'saMsgIn' && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing){ ev.preventDefault(); saSendMsg(); }
  if (ev.key === 'Escape'){ const op = sa$('#saBell'); if (op){ op.remove(); SA.notif.open = false; } }
});
/* notifications refresh while the page is open and visible */
setInterval(() => { if (SA.user && SA.user.email_confirmed_at && SA.cfg && SA.cfg.communityEnabled !== false && document.visibilityState === 'visible') saNotifLoad(); }, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && SA.user) saNotifLoad(); });
