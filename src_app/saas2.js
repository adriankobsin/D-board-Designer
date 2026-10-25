
/* ---------- routing ---------- */
function saGo(view){
  SA.view = view;
  const root = document.documentElement;
  if (view === 'app'){ root.classList.remove('sa-page'); saMenu(); window.scrollTo(0, 0); return; }
  root.classList.add('sa-page');
  saRender();
  window.scrollTo(0, 0);
}
function saRender(){
  const el = sa$('#saas'); if (!el) return;
  const v = SA.view, fn = {auth: saViewAuth, verify: saViewVerify, suspended: saViewSuspended, recovery: saViewRecovery, dashboard: saViewDash, import: saViewImport, account: saViewAccount, admin: saViewAdmin, community: saViewCommunity}[v];
  el.innerHTML = '';
  if (fn) fn(el);
  if (typeof walk === 'function') { try { walk(el); } catch (e) {} } else if (typeof translateTree === 'function') { try { translateTree(el); } catch (e) {} }
}
const saMsgHtml = () => { const m = SA.msg; SA.msg = null; return m ? `<div class="sa-msg ${m.t}" role="${m.t === 'bad' ? 'alert' : 'status'}">${saEsc(T(m.m))}</div>` : ''; };
const saBrand = (tag) => `<${tag || 'span'} class="sa-brand"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#0B6B8E"/><rect x="5" y="7" width="22" height="18" rx="2.5" fill="#F5F7F9"/><g fill="#0B6B8E"><rect x="8" y="10" width="3.2" height="7" rx=".8"/><rect x="12.6" y="10" width="3.2" height="7" rx=".8"/><rect x="17.2" y="10" width="3.2" height="7" rx=".8"/><rect x="21.8" y="10" width="2.6" height="7" rx=".8"/></g><rect x="8" y="19.5" width="16.4" height="1.6" rx=".8" fill="#0B6B8E"/></svg><span data-nt>DBoard <em>Designer</em></span></${tag || 'span'}>`;
function saLangSelect(){ return `<label class="langsel" data-nt><select aria-label="Language" id="saLang">${LANGS.map(l => `<option value="${l[0]}" ${l[0] === saLang() ? 'selected' : ''}>${saEsc(l[1])}</option>`).join('')}</select></label>`; }

/* ---------- auth page (sign in / register / forgot) ---------- */
function saAside(){
  return `<aside class="sa-aside"><div>${saBrand()}</div><div><h1>Design distribution boards you can build from.</h1><p>Layout, single-line diagram, schedules and cable sizing in one workspace, saved to your account and available on every device.</p><ul><li>DIN-rail layouts and breaker positions</li><li>Cable sizing, voltage drop and loads</li><li>Bill of materials, PDF and Excel export</li><li>Projects saved securely to your account</li></ul></div><div class="sa-fine">A design aid. Always verify against your local wiring regulations.</div>
  <svg class="sa-rail" viewBox="0 0 600 120" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="#9FD0E6" stroke-width="2"><path d="M0 100H600"/><path d="M0 40H600"/></g><g fill="#55B6DB">${Array.from({length: 14}, (_, i) => `<rect x="${20 + i * 42}" y="48" width="26" height="46" rx="3"/>`).join('')}</g></svg></aside>`;
}
function saField(id, label, type, extra, hint){
  return `<label class="sa-field" for="${id}"><span>${saEsc(T(label))}</span><input id="${id}" name="${id}" type="${type}" ${extra || ''}>${hint ? `<small>${saEsc(T(hint))}</small>` : ''}<em class="err" data-err="${id}" style="font-style:normal"></em></label>`;
}
function saPwField(id, label, auto, hint){
  return `<label class="sa-field" for="${id}"><span>${saEsc(T(label))}</span><div class="sa-pw"><input id="${id}" name="${id}" type="password" autocomplete="${auto}" required maxlength="72" style="padding-right:64px"><button type="button" data-sa="peek" data-for="${id}" aria-label="${saEsc(T('Show password'))}">${saEsc(T('Show'))}</button></div>${hint ? `<small>${saEsc(T(hint))}</small>` : ''}<em class="err" data-err="${id}" style="font-style:normal"></em></label>`;
}
function saViewAuth(el){
  const m = SA.authMode;
  let form = '';
  if (m === 'login'){
    let remembered = ''; try { remembered = localStorage.getItem('dbd_last_email') || ''; } catch (e) {}
    const okc = SA.confirmedOk;
    if (okc) remembered = SA.confirmedEmail || remembered;
    form = `<h2>${okc ? 'Email confirmed' : 'Sign in'}</h2><p class="lead">${okc ? 'Your email address is confirmed and your account is active. Sign in to start designing.' : 'Welcome back. Pick up your boards where you left them.'}</p>${saMsgHtml()}
    <form id="saForm" novalidate class="sa-form" style="grid-template-columns:1fr">
      ${saField('email', 'Email address', 'email', `autocomplete="username" required inputmode="email" value="${saEsc(remembered)}" maxlength="254"`)}
      ${saPwField('password', 'Password', 'current-password')}
      <div class="sa-row" style="justify-content:space-between"><label class="sa-check"><input type="checkbox" id="remember" ${saStore.mode() === 'local' ? 'checked' : ''}><span>Remember me on this device</span></label><button type="button" class="sa-link" data-sa="mode" data-m="forgot">Forgot password?</button></div>
      <button class="sa-btn pri" type="submit" id="saGo">Sign in</button></form>
      <p class="sa-alt">New to DBoard Designer? <button class="sa-link" data-sa="mode" data-m="register">Create an account</button></p>
      ${SA.cfg.requireLogin ? '' : `<p class="sa-alt"><button class="sa-link" data-sa="guest">Continue without an account</button></p>`}`;
  } else if (m === 'register'){
    form = `<h2>Create your account</h2><p class="lead">Free to start. We email you a link to confirm your address before you can sign in.</p>${saMsgHtml()}
    <form id="saForm" novalidate class="sa-form">
      ${saField('first_name', 'First name', 'text', 'autocomplete="given-name" required maxlength="80"')}
      ${saField('last_name', 'Last name', 'text', 'autocomplete="family-name" required maxlength="80"')}
      <div class="full">${saField('email', 'Email address', 'email', 'autocomplete="username" required inputmode="email" maxlength="254"')}</div>
      ${saPwField('password', 'Password', 'new-password', 'At least 8 characters, with a letter and a number.')}
      ${saPwField('password2', 'Confirm password', 'new-password')}
      <div class="full"><div class="sa-meter" aria-hidden="true"><i id="saMeter"></i></div></div>
      ${saField('company', 'Company (optional)', 'text', 'autocomplete="organization" maxlength="120"')}
      <label class="sa-field" for="country"><span>${saEsc(T('Country'))}</span><select id="country" autocomplete="country-name" required>${saCountryOptions('')}</select><em class="err" data-err="country" style="font-style:normal"></em></label>
      <label class="sa-field full" for="occupation"><span>${saEsc(T('Professional occupation'))}</span><select id="occupation" required><option value="">${saEsc(T('Select your occupation'))}</option>${SA_OCC.map(o => `<option value="${o}">${saEsc(T(o))}</option>`).join('')}</select><em class="err" data-err="occupation" style="font-style:normal"></em></label>
      <div class="full"><label class="sa-check"><input type="checkbox" id="terms"><span>I have read and accept the <button type="button" class="sa-link" data-sa="legal" data-w="terms">Terms and Conditions</button> and the <button type="button" class="sa-link" data-sa="legal" data-w="privacy">Privacy Policy</button>.</span></label><em class="err" data-err="terms" style="font-style:normal;color:var(--bad);font-size:12.5px"></em></div>
      <div class="full"><button class="sa-btn pri" type="submit" id="saGo" style="width:100%">Create account</button></div></form>
      <p class="sa-alt">Already have an account? <button class="sa-link" data-sa="mode" data-m="login">Sign in</button></p>`;
  } else {
    form = `<h2>Reset your password</h2><p class="lead">Enter your account email. If it matches an account, we send a link to choose a new password.</p>${saMsgHtml()}
    <form id="saForm" novalidate class="sa-form" style="grid-template-columns:1fr">${saField('email', 'Email address', 'email', 'autocomplete="username" required inputmode="email" maxlength="254"')}
    <button class="sa-btn pri" type="submit" id="saGo">Send reset link</button></form>
    <p class="sa-alt"><button class="sa-link" data-sa="mode" data-m="login">Back to sign in</button></p>`;
  }
  el.innerHTML = `<div class="sa-auth">${saAside()}<div class="sa-pane"><div class="sa-box"><div class="sa-row" style="justify-content:flex-end;margin-bottom:8px;gap:8px">${saThemeBtn()}${saLangSelect()}</div>${form}</div></div></div>`;
  const first = sa$('#saForm input'); if (first && !first.value) first.focus();
}
function saFieldErr(id, msg){ const e = sa$(`[data-err="${id}"]`); if (e) e.textContent = msg ? T(msg) : ''; const i = sa$('#' + id); if (i) i.setAttribute('aria-invalid', msg ? 'true' : 'false'); return !msg; }
function saBusy(on, label){ const b = sa$('#saGo'); if (!b) return; if (on){ b.dataset.l = b.textContent; b.disabled = true; b.textContent = T(label || 'Please wait…'); } else { b.disabled = false; if (b.dataset.l) b.textContent = b.dataset.l; } }

async function saSubmitAuth(){
  const m = SA.authMode, v = id => { const e = sa$('#' + id); return e ? e.value.trim() : ''; };
  const email = v('email').toLowerCase(); let ok = true;
  ok = saFieldErr('email', saEmailOk(email) ? '' : 'Enter a valid email address.') && ok;
  if (m === 'forgot'){
    if (!ok) return; saBusy(true);
    try { await SA.sb.auth.resetPasswordForEmail(email, {redirectTo: saSite() + '/'}); } catch (e) {}
    saBusy(false); SA.msg = {t: 'ok', m: 'If an account exists for that address, a reset link is on its way. Check your inbox and spam folder.'}; saRender(); return;
  }
  const pw = (sa$('#password') || {}).value || '';
  if (m === 'login'){
    ok = saFieldErr('password', pw ? '' : 'Enter your password.') && ok; if (!ok) return;
    try { localStorage.setItem('dbd_remember', sa$('#remember').checked ? '1' : '0'); localStorage.setItem('dbd_last_email', sa$('#remember').checked ? email : ''); } catch (e) {}
    saBusy(true, 'Signing in…');
    const {error} = await SA.sb.auth.signInWithPassword({email, password: pw});
    if (error){ saBusy(false); SA.msg = {t: 'bad', m: saErr(error)}; if (/not confirmed/i.test(error.message)) { SA.pendingEmail = email; } saRender(); const e2 = sa$('#email'); if (e2) e2.value = email; if (/not confirmed/i.test(error.message)) { const b = document.createElement('p'); b.className = 'sa-alt'; b.innerHTML = `<button class="sa-link" data-sa="resend" data-e="${saEsc(email)}">${saEsc(T('Resend verification email'))}</button>`; sa$('.sa-box').appendChild(b); } }
    return;
  }
  const fn = v('first_name'), ln = v('last_name'), pw2 = (sa$('#password2') || {}).value || '', country = v('country'), occ = v('occupation'), company = v('company');
  ok = saFieldErr('first_name', fn ? '' : 'Enter your first name.') && ok;
  ok = saFieldErr('last_name', ln ? '' : 'Enter your last name.') && ok;
  const pp = saPwProblem(pw); ok = saFieldErr('password', pp) && ok;
  ok = saFieldErr('password2', pw === pw2 ? '' : 'The passwords do not match.') && ok;
  ok = saFieldErr('country', country ? '' : 'Select your country.') && ok;
  ok = saFieldErr('occupation', SA_OCC.includes(occ) ? '' : 'Select your occupation.') && ok;
  ok = saFieldErr('terms', sa$('#terms').checked ? '' : 'You must accept the Terms and the Privacy Policy to continue.') && ok;
  if (!ok){ const f = sa$('[aria-invalid="true"]'); if (f) f.focus(); return; }
  saBusy(true, 'Creating account…');
  const {data, error} = await SA.sb.auth.signUp({email, password: pw, options: {emailRedirectTo: saSite() + '/confirmed', data: {first_name: fn, last_name: ln, company, country, occupation: occ, accepted_terms: 'true'}}});
  saBusy(false);
  if (error){ SA.msg = {t: 'bad', m: saErr(error)}; saRender(); return; }
  SA.pendingEmail = email;
  // With "Confirm email" on, Supabase returns a user without a session. An obfuscated duplicate has no identities.
  if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0){ SA.msg = {t: 'bad', m: 'An account with this email already exists. Sign in or reset your password.'}; SA.authMode = 'login'; saRender(); return; }
  if (data && data.session) return;   // confirmation switched off in Supabase: onAuthStateChange takes over
  saGo('verify');
}

/* ---------- verification, suspended, recovery ---------- */
function saViewVerify(el){
  const em = (SA.user && SA.user.email) || SA.pendingEmail || '';
  el.innerHTML = `<div class="sa-auth">${saAside()}<div class="sa-pane"><div class="sa-box"><h2>Check your email</h2><p class="lead">We sent a confirmation link to <b>${saEsc(em)}</b>. Open it to activate your account, then sign in. The link works once and expires after a while.</p>${saMsgHtml()}
  <div class="sa-row"><button class="sa-btn pri" data-sa="resend" data-e="${saEsc(em)}">Resend email</button><button class="sa-btn" data-sa="signedin">I have confirmed, sign in</button></div>
  <p class="sa-alt">Wrong address? <button class="sa-link" data-sa="signout">Start again</button></p><p class="sa-fine" style="color:var(--ink-2)">Nothing arrived? Check spam, and make sure the address is spelled correctly.</p></div></div></div>`;
}
function saViewSuspended(el){
  el.innerHTML = `<div class="sa-auth">${saAside()}<div class="sa-pane"><div class="sa-box"><h2>Account suspended</h2><p class="lead">This account has been suspended and cannot open projects right now. Your data is kept. Contact the service operator to have it reviewed.</p><div class="sa-row"><button class="sa-btn" data-sa="signout">Sign out</button><button class="sa-btn" data-sa="export">Download my data</button></div></div></div></div>`;
}
function saViewRecovery(el){
  el.innerHTML = `<div class="sa-auth">${saAside()}<div class="sa-pane"><div class="sa-box"><h2>Choose a new password</h2><p class="lead">Set a new password for your account.</p>${saMsgHtml()}<form id="saRec" novalidate class="sa-form" style="grid-template-columns:1fr">${saPwField('password', 'New password', 'new-password', 'At least 8 characters, with a letter and a number.')}${saPwField('password2', 'Confirm new password', 'new-password')}<button class="sa-btn pri" type="submit" id="saGo">Update password</button></form></div></div></div>`;
}
async function saSubmitRecovery(){
  const pw = sa$('#password').value, pw2 = sa$('#password2').value; let ok = true;
  ok = saFieldErr('password', saPwProblem(pw)) && ok; ok = saFieldErr('password2', pw === pw2 ? '' : 'The passwords do not match.') && ok; if (!ok) return;
  saBusy(true);
  const {error} = await SA.sb.auth.updateUser({password: pw});
  saBusy(false);
  if (error){ SA.msg = {t: 'bad', m: saErr(error)}; saRender(); return; }
  SA.recovery = false; try { history.replaceState(null, '', location.pathname); } catch (e) {}
  SA.msg = {t: 'ok', m: 'Password updated.'};
  await saSession(SA.session, 'signin');
}
