
/* ---------- admin console (every call is re-checked on the server) ---------- */
async function saApi(path, opt){
  const o = Object.assign({method: 'GET'}, opt || {}); o.headers = Object.assign({Authorization: 'Bearer ' + (SA.session && SA.session.access_token)}, o.body ? {'Content-Type': 'application/json'} : {});
  let r; try { r = await fetch(path, o); } catch (e) { throw new Error('Failed to fetch'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok){ const e = new Error(j.error || 'Request failed'); e.status = r.status; throw e; }
  return j;
}
SA.au = {search: '', status: '', verified: '', page: 1, size: 25};
async function saViewAdmin(el){
  el.innerHTML = saFrame('admin', `<div class="sa-splash">${saEsc(T('Loading…'))}</div>`);
  try { await saApi('/api/admin/me'); } catch (e) { el.innerHTML = saFrame('admin', `<div class="sa-msg bad">${saEsc(T(e.status === 403 ? 'You do not have administrator access.' : e.message))}</div>`); return; }
  const tabs = [['overview', 'Overview'], ['users', 'Users'], ['feedback', 'Feedback']];
  const tb = `<div class="sa-nav" role="tablist" style="margin-bottom:14px">${tabs.map(t => `<button role="tab" data-sa="atab" data-t="${t[0]}" ${SA.adminTab === t[0] ? 'aria-current="page"' : ''}>${saEsc(T(t[1]))}</button>`).join('')}</div>`;
  el.innerHTML = saFrame('admin', `<h1 class="sa-h1">${saEsc(T('Administration'))}</h1>${tb}<div id="saAdm"><div class="sa-splash">${saEsc(T('Loading…'))}</div></div>`);
  const box = sa$('#saAdm');
  try {
    if (SA.adminTab === 'overview') await saAdmOverview(box);
    else if (SA.adminTab === 'users') await saAdmUsers(box);
    else await saAdmFeedback(box);
  } catch (e) { box.innerHTML = `<div class="sa-msg bad">${saEsc(T(e.message || 'Request failed'))}</div>`; }
}
async function saAdmOverview(box){
  const s = await saApi('/api/admin/stats'), days = s.signups_by_day || [], mx = Math.max(1, ...days.map(d => d.count));
  const tile = (n, l) => `<div class="sa-card sa-tile"><b>${n}</b><span>${saEsc(T(l))}</span></div>`, ev = s.events_30d || {};
  box.innerHTML = `<div class="sa-grid c4">${tile(s.users_total, 'Registered users')}${tile(s.users_verified, 'Email verified')}${tile(s.users_suspended, 'Suspended')}${tile(s.users_new_7d, 'New in 7 days')}${tile(s.users_new_30d, 'New in 30 days')}${tile(s.users_active_7d, 'Active in 7 days')}${tile(s.projects_total, 'Projects')}${tile(s.feedback_new, 'New feedback')}</div>
  <div class="sa-grid c2" style="margin-top:16px"><section class="sa-card"><h2>${saEsc(T('Sign-ups, last 30 days'))}</h2><div class="sa-bars" role="img" aria-label="${saEsc(T('Sign-ups per day'))}">${days.map(d => `<i style="height:${Math.max(2, Math.round(d.count / mx * 100))}%" title="${saEsc(d.day)}: ${d.count}"></i>`).join('')}</div><p class="sa-fine" style="color:var(--ink-2);margin-top:8px">${saEsc(T('New projects in 7 days'))}: ${s.projects_new_7d}</p></section>
  <section class="sa-card"><h2>${saEsc(T('Usage, last 30 days'))}</h2><table class="sa-tab"><tbody>${Object.keys(ev).length ? Object.keys(ev).sort().map(k => `<tr><td>${saEsc(k.replace(/_/g, ' '))}</td><td>${ev[k]}</td></tr>`).join('') : `<tr><td>${saEsc(T('No events recorded yet.'))}</td></tr>`}</tbody></table></section>
  <section class="sa-card"><h2>${saEsc(T('Top countries'))}</h2><table class="sa-tab"><tbody>${(s.countries || []).map(c => `<tr><td>${saEsc(c.country)}</td><td>${c.count}</td></tr>`).join('')}</tbody></table></section></div>`;
}
async function saAdmUsers(box){
  const f = SA.au, qs = new URLSearchParams({search: f.search, status: f.status, verified: f.verified, page: f.page, size: f.size});
  const r = await saApi('/api/admin/users?' + qs);
  const pages = Math.max(1, Math.ceil(r.total / f.size));
  box.innerHTML = `<form id="saUF" class="sa-row" style="margin-bottom:12px"><input class="sa-in" id="auS" type="search" placeholder="${saEsc(T('Search name, email, company'))}" value="${saEsc(f.search)}" style="max-width:300px" aria-label="${saEsc(T('Search users'))}"><select class="sa-in" id="auSt" style="max-width:170px" aria-label="${saEsc(T('Status'))}"><option value="">${saEsc(T('Any status'))}</option><option value="active" ${f.status === 'active' ? 'selected' : ''}>${saEsc(T('Active'))}</option><option value="suspended" ${f.status === 'suspended' ? 'selected' : ''}>${saEsc(T('Suspended'))}</option></select><select class="sa-in" id="auV" style="max-width:190px" aria-label="${saEsc(T('Email verification'))}"><option value="">${saEsc(T('Any verification'))}</option><option value="yes" ${f.verified === 'yes' ? 'selected' : ''}>${saEsc(T('Verified'))}</option><option value="no" ${f.verified === 'no' ? 'selected' : ''}>${saEsc(T('Not verified'))}</option></select><button class="sa-btn" type="submit">${saEsc(T('Search'))}</button><span class="sa-fine" style="color:var(--ink-2)">${r.total} ${saEsc(T('users'))}</span></form>
  <div class="sa-card sa-tw" style="padding:0"><table class="sa-tab"><thead><tr><th>${saEsc(T('Name'))}</th><th>${saEsc(T('Email'))}</th><th>${saEsc(T('Registered'))}</th><th>${saEsc(T('Verified'))}</th><th>${saEsc(T('Projects'))}</th><th>${saEsc(T('Last seen'))}</th><th>${saEsc(T('Status'))}</th><th></th></tr></thead><tbody>${r.users.length ? r.users.map(u => `<tr><td>${saEsc((u.first_name || '') + ' ' + (u.last_name || ''))}<br><span class="sa-fine" style="color:var(--ink-2)">${saEsc([u.company, u.country, u.occupation].filter(Boolean).join(' · '))}</span></td><td style="overflow-wrap:anywhere">${saEsc(u.email)}${u.role === 'admin' ? ' <span class="sa-pill">admin</span>' : ''}</td><td>${saEsc(saDate(u.created_at))}</td><td><span class="sa-pill ${u.email_confirmed_at ? 'ok' : 'warn'}">${saEsc(T(u.email_confirmed_at ? 'Yes' : 'No'))}</span></td><td>${u.project_count}</td><td>${u.last_seen_at ? saEsc(saRel(u.last_seen_at)) : '–'}</td><td><span class="sa-pill ${u.status === 'active' ? 'ok' : 'bad'}">${saEsc(T(u.status === 'active' ? 'Active' : 'Suspended'))}</span></td><td>${u.role === 'admin' || u.id === SA.user.id ? '' : `<button class="sa-btn sm ${u.status === 'active' ? 'bad' : ''}" data-sa="ustatus" data-id="${u.id}" data-s="${u.status === 'active' ? 'suspended' : 'active'}" data-e="${saEsc(u.email)}">${saEsc(T(u.status === 'active' ? 'Suspend' : 'Reactivate'))}</button>`}</td></tr>`).join('') : `<tr><td colspan="8"><div class="sa-empty">${saEsc(T('No users match.'))}</div></td></tr>`}</tbody></table></div>
  <div class="sa-row" style="margin-top:12px;justify-content:center"><button class="sa-btn sm" data-sa="apage" data-d="-1" ${f.page <= 1 ? 'disabled' : ''}>${saEsc(T('Previous'))}</button><span>${f.page} / ${pages}</span><button class="sa-btn sm" data-sa="apage" data-d="1" ${f.page >= pages ? 'disabled' : ''}>${saEsc(T('Next'))}</button></div>`;
}
async function saAdmFeedback(box){
  const r = await saApi('/api/admin/feedback?size=50');
  box.innerHTML = r.feedback.length ? `<div class="sa-grid">${r.feedback.map(x => `<article class="sa-card"><div class="sa-row" style="justify-content:space-between"><span><b>${saEsc(x.from || T('Deleted user'))}</b> <span class="sa-fine" style="color:var(--ink-2)">${saEsc(saTime(x.created_at))}${x.rating ? ' · ' + '★'.repeat(x.rating) : ''}${x.page ? ' · ' + saEsc(x.page) : ''}</span></span><span class="sa-row"><span class="sa-pill ${x.status === 'new' ? 'warn' : 'ok'}">${saEsc(T(x.status === 'new' ? 'New' : 'Reviewed'))}</span><button class="sa-btn sm" data-sa="fbstat" data-id="${x.id}" data-s="${x.status === 'new' ? 'reviewed' : 'new'}">${saEsc(T(x.status === 'new' ? 'Mark reviewed' : 'Mark new'))}</button></span></div><p style="white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0">${saEsc(x.message)}</p></article>`).join('')}</div>` : `<div class="sa-empty">${saEsc(T('No feedback yet.'))}</div>`;
}

/* ---------- events ---------- */
document.addEventListener('click', async ev => {
  const mn = document.querySelector('.sa-menu');
  const b = ev.target.closest('[data-sa]');
  if (mn && !ev.target.closest('.sa-um')) mn.remove();
  if (!b) return;
  const a = b.dataset.sa, id = b.dataset.id;
  if (b.tagName === 'A') ev.preventDefault();
  if (a === 'menu'){ const w = b.closest('.sa-um'), old = w.querySelector('.sa-menu'); if (old){ old.remove(); b.setAttribute('aria-expanded', 'false'); return; }
    const adm = SA.profile && SA.profile.role === 'admin', m = document.createElement('div'); m.className = 'sa-menu'; m.setAttribute('role', 'menu');
    m.innerHTML = `<div class="who" data-nt><b>${saEsc(saName())}</b>${saEsc(SA.user.email)}</div><button role="menuitem" data-sa="dash">${saEsc(T('Dashboard'))}</button><button role="menuitem" data-sa="import">${saEsc(T('Import a panel'))}</button><button role="menuitem" data-sa="account">${saEsc(T('Account settings'))}</button>${adm ? `<button role="menuitem" data-sa="admin">${saEsc(T('Admin dashboard'))}</button>` : ''}<button role="menuitem" data-sa="signout">${saEsc(T('Sign out'))}</button>`; w.appendChild(m); b.setAttribute('aria-expanded', 'true'); return; }
  if (a === 'dash'){ SA.q = ''; saGo('dashboard'); }
  else if (a === 'account') saGo('account');
  else if (a === 'admin'){ SA.adminTab = 'overview'; saGo('admin'); }
  else if (a === 'app') saOpenLast();
  else if (a === 'signout') saSignOut();
  else if (a === 'gotoauth'){ SA.authMode = 'login'; saGo('auth'); }
  else if (a === 'guest') saGo('app');
  else if (a === 'mode'){ SA.authMode = b.dataset.m; saRender(); }
  else if (a === 'peek'){ const i = sa$('#' + b.dataset.for); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.textContent = T(show ? 'Hide' : 'Show'); }
  else if (a === 'legal') saLegal(b.dataset.w);
  else if (a === 'close') saModalClose();
  else if (a === 'resend'){ const e = b.dataset.e; if (!e) return; const {error} = await SA.sb.auth.resend({type: 'signup', email: e, options: {emailRedirectTo: location.origin + '/'}}); SA.msg = error ? {t: 'bad', m: saErr(error)} : {t: 'ok', m: 'Verification email sent. Check your inbox and spam folder.'}; saRender(); }
  else if (a === 'signedin'){ await SA.sb.auth.signOut().catch(() => {}); SA.user = null; SA.session = null; SA.authMode = 'login'; SA.userSignedOut = true; SA.msg = {t: 'ok', m: 'Once your email is confirmed, sign in below.'}; saGo('auth'); }
  else if (a === 'new') saNewProject();
  else if (a === 'open'){ b.disabled = true; if (!await saOpenProject(id)) b.disabled = false; }
  else if (a === 'local') saOpenLocal();
  else if (a === 'rename'){ const p = SA.projects.find(x => x.id === id); if (p) saRename(id, p.name); }
  else if (a === 'dup') saDuplicate(id);
  else if (a === 'del'){ const p = SA.projects.find(x => x.id === id); if (p) saDelete(id, p.name); }
  else if (a === 'migrate') saMigrate();
  else if (a === 'miglater'){ try { localStorage.setItem('dbd_mig_hide', '1'); } catch (e) {} saRender(); }
  else if (a === 'savecloud') saSaveCurrentToCloud();
  else if (a === 'export') saExportData();
  else if (a === 'delacct') saDeleteDialog();
  else if (a === 'keepmine') saKeepMine();
  else if (a === 'loadcloud') saLoadCloud();
  else if (a === 'atab'){ SA.adminTab = b.dataset.t; saRender(); }
  else if (a === 'apage'){ SA.au.page = Math.max(1, SA.au.page + parseInt(b.dataset.d, 10)); saRender(); }
  else if (a === 'ustatus'){
    const to = b.dataset.s; if (!confirm(T(to === 'suspended' ? 'Suspend this account? The user will be signed out of cloud features.' : 'Reactivate this account?') + '\n\n' + b.dataset.e)) return;
    try { await saApi(`/api/admin/users/${id}/status`, {method: 'POST', body: JSON.stringify({status: to})}); saRender(); } catch (e) { toast(e.message); }
  }
  else if (a === 'fbstat'){ try { await saApi(`/api/admin/feedback/${id}/status`, {method: 'POST', body: JSON.stringify({status: b.dataset.s})}); saRender(); } catch (e) { toast(e.message); } }
});
function saOpenLast(){ if (SA.cloudId) { saGo('app'); saChip(); } else saOpenLocal(); }
document.addEventListener('submit', ev => {
  const f = ev.target.id; if (!['saForm', 'saRec', 'saProf', 'saPw', 'saFb', 'saDel', 'saUF'].includes(f)) return;
  ev.preventDefault();
  if (f === 'saForm') saSubmitAuth(); else if (f === 'saRec') saSubmitRecovery(); else if (f === 'saProf') saSaveProfile(); else if (f === 'saPw') saChangePw(); else if (f === 'saFb') saSendFeedback(); else if (f === 'saDel') saDoDelete();
  else { SA.au.search = sa$('#auS').value.trim(); SA.au.status = sa$('#auSt').value; SA.au.verified = sa$('#auV').value; SA.au.page = 1; saRender(); }
});
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.id === 'password' && SA.authMode === 'register' && sa$('#saMeter')){ const s = saPwScore(t.value), m = sa$('#saMeter'); m.style.width = (s * 20) + '%'; m.style.background = s <= 2 ? 'var(--bad)' : s <= 3 ? 'var(--warn)' : 'var(--ok)'; }
  if (t.id === 'saQ'){ SA.q = t.value; const l = SA.projects.filter(p => p.name.toLowerCase().includes(SA.q.toLowerCase())); const g = sa$('#saList'); if (g) g.innerHTML = l.map(p => saProjCard(p)).join(''); }
});
document.addEventListener('change', ev => { if (ev.target.id === 'saLang'){ setLang(ev.target.value); if (SA.view !== 'app') saRender(); } });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape'){ const m = sa$('#saModal'); if (m) saModalClose(); const mn = document.querySelector('.sa-menu'); if (mn) mn.remove(); } });

/* ---------- usage tracking on existing exports and tools ---------- */
{
  const o = {pdf: exportPDF, excel: exportXLSX, csv: exportCSV}, r = renderTools;
  exportPDF = function(){ saTrack('export_pdf'); return o.pdf.apply(this, arguments); };
  exportXLSX = function(){ saTrack('export_excel'); return o.excel.apply(this, arguments); };
  exportCSV = function(){ saTrack('export_csv'); return o.csv.apply(this, arguments); };
  renderTools = function(){ if (!SA.toolT || Date.now() - SA.toolT > 600000){ SA.toolT = Date.now(); saTrack('tool_opened'); } return r.apply(this, arguments); };
}

saInit();
