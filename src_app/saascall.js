/* ---------- calls (Cloudflare RealtimeKit) and instant notifications ---------- */
SA.call = {open: false, ringing: null, ringTimer: null, audio: null, chan: null, seen: new Set()};

/* Join (and optionally start and ring) the call of a chat, then show the call screen. */
async function saCall(chatId, video, ring){
  if (SA.call.open){ toast(T('You are already in a call.')); return; }
  saRingStop();
  let r;
  try { r = await saApi('/api/community/call', {method: 'POST', body: JSON.stringify({chat_id: chatId, video: !!video, ring: !!ring})}); }
  catch (e) { toast(T(e.message || 'Request failed')); return; }
  if (r.message && SA.com.active === chatId && !SA.com.msgs.some(m => m.id === r.message.id)){ SA.com.msgs.push(r.message); SA.com.lastId = Math.max(SA.com.lastId, r.message.id); saMsgPaint(true); }
  saCallOpen(r.token, video);
}
function saCallOpen(token, video){
  const page = SA_NATIVE ? 'call.html' : '/call';
  const w = document.createElement('div'); w.className = 'sa-callwrap'; w.id = 'saCallWrap'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', T('Call'));
  w.innerHTML = `<iframe title="${saEsc(T('Call'))}" allow="camera; microphone; display-capture; autoplay; fullscreen; clipboard-write" src="${page}#t=${encodeURIComponent(token)}&v=${video ? 1 : 0}"></iframe><button class="sa-callx" data-sa="callx" aria-label="${saEsc(T('Close the call window'))}">✕</button>`;
  document.body.appendChild(w); document.documentElement.classList.add('sa-incall'); SA.call.open = true;
}
function saCallClose(){
  const w = sa$('#saCallWrap'); if (w) w.remove();
  document.documentElement.classList.remove('sa-incall'); SA.call.open = false;
  if (SA.view === 'community' && SA.com.active) saMsgFetch(false);
}
window.addEventListener('message', ev => { if (ev.origin === location.origin && ev.data && ev.data.type === 'dbd-call-ended') saCallClose(); });

/* Call card shown in the chat. */
function saCallMsgHtml(m, mine){
  const v = m.call && m.call.video, who = mine ? T('You') : (SA.com.names[m.sender_id] || T('A member'));
  const recent = Date.now() - new Date(m.created_at).getTime() < 3 * 3600000;
  return `<span class="sa-pcard sa-callcard"><span class="ic" aria-hidden="true">${v ? '📹' : '📞'}</span><span class="nm"><b>${saEsc(T(v ? 'Video call' : 'Audio call'))}</b><em data-nt>${saEsc(T('Started by'))} ${saEsc(who)}</em></span>${recent ? `<button class="sa-btn sm pri" data-sa="calljoin" data-id="${m.chat_id || SA.com.active}" data-v="${v ? 1 : 0}">${saEsc(T('Join'))}</button>` : ''}</span>`;
}

/* ----- ringing ----- */
function saRingSound(on){
  try {
    if (!on){ if (SA.call.audio){ SA.call.audio.close(); SA.call.audio = null; } return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C || SA.call.audio) return;
    const ctx = new C(); SA.call.audio = ctx;
    const beep = t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 660; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); o.start(t); o.stop(t + 0.42); };
    for (let i = 0; i < 15; i++){ beep(ctx.currentTime + i * 2); beep(ctx.currentTime + i * 2 + 0.5); }
  } catch (e) {}
}
function saRingStop(){
  clearTimeout(SA.call.ringTimer); saRingSound(false);
  const b = sa$('#saRing'); if (b) b.remove(); SA.call.ringing = null;
}
function saRing(n){
  if (SA.call.open || SA.call.seen.has(n.id)) return;
  if (Date.now() - new Date(n.created_at).getTime() > 60000) return;   // only ring for calls started in the last minute
  SA.call.seen.add(n.id); saRingStop(); SA.call.ringing = n;
  const video = /video/i.test(n.body || '');
  const d = document.createElement('div'); d.id = 'saRing'; d.className = 'sa-ring'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-label', T('Incoming call'));
  d.innerHTML = `<span class="ic" aria-hidden="true">${video ? '📹' : '📞'}</span><span class="tx"><b data-nt>${saEsc(n.title)}</b><span data-nt>${saEsc(n.body)}</span></span><span class="sa-row"><button class="sa-btn bad sm" data-sa="ringno">${saEsc(T('Decline'))}</button><button class="sa-btn pri sm" data-sa="ringyes" data-id="${n.ref_id}" data-v="${video ? 1 : 0}">${saEsc(T('Join'))}</button></span>`;
  document.body.appendChild(d); saRingSound(true);
  SA.call.ringTimer = setTimeout(saRingStop, 45000);
}

/* Instant notifications (Supabase Realtime). The 30-second refresh stays as a fallback. */
function saLive(){
  if (!SA.sb || !SA.user || !SA.user.email_confirmed_at || SA.call.chan || typeof SA.sb.channel !== 'function') return;
  try {
    SA.call.chan = SA.sb.channel('notif-' + SA.user.id)
      .on('postgres_changes', {event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + SA.user.id}, p => {
        const n = p && p.new; if (!n) return;
        if (!SA.notif.list.some(x => x.id === n.id)){ SA.notif.list.unshift(n); saBadge(); if (SA.notif.open) saBellPaint(); }
        if (n.kind === 'call') saRing(n);
        else if (n.kind === 'chat_message' && SA.view === 'community'){ if (SA.com.active === n.ref_id) saMsgFetch(false); saComLoad().then(() => { if (SA.com.tab === 'chats') saChatListPaint(); }); }
      })
      .subscribe();
  } catch (e) { SA.call.chan = null; }
}
function saLiveStop(){ try { if (SA.call.chan) SA.sb.removeChannel(SA.call.chan); } catch (e) {} SA.call.chan = null; }

document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-sa]'); if (!b) return;
  const a = b.dataset.sa;
  if (a === 'callstart'){ b.disabled = true; await saCall(SA.com.active, b.dataset.v === '1', true); b.disabled = false; }
  else if (a === 'calljoin'){ b.disabled = true; await saCall(b.dataset.id, b.dataset.v === '1', false); b.disabled = false; }
  else if (a === 'ringyes'){ const n = SA.call.ringing; saRingStop(); if (n) saNotifRead([n.id]); await saCall(b.dataset.id, b.dataset.v === '1', false); }
  else if (a === 'ringno'){ const n = SA.call.ringing; saRingStop(); if (n) saNotifRead([n.id]); }
  else if (a === 'callx'){ const f = sa$('#saCallWrap iframe'); try { f.contentWindow.postMessage({type: 'dbd-call-leave'}, location.origin); } catch (e) {} setTimeout(saCallClose, 600); }
});
/* Start listening once signed in; ring for calls found by the regular refresh too. */
setInterval(() => {
  if (SA.user && SA.user.email_confirmed_at && SA.cfg && SA.cfg.communityEnabled !== false){
    saLive();
    SA.notif.list.filter(n => n.kind === 'call' && !n.read_at).forEach(saRing);
  } else saLiveStop();
}, 3000);
