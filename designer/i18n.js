/* ---------- language support ----------
   English is the source language. Every other language is a dictionary of exact strings plus
   patterns with {1} {2} placeholders (see i18n-data.js). A DOM walker translates text and a few
   attributes, and a MutationObserver keeps newly drawn screens translated. */
const LANGS = [['en', 'English'], ['ro', 'Română'], ['it', 'Italiano'], ['fr', 'Français'], ['es', 'Español'], ['pt', 'Português'], ['ja', '日本語'], ['vi', 'Tiếng Việt'], ['th', 'ไทย'], ['ru', 'Русский'], ['pl', 'Polski'], ['de', 'Deutsch'], ['zh', '中文']];
let LANG = 'en';
const I18N_ATTRS = ['title', 'placeholder', 'aria-label', 'alt', 'data-label'];
const I18N_SKIP = {SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1, OPTGROUP: 0};
const I18N_MISS = {};
const I18N_ORIG = new WeakMap();
let I18N_BUSY = false, I18N_OBS = null;

function i18nCompile(){
  Object.keys(window.DICT || {}).forEach(k => {
    const d = window.DICT[k];
    if (d.C) return;
    d.C = true;
    d.PC = (d.P || []).map(p => {
      const src = p[0], parts = src.split(/\{(\d+)\}/);
      let re = '^';
      for (let i = 0; i < parts.length; i++){
        if (i % 2 === 0) re += parts[i].replace(/[.*+?^$()|[\]\\]/g, '\\$&');
        else {
          const before = parts[i - 1], after = parts[i + 1] || '';
          const num = /^ ?(%|A\b|kA\b|W\b|V\b|mm\b|kW\b|kVA\b|C\b|°C|modules?\b|fail\b|fed\b|series\b|manufacturers\b|in satellite|zones?\b|DIN-rail|BTU)/.test(after) || /[Zz]one $/.test(before) && !/^[A-Za-z]/.test(after.trim() || '-');
          re += num ? '([\\d.,]+(?:[/–-][\\d.,]+)*)' : '(.+?)';
        }
      }
      return {re: new RegExp(re + '$'), t: p[1]};
    });
  });
}
const I18N_CACHE = {};
function tr(core, exactOnly, deep){
  const d = (window.DICT || {})[LANG];
  if (!d) return core;
  if (Object.prototype.hasOwnProperty.call(d.E, core)) return d.E[core];
  const ck = LANG + '\u0001' + core;
  if (I18N_CACHE[ck] !== undefined) return I18N_CACHE[ck];
  let out = core;
  if (/[A-Za-z]{2}/.test(core)){
    let hit = false;
    for (const p of d.PC){
      const m = core.match(p.re);
      if (m){ out = p.t.replace(/\{(\d+)\}/g, (_, n) => { const a = m[+n]; return a == null ? '' : tr(a.trim(), false, 1); }); hit = true; break; }
    }
    if (!hit && !deep){
      /* long texts are translated sentence by sentence, and "A · B" labels part by part */
      let parts = core.split(' · ');
      if (parts.length > 1){
        const t = parts.map(x => tr(x, false, 1));
        if (t.some((x, i) => x !== parts[i])) { out = t.join(' · '); hit = true; }
      }
      if (!hit){
        parts = core.split(/(?<=[.!?])\s+/);
        if (parts.length > 1){
          const t = parts.map(x => tr(x, false, 1));
          if (t.some((x, i) => x !== parts[i])) { out = t.join(d.sp === 0 ? '' : ' '); hit = true; }
        }
      }
    }
    if (!hit && !deep) I18N_MISS[core] = 1;
  }
  I18N_CACHE[ck] = out;
  return out;
}
function T(s){
  if (LANG === 'en' || typeof s !== 'string') return s;
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m[2]) return s;
  const r = tr(m[2], false);
  return r === m[2] ? s : m[1] + r + m[3];
}
/* text for the PDF, which only has Latin-1 fonts: translate where the font can show it */
function PT(s){
  if (LANG === 'en') return s;
  if (['de', 'fr', 'es', 'it', 'pt'].includes(LANG)) return T(s);
  if (['pl', 'ro', 'vi'].includes(LANG)) return T(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  return s;
}
function i18nText(n, svg){
  let r = I18N_ORIG.get(n);
  const cur = n.nodeValue;
  if (!r || cur !== r.t) r = {o: cur, t: cur};
  const t = LANG === 'en' ? r.o : T(r.o);
  if (t !== cur) n.nodeValue = t;
  r.t = t;
  I18N_ORIG.set(n, r);
}
function i18nAttrs(el){
  I18N_ATTRS.forEach(a => {
    if (!el.hasAttribute(a)) return;
    let r = I18N_ORIG.get(el); if (!r) { r = {}; I18N_ORIG.set(el, r); }
    const cur = el.getAttribute(a);
    let x = r[a];
    if (!x || cur !== x.t) x = {o: cur, t: cur};
    const t = LANG === 'en' ? x.o : T(x.o, false);
    if (t !== cur) el.setAttribute(a, t);
    x.t = t; r[a] = x;
  });
}
function i18nWalk(el, svg){
  if (el.nodeType === 3){ i18nText(el, svg); return; }
  if (el.nodeType !== 1 || I18N_SKIP[el.tagName] || el.hasAttribute('data-nt')) return;
  const inSvg = svg || el.tagName.toLowerCase() === 'svg';
  i18nAttrs(el);
  for (let c = el.firstChild; c; c = c.nextSibling) i18nWalk(c, inSvg);
}
function i18nRun(fn){
  if (I18N_BUSY) return;
  I18N_BUSY = true;
  try { fn(); } finally { if (I18N_OBS) I18N_OBS.takeRecords(); I18N_BUSY = false; }
}
function i18nApply(){
  i18nCompile();
  i18nRun(() => { i18nWalk(document.body, false); document.title = LANG === 'en' ? 'DBoard Designer' : (T('DBoard Designer') || 'DBoard Designer'); });
}
function setLang(l){
  if (!LANGS.some(x => x[0] === l)) l = 'en';
  LANG = l;
  document.documentElement.lang = l;
  try { localStorage.setItem('dbd_lang', l); } catch (e) {}
  const sel = document.getElementById('lang'); if (sel && sel.value !== l) sel.value = l;
  if (typeof tab !== 'undefined' && tab === 'help' && typeof draw === 'function') draw();
  i18nApply();
}
function initLang(){
  let l = 'en';
  try { l = localStorage.getItem('dbd_lang') || ''; } catch (e) {}
  if (!l){
    const nav = ((navigator.languages && navigator.languages[0]) || navigator.language || 'en').slice(0, 2).toLowerCase();
    l = LANGS.some(x => x[0] === nav) ? nav : 'en';
  }
  const sel = document.getElementById('lang');
  if (sel){ sel.innerHTML = LANGS.map(x => `<option value="${x[0]}">${x[1]}</option>`).join(''); sel.setAttribute('data-nt', ''); sel.value = l; }
  I18N_OBS = new MutationObserver(recs => i18nRun(() => {
    recs.forEach(r => {
      if (r.type === 'childList') r.addedNodes.forEach(n => { const p = n.parentNode; if (n.nodeType === 3) i18nText(n, !!(p && p.closest && p.closest('svg'))); else i18nWalk(n, !!(p && p.closest && p.closest('svg'))); });
      else if (r.type === 'characterData'){ const p = r.target.parentNode; i18nText(r.target, !!(p && p.closest && p.closest('svg'))); }
      else if (r.type === 'attributes') i18nAttrs(r.target);
    });
  }));
  I18N_OBS.observe(document.body, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS});
  setLang(l);
}
