/* ====================================================================
   DBoard Designer: accounts, cloud projects, dashboard and admin console.
   Loaded after the designer. If the Worker has no Supabase settings, this file does nothing
   and the designer behaves exactly as before (local storage only).
   ==================================================================== */
const SA = {cfg: null, sb: null, session: null, user: null, profile: null, view: 'boot', cloudId: null, rev: null, projects: [], recovery: false,
  saveT: null, saving: false, offline: false, authMode: 'login', msg: null, userSignedOut: false, adminTab: 'overview'};
const SA_COUNTRIES = 'AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI KH CM CA CV CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW'.split(' ');
const SA_OCC = ['Electrical Engineer', 'Electrician', 'Panel Builder', 'System Integrator', 'Student', 'Other'];
const sa$ = (s, r = document) => r.querySelector(s);
const saEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const saLang = () => (typeof LANG === 'string' ? LANG : 'en');
function saCountryName(code){ try { return new Intl.DisplayNames([saLang()], {type: 'region'}).of(code) || code; } catch (e) { return code; } }
function saCountryOptions(sel){
  const L = SA_COUNTRIES.map(c => [c, saCountryName(c)]).sort((a, b) => a[1].localeCompare(b[1], saLang()));
  return '<option value="">' + saEsc(T('Select your country')) + '</option>' + L.map(c => `<option value="${saEsc(c[1])}" ${sel === c[1] ? 'selected' : ''}>${saEsc(c[1])}</option>`).join('');
}
const saInitials = () => { const p = SA.profile || {}, e = (SA.user && SA.user.email) || '?'; const a = ((p.first_name || '')[0] || '') + ((p.last_name || '')[0] || ''); return (a || e[0]).toUpperCase(); };
const saName = () => { const p = SA.profile || {}; return ((p.first_name || '') + ' ' + (p.last_name || '')).trim() || (SA.user && SA.user.email) || ''; };
const saDate = s => { try { return new Date(s).toLocaleDateString(saLang(), {year: 'numeric', month: 'short', day: 'numeric'}); } catch (e) { return ''; } };
const saTime = s => { try { return new Date(s).toLocaleString(saLang(), {dateStyle: 'medium', timeStyle: 'short'}); } catch (e) { return ''; } };
const saRel = s => { const d = (Date.now() - new Date(s)) / 1000; if (d < 60) return T('just now'); if (d < 3600) return Math.floor(d / 60) + ' ' + T('min ago'); if (d < 86400) return Math.floor(d / 3600) + ' ' + T('h ago'); return saDate(s); };

/* ---------- storage adapter: Remember me = localStorage, otherwise sessionStorage ---------- */
const saStore = {
  mode(){ try { return localStorage.getItem('dbd_remember') === '0' ? 'session' : 'local'; } catch (e) { return 'local'; } },
  getItem(k){ try { return localStorage.getItem(k) ?? sessionStorage.getItem(k); } catch (e) { return null; } },
  setItem(k, v){ try { (this.mode() === 'session' ? sessionStorage : localStorage).setItem(k, v); (this.mode() === 'session' ? localStorage : sessionStorage).removeItem(k); } catch (e) {} },
  removeItem(k){ try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {} }
};

/* ---------- validation ---------- */
const saEmailOk = e => /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
function saPwProblem(p){
  if (p.length < 8) return 'Use at least 8 characters.';
  if (p.length > 72) return 'Use 72 characters or fewer.';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Include at least one letter and one number.';
  return '';
}
function saPwScore(p){ let s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++; return s; }
function saErr(e){
  const m = String((e && e.message) || e || '').toLowerCase(), c = e && (e.code || e.status);
  if (m.includes('invalid login')) return 'Email or password is incorrect.';
  if (m.includes('email not confirmed')) return 'Verify your email first. Check your inbox for the link.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Sign in or reset your password.';
  if (m.includes('rate limit') || m.includes('too many') || c === 429) return 'Too many attempts. Wait a minute and try again.';
  if (m.includes('banned') || m.includes('suspended')) return 'This account is suspended. Contact support.';
  if (m.includes('same password')) return 'Choose a password you have not used on this account before.';
  if (m.includes('weak') || m.includes('password should')) return 'That password is too weak. Use at least 8 characters with a letter and a number.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'No connection. Check your internet and try again.';
  if (m.includes('jwt') || c === 401) return 'Your session has expired. Sign in again.';
  return 'Something went wrong. Try again.';
}

/* ---------- boot ---------- */
async function saFetchConfig(){
  try {
    const r = await fetch('/api/config', {cache: 'no-store'});
    if (r.ok && (r.headers.get('content-type') || '').includes('json')){ const c = await r.json(); try { localStorage.setItem('dbd_cfg', JSON.stringify(c)); } catch (e) {} return c; }
  } catch (e) {}
  try { const c = JSON.parse(localStorage.getItem('dbd_cfg') || 'null'); if (c) { c.cached = true; return c; } } catch (e) {}
  return {configured: false};
}
async function saInit(){
  document.documentElement.classList.add('sa-hold');
  SA.cfg = await saFetchConfig();
  if (!SA.cfg.configured || typeof supabase === 'undefined'){ document.documentElement.classList.remove('sa-hold'); return; }   // local-only mode
  const hash = location.hash || '';
  if (/[#&]type=recovery/.test(hash)) SA.recovery = true;
  const he = /[#&]error_description=([^&]*)/.exec(hash);
  if (he){ let d = ''; try { d = decodeURIComponent(he[1].replace(/\+/g, ' ')); } catch (e) {} SA.msg = {t: 'bad', m: /expired|invalid/i.test(d) ? 'That link is invalid or has expired. Request a new one.' : 'The link could not be used. Request a new one.'}; try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  SA.sb = supabase.createClient(SA.cfg.supabaseUrl, SA.cfg.anonKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: saStore, flowType: 'implicit'}});
  saMountChrome();
  SA.sb.auth.onAuthStateChange((ev, s) => { setTimeout(() => saOnAuth(ev, s), 0); });
  const {data, error} = await SA.sb.auth.getSession();
  if (SA.recovery){ if (data && data.session){ SA.session = data.session; SA.user = data.session.user; saGo('recovery'); } else { SA.recovery = false; SA.msg = {t: 'bad', m: 'That link is invalid or has expired. Request a new one.'}; SA.authMode = 'forgot'; saGo('auth'); } }
  else if (data && data.session) await saSession(data.session, 'restore');
  else if (error && !navigator.onLine && saCachedUser()){ SA.offline = true; SA.user = saCachedUser().user; SA.profile = saCachedUser().profile; saGo('app'); }
  else if (!SA.recovery) saNoSession();
  document.documentElement.classList.remove('sa-hold');
}
function saCachedUser(){ try { return JSON.parse(localStorage.getItem('dbd_user') || 'null'); } catch (e) { return null; } }
async function saOnAuth(ev, s){
  if (ev === 'PASSWORD_RECOVERY'){ SA.recovery = true; SA.session = s; SA.user = s && s.user; saGo('recovery'); document.documentElement.classList.remove('sa-hold'); return; }
  if (ev === 'SIGNED_IN' && s){ if (SA.reauth || SA.recovery){ SA.session = s; SA.user = s.user; return; } if (SA.session && SA.session.access_token === s.access_token) return; await saSession(s, 'signin'); }
  else if (ev === 'TOKEN_REFRESHED' && s){ SA.session = s; }
  else if (ev === 'USER_UPDATED' && s){ SA.session = s; SA.user = s.user; }
  else if (ev === 'SIGNED_OUT'){
    const wasIn = !!SA.session; SA.session = null; SA.user = null; SA.profile = null; SA.cloudId = null; saChip();
    if (wasIn && !SA.userSignedOut) SA.msg = {t: 'warn', m: 'Your session has ended. Sign in again.'};
    SA.userSignedOut = false; saNoSession();
  }
}
function saNoSession(){
  if (SA.recovery) return;
  if (SA.cfg.requireLogin){ saGo('auth'); } else { saGo('app'); }
  saMenu();
}
async function saSession(s, why){
  SA.session = s; SA.user = s.user;
  if (!SA.user.email_confirmed_at){ SA.profile = null; saGo('verify'); saMenu(); return; }
  await saLoadProfile();
  if (SA.profile && SA.profile.status === 'suspended'){ saGo('suspended'); saMenu(); return; }
  try { localStorage.setItem('dbd_user', JSON.stringify({user: {id: SA.user.id, email: SA.user.email}, profile: SA.profile})); } catch (e) {}
  if (why === 'signin' || why === 'restore'){
    try { if (!sessionStorage.getItem('dbd_login_logged')){ sessionStorage.setItem('dbd_login_logged', '1'); saTrack('login'); } } catch (e) {}
    SA.sb.rpc('touch_last_seen').then(() => {}, () => {});
  }
  if (SA.view === 'boot' || SA.view === 'auth' || SA.view === 'verify' || SA.view === 'suspended' || SA.view === 'recovery') saGo(why === 'restore' && SA.cfg.landing === 'app' ? 'app' : 'dashboard');
  saMenu();
}
async function saLoadProfile(){
  const {data, error} = await SA.sb.from('profiles').select('*').eq('id', SA.user.id).maybeSingle();
  if (!error) SA.profile = data || null;
  else if (!SA.profile){ const c = saCachedUser(); if (c && c.user.id === SA.user.id) SA.profile = c.profile; }
}
function saTrack(event, meta){ if (!SA.sb || !SA.user) return; SA.sb.from('usage_events').insert({event, meta: meta || {}}).then(() => {}, () => {}); }

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
  const v = SA.view, fn = {auth: saViewAuth, verify: saViewVerify, suspended: saViewSuspended, recovery: saViewRecovery, dashboard: saViewDash, import: saViewImport, account: saViewAccount, admin: saViewAdmin}[v];
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
    form = `<h2>Sign in</h2><p class="lead">Welcome back. Pick up your boards where you left them.</p>${saMsgHtml()}
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
  el.innerHTML = `<div class="sa-auth">${saAside()}<div class="sa-pane"><div class="sa-box"><div class="sa-row" style="justify-content:flex-end;margin-bottom:8px">${saLangSelect()}</div>${form}</div></div></div>`;
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
    try { await SA.sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + '/'}); } catch (e) {}
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
  const {data, error} = await SA.sb.auth.signUp({email, password: pw, options: {emailRedirectTo: location.origin + '/', data: {first_name: fn, last_name: ln, company, country, occupation: occ, accepted_terms: 'true'}}});
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
  w.innerHTML = `<button class="sa-ub" data-sa="menu" aria-haspopup="menu" aria-expanded="false" aria-label="${saEsc(T('Account menu'))}"><span class="sa-av" data-nt>${saEsc(saInitials())}</span><span class="nm" data-nt>${saEsc((SA.profile && SA.profile.first_name) || SA.user.email)}</span></button>`;
  saChip();
}
window.addEventListener('online', () => { saChip(); if (SA.dirty) saFlush(); });
window.addEventListener('offline', saChip);
window.addEventListener('beforeunload', () => { if (SA.dirty && SA.cloudId) { try { localStorage.setItem('dbd_cloudcache_' + SA.cloudId, JSON.stringify({rev: SA.rev, at: Date.now(), data: S})); } catch (e) {} } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && SA.dirty) { clearTimeout(SA.saveT); saFlush(); } });

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

/* ====================================================================
   Panel import: photo(s) or PDF -> reviewed device list -> board
   The reading is done by the Worker (/api/import/analyze). Nothing is created until the user has reviewed and edited it.
   ==================================================================== */
const IMP_KINDS = [['mcb', 'MCB'], ['rcbo', 'RCBO'], ['rccb', 'RCCB'], ['isolator', 'Isolator'], ['mccb', 'MCCB'], ['contactor', 'Contactor'], ['relay', 'Relay'], ['spd', 'Surge protector'], ['meter', 'Meter'], ['timer', 'Timer'], ['psu', 'Power supply'], ['dimmer', 'Dimmer'], ['controller', 'Controller'], ['terminal_block', 'Terminal block'], ['other', 'Other']];
const IMP_W = {rccb: 2, isolator: 2, mccb: 3, contactor: 2, relay: 1, meter: 4, timer: 1, psu: 4, dimmer: 2, controller: 4, terminal_block: 2, other: 2};
const IMP_GUESS = [[/light|lamp|lum|illum|downlight|led/i, 'lighting'], [/socket|outlet|plug|prize|presa|steckdose|prise/i, 'sockets'], [/bilge|sump/i, 'bilge'], [/pump|pompa|pumpe/i, 'pump'], [/water ?heat|calorif|boiler|geyser/i, 'waterheater'], [/heat|radiat|chauff/i, 'heater'], [/cook|oven|hob|range|cuisini/i, 'cooker'], [/fridge|freez|refrig|cold/i, 'fridge'], [/washer|dryer|laundry|washing/i, 'laundry'], [/a\/c|air.?con|hvac|chiller|split/i, 'ac'], [/fan|vent|extract/i, 'fan'], [/ev |charger|wallbox/i, 'ev'], [/ups|inverter/i, 'inverter'], [/network|switch rack|wifi|router|data/i, 'network'], [/nav|radar|plotter|gps/i, 'nav'], [/alarm|cctv|security/i, 'security'], [/emerg/i, 'emergency'], [/motor/i, 'motor']];
function saImpReset(){ if (SA.imp) (SA.imp.files || []).forEach(f => { try { URL.revokeObjectURL(f.url); } catch (e) {} }); SA.imp = {stage: 'upload', files: [], panel: null, rows: [], set: {}, issues: [], err: null, notes: '', std: '', truncated: false}; }
const saImpOn = () => !!(SA.cfg && SA.cfg.importEnabled);

/* ---------- file preparation (photos are resized here, PDFs pass through) ---------- */
const saB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
async function saImgPrep(file){
  let bmp; try { bmp = await createImageBitmap(file, {imageOrientation: 'from-image'}); } catch (e) { throw new Error('This image format is not supported. Use JPEG, PNG or WebP.'); }
  let max = 2200, q = 0.88, blob, data;
  for (let i = 0; i < 5; i++){
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', q)); data = await saB64(blob);
    if (data.length < 6_500_000) break; max = Math.round(max * 0.75); q = 0.8;
  }
  return {name: file.name || 'photo.jpg', mime: 'image/jpeg', data, url: URL.createObjectURL(blob)};
}
async function saImpAdd(list){
  const I = SA.imp; I.err = null;
  for (const f of Array.from(list)){
    try {
      const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
      if (isPdf){
        if (I.files.length) throw new Error('Add either one PDF or up to four photos, not both.');
        if (f.size > 12 * 1024 * 1024) throw new Error('The PDF is larger than 12 MB. Split it or export fewer pages.');
        I.files = [{name: f.name, mime: 'application/pdf', data: await saB64(f), url: URL.createObjectURL(f)}]; break;
      }
      if (I.files.some(x => x.mime === 'application/pdf')) throw new Error('Add either one PDF or up to four photos, not both.');
      if (I.files.length >= 4) throw new Error('Use at most four photos.');
      I.files.push(await saImgPrep(f));
    } catch (e) { I.err = e.message; break; }
  }
  saRender();
}

/* ---------- analysis ---------- */
async function saImpRun(){
  const I = SA.imp; if (!I.files.length) return;
  I.stage = 'busy'; I.err = null; saRender();
  let r, j;
  try {
    r = await fetch('/api/import/analyze', {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + SA.session.access_token}, body: JSON.stringify({files: I.files.map(f => ({mime: f.mime, data: f.data})), hints: {standard: I.std || undefined, notes: I.notes || undefined}})});
    j = await r.json().catch(() => ({}));
  } catch (e) { I.stage = 'upload'; I.err = 'No connection. Check your internet and try again.'; saRender(); return; }
  if (!r.ok){ I.stage = 'upload'; I.err = j.error || 'The panel could not be read.'; saRender(); return; }
  saImpLoad(j.panel, !!j.truncated);
}
function saImpLoad(p, truncated){
  const I = SA.imp, P = p || {}, panel = P.panel || {}, devs = (P.devices || []).map((d, i) => Object.assign({}, d, {_i: i}));
  devs.sort((a, b) => ((a.rail || 99) - (b.rail || 99)) || ((a.slot || 999) - (b.slot || 999)) || (a._i - b._i));
  const three = devs.some(d => (d.poles || 0) >= 3 || d.phase === '3P' || d.phase === 'L2' || d.phase === 'L3');
  I.rows = devs.map(d => ({inc: !!d.is_incomer, use: true, kind: d.kind, ref: d.circuit_ref || '', label: d.label || d.load_description || '', rating: d.rating_a || '', curve: d.curve || '', poles: d.poles || '', rcd: d.rcd_ma || '', phase: d.phase || 'unknown', ltype: d.load_type || '', P: d.power_w || '', len: d.cable_length_m || '', cable: d.cable_mm2 || '', mfr: d.manufacturer || '', model: d.model || '', conf: d.confidence, notes: d.notes || '', rail: d.rail, slot: d.slot}));
  const incs = I.rows.filter(r => r.inc); if (incs.length > 1) incs.slice(1).forEach(r => r.inc = false);
  I.set = {name: panel.name || panel.project || 'Imported board', std: panel.standard || 'iec', sys: panel.system || (three ? '3p400' : '1p230'), cols: [12, 18, 24, 36, 48].reduce((a, b) => Math.abs(b - (panel.modules_per_rail || 24)) < Math.abs(a - (panel.modules_per_rail || 24)) ? b : a)};
  I.assumed = {sys: !panel.system, std: !panel.standard};
  I.issues = (P.issues || []).slice(); if (panel.notes) I.issues.push(panel.notes);
  I.srcType = P.source_type; I.truncated = truncated; I.stage = 'review'; saRender();
}

/* ---------- build a board from the reviewed rows ---------- */
function saImpBuild(){
  const I = SA.imp, set = I.set, sys = SYSTEMS.find(x => x.id === set.sys) || SYSTEMS[1], std = STD[set.std] || STD.iec, notes = [];
  const B = Object.assign(exampleProject(), {name: String(set.name || 'Imported board').slice(0, 120), std: STD[set.std] ? set.std : 'iec', sysId: sys.id, phases: sys.phases, vLN: sys.vLN, f: sys.f, custom: [], modules: [], circuits: [], order: [], incomer: 0, spd: false, cols: +set.cols || 24, mainOff: false});
  const three = sys.phases === 3, lv = !!sys.lv, vL = three ? sys.vLN * Math.sqrt(3) : sys.vLN; let rot = 0, nC = 0, nX = 0, est = 0, noRating = 0, phGuess = 0, typeGuess = 0, incSeen = false;
  const used = new Set(); const rows = I.rows.filter(r => r.use);
  rows.forEach(r => {
    const rating = +r.rating > 0 ? +r.rating : 0, poles = Math.min(4, Math.max(0, Math.round(+r.poles || 0)));
    if (r.inc){
      incSeen = true; if (rating) B.incomer = rating; else notes.push('Main switch rating not read: the app sizes it from the load.');
      if (poles) B.incPoles = poles + 'P'; return;
    }
    if (r.kind === 'spd'){ B.spd = true; return; }
    if (['mcb', 'rcbo', 'mccb'].includes(r.kind)){
      nC++; const id = 'c' + nC; let ref = (r.ref || '').trim().slice(0, 20) || 'C' + nC; while (used.has(ref)) ref += '*'; used.add(ref);
      const name = (r.label || ('Circuit ' + nC)).slice(0, 80);
      let type = TYPES[r.ltype] ? r.ltype : ''; if (!type){ const g = IMP_GUESS.find(x => x[0].test(name)); type = g ? g[1] : 'other'; if (g) typeGuess++; }
      const tp = TYPES[type], pf = tp.pf, thr = three && (poles >= 3 || r.phase === '3P');
      let ph = thr ? '3P' : (['L1', 'L2', 'L3'].includes(r.phase) && three ? r.phase : 'L1');
      if (three && !thr && !['L1', 'L2', 'L3'].includes(r.phase)){ ph = ['L1', 'L2', 'L3'][rot++ % 3]; phGuess++; }
      let P = +r.P > 0 ? +r.P : 0; if (!P){ const In = rating || 16; if (!rating) noRating++; P = Math.round((thr ? In * vL * Math.sqrt(3) : In * sys.vLN) * 0.8 * pf / 10) * 10; est++; }
      const rc = r.kind === 'rcbo' || +r.rcd > 0;
      B.circuits.push({id, ref, name, type, mod: '', zone: 1, P, pf, phase: ph, len: +r.len > 0 ? +r.len : 10, prot: rc && !lv ? 'RCBO' : 'MCB', curve: std.curves.includes(r.curve) ? r.curve : std.curves[0], dem: 1, grp: 1, cable: 'pvc', size: +r.cable > 0 ? +r.cable : 'auto', inO: rating});
      B.order.push('c:' + id); return;
    }
    nX++; let id = 'X' + nX; const kn = (IMP_KINDS.find(k => k[0] === r.kind) || [0, 'Device'])[1];
    const name = (r.label || (kn + (rating ? ' ' + rating + ' A' : '') + (+r.rcd ? ' ' + r.rcd + ' mA' : ''))).slice(0, 80);
    B.custom.push({id, name, note: [r.mfr, r.model, r.notes].filter(Boolean).join(' · ').slice(0, 200), w: Math.min(24, poles || IMP_W[r.kind] || 2), rating: rating || '', ph: 'N', heatW: 0});
    B.order.push('x:' + id);
  });
  if (!incSeen) notes.push('No main switch was identified: the app adds one sized from the load.');
  if (est) notes.push(`${est} circuit load${est > 1 ? 's' : ''} not on the drawing or labels: estimated at 80% of the breaker rating${noRating ? ` (${noRating} had no rating either, 16 A assumed)` : ''}. Replace with real loads.`);
  if (phGuess) notes.push(`${phGuess} circuit${phGuess > 1 ? 's have' : ' has'} no readable phase: assigned L1, L2, L3 in rotation.`);
  if (typeGuess) notes.push(`${typeGuess} circuit type${typeGuess > 1 ? 's' : ''} guessed from the label text.`);
  if (I.assumed.sys) notes.push('The supply system was not on the panel: check it.');
  return {B, notes, counts: {circuits: B.circuits.length, devices: B.custom.length, spd: B.spd}};
}
async function saImpCreate(){
  const I = SA.imp; let built;
  try { built = saImpBuild(); } catch (e) { toast('The board could not be built. Check the values and try again.'); return; }
  const {B, notes} = built;
  if (!B.circuits.length && !B.custom.length){ toast('Add at least one device first.'); return; }
  const btn = sa$('#impCreate'); if (btn) btn.disabled = true;
  try { const row = await saCreateProject(B, B.name); saTrack('import_created', {src: I.srcType || ''}); tab = 'circuits'; SA.impNotes = notes; saImpReset(); await saOpenProject(row.id); if (notes.length) saModal(`<h2>${saEsc(T('Board created. Please check:'))}</h2><ul style="padding-left:18px">${notes.map(n => `<li style="margin:6px 0">${saEsc(T(n))}</li>`).join('')}</ul><div class="sa-row"><button class="sa-btn pri" data-sa="close">${saEsc(T('Close'))}</button></div>`); }
  catch (e) { toast(saErr(e)); if (btn) btn.disabled = false; }
}

/* ---------- view ---------- */
function saImpTable(){
  const I = SA.imp, n = x => x === '' || x == null ? '' : x;
  const kinds = k => IMP_KINDS.map(o => `<option value="${o[0]}" ${o[0] === k ? 'selected' : ''}>${saEsc(T(o[1]))}</option>`).join('');
  const types = t => '<option value="">–</option>' + Object.keys(TYPES).map(k => `<option value="${k}" ${k === t ? 'selected' : ''}>${saEsc(T(TYPES[k].l))}</option>`).join('');
  const std = STD[I.set.std] || STD.iec, curves = ['', 'B', 'C', 'D', 'K', 'Z', 'Std'];
  return `<div class="sa-card sa-tw" style="padding:0"><table class="sa-tab" id="impT"><thead><tr><th>${saEsc(T('Use'))}</th><th>${saEsc(T('Main'))}</th><th>${saEsc(T('Ref'))}</th><th>${saEsc(T('Label'))}</th><th>${saEsc(T('Device'))}</th><th>A</th><th>${saEsc(T('Curve'))}</th><th>${saEsc(T('Poles'))}</th><th>mA</th><th>${saEsc(T('Phase'))}</th><th>${saEsc(T('Load type'))}</th><th>W</th><th>m</th><th>mm²</th><th></th></tr></thead><tbody>${I.rows.map((r, i) => {
    const low = r.conf < 0.6; const f = (k, v, w, t, ex) => `<input class="sa-in imp-in" data-ir="${i}" data-f="${k}" ${t ? 'type="number" step="any" min="0"' : 'type="text"'} value="${saEsc(n(v))}" style="width:${w}px;min-height:32px;padding:3px 6px" ${ex || ''}>`;
    return `<tr style="${low ? 'background:var(--warn-bg)' : ''}${r.use ? '' : ';opacity:.5'}"><td><input type="checkbox" data-ir="${i}" data-f="use" ${r.use ? 'checked' : ''} aria-label="${saEsc(T('Use'))}"></td><td><input type="radio" name="impInc" data-ir="${i}" data-f="inc" ${r.inc ? 'checked' : ''} aria-label="${saEsc(T('Main switch'))}"></td><td>${f('ref', r.ref, 62, 0, 'maxlength="20"')}</td><td>${f('label', r.label, 190, 0, 'maxlength="120"')}${r.notes ? `<div class="sa-fine" style="color:var(--ink-2);max-width:230px">${saEsc(r.notes)}</div>` : ''}</td><td><select class="sa-in imp-in" data-ir="${i}" data-f="kind" style="min-height:32px;padding:3px 4px;width:118px">${kinds(r.kind)}</select></td><td>${f('rating', r.rating, 58, 1)}</td><td><select class="sa-in imp-in" data-ir="${i}" data-f="curve" style="min-height:32px;padding:3px 4px;width:62px">${curves.map(c => `<option ${c === r.curve ? 'selected' : ''} value="${c}">${c || '–'}</option>`).join('')}</select></td><td>${f('poles', r.poles, 46, 1, 'max="4"')}</td><td>${f('rcd', r.rcd, 52, 1)}</td><td><select class="sa-in imp-in" data-ir="${i}" data-f="phase" style="min-height:32px;padding:3px 4px;width:94px">${['unknown', 'L1', 'L2', 'L3', '3P', 'N'].map(p => `<option ${p === r.phase ? 'selected' : ''}>${p}</option>`).join('')}</select></td><td><select class="sa-in imp-in" data-ir="${i}" data-f="ltype" style="min-height:32px;padding:3px 4px;width:130px">${types(r.ltype)}</select></td><td>${f('P', r.P, 70, 1)}</td><td>${f('len', r.len, 52, 1)}</td><td>${f('cable', r.cable, 52, 1)}</td><td style="white-space:nowrap"><span class="sa-pill ${r.conf >= 0.8 ? 'ok' : r.conf >= 0.6 ? '' : 'warn'}" title="${saEsc(T('How sure the reading is'))}">${Math.round(r.conf * 100)}%</span> <button class="sa-btn sm bad" data-sa="imprm" data-i="${i}" aria-label="${saEsc(T('Delete'))}">✕</button></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function saViewImport(el){
  const I = SA.imp || (saImpReset(), SA.imp);
  let body = '';
  if (I.stage === 'busy'){
    body = `<div class="sa-card sa-splash" style="flex-direction:column;gap:12px"><div class="sa-spin" aria-hidden="true"></div><b>${saEsc(T('Reading the panel…'))}</b><span>${saEsc(T('This usually takes 20 to 60 seconds. Keep this page open.'))}</span></div>`;
  } else if (I.stage === 'review'){
    const s = I.set, sysOpts = SYSTEMS.map(x => `<option value="${x.id}" ${x.id === s.sys ? 'selected' : ''}>${saEsc(x.label)}</option>`).join(''), stdOpts = Object.keys(STD).map(k => `<option value="${k}" ${k === s.std ? 'selected' : ''}>${saEsc(STD[k].n)}</option>`).join('');
    const low = I.rows.filter(r => r.conf < 0.6).length, nCirc = I.rows.filter(r => r.use && ['mcb', 'rcbo', 'mccb'].includes(r.kind) && !r.inc).length;
    const prev = I.files.map(f => f.mime === 'application/pdf' ? `<iframe src="${f.url}" title="${saEsc(f.name)}" style="width:100%;height:520px;border:1px solid var(--line);border-radius:4px;background:#fff"></iframe>` : `<img src="${f.url}" alt="${saEsc(f.name)}" class="imp-img" data-sa="impzoom" style="width:100%;border:1px solid var(--line);border-radius:4px;cursor:zoom-in;margin-bottom:8px">`).join('');
    body = `${saMsgHtml()}${I.truncated ? `<div class="sa-msg warn" style="margin-bottom:12px">${saEsc(T('The panel was large and the reading was cut short. Add the missing devices by hand, or run it again with closer photos of the right-hand side.'))}</div>` : ''}${I.issues.length ? `<div class="sa-msg warn" style="margin-bottom:12px"><b>${saEsc(T('Check these'))}</b><ul style="margin:6px 0 0;padding-left:18px">${I.issues.map(x => `<li>${saEsc(x)}</li>`).join('')}</ul></div>` : ''}
    <div class="sa-grid" style="grid-template-columns:minmax(260px,1fr) minmax(0,2.4fr);align-items:start" id="impGrid"><div class="sa-card" style="position:sticky;top:70px"><h2>${saEsc(T('Your source'))}</h2><div style="max-height:70vh;overflow:auto">${prev}</div></div>
    <div><div class="sa-card" style="margin-bottom:14px"><h2>${saEsc(T('Board'))}</h2><div class="sa-form"><label class="sa-field full"><span>${saEsc(T('Board name'))}</span><input id="impName" value="${saEsc(s.name)}" maxlength="120"></label><label class="sa-field"><span>${saEsc(T('Standard'))}</span><select id="impStd">${stdOpts}</select>${I.assumed.std ? `<small>${saEsc(T('Not on the panel. Assumed, please check.'))}</small>` : ''}</label><label class="sa-field"><span>${saEsc(T('Supply'))}</span><select id="impSys">${sysOpts}</select>${I.assumed.sys ? `<small>${saEsc(T('Not on the panel. Assumed, please check.'))}</small>` : ''}</label><label class="sa-field"><span>${saEsc(T('Modules per DIN rail'))}</span><select id="impCols">${[12, 18, 24, 36, 48].map(n => `<option ${n === s.cols ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div></div>
    <div class="sa-row" style="justify-content:space-between;margin-bottom:8px"><span><b>${I.rows.length}</b> ${saEsc(T('devices read'))} · <b>${nCirc}</b> ${saEsc(T('circuits'))}${low ? ` · <span class="sa-pill warn">${low} ${saEsc(T('low confidence, highlighted'))}</span>` : ''}</span><span class="sa-row"><button class="sa-btn sm" data-sa="impadd">${saEsc(T('Add device'))}</button></span></div>
    ${I.rows.length ? saImpTable() : `<div class="sa-empty">${saEsc(T('Nothing was recognised. Add devices by hand, or go back and try a clearer photo.'))}</div>`}
    <p class="sa-fine" style="color:var(--ink-2);margin:10px 0">${saEsc(T('Fix anything that looks wrong. Loads you leave blank are estimated from the breaker rating. Nothing is saved until you press Create board.'))}</p>
    <div class="sa-row"><button class="sa-btn pri" id="impCreate" data-sa="impcreate">${saEsc(T('Create board'))}</button><button class="sa-btn" data-sa="impback">${saEsc(T('Start over'))}</button></div></div></div>`;
  } else {
    const on = saImpOn(), pre = I.files.map((f, i) => `<div class="sa-card" style="padding:8px;display:flex;gap:10px;align-items:center">${f.mime === 'application/pdf' ? '<b style="font-size:28px">PDF</b>' : `<img src="${f.url}" alt="" style="width:64px;height:48px;object-fit:cover;border-radius:3px">`}<span style="flex:1;overflow-wrap:anywhere">${saEsc(f.name)}</span><button class="sa-btn sm" data-sa="impdel" data-i="${i}">${saEsc(T('Remove'))}</button></div>`).join('');
    body = `${I.err ? `<div class="sa-msg bad" role="alert" style="margin-bottom:12px">${saEsc(T(I.err))}</div>` : ''}${on ? '' : `<div class="sa-msg warn" style="margin-bottom:12px">${saEsc(T('Panel import is not switched on for this site yet. The site owner needs to add the reading service key (see the README).'))}</div>`}
    <div class="sa-grid c2"><section class="sa-card"><h2>${saEsc(T('Add photos or a PDF'))}</h2><p class="sa-sub" style="margin-bottom:12px">${saEsc(T('Up to four photos of one panel, or one PDF schematic or circuit schedule.'))}</p>
    <div class="sa-row" style="margin-bottom:12px"><label class="sa-btn pri" style="cursor:pointer">${saEsc(T('Choose files'))}<input type="file" id="impFile" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple hidden></label><label class="sa-btn" style="cursor:pointer">${saEsc(T('Take photo'))}<input type="file" id="impCam" accept="image/*" capture="environment" hidden></label></div>
    <div class="sa-grid" style="gap:8px;margin-bottom:12px">${pre}</div>
    <div class="sa-form" style="grid-template-columns:1fr"><label class="sa-field"><span>${saEsc(T('Wiring standard (optional)'))}</span><select id="impHintStd"><option value="">${saEsc(T('Detect from the panel'))}</option>${Object.keys(STD).map(k => `<option value="${k}" ${I.std === k ? 'selected' : ''}>${saEsc(STD[k].n)}</option>`).join('')}</select></label><label class="sa-field"><span>${saEsc(T('Notes for the reader (optional)'))}</span><textarea id="impNotes" maxlength="300" placeholder="${saEsc(T('For example: labels are in Italian, panel is a marine 230 V board'))}" style="min-height:70px">${saEsc(I.notes)}</textarea></label></div>
    <div class="sa-row" style="margin-top:14px"><button class="sa-btn pri" data-sa="imprun" ${on && I.files.length ? '' : 'disabled'}>${saEsc(T('Read panel'))}</button></div></section>
    <section class="sa-card"><h2>${saEsc(T('For the best reading'))}</h2><ul style="padding-left:18px;margin:0;display:grid;gap:8px"><li>${saEsc(T('Take the photo straight on with the door open, not from an angle.'))}</li><li>${saEsc(T('Avoid glare and shadows. Switch the flash off if labels reflect it.'))}</li><li>${saEsc(T('For large boards add close-ups of each row so the breaker markings and labels are sharp.'))}</li><li>${saEsc(T('Include the circuit legend or label strip if there is one.'))}</li><li>${saEsc(T('For PDFs, vector drawings and text schedules read best. Scans need to be sharp.'))}</li></ul><p class="sa-fine" style="color:var(--ink-2);margin-top:12px">${saEsc(T('The photo or PDF is sent to the reading service to be analysed and is not stored. You review everything before a board is created.'))}</p></section></div>`;
  }
  el.innerHTML = saFrame('import', `<h1 class="sa-h1">${saEsc(T('Import a panel'))}</h1><p class="sa-sub">${saEsc(T('Turn a photo of a built panel, or a PDF schematic, into an editable board with circuits, labels, schematic and bill of materials.'))}</p>${I.stage === 'upload' ? '' : ''}${body}`);
}
function saImpSet(el){
  const t = el.dataset, I = SA.imp, i = +t.ir, r = I.rows[i]; if (!r) return;
  const f = t.f; let v = el.type === 'checkbox' ? el.checked : el.value;
  if (f === 'inc'){ I.rows.forEach(x => x.inc = false); r.inc = true; return; }
  if (['rating', 'poles', 'rcd', 'P', 'len', 'cable'].includes(f)) v = v === '' ? '' : Math.max(0, +v || 0);
  r[f] = v;
  if (f === 'use') el.closest('tr').style.opacity = v ? '' : '.5';
}
document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.id === 'impFile' || t.id === 'impCam'){ const l = t.files; if (l && l.length) await saImpAdd(l); t.value = ''; return; }
  if (!SA.imp || SA.view !== 'import') return;
  if (t.id === 'impHintStd') SA.imp.std = t.value; else if (t.id === 'impStd') SA.imp.set.std = t.value; else if (t.id === 'impSys'){ SA.imp.set.sys = t.value; SA.imp.assumed.sys = false; } else if (t.id === 'impCols') SA.imp.set.cols = +t.value;
  else if (t.dataset && t.dataset.ir != null) saImpSet(t);
});
document.addEventListener('input', ev => {
  const t = ev.target; if (!SA.imp || SA.view !== 'import') return;
  if (t.id === 'impNotes') SA.imp.notes = t.value; else if (t.id === 'impName') SA.imp.set.name = t.value;
  else if (t.dataset && t.dataset.ir != null && t.type !== 'checkbox' && t.type !== 'radio' && t.tagName !== 'SELECT') saImpSet(t);
});
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-sa]'); if (!b) return; const a = b.dataset.sa, I = SA.imp;
  if (a === 'import'){ if (!I || I.stage !== 'review') saImpReset(); saGo('import'); }
  else if (a === 'imprun') saImpRun();
  else if (a === 'impback'){ saImpReset(); saRender(); }
  else if (a === 'impdel'){ const f = I.files.splice(+b.dataset.i, 1)[0]; if (f) try { URL.revokeObjectURL(f.url); } catch (e) {} saRender(); }
  else if (a === 'imprm'){ I.rows.splice(+b.dataset.i, 1); saRender(); }
  else if (a === 'impadd'){ I.rows.push({inc: false, use: true, kind: 'mcb', ref: '', label: '', rating: '', curve: '', poles: '', rcd: '', phase: 'unknown', ltype: '', P: '', len: '', cable: '', mfr: '', model: '', conf: 1, notes: '', rail: null, slot: null}); saRender(); setTimeout(() => { const l = document.querySelectorAll('#impT tbody tr'); if (l.length) l[l.length - 1].scrollIntoView({block: 'center'}); }, 30); }
  else if (a === 'impcreate') saImpCreate();
  else if (a === 'impzoom'){ const z = b.style.width === '220%'; b.style.width = z ? '100%' : '220%'; b.style.maxWidth = 'none'; b.style.cursor = z ? 'zoom-in' : 'zoom-out'; }
});

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
