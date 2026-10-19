
/* ---------- cloud projects ---------- */
const SA_COLS = 'id,name,meta,created_at,updated_at,last_opened_at';
function saBlank(name){ return Object.assign(exampleProject(), {name: name || 'New board', circuits: [], modules: [], order: []}); }
function saMeta(p){ return {circuits: (p.circuits || []).length, modules: (p.modules || []).length, std: p.std || '', sys: p.sys || ''}; }
async function saListProjects(){
  const {data, error} = await SA.sb.from('projects').select(SA_COLS).order('updated_at', {ascending: false}).limit(500);
  if (error){ SA.listErr = saErr(error); return []; }
  SA.listErr = null; SA.projects = data || []; return SA.projects;
}
async function saCreateProject(data, name){
  const nm = (name || data.name || 'New board').slice(0, 200);
  const {data: row, error} = await SA.sb.from('projects').insert({name: nm, data: Object.assign({}, data, {name: nm}), meta: saMeta(data), last_opened_at: new Date().toISOString()}).select(SA_COLS).single();
  if (error) throw error;
  saTrack('project_created'); return row;
}
async function saOpenProject(id){
  const {data: row, error} = await SA.sb.from('projects').select('id,name,data,updated_at').eq('id', id).maybeSingle();
  if (error || !row){ toast(error ? saErr(error) : 'That project no longer exists.'); return false; }
  const p = row.data;
  if (!p || !p.circuits || !p.modules || !STD[p.std]){ toast('This project could not be read.'); return false; }
  S = p; S.name = row.name; S.order = S.order || []; sel = null;
  SA.cloudId = row.id; SA.rev = row.updated_at; SA.dirty = false;
  SA.sb.from('projects').update({last_opened_at: new Date().toISOString()}).eq('id', id).then(() => {}, () => {});
  saTrack('project_opened');
  saGo('app'); saChip(); syncHeader(); refresh(true);
  return true;
}
function saCloseProject(){ SA.cloudId = null; SA.rev = null; SA.dirty = false; clearTimeout(SA.saveT); }
function saOpenLocal(){ saCloseProject(); S = load(); S.order = S.order || []; sel = null; saGo('app'); saChip(); syncHeader(); refresh(true); }
async function saNewProject(){
  try { const row = await saCreateProject(saBlank('New board'), 'New board'); await saOpenProject(row.id); }
  catch (e) { toast(saErr(e)); }
}
/* auto-save: wrap persist() so local-only behaviour is unchanged when no cloud project is open */
const saPersistLocal = persist;
persist = function(){
  if (SA.sb && SA.user && SA.cloudId && !SA.offlineOnly){
    try { localStorage.setItem('dbd_cloudcache_' + SA.cloudId, JSON.stringify({rev: SA.rev, at: Date.now(), data: S})); } catch (e) {}   // never overwrites the local project
    SA.dirty = true; saChip(); clearTimeout(SA.saveT); SA.saveT = setTimeout(saFlush, 1500); return;
  }
  return saPersistLocal();
};
async function saFlush(){
  if (!SA.cloudId || !SA.dirty) return;
  if (SA.saving){ SA.saveT = setTimeout(saFlush, 800); return; }
  if (!navigator.onLine){ SA.chip = 'offline'; saChip(); return; }
  SA.saving = true; SA.chip = 'busy'; saChip();
  const snap = JSON.parse(JSON.stringify(S)), id = SA.cloudId;
  const {data, error} = await SA.sb.from('projects').update({name: (snap.name || 'Untitled board').slice(0, 200), data: snap, meta: saMeta(snap)}).eq('id', id).eq('updated_at', SA.rev).select('updated_at');
  SA.saving = false;
  if (id !== SA.cloudId) return;
  if (error){ SA.chip = 'bad'; saChip(); if (/jwt|401/i.test(error.message || '')) { toast('Your session has expired. Sign in again.'); } return; }
  if (!data || !data.length){ SA.chip = 'bad'; saChip(); saConflict(id); return; }
  SA.rev = data[0].updated_at; SA.dirty = JSON.stringify(S) !== JSON.stringify(snap); SA.chip = null; saChip();
  if (SA.dirty) SA.saveT = setTimeout(saFlush, 800);
}
function saConflict(id){
  if (SA.conflictOpen) return; SA.conflictOpen = true;
  saModal(`<h2>${saEsc(T('This project changed on another device'))}</h2><p>${saEsc(T('A newer version of this project was saved from another device or tab. Choose which version to keep.'))}</p>
  <div class="sa-row"><button class="sa-btn pri" data-sa="keepmine">${saEsc(T('Keep my version'))}</button><button class="sa-btn" data-sa="loadcloud">${saEsc(T('Load the saved version'))}</button></div>`, () => { SA.conflictOpen = false; });
}
async function saKeepMine(){
  const {data} = await SA.sb.from('projects').select('updated_at').eq('id', SA.cloudId).maybeSingle();
  if (data) SA.rev = data.updated_at; SA.conflictOpen = false; saModalClose(); SA.dirty = true; saFlush();
}
async function saLoadCloud(){ const id = SA.cloudId; SA.conflictOpen = false; saModalClose(); SA.dirty = false; await saOpenProject(id); }
async function saRename(id, cur){
  const nm = prompt(T('Project name'), cur); if (nm === null) return; const n = nm.trim().slice(0, 200); if (!n) return;
  const {data: row} = await SA.sb.from('projects').select('data').eq('id', id).maybeSingle();
  const upd = {name: n}; if (row && row.data) upd.data = Object.assign({}, row.data, {name: n});
  const {error} = await SA.sb.from('projects').update(upd).eq('id', id);
  if (error) toast(saErr(error)); else { if (id === SA.cloudId) S.name = n; await saListProjects(); saRender(); }
}
async function saDuplicate(id){
  const {data: row, error} = await SA.sb.from('projects').select('name,data').eq('id', id).maybeSingle();
  if (error || !row){ toast(error ? saErr(error) : 'That project no longer exists.'); return; }
  try { await saCreateProject(row.data, (row.name + ' (copy)').slice(0, 200)); toast('Project duplicated.'); await saListProjects(); saRender(); } catch (e) { toast(saErr(e)); }
}
async function saDelete(id, nm){
  if (!confirm(T('Delete this project permanently?') + '\n\n' + nm)) return;
  const {error} = await SA.sb.from('projects').delete().eq('id', id);
  if (error){ toast(saErr(error)); return; }
  try { localStorage.removeItem('dbd_cloudcache_' + id); } catch (e) {}
  if (id === SA.cloudId) saCloseProject();
  toast('Project deleted.'); await saListProjects(); saRender();
}
async function saSaveCurrentToCloud(){
  try { const row = await saCreateProject(S, S.name || 'Untitled board'); SA.cloudId = row.id; SA.rev = row.updated_at; SA.dirty = false; saChip(); toast('Saved to your account.'); await saListProjects(); }
  catch (e) { toast(saErr(e)); }
}
/* local project -> cloud, only when the user asks. The local copy is never removed. */
function saLocalProject(){ try { const j = localStorage.getItem(KEY); if (!j) return null; const p = JSON.parse(j); return p && p.circuits && p.modules && STD[p.std] ? p : null; } catch (e) { return null; } }
async function saMigrate(){
  const p = saLocalProject(); if (!p) return;
  try { await saCreateProject(p, (p.name || 'Imported board').slice(0, 200)); try { localStorage.setItem('dbd_migrated_' + SA.user.id, '1'); } catch (e) {} toast('Uploaded to your account. The copy on this device is untouched.'); await saListProjects(); saRender(); }
  catch (e) { toast(saErr(e)); }
}

/* ---------- modal ---------- */
function saModal(html, onClose){
  saModalClose(); const m = document.createElement('div'); m.className = 'sa-modal'; m.id = 'saModal'; m.innerHTML = `<div class="sa-dlg" role="dialog" aria-modal="true">${html}</div>`;
  m._close = onClose; document.body.appendChild(m); const f = m.querySelector('input,textarea,button,select'); if (f) f.focus();
}
function saModalClose(){ const m = sa$('#saModal'); if (m){ if (m._close) m._close(); m.remove(); } }
const SA_LEGAL = {
  terms: ['Terms and Conditions', `<p><i>Template for the service operator. Have it reviewed by a qualified lawyer and adapt it before public launch.</i></p>
  <h3>1. The service</h3><p>DBoard Designer is a design aid for electrical distribution boards. Results (cable sizes, voltage drop, loads, bills of materials) are indicative.</p>
  <h3>2. Professional responsibility</h3><p>You are responsible for checking every design against the wiring regulations that apply where it is built, and for having it verified by a competent person before installation.</p>
  <h3>3. Your account</h3><p>Keep your password confidential. You are responsible for activity under your account. Provide accurate registration details.</p>
  <h3>4. Your content</h3><p>You own the projects you create. You grant the operator the right to store and process them to run the service for you.</p>
  <h3>5. Acceptable use</h3><p>Do not attempt to access other users' data, disrupt the service or use it unlawfully. Accounts that do so may be suspended.</p>
  <h3>6. Availability and liability</h3><p>The service is provided as is during beta. To the extent the law allows, the operator is not liable for losses arising from its use. Keep your own exports of important projects.</p>
  <h3>7. Ending your account</h3><p>You can delete your account at any time in Account settings. Your projects and profile are then permanently removed.</p>`],
  privacy: ['Privacy Policy', `<p><i>Template for the service operator. Complete the operator details and have it reviewed before public launch.</i></p>
  <h3>What we collect</h3><p>Name, email address, country, occupation and optional company, which you give when registering. Your projects. Basic usage events (sign-ins, project opened or created, exports, tools opened) and any feedback you send.</p>
  <h3>Why</h3><p>To run your account, store your projects, secure the service and understand which features are used. We do not sell personal data and do not show advertising.</p>
  <h3>Passwords</h3><p>Passwords are never stored by this application. Authentication is handled by Supabase Auth, which stores only a salted hash.</p>
  <h3>Who processes data</h3><p>Supabase (database and authentication) and Cloudflare (hosting). Administrators of this service can see account details, project counts and feedback. They cannot see your password.</p>
  <h3>Your rights</h3><p>In Account settings you can edit your details, download all your data, and delete your account and projects permanently. Contact the operator for any other privacy request.</p>
  <h3>Retention</h3><p>Data is kept while your account exists and removed when you delete it.</p>`]
};
function saLegal(w){ const L = SA_LEGAL[w]; saModal(`<h2>${saEsc(T(L[0]))}</h2><div class="legal">${L[1]}</div><div class="sa-row" style="margin-top:14px"><button class="sa-btn pri" data-sa="close">${saEsc(T('Close'))}</button></div>`); }

/* ---------- header: profile menu + cloud chip ---------- */
function saMountChrome(){
  const q = sa$('.quick'); if (!q || sa$('#saUM')) return;
  const w = document.createElement('div'); w.id = 'saUM'; w.className = 'sa-um'; w.setAttribute('data-nt', ''); q.insertBefore(w, q.firstChild);
  const c = document.createElement('span'); c.id = 'saChip'; c.className = 'sa-chip'; c.hidden = true; q.insertBefore(c, q.firstChild);
  const s = document.createElement('div'); s.id = 'saas'; document.body.appendChild(s);
}
function saChip(){
  const c = sa$('#saChip'); if (!c) return;
  if (!SA.user || SA.view !== 'app' && SA.view !== undefined && SA.view !== 'app'){ c.hidden = !SA.user; }
  if (!SA.user){ c.hidden = true; return; }
  c.hidden = false; c.className = 'sa-chip'; c.onclick = null; c.style.cursor = '';
  if (!SA.cloudId){ c.innerHTML = `<i style="background:var(--ink-2)"></i>${saEsc(T('This device only'))} · <button class="sa-link" data-sa="savecloud" style="text-decoration:none">${saEsc(T('Save to account'))}</button>`; return; }
  const st = !navigator.onLine ? 'offline' : SA.chip === 'bad' ? 'bad' : (SA.saving || SA.dirty) ? 'busy' : 'ok';
  c.className = 'sa-chip ' + (st === 'bad' ? 'bad' : st === 'ok' ? '' : 'busy');
  c.innerHTML = `<i></i>${saEsc(T(st === 'ok' ? 'Saved to your account' : st === 'busy' ? 'Saving…' : st === 'offline' ? 'Offline. Will save when you reconnect' : 'Not saved. Retry'))}`;
  if (st === 'bad'){ c.style.cursor = 'pointer'; c.onclick = () => { SA.chip = null; SA.dirty = true; saFlush(); }; }
}
function saMenu(){
  const w = sa$('#saUM'); if (!w) return;
  if (!SA.user || !SA.user.email_confirmed_at){
    w.innerHTML = SA.cfg && SA.cfg.configured && !SA.cfg.requireLogin ? `<button class="sa-btn sa-signin" data-sa="gotoauth">${saEsc(T('Sign in'))}</button>` : '';
    saChip(); return;
  }
  const adm = SA.profile && SA.profile.role === 'admin';
  w.innerHTML = (SA.cfg && SA.cfg.communityEnabled !== false ? saBellBtn() : '') + `<button class="sa-ub" data-sa="menu" aria-haspopup="menu" aria-expanded="false" aria-label="${saEsc(T('Account menu'))}"><span class="sa-av" data-nt>${saEsc(saInitials())}</span><span class="nm" data-nt>${saEsc((SA.profile && SA.profile.first_name) || SA.user.email)}</span></button>`;
  saChip();
}
window.addEventListener('online', () => { saChip(); if (SA.dirty) saFlush(); });
window.addEventListener('offline', saChip);
window.addEventListener('beforeunload', () => { if (SA.dirty && SA.cloudId) { try { localStorage.setItem('dbd_cloudcache_' + SA.cloudId, JSON.stringify({rev: SA.rev, at: Date.now(), data: S})); } catch (e) {} } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && SA.dirty) { clearTimeout(SA.saveT); saFlush(); } });
