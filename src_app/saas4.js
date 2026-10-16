
/* ---------- shared page frame ---------- */
function saFrame(active, body){
  const adm = SA.profile && SA.profile.role === 'admin';
  const nav = [['dashboard', 'Dashboard'], ['import', 'Import'], ['account', 'Account']].concat(adm ? [['admin', 'Admin']] : []);
  return `<div class="sa-bar"><div class="in">${saBrand('button').replace('class="sa-brand"', 'class="sa-brand" data-sa="dash" aria-label="Dashboard"')}<nav class="sa-nav" aria-label="Main">${nav.map(n => `<button data-sa="${n[0] === 'dashboard' ? 'dash' : n[0]}" ${active === n[0] ? 'aria-current="page"' : ''}>${saEsc(T(n[1]))}</button>`).join('')}</nav><span class="sa-sp"></span>${saLangSelect()}<button class="sa-btn" data-sa="app">${saEsc(T('Open designer'))}</button><div class="sa-um" data-nt><button class="sa-ub" data-sa="menu" aria-haspopup="menu" aria-expanded="false"><span class="sa-av">${saEsc(saInitials())}</span><span class="nm">${saEsc((SA.profile && SA.profile.first_name) || '')}</span></button></div></div></div><main class="sa-main">${body}</main>`;
}
function saProjCard(p, recent){
  const mt = p.meta || {};
  return `<article class="sa-card sa-proj"><h3>${saEsc(p.name)}</h3><div class="meta"><span>${saEsc(T('Edited'))} ${saEsc(saRel(p.updated_at))}</span>${mt.circuits != null ? `<span>${mt.circuits} ${saEsc(T('circuits'))}</span>` : ''}${mt.modules != null ? `<span>${mt.modules} ${saEsc(T('devices'))}</span>` : ''}</div>
  <div class="acts"><button class="sa-btn pri sm" data-sa="open" data-id="${p.id}">${saEsc(T('Open'))}</button>${recent ? '' : `<button class="sa-btn sm" data-sa="rename" data-id="${p.id}">${saEsc(T('Rename'))}</button><button class="sa-btn sm" data-sa="dup" data-id="${p.id}">${saEsc(T('Duplicate'))}</button><button class="sa-btn sm bad" data-sa="del" data-id="${p.id}">${saEsc(T('Delete'))}</button>`}</div></article>`;
}
async function saViewDash(el){
  el.innerHTML = saFrame('dashboard', `<div class="sa-splash">${saEsc(T('Loading your projects…'))}</div>`);
  await saListProjects();
  if (SA.view !== 'dashboard') return;
  const list = SA.projects, q = (SA.q || '').toLowerCase();
  const recent = list.filter(p => p.last_opened_at).sort((a, b) => new Date(b.last_opened_at) - new Date(a.last_opened_at)).slice(0, 4);
  const shown = q ? list.filter(p => p.name.toLowerCase().includes(q)) : list;
  const lp = saLocalProject(); let migrated = false; try { migrated = localStorage.getItem('dbd_migrated_' + SA.user.id) === '1' || localStorage.getItem('dbd_mig_hide') === '1'; } catch (e) {}
  const mig = lp && !migrated ? `<div class="sa-msg warn sa-row" style="justify-content:space-between;margin-bottom:16px"><span>${saEsc(T('A project is saved on this device only:'))} <b>${saEsc(lp.name || 'Untitled')}</b>. ${saEsc(T('Upload a copy to your account to use it on other devices. The copy on this device is kept.'))}</span><span class="sa-row"><button class="sa-btn sm pri" data-sa="migrate">${saEsc(T('Upload a copy'))}</button><button class="sa-btn sm" data-sa="miglater">${saEsc(T('Not now'))}</button></span></div>` : '';
  el.innerHTML = saFrame('dashboard', `<h1 class="sa-h1">${saEsc(T('Welcome'))}, ${saEsc((SA.profile && SA.profile.first_name) || SA.user.email)}</h1><p class="sa-sub">${saEsc(T('Start a new distribution board or continue a saved one.'))}</p>${SA.offline ? `<div class="sa-msg warn" style="margin-bottom:16px">${saEsc(T('You are offline. Cloud projects load when you reconnect.'))}</div>` : ''}${saMsgHtml()}${mig}
  <div class="sa-grid c3" style="margin-bottom:22px"><div class="sa-card"><h2>${saEsc(T('Create New Distribution Board'))}</h2><p class="sa-sub" style="margin-bottom:12px">${saEsc(T('Opens a blank board saved to your account automatically.'))}</p><button class="sa-btn pri" data-sa="new">${saEsc(T('New board'))}</button></div>
  <div class="sa-card"><h2>${saEsc(T('Import a panel'))}</h2><p class="sa-sub" style="margin-bottom:12px">${saEsc(T('Turn a photo of a built panel, or a PDF schematic, into an editable board.'))}</p><button class="sa-btn pri" data-sa="import">${saEsc(T('Import from photo or PDF'))}</button></div><div class="sa-card sa-tile"><b>${list.length}</b><span>${saEsc(T('Saved projects'))}</span></div><div class="sa-card"><h2>${saEsc(T('Work on this device'))}</h2><p class="sa-sub" style="margin-bottom:12px">${saEsc(T('Open the board stored in this browser, without saving it to the cloud.'))}</p><button class="sa-btn" data-sa="local">${saEsc(T('Open local board'))}</button></div></div>
  ${SA.listErr ? `<div class="sa-msg bad">${saEsc(T(SA.listErr))}</div>` : ''}
  ${recent.length ? `<h2 style="margin:0 0 10px">${saEsc(T('Recently Opened Projects'))}</h2><div class="sa-grid c4" style="margin-bottom:22px">${recent.map(p => saProjCard(p, true)).join('')}</div>` : ''}
  <div class="sa-row" style="justify-content:space-between;margin-bottom:10px"><h2 style="margin:0">${saEsc(T('My Saved Projects'))}</h2><input class="sa-in" id="saQ" type="search" placeholder="${saEsc(T('Search projects'))}" aria-label="${saEsc(T('Search projects'))}" value="${saEsc(SA.q || '')}" style="max-width:260px"></div>
  ${shown.length ? `<div class="sa-grid c3" id="saList">${shown.map(p => saProjCard(p)).join('')}</div>` : `<div class="sa-empty">${saEsc(T(list.length ? 'No projects match your search.' : 'No saved projects yet. Create your first board above.'))}</div>`}
  <div class="sa-card" style="margin-top:26px"><h2>${saEsc(T('Send feedback'))}</h2>${saFeedbackForm()}</div>`);
}
function saFeedbackForm(){
  return `<form id="saFb" class="sa-form" style="grid-template-columns:1fr"><label class="sa-field"><span>${saEsc(T('Your message'))}</span><textarea id="fbMsg" maxlength="4000" required placeholder="${saEsc(T('What works, what is missing, what went wrong?'))}"></textarea></label><div class="sa-row"><label class="sa-field" style="max-width:160px"><span>${saEsc(T('Rating'))}</span><select id="fbRate"><option value="">–</option>${[5, 4, 3, 2, 1].map(n => `<option>${n}</option>`).join('')}</select></label><button class="sa-btn pri" type="submit">${saEsc(T('Send feedback'))}</button></div></form>`;
}
async function saSendFeedback(){
  const m = sa$('#fbMsg').value.trim(), r = parseInt(sa$('#fbRate').value, 10);
  if (!m){ toast('Write a message first.'); return; }
  const {error} = await SA.sb.from('feedback').insert({message: m.slice(0, 4000), rating: r >= 1 && r <= 5 ? r : null, page: SA.view});
  if (error){ toast(saErr(error)); return; }
  saTrack('feedback_sent'); sa$('#fbMsg').value = ''; toast('Thank you. Your feedback was sent.');
}

/* ---------- account ---------- */
function saViewAccount(el){
  const p = SA.profile || {};
  el.innerHTML = saFrame('account', `<h1 class="sa-h1">${saEsc(T('Account settings'))}</h1><p class="sa-sub">${saEsc(SA.user.email)}</p>${saMsgHtml()}
  <div class="sa-grid c2"><section class="sa-card"><h2>${saEsc(T('Profile'))}</h2><form id="saProf" class="sa-form" novalidate>
  ${saField('first_name', 'First name', 'text', `required maxlength="80" value="${saEsc(p.first_name || '')}"`)}${saField('last_name', 'Last name', 'text', `required maxlength="80" value="${saEsc(p.last_name || '')}"`)}
  <div class="full">${saField('company', 'Company (optional)', 'text', `maxlength="120" value="${saEsc(p.company || '')}"`)}</div>
  <label class="sa-field"><span>${saEsc(T('Country'))}</span><select id="country">${saCountryOptions(p.country || '')}</select></label>
  <label class="sa-field"><span>${saEsc(T('Professional occupation'))}</span><select id="occupation">${SA_OCC.map(o => `<option value="${o}" ${p.occupation === o ? 'selected' : ''}>${saEsc(T(o))}</option>`).join('')}</select></label>
  <div class="full"><button class="sa-btn pri" type="submit">${saEsc(T('Save profile'))}</button></div></form></section>
  <section class="sa-card"><h2>${saEsc(T('Change password'))}</h2><form id="saPw" class="sa-form" style="grid-template-columns:1fr" novalidate>${saPwField('cur', 'Current password', 'current-password')}${saPwField('password', 'New password', 'new-password', 'At least 8 characters, with a letter and a number.')}${saPwField('password2', 'Confirm new password', 'new-password')}<div><button class="sa-btn pri" type="submit">${saEsc(T('Update password'))}</button></div></form></section></div>
  <div class="sa-grid c2" style="margin-top:16px"><section class="sa-card"><h2>${saEsc(T('Your data'))}</h2><p class="sa-sub">${saEsc(T('Download your profile and all your projects as one JSON file.'))}</p><button class="sa-btn" data-sa="export">${saEsc(T('Download my data'))}</button> <button class="sa-btn" data-sa="legal" data-w="privacy">${saEsc(T('Privacy Policy'))}</button> <button class="sa-btn" data-sa="legal" data-w="terms">${saEsc(T('Terms and Conditions'))}</button></section>
  <section class="sa-card"><h2>${saEsc(T('Delete account'))}</h2><p class="sa-sub">${saEsc(T('Permanently removes your account, profile and every saved project. This cannot be undone. Projects stored only on this device are not affected.'))}</p><button class="sa-btn bad" data-sa="delacct">${saEsc(T('Delete my account'))}</button></section></div>`);
}
async function saSaveProfile(){
  const v = id => sa$('#' + id).value.trim(); let ok = true;
  ok = saFieldErr('first_name', v('first_name') ? '' : 'Enter your first name.') && ok; ok = saFieldErr('last_name', v('last_name') ? '' : 'Enter your last name.') && ok; if (!ok) return;
  const upd = {first_name: v('first_name'), last_name: v('last_name'), company: v('company') || null, country: v('country') || null, occupation: SA_OCC.includes(v('occupation')) ? v('occupation') : null};
  const {error} = await SA.sb.from('profiles').update(upd).eq('id', SA.user.id);
  if (error){ SA.msg = {t: 'bad', m: saErr(error)}; saRender(); return; }
  await saLoadProfile(); saMenu(); SA.msg = {t: 'ok', m: 'Profile saved.'}; saRender();
}
async function saChangePw(){
  const cur = sa$('#cur').value, pw = sa$('#password').value, pw2 = sa$('#password2').value; let ok = true;
  ok = saFieldErr('cur', cur ? '' : 'Enter your current password.') && ok; ok = saFieldErr('password', saPwProblem(pw)) && ok; ok = saFieldErr('password2', pw === pw2 ? '' : 'The passwords do not match.') && ok; if (!ok) return;
  SA.reauth = true;
  const r = await SA.sb.auth.signInWithPassword({email: SA.user.email, password: cur});
  if (r.error){ SA.reauth = false; saFieldErr('cur', 'Current password is incorrect.'); return; }
  const {error} = await SA.sb.auth.updateUser({password: pw});
  SA.reauth = false;
  SA.msg = error ? {t: 'bad', m: saErr(error)} : {t: 'ok', m: 'Password updated.'}; saRender();
}
async function saExportData(){
  const {data} = await SA.sb.from('projects').select('id,name,data,meta,created_at,updated_at');
  const out = {exported_at: new Date().toISOString(), account: {email: SA.user.email, profile: SA.profile}, projects: data || []};
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], {type: 'application/json'})); a.download = 'dboard-designer-my-data.json'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function saDeleteDialog(){
  saModal(`<h2>${saEsc(T('Delete your account?'))}</h2><p>${saEsc(T('This permanently deletes your account and all saved projects. To confirm, type your email address.'))}</p><form id="saDel" class="sa-form" style="grid-template-columns:1fr"><label class="sa-field"><span>${saEsc(T('Email address'))}</span><input id="delEmail" type="email" autocomplete="off" required></label><div class="sa-msg bad" id="delErr" hidden></div><div class="sa-row"><button class="sa-btn bad pri" type="submit">${saEsc(T('Delete permanently'))}</button><button class="sa-btn" type="button" data-sa="close">${saEsc(T('Cancel'))}</button></div></form>`);
}
async function saDoDelete(){
  const email = sa$('#delEmail').value.trim(), err = sa$('#delErr'); err.hidden = true;
  let r; try { r = await fetch('/api/me/delete', {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + SA.session.access_token}, body: JSON.stringify({email})}); } catch (e) { err.textContent = T('No connection. Check your internet and try again.'); err.hidden = false; return; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok){ err.textContent = T(j.error || 'The account could not be deleted. Try again later.'); err.hidden = false; return; }
  saModalClose(); try { localStorage.removeItem('dbd_user'); Object.keys(localStorage).filter(k => k.startsWith('dbd_cloudcache_')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
  SA.userSignedOut = true; await SA.sb.auth.signOut().catch(() => {}); SA.authMode = 'login'; SA.msg = {t: 'ok', m: 'Your account has been deleted.'}; saCloseProject(); saNoSession();
}
async function saSignOut(){
  SA.userSignedOut = true; saCloseProject();
  try { await SA.sb.auth.signOut(); } catch (e) {}
  try { localStorage.removeItem('dbd_user'); sessionStorage.removeItem('dbd_login_logged'); } catch (e) {}
  SA.session = null; SA.user = null; SA.profile = null; SA.authMode = 'login'; saNoSession();
}
