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
