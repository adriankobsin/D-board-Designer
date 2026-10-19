/* ========== DBoard Designer interface ========== */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const KEY = 'boardline.project.v1';
const PHV = {L1:'var(--ph1)', L2:'var(--ph2)', L3:'var(--ph3)', '3P':'var(--phA)', N:'var(--phN)'};
const PHRGB = {L1:[154,99,48], L2:[42,47,54], L3:[143,153,164], '3P':[11,107,142], N:[62,121,186]};
let S, R, B, tab = 'panel', sel = null, libQ = '', libFam = '', libBrand = '', brkQ = '', brkMfr = '', brkKind = '', saveT = null, delArm = null;
const mqNarrow = () => window.innerWidth < 700;
let fitP = !mqNarrow(), fitD = !mqNarrow(), bp = '';

function load(){
  try { const j = localStorage.getItem(KEY); if (j){ const p = JSON.parse(j); if (p && p.circuits && p.modules && STD[p.std]) return p; } } catch (e) {}
  return exampleProject();
}
function persist(){ clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }, 400); }
function toast(msg){ const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = T(msg); document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }
function fix(){
  const sys = SYSTEMS.find(s => s.id === S.sysId) || SYSTEMS[1];
  if (S.phases !== sys.phases && S.sysId) { /* keep custom */ }
  if (isLV(S)) S.circuits.forEach(c => { c.prot = 'MCB'; });
  S.circuits.forEach(c => { if (S.phases === 1) c.phase = 'L1'; if (c.phase === '3P' && S.phases === 1) c.phase = 'L1'; });
  S.modules.forEach(m => { if (S.phases === 1) m.phase = 'L1'; });
  S.circuits.forEach(c => { if (c.mod){ const m = S.modules.find(x => x.id === c.mod), z = m && (libOf(m.model) || {}).zones; if (!z) c.mod = ''; else if (c.zone > z) c.zone = z; } });
  const std = STD[S.std];
  S.circuits.forEach(c => { if (!std.curves.includes(c.curve)) c.curve = std.curves[0]; });
  try { daliFix(); } catch (e) { console.warn('DALI data skipped', e); }
}
function calc(){
  fix();
  const dcm = isDC(S);
  PHV.L1 = dcm ? 'var(--dcpos)' : 'var(--ph1)'; PHV.N = dcm ? 'var(--dcneg)' : 'var(--phN)';
  PHRGB.L1 = dcm ? [192,57,43] : [154,99,48]; PHRGB.N = dcm ? [42,47,54] : [62,121,186];
  R = compute(S); B = buildDevices(S, R);
}
const busLab = p => isDC(S) ? (p === 'L1' ? '+' : p === 'N' ? '−' : p) : (p === 'N' ? 'N' : p);
function statusOf(ref){
  const m = R.checks.filter(c => c.ref === ref);
  return m.some(c => c.lvl === 'err') ? 'bad' : m.some(c => c.lvl === 'warn') ? 'warn' : 'ok';
}
const stLabel = {ok:'OK', warn:'Check', bad:'Fail'};
const tag = s => `<span class="tag ${s}">${stLabel[s]}</span>`;
const fmt = (x, d = 1) => (x == null || isNaN(x)) ? '–' : (+x).toFixed(d);
const cabTxt = (cab, thr, ty) => `${thr ? '4' : isDC(S) ? '2' : '3'}×${cab.size} mm² ${ty === 'xlpe' ? 'XLPE' : 'PVC'}`;

/* ---------- header ---------- */
function syncHeader(){
  const lg = $('#logo'), co = $('#co');
  if (lg){ if (S.logo){ lg.src = S.logo; lg.hidden = false; } else { lg.removeAttribute('src'); lg.hidden = true; } }
  if (co){ co.textContent = S.company || ''; co.hidden = !S.company; }
  $('#pname').value = S.name;
  $('#std').innerHTML = Object.keys(STD).map(k => `<option value="${k}" ${S.std === k ? 'selected' : ''}>${STD[k].n}</option>`).join('');
  $('#sys').innerHTML = SYSTEMS.map(s => `<option value="${s.id}" ${S.sysId === s.id ? 'selected' : ''}>${s.label}</option>`).join('');
}

/* ---------- setup ---------- */
function fld(label, input, hint){ return `<label class="fld"><span>${label}</span>${input}${hint ? `<small>${hint}</small>` : ''}</label>`; }
function ni(f, v, extra = ''){ return `<input type="number" data-k="s" data-f="${f}" data-t="n" value="${v == null ? '' : v}" ${extra}>`; }
function brkSelect(kinds, f){
  const cur = S[f] || '';
  return `<select data-k="s" data-f="${f}"><option value="">Generic (standard defaults)</option>${BRK.filter(b => kinds.includes(b.kind) && (!isDC(S) || (b.vdc != null && b.vdc >= S.vLN * 1.25))).map(b => `<option value="${b.id}" ${cur === b.id ? 'selected' : ''}>${esc(b.mfr + ' ' + b.series)}</option>`).join('')}</select>`;
}
function renderSetup(){
  const std = STD[S.std], lvm = isLV(S), dcm = isDC(S), vd = vdDef(S), sysList = SYSTEMS.filter(x => lvm ? x.lv : (x.phases === S.phases && !x.lv));
  const seg = (n, t) => `<button class="seg ${(n === 'lv' ? lvm : (!lvm && S.phases === n)) ? 'on' : ''}" data-a="phase" data-p="${n}" aria-pressed="${n === 'lv' ? lvm : (!lvm && S.phases === n)}">${t}</button>`;
  return `<div class="card"><h2>Company and supply</h2>
  <div class="form" style="margin-top:14px">
    ${fld('Company name', `<input type="text" data-k="s" data-f="company" value="${esc(S.company || '')}" placeholder="Shown beside the logo and on exports">`)}
    ${fld('Company details', `<textarea data-k="s" data-f="companyInfo" rows="3" maxlength="300" placeholder="Address, phone, email, website. Shown on the PDF cover page.">${esc(S.companyInfo || '')}</textarea>`)}
    <div class="fld"><span>Company logo</span><div class="row">${S.logo ? `<img class="logoprev" src="${S.logo}" alt="Company logo preview">` : ''}<label class="btn" for="logofile" style="cursor:pointer">${S.logo ? 'Replace logo…' : 'Upload logo…'}</label><input type="file" id="logofile" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden>${S.logo ? '<button class="btn" data-a="nologo">Remove</button>' : ''}</div><small>Shown at the top of the page, in the diagram and in the PDF. The Excel export carries the company name only.</small></div>
    <div class="fld"><span>Supply type</span><div class="segs" role="group" aria-label="Supply type">${seg(1, 'Single phase')}${seg(3, 'Three phase')}${seg('lv', 'Low voltage AC / DC')}</div><small>${lvm ? '12, 24 or 48 V DC and 24 V AC, as used on yachts and boats.' : 'Switching adjusts the circuits to suit.'}</small></div>
    ${fld('Supply voltage', `<select id="sys2">${sysList.map(x => `<option value="${x.id}" ${S.sysId === x.id ? 'selected' : ''}>${x.label}</option>`).join('')}</select>`)}
    ${dcm ? fld('Breaker poles', `<select data-k="s" data-f="dcPoles"><option value="2P" ${S.dcPoles !== '1P' ? 'selected' : ''}>Both poles (2P, ungrounded or isolated)</option><option value="1P" ${S.dcPoles === '1P' ? 'selected' : ''}>Positive only (1P, negative earthed or common)</option></select>`, 'Sets breaker width and the diagram') : ''}
  </div></div>
  <div class="card"><h2>Panel layout</h2>
  <div class="form" style="margin-top:14px">
    ${fld('Modules per DIN rail', `<select data-k="s" data-f="cols" data-t="n">${[12, 18, 24, 36, 48].map(n => `<option ${S.cols === n ? 'selected' : ''}>${n}</option>`).join('')}</select>`, '1 module = 18 mm')}
    ${lvm ? '' : fld('RCBO width', `<select data-k="s" data-f="rcboW" data-t="n"><option value="1" ${S.rcboW === 1 ? 'selected' : ''}>1 module (compact)</option><option value="2" ${S.rcboW === 2 ? 'selected' : ''}>2 modules (1P+N)</option></select>`)}
    <label class="fld chk"><input type="checkbox" data-k="s" data-f="seg" ${S.seg ? 'checked' : ''}><span style="text-transform:none;letter-spacing:0;font-size:14px;color:var(--ink)">Put control modules on their own rails</span></label>
    <label class="fld chk"><input type="checkbox" data-k="s" data-f="spd" ${S.spd ? 'checked' : ''}><span style="text-transform:none;letter-spacing:0;font-size:14px;color:var(--ink)">Include surge protection device</span></label>
  </div>
  <p class="note" style="margin-top:12px">${lvm ? (dcm ? 'Extra-low-voltage DC: no RCD is needed for SELV circuits. Size each breaker from the current (I = P ÷ V), protect the cable, and use DC-rated devices. Marine practice (ISO 10133, ABYC E-11) allows 3 % voltage drop for critical circuits such as navigation lights and bilge pumps and 10 % for the rest.' : 'Extra-low-voltage AC: no RCD is needed for SELV circuits. Voltage drop is the usual limit on cable length.') : esc(std.rcd)}</p></div>
  <div class="card"><h2>Preferred protection range</h2>
  <p class="muted" style="max-width:70ch">Pick a manufacturer series and the layout uses its module widths, the checks use its breaking capacity, rating range and curves, and the bill of materials names it. Leave on Generic to use the standard defaults.</p>
  <div class="form" style="margin-top:14px">
    ${fld('MCB series', brkSelect(['mcb'], 'mcbSel'))}
    ${lvm ? '' : fld('RCBO series', brkSelect(['rcbo'], 'rcboSel'))}
    ${fld('Main switch or incomer', brkSelect(['isolator', 'rccb', 'mccb'], 'mainSel'))}
  </div></div>
  <div class="row"><button class="btn" data-a="reset">Reload the example board</button><button class="btn" data-a="clear">Start an empty board</button></div>`;
}

/* ---------- panel ---------- */
const U = 30, MX = 64, MY = 70, RH = 228;
const clip = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
function nameTag(cx, y, w, text){
  if (!text) return '';
  if (w >= 88){ const per = Math.max(8, Math.floor(w / 6.4)), a = clip(text, per * 2); const l1 = a.slice(0, per), l2 = a.slice(per); return `<text class="ink" font-size="10" x="${cx}" y="${y + 14}" text-anchor="middle">${esc(l1)}</text>${l2 ? `<text class="ink" font-size="10" x="${cx}" y="${y + 27}" text-anchor="middle">${esc(l2)}</text>` : ''}`; }
  return `<text class="ink" font-size="10" x="${cx}" y="${y + 6}" transform="rotate(90 ${cx} ${y + 6})" dy="3.5">${esc(clip(text, 14))}</text>`;
}
const screw = (cx, cy, r = 3.3) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gScrew)" stroke="var(--screw-ln)" stroke-width=".8"/><line x1="${cx - r * .6}" y1="${cy + r * .5}" x2="${cx + r * .6}" y2="${cy - r * .5}" stroke="var(--screw-ln)" stroke-width="1"/>`;
function devSVG(p){
  const d = p.d, x = MX + p.col * U, y = MY + p.row * RH + 6, w = d.w * U - 2, h = 94, on = sel === d.key ? ' on' : '';
  const cx = x + w / 2, phc = PHV[d.ph] || 'var(--phN)';
  let b = '';
  const cav = (yy) => `<rect x="${x + 3}" y="${yy}" width="${w - 6}" height="12" rx="2.5" fill="var(--brk-cav)"/>` + (w > 54 ? [0, 1].map(k => screw(x + w * (k ? .75 : .25), yy + 6)).join('') : screw(cx, yy + 6));
  const body = (cls) => `<rect x="${x + 1}" y="${y + 2}" width="${w}" height="${h}" rx="4" fill="#000" opacity=".16"/><rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/><rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="3.5" fill="none" stroke="#fff" stroke-opacity=".5"/>`;
  if (d.kind === 'incomer'){
    const bw = Math.min(w - 16, 74);
    b = `${body('d-brk')}<rect x="${x}" y="${y}" width="${w}" height="5" rx="2" fill="${phc}"/>${cav(y + 7)}
    <rect x="${x + 5}" y="${y + 23}" width="${w - 10}" height="34" rx="3" fill="#F2C230" stroke="#B8921C"/>
    <rect x="${cx - bw / 2}" y="${y + 33}" width="${bw}" height="14" rx="7" fill="url(#gRed)" stroke="#8E211C"/><circle cx="${cx}" cy="${y + 40}" r="5.5" fill="#2B343D" stroke="#0007"/><circle cx="${cx}" cy="${y + 40}" r="1.8" fill="#C9D0D6"/>
    <text x="${x + 10}" y="${y + 53}" font-size="7.5" fill="#6b5410" font-weight="700">O</text><text x="${x + w - 10}" y="${y + 53}" text-anchor="end" font-size="7.5" fill="#6b5410" font-weight="700">I</text>
    <rect x="${x + 4}" y="${y + 61}" width="${w - 8}" height="26" rx="2.5" fill="var(--label)"/><text class="lbl" x="${cx}" y="${y + 74}" text-anchor="middle" font-size="${w < 60 ? 12 : 14}" font-weight="700">${d.rating || '–'}A</text><text class="lbl" x="${cx}" y="${y + 83}" text-anchor="middle" font-size="7" opacity=".7">MAIN ${esc(d.label.replace(' main', ''))}</text>`;
  } else if (d.kind === 'spd'){
    b = `${body('d-brk')}<rect x="${x}" y="${y}" width="${w}" height="5" rx="2" fill="var(--phN)"/>${cav(y + 7)}
    <rect x="${x + 7}" y="${y + 24}" width="${w - 14}" height="22" rx="3" fill="#1F7A47" stroke="#0E4F2B"/><circle cx="${x + 17}" cy="${y + 35}" r="3.4" fill="#7DF0A8"/><circle cx="${x + 17}" cy="${y + 35}" r="6.5" fill="#7DF0A8" opacity=".25"/><text x="${cx + 5}" y="${y + 39}" text-anchor="middle" font-size="10" font-weight="700" fill="#E7FFF0">OK</text>
    <rect x="${x + 4}" y="${y + 56}" width="${w - 8}" height="25" rx="2.5" fill="var(--label)"/><text class="lbl" x="${cx}" y="${y + 69}" text-anchor="middle" font-size="11" font-weight="700">SPD</text><text class="lbl" x="${cx}" y="${y + 78}" text-anchor="middle" font-size="7" opacity=".7">TYPE 2</text><rect x="${x + 3}" y="${y + 83}" width="${w - 6}" height="8" rx="2" fill="var(--brk-cav)"/>`;
  } else if (d.kind === 'custom'){
    const x0 = S.custom.find(q => q.id === d.cx) || {};
    b = `${body('d-cus')}<rect x="${x}" y="${y}" width="${w}" height="5" rx="2" fill="${phc}"/>${cav(y + 7)}<rect x="${x + 4}" y="${y + 24}" width="${w - 8}" height="${h - 48}" rx="3" fill="url(#gHatch)" opacity=".6"/>
    <rect x="${x + 4}" y="${y + 44}" width="${w - 8}" height="30" rx="2.5" fill="var(--label)"/><text class="lbl" x="${cx}" y="${y + 58}" text-anchor="middle" font-size="${d.w < 2 ? 9 : 12}" font-weight="700">${d.rating ? d.rating + 'A' : 'CUSTOM'}</text><text class="lbl" x="${cx}" y="${y + 69}" text-anchor="middle" font-size="7.5" opacity=".7">${esc(d.ref)}${d.w >= 3 && x0.note ? ' · ' + esc(clip(x0.note, Math.floor(w / 7))) : ''}</text><rect x="${x + 3}" y="${y + 80}" width="${w - 6}" height="11" rx="2" fill="var(--brk-cav)"/>`;
  } else if (d.kind === 'lutron'){
    const lib = d.lib || {}, zs = lib.zones || 0, nT = Math.max(2, Math.floor(w / 30));
    let zl = '';
    for (let z = 1; z <= zs; z++){
      const zw = (w - 20) / zs, zx = x + 10 + (z - 1) * zw, cs = S.circuits.filter(c => c.mod === d.mod && c.zone === z).map(c => c.ref).join(' '), lit = !!cs;
      zl += `<rect x="${zx}" y="${y + 60}" width="${zw - 6}" height="26" rx="3" fill="var(--lut-2)" stroke="#fff1" /><circle cx="${zx + 9}" cy="${y + 69}" r="2.6" fill="${lit ? '#59D68C' : '#59666F'}"/>${lit ? `<circle cx="${zx + 9}" cy="${y + 69}" r="6" fill="#59D68C" opacity=".22"/>` : ''}${zw >= 40 ? `<text class="lutink" x="${zx + 17}" y="${y + 72}" font-size="9" font-weight="600">Z${z}</text><text class="lutink" x="${zx + 6}" y="${y + 83}" font-size="8" opacity=".75">${esc(cs || 'free')}</text>` : `${zw >= 20 || z === 1 || z === zs || z % 4 === 0 ? `<text class="lutink" x="${zx + (zw >= 20 ? 14 : 2)}" y="${y + (zw >= 20 ? 72 : 82)}" font-size="${zw >= 20 ? 8 : 7}" font-weight="600">${z}</text>` : ''}${cs ? `<text class="lutink" x="${zx + 3}" y="${y + 83}" font-size="7" opacity=".8">${esc(clip(cs, Math.max(2, Math.floor((zw - 6) / 4.4))))}</text>` : ''}`}<title>Zone ${z}: ${esc(cs || 'free')}</title>`;
    }
    let tb = ''; for (let k = 0; k < nT; k++){ const tx = x + 8 + k * ((w - 16) / nT); tb += `<rect x="${tx}" y="${y + 6}" width="${(w - 16) / nT - 5}" height="11" rx="2" fill="#0B0F13" stroke="#fff2"/>${screw(tx + ((w - 16) / nT - 5) / 2, y + 11.5, 3)}`; }
    b = `${body('d-lut')}<rect x="${x}" y="${y}" width="${w}" height="5" rx="2" fill="${phc}"/>${tb}
    <text class="lutink" x="${x + 10}" y="${y + 33}" font-size="${w < 140 ? 10.5 : 13}" font-weight="700">${esc(clip(lib.model || d.label, Math.floor((w - 20) / (w < 140 ? 6.6 : 8.2))))}</text>
    <text class="lutink" x="${x + 10}" y="${y + 47}" font-size="9" opacity=".7">${esc(clip(d.ref + ' · ' + (lib.fam || ''), Math.floor((w - 20) / 5.4)))}</text>${zl}
    ${zs ? '' : `<text class="lutink" x="${x + 10}" y="${y + 72}" font-size="9" opacity=".7">${lib.din == null ? 'width not listed' : lib.din + ' modules · ' + (lib.din * 18).toFixed(0) + ' mm'}</text>`}
    ${w > 150 ? [0, 1, 2, 3].map(k => `<rect x="${x + w - 30}" y="${y + 24 + k * 5}" width="20" height="2" rx="1" fill="#fff" opacity=".12"/>`).join('') : ''}`;
  } else if (d.kind === 'dali'){
    const dc = d.dc, nT = Math.max(1, Math.floor(w / 30)), bc = d.band || phc, nar = w < 80;
    let tb = ''; for (let k = 0; k < nT; k++){ const tx = x + 8 + k * ((w - 16) / nT); tb += `<rect x="${tx}" y="${y + 6}" width="${(w - 16) / nT - 5}" height="11" rx="2" fill="#0B0F13" stroke="#fff2"/>${screw(tx + ((w - 16) / nT - 5) / 2, y + 11.5, 3)}`; }
    b = `${body('d-lut')}<rect x="${x}" y="${y}" width="${w}" height="5" rx="2" fill="${bc}"/>${tb}` + (nar
      ? `<text class="lutink" x="${cx}" y="${y + 31}" text-anchor="middle" font-size="10" font-weight="700">${esc(d.ref)}</text><text class="lutink" x="${cx}" y="${y + 41}" text-anchor="middle" font-size="7.5" opacity=".8">${esc(d.addr || '')}</text><text class="lutink" transform="rotate(-90 ${cx + 3} ${y + h - 6})" x="${cx + 3}" y="${y + h - 6}" font-size="8.5" opacity=".85">${esc(clip(dc.m.replace('DALI-2 ', '').replace('LED ', '').replace('Dimmer', 'Dim'), 9))}</text>`
      : `<text class="lutink" x="${x + 10}" y="${y + 33}" font-size="${w < 140 ? 10.5 : 13}" font-weight="700">${esc(clip(dc.m, Math.floor((w - 20) / (w < 140 ? 6.6 : 8.2))))}</text><text class="lutink" x="${x + 10}" y="${y + 47}" font-size="9" opacity=".7">${esc(clip(d.ref + ' · ' + DKIND[dc.k], Math.floor((w - 20) / 5.4)))}</text><text class="lutink" x="${x + 10}" y="${y + 63}" font-size="9" opacity=".85">${esc(clip((d.addr ? d.addr + ' · ' : '') + (d.lnk || 'not connected'), Math.floor((w - 20) / 5.4)))}</text><text class="lutink" x="${x + 10}" y="${y + 77}" font-size="8.5" opacity=".65">${dc.du} DU · ${(dc.du * 17.5).toFixed(0)} mm</text>`);
  } else {
    const ph = d.ph, narrow = d.w === 1, rc = d.kind === 'rcbo', nLev = (d.w === 1 || rc) ? 1 : Math.min(d.w, 4);
    const rtxt = (d.curve && d.curve !== 'Std' && d.kind !== 'feed' ? d.curve : '') + (d.rating || '–');
    let lev = '';
    const lw = narrow ? 9 : nLev > 2 ? 11 : 13, win = w - 10;
    for (let k = 0; k < nLev; k++){ const lx = x + 5 + win * (k + .5) / nLev - lw / 2; lev += `<rect x="${lx}" y="${y + 22}" width="${lw}" height="15" rx="2.5" fill="url(#gLever)" stroke="#000a"/><rect x="${lx}" y="${y + 22}" width="${lw}" height="4" rx="2" fill="${phc}"/>`; }
    if (nLev > 1) lev += `<rect x="${x + 5 + win * .5 / nLev}" y="${y + 29}" width="${win * (nLev - 1) / nLev}" height="3.5" rx="1.5" fill="#1b232a"/>`;
    b = `${body(rc ? 'd-rcbo' : 'd-brk')}<rect x="${x}" y="${y}" width="${w}" height="5" rx="2" fill="${phc}"/>${cav(y + 6)}
    <rect x="${x + 5}" y="${y + 20}" width="${win}" height="26" rx="3" fill="var(--lever-slot)"/>${lev}
    ${rc ? `<rect x="${cx - 6}" y="${y + 49}" width="12" height="6" rx="2" fill="#2F7FD0" stroke="#173F6B"/><text x="${cx}" y="${y + 54.2}" text-anchor="middle" font-size="5.5" font-weight="700" fill="#fff">T</text>` : ''}
    <rect x="${x + 3.5}" y="${y + 57}" width="${w - 7}" height="25" rx="2.5" fill="var(--label)"/><text class="lbl" x="${cx}" y="${y + 69.5}" text-anchor="middle" font-size="${narrow ? 10 : 12.5}" font-weight="700">${rtxt}</text><text class="lbl" x="${cx}" y="${y + 78.5}" text-anchor="middle" font-size="${narrow ? 6.5 : 7.5}" opacity=".7">${esc(narrow ? clip(d.ref, 4) : d.ref)}${rc && !narrow ? ' · 30mA' : ''}</text>
    <rect x="${x + 3}" y="${y + 83}" width="${w - 6}" height="8.5" rx="2" fill="var(--brk-cav)"/>${w > 54 ? [0, 1].map(k => screw(x + w * (k ? .75 : .25), y + 87.2, 2.8)).join('') : screw(cx, y + 87.2, 2.8)}`;
  }
  /* short phase-coloured stub up to the duct */
  const stub = (d.kind === 'incomer' || d.kind === 'lutron' || d.kind === 'dali') ? '' : `<line x1="${cx}" y1="${y - 6}" x2="${cx}" y2="${y + 6}" stroke="${phc}" stroke-width="3" stroke-linecap="round"/>`;
  let nm = '';
  const by = y + 104;
  if (d.kind === 'lutron'){
    const lib = d.lib || {}, zs = lib.zones || 0;
    if (zs){ for (let z = 1; z <= zs; z++){ const zw = (w - 20) / zs, cx2 = x + 10 + (z - 1) * zw + (zw - 6) / 2; const cs = S.circuits.filter(c => c.mod === d.mod && c.zone === z); if (cs.length) nm += nameTag(cx2, by, zw - 6, cs.map(c => c.ref + ' ' + c.name).join(', ')); } }
    else nm += nameTag(cx, by, w, d.label);
  } else if (d.kind === 'incomer') nm = nameTag(cx, by, w, 'Main');
  else if (d.kind === 'spd') nm = nameTag(cx, by, w, 'Surge');
  else nm = nameTag(cx, by, w, d.label);
  const tip = d.ref + ' ' + d.label + (d.rating ? ' · ' + (d.curve && d.curve !== 'Std' && d.kind !== 'feed' ? d.curve : '') + d.rating + ' A' : '') + ' · ' + d.w + (d.w === 1 ? ' module' : ' modules');
  return `<g data-dev="${esc(d.key)}" class="${on.trim()}" tabindex="0" role="button" aria-label="${esc(d.ref + ' ' + d.label)}"><title>${esc(tip)}</title>${stub}${b}${nm}<rect class="sel-ring" x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="6"/></g>`;
}
function panelDefs(){
  return `<defs>
  <linearGradient id="gEncl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--encl-hi)"/><stop offset="1" style="stop-color:var(--encl-lo)"/></linearGradient>
  <linearGradient id="gBody" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--brk-lo)"/><stop offset=".18" style="stop-color:var(--brk-hi)"/><stop offset=".82" style="stop-color:var(--brk-hi)"/><stop offset="1" style="stop-color:var(--brk-lo)"/></linearGradient>
  <linearGradient id="gRcbo" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--rcbo-lo)"/><stop offset=".18" style="stop-color:var(--rcbo-hi)"/><stop offset=".82" style="stop-color:var(--rcbo-hi)"/><stop offset="1" style="stop-color:var(--rcbo-lo)"/></linearGradient>
  <linearGradient id="gLut" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--lut-hi)"/><stop offset="1" style="stop-color:var(--lut)"/></linearGradient>
  <linearGradient id="gLever" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#11171c"/><stop offset=".5" stop-color="#3a4651"/><stop offset="1" stop-color="#11171c"/></linearGradient>
  <linearGradient id="gRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E5493F"/><stop offset="1" stop-color="#B0261F"/></linearGradient>
  <radialGradient id="gScrew" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#F3F6F8"/><stop offset="1" stop-color="#8C97A1"/></radialGradient>
  <linearGradient id="gRail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E9EEF2"/><stop offset=".5" stop-color="#AAB5BF"/><stop offset="1" stop-color="#7C8893"/></linearGradient>
  <pattern id="pRail" width="26" height="9" patternUnits="userSpaceOnUse"><rect width="26" height="9" fill="url(#gRail)"/><rect x="9" y="3" width="8" height="3" rx="1.5" fill="#5d6873" opacity=".85"/></pattern>
  <pattern id="pDuct" width="7" height="12" patternUnits="userSpaceOnUse"><rect width="7" height="12" style="fill:var(--duct)"/><rect x="5.6" width="1.4" height="12" style="fill:var(--duct-ln)"/></pattern>
  <pattern id="gHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="var(--ink-2)" stroke-width="1.2" opacity=".5"/></pattern>
  </defs>`;
}
function panelSVG(){
  const W = MX * 2 + B.cols * U, H = MY + B.rows * RH + 58, ex = MX - 20, ew = B.cols * U + 40, eh = B.rows * RH + 70;
  let g = panelDefs();
  g += `<rect x="${ex + 2}" y="${MY - 36}" width="${ew}" height="${eh}" rx="10" fill="#000" opacity=".12"/><rect class="encl" x="${ex}" y="${MY - 40}" width="${ew}" height="${eh}" rx="10"/><rect x="${ex + 8}" y="${MY - 32}" width="${ew - 16}" height="${eh - 16}" rx="6" style="fill:var(--plate);stroke:var(--line-2)"/>`;
  [[ex + 14, MY - 26], [ex + ew - 14, MY - 26], [ex + 14, MY + eh - 58], [ex + ew - 14, MY + eh - 58]].forEach(q => { g += screw(q[0], q[1], 3.6); });
  const np = Math.min(260, Math.max(150, S.name.length * 8 + 28));
  g += `<rect x="${MX - 8}" y="${MY - 34}" width="${np}" height="21" rx="3" fill="#2A323B" stroke="#0006"/><text class="lutink" x="${MX + 2}" y="${MY - 20}" font-size="11.5" font-weight="700">${esc(clip(S.name, 30))}</text>`;
  if (S.logo) g += `<image href="${S.logo}" x="${MX + B.cols * U - 120}" y="${MY - 36}" width="112" height="24" preserveAspectRatio="xMaxYMid meet" opacity=".95"/>`;
  g += `<text class="ink2" x="${MX + B.cols * U - 14}" y="${MY + B.rows * RH + 17}" text-anchor="end" font-size="10">${B.cols} modules × 18 mm = ${B.cols * 18} mm</text>`;
  for (let r = 0; r < B.rows; r++){
    const y = MY + r * RH;
    g += `<rect x="${MX - 8}" y="${y - 8}" width="${B.cols * U + 16}" height="12" rx="2" fill="url(#pDuct)" stroke="var(--duct-ln)" stroke-width=".8"/>`;
    g += `<rect x="${MX - 8}" y="${y + 49}" width="${B.cols * U + 16}" height="9" rx="1.5" fill="url(#pRail)" stroke="#6a7681" stroke-width=".6"/>`;
    for (let c = 0; c <= B.cols; c++) g += `<line class="slot" x1="${MX + c * U}" y1="${y + 101}" x2="${MX + c * U}" y2="${y + (c % 6 === 0 ? 112 : 106)}"/>`;
    g += `<text class="ink2" x="${MX - 30}" y="${y + 56}" font-size="9" text-anchor="middle" transform="rotate(-90 ${MX - 30} ${y + 56})" letter-spacing="1">${T('RAIL')} ${r + 1}</text>`;
  }
  const yb = MY + B.rows * RH - 8; g += `<rect x="${MX - 8}" y="${yb}" width="${B.cols * U + 16}" height="12" rx="2" fill="url(#pDuct)" stroke="var(--duct-ln)" stroke-width=".8"/>`;
  g += B.place.map(devSVG).join('') + `<rect id="ins" x="0" y="0" width="3" height="94" style="fill:var(--accent);display:none"/>`;
  return `<div class="zoomrow"><span class="note">${fitP ? 'Fitted to the screen' : 'Full size, scroll sideways'}</span><button class="btn sm" data-a="zoomP">${fitP ? 'Full size' : 'Fit to screen'}</button></div><svg id="panelsvg" viewBox="0 0 ${W} ${H}" style="min-width:${fitP ? 0 : Math.max(W, 760)}px;width:100%;height:auto;display:block" role="img" aria-label="DIN rail layout of ${esc(S.name)}">${g}</svg>`;
}
const WLAB = {0:'Auto', 1:'1 module', 2:'2 modules', 3:'3 modules', 4:'4 modules'};
function addTools(){
  const mods = LIB.filter(l => l.din !== 0);
  return `<div class="row"><button class="btn sm pri" data-a="addc">+ Circuit</button>
   <select id="addmodel" aria-label="Module to add" style="max-width:190px">${[...new Set(mods.map(l => l.brand))].map(b => `<optgroup label="${b}">${mods.filter(l => l.brand === b).map(l => `<option value="${l.model}">${l.model}</option>`).join('')}</optgroup>`).join('')}</select><input type="number" class="qty" id="addqty" value="1" min="1" max="50" step="1" aria-label="Quantity" title="Quantity" inputmode="numeric"><button class="btn sm" data-a="addm2">+ DIN module</button></div>${(() => { try { return dPanelAdd(); } catch (e) { return ''; } })()}
   <div class="row" style="margin-top:8px"><button class="btn sm" data-a="addx">+ Custom device</button>${S.mainOff ? '<button class="btn sm" data-a="restmain">Restore main breaker</button>' : ''}${S.spd ? '' : '<button class="btn sm" data-a="restspd">Restore SPD</button>'}</div>`;
}
function inspector(){
  const d = B.devs.find(x => x.key === sel);
  if (!d) return `<div class="card insp"><h3>Panel notes</h3><p class="muted">Select a device to edit it here. Drag a device to move it along the rails.</p>
    <div style="margin-top:10px">${addTools()}</div>
    <div class="legend" style="margin-top:12px">${['L1', 'L2', 'L3', '3P'].filter(p => S.phases === 3 || p === 'L1').map(p => `<span><i class="pdot" style="background:${PHV[p]}"></i>${p === '3P' ? '3-phase' : p}</span>`).join('')}</div>
    <p class="note" style="margin-top:12px">Layout wraps to a new rail when a device does not fit. Rows use ${B.pitch} mm pitch${R.hasAdaptive ? ' because phase-adaptive Lutron modules are fitted' : ''}.</p></div>`;
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  const fl = (label, input) => `<label class="ifld"><span>${label}</span>${input}</label>`;
  const inp = (k, id, f, v, type = 'text', extra = '') => `<input type="${type}" data-k="${k}" data-id="${id}" data-f="${f}" ${type === 'number' ? 'data-t="n"' : ''} value="${esc(v)}" ${extra}>`;
  const sl = (k, id, f, opts, v, lab, t = '') => `<select data-k="${k}" data-id="${id}" data-f="${f}" ${t ? 'data-t="n"' : ''}>${opts.map(o => `<option value="${o}" ${String(v) === String(o) ? 'selected' : ''}>${lab ? lab[o] : o}</option>`).join('')}</select>`;
  let ttl = d.ref + ' · ' + d.label, form = '', dl = '', acts = '', delTxt = 'Delete', delNote = '';
  if (d.cid){
    const c = S.circuits.find(x => x.id === d.cid), r = R.c[c.id], std = STD[S.std], three = S.phases === 3;
    ttl = c.ref + ' · ' + c.name;
    form = `<div class="iform">${fl('Name', inp('c', c.id, 'name', c.name))}${fl('Reference', inp('c', c.id, 'ref', c.ref))}
     ${fl('Load W', inp('c', c.id, 'P', c.P, 'number', 'step="10"'))}${fl('Length m', inp('c', c.id, 'len', c.len, 'number', 'step="1"'))}
     ${fl('Device', sl('c', c.id, 'prot', ['MCB', 'RCBO'], c.prot))}${fl('Curve', sl('c', c.id, 'curve', std.curves, c.curve))}
     ${fl('Width', sl('c', c.id, 'wSel', [0, 1, 2, 3, 4], c.wSel || 0, WLAB, 1))}${three ? fl('Phase', sl('c', c.id, 'phase', ['L1', 'L2', 'L3', '3P'], c.phase)) : ''}</div>`;
    dl = row('Design current', fmt(r.Ib, 1) + ' A') + row('Breaker', `${c.prot} ${r.curve}${r.In} A · ${d.w} module${d.w > 1 ? 's' : ''}`) + row('Cable', `${cabTxt(r.cab, r.thr, c.cable)} · ${fmt(r.cab.Iz, 0)} A`) + row('Voltage drop', fmt(r.vdTot, 2) + ' %') + row('Status', tag(statusOf(c.ref))) + (d.series ? row('Series', esc(d.series)) : '');
    acts = `<button class="btn sm" data-a="edit" data-id="${c.id}">Full row in schedule</button>`;
    delTxt = 'Delete circuit';
  } else if (d.kind === 'feed' || d.kind === 'lutron'){
    const m = S.modules.find(x => x.id === d.mod), r = R.m[m.id], std = STD[S.std], three = S.phases === 3, n = S.circuits.filter(c => c.mod === m.id).length;
    ttl = m.id + ' · ' + m.model;
    form = `<div class="iform">${fl('Model', `<select data-k="m" data-id="${m.id}" data-f="model">${LIB.filter(l => l.din !== 0).map(l => `<option value="${l.model}" ${l.model === m.model ? 'selected' : ''}>${l.model}</option>`).join('')}</select>`)}
     ${r.lv ? '' : fl('Feed breaker', `<select data-k="m" data-id="${m.id}" data-f="inSel" data-t="n"><option value="0">Auto</option>${ratingsOf(S).map(x => `<option value="${x}" ${+m.inSel === x ? 'selected' : ''}>${x} A</option>`).join('')}</select>`)}
     ${r.lv ? '' : fl('Feed length m', inp('m', m.id, 'len', m.len, 'number', 'step="1"'))}${three && !r.lv ? fl('Feed phase', sl('m', m.id, 'phase', ['L1', 'L2', 'L3'], m.phase)) : ''}</div>`;
    dl = row('Family', esc(r.lib.fam || '')) + row('Supply', esc(r.lib.volt || '')) + (r.lv ? '' : row('Feed load', fmt(r.Ib, 1) + ' A') + row('Feed cable', `${r.cab.size} mm²`)) + row('Width', `${r.lib.din == null ? 'not listed' : r.lib.din + ' modules'}`) + row('Heat', `${r.lib.btu || 0} BTU/h`) + row('Circuits', n ? n + ' fed' : 'none') + row('Status', tag(statusOf(m.id)));
    acts = `<button class="btn sm" data-a="tab" data-t="equipment">Equipment list</button>`;
    delTxt = 'Delete module'; delNote = n ? `${n} circuit${n > 1 ? 's' : ''} fed from it will become direct breakers.` : '';
  } else if (d.kind === 'dali'){
    const du = S.dali.units.find(x => x.id === d.dali), dc = d.dc, DA = dAnalyse(), dl2 = DA.by[du.link];
    ttl = du.id + ' · ' + dc.m;
    form = `<div class="iform"><div style="grid-column:1/-1">${fl('Name / location', `<input type="text" data-dk="label" data-id="${du.id}" value="${esc(du.label)}" maxlength="40">`)}</div>
     <div style="grid-column:1/-1">${fl('Model', `<select data-dk="model" data-id="${du.id}">${dModelOpts(du.model)}</select>`)}</div>
     ${dc.k === 'master' ? '' : `<div style="grid-column:1/-1">${fl('DALI link', dLinkSelect(du, DA))}</div>`}</div>`;
    dl = row('Type', DKIND[dc.k]) + row('Width', `${dc.du} DU · ${(dc.du * 17.5).toFixed(0)} mm`) + (dc.k === 'master' ? row('Lines', dc.ln) : dc.k === 'psu' ? row('Bus supply', dc.sup + ' mA') : row('Address', d.addr || '–') + row('DALI current', dc.ma + ' mA')) + (dl2 ? row('Line load', `${dl2.addr}/${dl2.max} addr · ${+dl2.mA.toFixed(1)}/${dl2.sup || '?'} mA`) : '');
    acts = `<button class="btn sm" data-a="tab" data-t="dali">DALI page</button>`;
    delTxt = 'Delete DALI module'; delNote = dc.k === 'master' ? 'Devices connected to its lines will become not connected.' : '';
  } else if (d.kind === 'custom'){
    const x = S.custom.find(q => q.id === d.cx), three = S.phases === 3;
    ttl = x.id + ' · ' + (x.name || 'Custom device');
    form = `<div class="iform"><div style="grid-column:1/-1">${fl('Name', inp('x', x.id, 'name', x.name))}</div><div style="grid-column:1/-1">${fl('Manufacturer, part number or note', inp('x', x.id, 'note', x.note || ''))}</div>
     ${fl('Width (modules)', inp('x', x.id, 'w', x.w, 'number', 'step="1" min="1" max="36"'))}${fl('Rating A', inp('x', x.id, 'rating', x.rating == null ? '' : x.rating, 'number', 'step="1" min="0"'))}
     ${fl('Heat W', inp('x', x.id, 'heatW', x.heatW || 0, 'number', 'step="0.5" min="0"'))}${fl('Colour band', sl('x', x.id, 'ph', three ? ['L1', 'L2', 'L3', '3P', 'N'] : ['L1', 'N'], x.ph || 'N'))}</div>`;
    delTxt = 'Delete device';
  } else if (d.kind === 'incomer'){
    const ratings = [0].concat(INCOMER_RATINGS), pols = ['', '1P+N', '2P', '3P', '4P'], poleLab = {'': 'Auto (' + (isLV(S) ? (dpOf(S) ? '2P' : '1P') : (S.phases === 3 ? '4P' : '2P')) + ')', '1P+N':'1P+N', '2P':'2P', '3P':'3P', '4P':'4P'};
    form = `<div class="iform">${fl('Rating A', `<select data-k="s" data-f="incomer" data-t="n">${ratings.map(r2 => `<option value="${r2}" ${(+S.incomer || 0) === r2 ? 'selected' : ''}>${r2 ? r2 + ' A' : 'Auto (' + (R.inc.In || '–') + ' A)'}</option>`).join('')}</select>`)}
     ${fl('Poles', sl('s', '', 'incPoles', pols, S.incPoles || '', poleLab))}
     ${fl('Width (modules)', sl('s', '', 'incW', [0, 1, 2, 3, 4, 5, 6, 8], num(S.incW, 0), {0: 'Auto', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 8: '8'}, 1))}
     ${fl('Cable length m', ni('incLen', S.incLen, 'step="1" min="0"'))}
     <div style="grid-column:1/-1">${fl('Cable', `<select data-k="s" data-f="incCable"><option value="xlpe" ${S.incCable === 'xlpe' ? 'selected' : ''}>Cu XLPE 90 °C</option><option value="pvc" ${S.incCable === 'pvc' ? 'selected' : ''}>Cu PVC 70 °C</option></select>`)}</div>
     <div style="grid-column:1/-1">${fl('Series', brkSelect(['isolator', 'rccb', 'mccb'], 'mainSel'))}</div></div>`;
    delTxt = 'Remove main breaker'; delNote = 'The incomer rating and cable are still calculated. Add it back from Panel notes.';
    dl = row('Rating', `${d.rating || '–'} A`) + row('Max phase', fmt(R.inc.Imax, 1) + ' A') + row('Imbalance', fmt(R.inc.imb, 0) + ' %') + row('Cable', `${R.inc.cab.size} mm² · ${S.incLen} m`) + row('Apparent power', fmt(R.inc.kVA, 1) + ' kVA') + (d.series ? row('Series', esc(d.series)) : '');
    acts = `<button class="btn sm" data-a="tab" data-t="setup">Supply settings</button>`;
  } else {
    dl = row('Note', 'Surge protective device, type 2.');
    delTxt = 'Remove SPD';
  }
  const i = S.order.indexOf(d.key), movable = i >= 0, armed = delArm === d.key, deletable = movable || d.key === 'inc' || d.key === 'spd';
  const mvBtns = movable ? `<div class="row"><button class="btn sm" data-a="mv" data-d="-1" ${i === 0 ? 'disabled' : ''}>← Earlier</button><button class="btn sm" data-a="mv" data-d="1" ${i === S.order.length - 1 ? 'disabled' : ''}>Later →</button><button class="btn sm" data-a="mvrail" data-d="-1">↑ Rail up</button><button class="btn sm" data-a="mvrail" data-d="1">↓ Rail down</button></div>` : '';
  const delBtn = deletable ? `<div class="row" style="margin-top:4px">${armed ? `<button class="btn sm danger" data-a="del">Confirm delete</button><button class="btn sm" data-a="delcancel">Cancel</button>` : `<button class="btn sm" data-a="delarm">${delTxt}</button>`}</div>${armed && delNote ? `<p class="note" style="margin-top:6px">${delNote}</p>` : ''}` : '';
  return `<div class="card insp"><h3>${esc(ttl)}</h3>${form}<dl>${dl}</dl><div class="row">${acts}</div>${movable ? '<p class="note" style="margin:10px 0 4px">Move</p>' : ''}${mvBtns}${delBtn}<div class="row" style="margin-top:10px"><button class="btn sm" data-a="desel">Close</button></div></div>`;
}
function panelStats(){
  const P = R.power, three = S.phases === 3;
  const lvm = isLV(S), dcm = isDC(S);
  const ph = three ? ['L1', 'L2', 'L3'].map(p => `${p} <b>${fmt(R.ph[p], 1)} A · ${fmt(P.phW[p] / 1000, 1)} kW</b>`).join(' · ') : `${lvm ? 'Bus ' + fmt(S.vLN, 0) + ' V' + (dcm ? ' DC' : ' AC') : 'L1'} <b>${fmt(R.ph.L1, 1)} A${lvm ? ' · ' + fmt(P.phW.L1 / 1000, 2) + ' kW' : ''}</b>`;
  const nErr = R.checks.filter(c => c.lvl === 'err').length, nW = R.checks.filter(c => c.lvl === 'warn').length;
  return `<div class="stats pw"><span>Connected <b>${fmt(P.conn / 1000, 2)} kW</b></span><span>Demand <b>${fmt(P.dem / 1000, 2)} kW</b> at ${S.diversity} diversity</span>${dcm ? '' : `<span>Apparent <b>${fmt(P.kva / 1000, 2)} kVA</b>, PF <b>${fmt(P.pf, 2)}</b></span>`}<span>${ph}</span></div>
   <div class="stats" style="margin-top:8px"><span>Enclosure ≈ <b>${B.widthMm} × ${B.heightMm} mm</b></span><span>Rails <b>${B.rows}</b></span><span>Modules <b>${B.used}</b> used, <b>${B.free}</b> free</span>
    <span>Dissipation ≈ <b>${fmt(R.heatW, 0)} W</b></span><span>Incomer <b>${R.inc.In || '–'} A</b></span>
    <span>Checks <b style="color:${nErr ? 'var(--bad)' : nW ? 'var(--warn)' : 'var(--ok)'}">${nErr} fail · ${nW} review</b></span></div>`;
}
function renderPanel(){
  return `<div class="card" id="pstats">${panelStats()}</div>
  <div class="grid2"><div class="card scroll" id="panelwrap">${panelSVG()}</div><div id="insp">${inspector()}</div></div>`;
}
function softPanel(inspToo){
  const w = $('#panelwrap'); if (!w) return;
  w.innerHTML = panelSVG(); bindPanel();
  const st = $('#pstats'); if (st) st.innerHTML = panelStats();
  if (inspToo){ const ins = $('#insp'); if (ins) ins.innerHTML = inspector(); }
}
function moveRail(dir){
  const p = B.place.find(q => q.d.key === sel); if (!p || !S.order.includes(sel)) return;
  const tr = p.row + dir, cand = B.place.filter(q => q.row === tr && S.order.includes(q.d.key) && q.d.key !== sel);
  if (!cand.length){ toast(dir < 0 ? 'Already on the first rail.' : 'No device on the next rail to place it beside. Drag it instead.'); return; }
  S.order = S.order.filter(k => k !== sel);
  const before = cand.find(q => q.col >= p.col);
  const at = before ? S.order.indexOf(before.d.key) : S.order.indexOf(cand[cand.length - 1].d.key) + 1;
  S.order.splice(at, 0, sel); refresh(true);
}
function bindPanel(){
  const svg = $('#panelsvg'); if (!svg) return;
  const toSvg = e => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  let drag = null;
  const targetOf = p => {
    let best = null, bd = 1e9;
    B.place.forEach(q => {
      const x = MX + q.col * U, y = MY + q.row * RH + 6, w = q.d.w * U, cx = x + w / 2, cy = y + 47, dd = Math.hypot(p.x - cx, (p.y - cy) * 0.5);
      if (dd < bd){ bd = dd; best = {q, before: p.x < cx, x, w, y}; }
    });
    return best;
  };
  svg.addEventListener('pointerdown', e => {
    const g = e.target.closest('[data-dev]'); if (!g) return;
    drag = {key: g.dataset.dev, x: e.clientX, y: e.clientY, moved: false, g}; svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6){ drag.moved = true; drag.g.classList.add('dragging'); }
    if (drag.moved){
      const t = targetOf(toSvg(e)), ins = $('#ins'); if (!t) return;
      ins.style.display = ''; ins.setAttribute('x', t.before ? t.x - 2 : t.x + t.w - 1); ins.setAttribute('y', t.y); drag.t = t;
    }
  });
  const end = e => {
    if (!drag) return;
    const dd = drag; drag = null;
    if (dd.moved && dd.t){
      const tk = dd.t.q.d.key;
      if (S.order.includes(dd.key) && tk !== dd.key){
        S.order = S.order.filter(k => k !== dd.key);
        let i = S.order.indexOf(tk); if (i < 0) i = dd.t.before ? 0 : S.order.length; else if (!dd.t.before) i++;
        S.order.splice(i, 0, dd.key); sel = dd.key; refresh(true);
      } else { dd.g.classList.remove('dragging'); const ins = $('#ins'); if (ins) ins.style.display = 'none'; }
    } else { if (sel !== dd.key) delArm = null; sel = dd.key; refresh(true); if (window.innerWidth < 980){ const ins = $('#insp'); if (ins) ins.scrollIntoView({block: 'nearest', behavior: 'smooth'}); } }
  };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ const g = e.target.closest('[data-dev]'); if (g){ e.preventDefault(); sel = g.dataset.dev; refresh(true); } } });
}

/* ---------- circuits ---------- */
function circuitRow(c){
  const std = STD[S.std], mod = c.mod, three = S.phases === 3;
  const fedOpts = `<option value="" ${!mod ? 'selected' : ''}>Direct breaker</option>` + S.modules.map(m => {
    const lib = libOf(m.model) || {}; if (!lib.power) return '';
    return Array.from({length: lib.zones}, (_, z) => `<option value="${m.id}|${z + 1}" ${mod === m.id && c.zone === z + 1 ? 'selected' : ''}>${m.id} zone ${z + 1}</option>`).join('');
  }).join('');
  const ph = three ? ['L1', 'L2', 'L3', '3P'] : ['L1'];
  const sizes = ['auto'].concat(SZ);
  const tl = Object.fromEntries(Object.keys(TYPES).map(k => [k, TYPES[k].l])), cl = {pvc:'PVC 70', xlpe:'XLPE 90'};
  const selc = (f, opts, v, extra = '', lab = null) => `<select data-k="c" data-id="${c.id}" data-f="${f}" ${extra}>${opts.map(o => `<option value="${o}" ${String(v) === String(o) ? 'selected' : ''}>${lab ? lab[o] : (o === 'auto' ? 'Auto' : o)}</option>`).join('')}</select>`;
  const n = (f, v, st = '1', w = '') => `<input type="number" data-k="c" data-id="${c.id}" data-f="${f}" data-t="n" value="${v}" step="${st}" ${w}>`;
  return `<tr data-row="${c.id}">
   <td style="width:44px"><button class="btn sm" data-a="delc" data-id="${c.id}" aria-label="Delete circuit ${esc(c.ref)}">✕</button></td>
   <td style="width:62px"><input type="text" data-k="c" data-id="${c.id}" data-f="ref" value="${esc(c.ref)}" aria-label="Reference"></td>
   <td style="min-width:170px"><input type="text" data-k="c" data-id="${c.id}" data-f="name" value="${esc(c.name)}" aria-label="Description"></td>
   <td style="min-width:150px">${selc('type', Object.keys(TYPES), c.type, '', tl)}</td>
   <td style="min-width:150px"><select data-k="c" data-id="${c.id}" data-f="fed">${fedOpts}</select></td>
   <td style="width:84px">${n('P', c.P, '10')}</td><td style="width:76px">${n('pf', isDC(S) ? 1 : c.pf, '0.01', isDC(S) ? 'disabled' : '')}</td>
   <td style="width:68px">${selc('phase', ph, mod ? (R.c[c.id].ph) : c.phase, (mod || !three) ? 'disabled' : '')}</td>
   <td style="width:70px">${n('len', c.len, '1')}</td>
   <td style="width:96px">${selc('prot', isLV(S) ? ['MCB'] : ['MCB', 'RCBO'], c.prot, mod ? 'disabled' : '')}</td>
   <td style="width:64px">${selc('curve', std.curves, c.curve, mod ? 'disabled' : '')}</td>
   <td style="width:96px">${selc('wSel', [0, 1, 2, 3, 4], c.wSel || 0, mod ? 'disabled' : '', {0:'Auto', 1:'1 module', 2:'2 modules', 3:'3 modules', 4:'4 modules'})}</td>
   <td style="width:104px">${selc('cable', ['pvc', 'xlpe'], c.cable, '', cl)}</td>
   <td style="width:80px">${selc('size', sizes, c.size)}</td><td style="width:60px">${n('grp', c.grp, '0.05')}</td>
   <td class="mono" id="ib-${c.id}" style="text-align:right"></td><td class="mono" id="in-${c.id}" style="text-align:right"></td><td class="mono" id="cab-${c.id}"></td><td class="mono" id="vd-${c.id}" style="text-align:right"></td><td id="st-${c.id}"></td></tr>`;
}
function quickCard(){
  if (!isLV(S)) return '';
  const dcm = isDC(S);
  return `<div class="card"><h3>Quick breaker calculator</h3><p class="note" style="margin:4px 0 10px">Enter the power of a load, or its current if you know it. It shows the design current, the breaker to use and the cable.</p>
   <div class="form" style="grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr))">
    <label class="fld"><span>Power W</span><input type="number" id="qcP" value="240" step="10" min="0"></label>
    <label class="fld"><span>or current A</span><input type="number" id="qcI" value="" step="0.1" min="0" placeholder="optional"></label>
    <label class="fld"><span>Cable length m</span><input type="number" id="qcL" value="10" step="1" min="0"></label>
    ${dcm ? '' : '<label class="fld"><span>Power factor</span><input type="number" id="qcF" value="1" step="0.05" min="0.1" max="1"></label>'}
    <label class="fld"><span>Circuit type</span><select id="qcT"><option value="critical">Critical (3 % drop)</option><option value="lighting">Lighting (3 % drop)</option><option value="other" selected>Other (10 % drop)</option></select></label>
   </div><div id="qcOut" class="qc"></div></div>`;
}
function quickCalc(){
  const o = $('#qcOut'); if (!o) return;
  const std = STD[S.std], V = S.vLN, dcm = isDC(S), RT = ratingsOf(S), g = id => { const e = $('#' + id); return e ? +e.value : NaN; };
  const P = num(g('qcP'), 0), Ii = num(g('qcI'), 0), L = num(g('qcL'), 0), pf = dcm ? 1 : Math.min(1, Math.max(.1, num(g('qcF'), 1))), t = $('#qcT').value, d = vdDef(S);
  const lim = (t === 'lighting' || t === 'critical') ? num(S.vdL, d.l) : num(S.vdO, d.o);
  const Ib = Ii > 0 ? Ii : P / (V * pf);
  if (!(Ib > 0)){ o.innerHTML = '<p class="muted">Enter a power or a current.</p>'; return; }
  const need = Ib * std.cont, In = pick(RT, Math.max(need, RT[0]));
  if (!In){ o.innerHTML = `<p class="muted">${fmt(Ib, 1)} A is above the largest breaker listed (${RT[RT.length - 1]} A). Use an MCCB or a fuse.</p>`; return; }
  const cab = sizeCable(S, {cable: 'pvc', In, Ib, len: L, pf, three: false, grp: 1, min: 1.5, lim, size: 'auto'});
  const dutyV = V * 1.25;
  const ser = BRK.filter(b => b.kind === 'mcb' && In >= b.rMin && In <= b.rMax && (!dcm || (b.vdc != null && b.vdc >= dutyV)));
  const sers = ser.length ? ser.map(b => esc(b.mfr + ' ' + b.series)).join(', ') : (dcm ? 'none of the listed series covers this rating at DC. Use a DC-rated breaker from your supplier.' : 'any standard MCB.');
  o.innerHTML = `<dl class="qcd"><dt>Design current</dt><dd>${Ii > 0 ? fmt(Ib, 2) + ' A (entered)' : `${fmt(P, 0)} W ÷ ${V} V${dcm ? '' : ' ÷ ' + fmt(pf, 2)} = <b>${fmt(Ib, 2)} A</b>`}</dd>
   <dt>Breaker</dt><dd><b>${In} A</b> ${std.cont > 1 ? '(design current × ' + std.cont + ' for continuous load) ' : '(next standard rating at or above the design current) '}${dpOf(S) ? '2-pole' : '1-pole'}${dcm ? ', DC rated' : ''}</dd>
   <dt>Cable</dt><dd><b>${cab.size} mm²</b> copper PVC, rating ${fmt(cab.Iz, 0)} A, voltage drop ${fmt(cab.vd, 2)} % of ${V} V (limit ${lim} %)</dd>
   <dt>Series that fit</dt><dd>${sers}</dd></dl>`;
}
function renderCircuits(){
  return `${quickCard()}<div class="card"><div class="row" style="justify-content:space-between"><h2>Circuit schedule</h2><div class="row">
    <button class="btn pri" data-a="addc">Add circuit</button><button class="btn" data-a="bal">Auto-balance phases</button><button class="btn" data-a="renum">Renumber</button></div></div>
    <p class="note" style="margin:6px 0 10px">Circuits fed from a Lutron module zone share the module's feed breaker, so their cable is checked against that breaker rating. Grouping factor multiplies the cable rating (use 1 if none).</p>
    <div class="scroll"><table class="tbl-c stack"><thead><tr><th></th><th>Ref</th><th>Description</th><th>Type</th><th>Fed from</th><th>Load W</th><th>PF</th><th>Phase</th><th>Length m</th><th>Device</th><th>Curve</th><th>Width</th><th>Cable</th><th>Size mm²</th><th>Grp</th><th>Ib A</th><th>In A</th><th>Cable</th><th>VD %</th><th>Status</th></tr></thead>
    <tbody>${S.circuits.map(circuitRow).join('') || '<tr><td colspan="20" class="muted" style="padding:20px">No circuits yet. Add one to start the schedule.</td></tr>'}</tbody></table></div></div>`;
}
function updateCircuitCells(){
  S.circuits.forEach(c => {
    const r = R.c[c.id], set = (id, v) => { const e = $('#' + id + '-' + c.id); if (e) e.innerHTML = v; };
    set('ib', fmt(r.Ib, 2)); set('in', r.In ? (r.In + (r.prot === 'Via module' ? '*' : '')) : '–');
    set('cab', `${r.thr ? 4 : 3}×${r.cab.size} <span class="note">Iz ${fmt(r.cab.Iz, 0)}</span>`);
    set('vd', `<span style="color:${r.vdTot > r.lim ? 'var(--bad)' : 'inherit'}">${fmt(r.vdTot, 2)}</span>`); set('st', tag(statusOf(c.ref)));
  });
}

/* ---------- equipment ---------- */
function modRow(m){
  const r = R.m[m.id], std = STD[S.std], three = S.phases === 3;
  return `<tr><td class="mono">${m.id}</td><td><b>${esc(m.model)}</b><div class="note">${esc(r.lib.fam || '')} · ${r.lib.din === 0 ? 'not on a DIN rail' : r.lib.din == null ? 'width not listed' : r.lib.din + ' modules'}</div></td>
  <td style="width:80px"><select data-k="m" data-id="${m.id}" data-f="phase" ${three ? '' : 'disabled'}>${(three ? ['L1', 'L2', 'L3'] : ['L1']).map(p => `<option ${m.phase === p ? 'selected' : ''}>${p}</option>`).join('')}</select></td>
  <td style="width:84px"><input type="number" data-k="m" data-id="${m.id}" data-f="len" data-t="n" value="${m.len}" step="1"></td>
  <td style="width:110px"><select data-k="m" data-id="${m.id}" data-f="inSel" data-t="n"><option value="0">Auto</option>${ratingsOf(S).map(x => `<option value="${x}" ${+m.inSel === x ? 'selected' : ''}>${x} A</option>`).join('')}</select></td>
  <td class="mono" style="text-align:right">${fmt(r.Ib, 2)}</td><td class="mono" style="text-align:right">${r.In || '–'}</td><td class="mono">${r.cab.size} mm²</td><td>${tag(statusOf(m.id))}</td>
  <td><button class="btn sm" data-a="delm" data-id="${m.id}" aria-label="Remove ${m.id}">✕</button></td></tr>`;
}
function libRows(){
  const q = libQ.trim().toLowerCase();
  return LIB.filter(l => (!libBrand || l.brand === libBrand) && (!libFam || l.fam === libFam) && (!q || (l.model + ' ' + l.brand + ' ' + l.fam + ' ' + l.line + ' ' + l.volt + ' ' + l.note).toLowerCase().includes(q))).map(l => `<tr>
   <td class="mono"><b>${l.model}</b></td><td>${l.fam}</td><td>${l.line}</td><td>${l.volt}</td><td class="mono" style="text-align:right">${l.din == null ? '?' : l.din === 0 ? '–' : l.din}</td><td class="mono" style="text-align:right">${l.din ? l.din * 18 : '–'}</td>
   <td class="mono" style="text-align:right">${l.zones || '–'}</td><td class="mono" style="text-align:right">${l.inA != null ? l.inA : '–'}</td><td class="mono" style="text-align:right">${l.btu == null ? '?' : l.btu}</td><td class="mono" style="text-align:right">${l.amb == null ? '?' : l.amb}</td><td class="mono" style="text-align:right">${l.g || '–'}</td>
   <td style="min-width:240px" class="note"><span data-nt>${esc(l.note)}</span> <a href="${l.src}" target="_blank" rel="noopener">source</a></td><td><input type="number" class="qty" value="1" min="1" max="50" step="1" aria-label="Quantity" title="Quantity" inputmode="numeric"><button class="btn sm pri" data-a="addm" data-model="${l.model}">Add</button></td></tr>`).join('') || '<tr><td colspan="13" class="muted" style="padding:16px">No equipment matches.</td></tr>';
}
const KIND = {mcb:'MCB', rcbo:'RCBO', rccb:'RCCB (group RCD)', isolator:'Isolator', mccb:'MCCB (incomer)'};
function brkWidth(b){
  const p = [];
  if (b.kind === 'rcbo'){ if (b.w1 != null) p.push('1P+N ' + b.w1); if (b.w4 != null) p.push('4P ' + b.w4); }
  else { if (b.w1 != null) p.push('1P ' + b.w1); if (b.wdp != null) p.push('2P ' + b.wdp); if (b.w3 != null) p.push('3P ' + b.w3); if (b.w4 != null) p.push('4P ' + b.w4); }
  return p.join(' · ') || '–';
}
function brkRows(){
  const q = brkQ.trim().toLowerCase();
  const used = id => id && [S.mcbSel, S.rcboSel, S.mainSel].includes(id);
  return BRK.filter(b => (!brkMfr || b.mfr === brkMfr) && (!brkKind || b.kind === brkKind) && (!q || (b.mfr + ' ' + b.series + ' ' + b.std + ' ' + b.note).toLowerCase().includes(q))).map(b => `<tr>
   <td>${esc(b.mfr)}</td><td><b>${esc(b.series)}</b></td><td>${KIND[b.kind]}</td><td>${esc(b.poles)}</td><td class="mono" style="text-align:right">${b.rMin}–${b.rMax}</td><td class="mono">${b.curves.length ? b.curves.join(' ') : '–'}</td>
   <td class="mono" style="text-align:right">${b.icn != null ? b.icn : '–'}</td><td class="mono" style="text-align:right">${b.icu != null ? b.icu : '–'}</td><td class="mono" style="white-space:nowrap">${brkWidth(b)}</td><td class="note"><span data-nt>${esc(b.rcd || '–')}</span></td>
   <td style="min-width:240px" class="note"><span data-nt>${esc(b.note)}</span> <span class="tag ${b.conf === 'v' ? 'ok' : 'warn'}">${b.conf === 'v' ? 'Source checked' : 'Typical'}</span> <a href="${b.src}" target="_blank" rel="noopener">source</a></td>
   <td>${used(b.id) ? '<span class="tag ok">In use</span>' : `<button class="btn sm pri" data-a="usebrk" data-id="${b.id}">Use</button>`}</td></tr>`).join('') || '<tr><td colspan="12" class="muted" style="padding:16px">No devices match.</td></tr>';
}
function renderEquipment(){
  const brands = [...new Set(LIB.map(l => l.brand))], fams = [...new Set(LIB.filter(l => !libBrand || l.brand === libBrand).map(l => l.fam))];
  return `<div class="card"><h2>Modules on this board</h2>${S.modules.length ? `<div class="scroll"><table class="stack" style="min-width:760px"><thead><tr><th>Ref</th><th>Module</th><th>Phase</th><th>Feed m</th><th>Feed breaker</th><th>Ib A</th><th>In A</th><th>Feed cable</th><th>Status</th><th></th></tr></thead><tbody>${S.modules.map(modRow).join('')}</tbody></table></div>` : '<p class="muted">No DIN modules placed yet. Add one from the library below.</p>'}</div>
  <div class="card"><div class="row" style="justify-content:space-between"><h2>DIN equipment library</h2><div class="row"><input type="text" id="libq" placeholder="Search model, family, voltage" value="${esc(libQ)}" style="min-width:220px" aria-label="Search library"><select id="libbrand" aria-label="Brand"><option value="">All brands</option>${brands.map(b => `<option value="${esc(b)}" ${libBrand === b ? 'selected' : ''}>${b}</option>`).join('')}</select><select id="libfam" aria-label="Family"><option value="">All families</option>${fams.map(f => `<option value="${esc(f)}" ${libFam === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div></div>
  <p class="note" style="margin:6px 0 10px">${LIB.length} DIN-rail modules from Lutron, Crestron, Control4 and MDT KNX. Lutron data comes from Application Note #466 (rev T, May 2026) and spec submittals, Crestron from its product pages, Control4 from its data sheets, and MDT from its product and price lists (1 module = 18 mm). Where a source did not state a value it is shown as ? or –. KNX actuators are bus powered, so only their load side counts toward the feed. Verify against the current manufacturer datasheet before ordering.</p>
  <div class="scroll" style="max-height:520px;overflow-y:auto"><table style="min-width:1220px"><thead><tr><th>Model</th><th>Family</th><th>Line</th><th>Supply</th><th>DIN</th><th>mm</th><th>Zones</th><th>Input A</th><th>BTU/h</th><th>Max °C</th><th>g</th><th>Notes</th><th></th></tr></thead><tbody id="libbody">${libRows()}</tbody></table></div></div>
  ${(() => { try { return daliLibCard(); } catch (e) { return ''; } })()}
  <div class="card"><div class="row" style="justify-content:space-between"><h2>Circuit protection library</h2><div class="row"><input type="text" id="brkq" placeholder="Search series or standard" value="${esc(brkQ)}" style="min-width:200px" aria-label="Search protection devices"><select id="brkmfr" aria-label="Manufacturer"><option value="">All manufacturers</option>${[...new Set(BRK.map(b => b.mfr))].map(m => `<option value="${esc(m)}" ${brkMfr === m ? 'selected' : ''}>${m}</option>`).join('')}</select><select id="brkkind" aria-label="Device type"><option value="">All types</option>${Object.keys(KIND).map(k => `<option value="${k}" ${brkKind === k ? 'selected' : ''}>${KIND[k]}</option>`).join('')}</select></div></div>
  <p class="note" style="margin:6px 0 10px">${BRK.length} series from ${new Set(BRK.map(b => b.mfr)).size} manufacturers. Ratings, capacities and widths are series-level catalogue values: “Source checked” means a manufacturer or distributor page confirmed them, “Typical” means they are common catalogue figures to confirm on the datasheet. Press Use to apply a series to this board.</p>
  <div class="scroll" style="max-height:520px;overflow-y:auto"><table style="min-width:1180px"><thead><tr><th>Manufacturer</th><th>Series</th><th>Type</th><th>Poles</th><th>Rating A</th><th>Curves</th><th>Icn kA</th><th>Icu kA</th><th>Width, modules</th><th>RCD</th><th>Notes</th><th></th></tr></thead><tbody id="brkbody">${brkRows()}</tbody></table></div></div>
  <div class="card"><h3>Lutron DIN panels and enclosures (reference)</h3><div class="scroll"><table style="min-width:680px"><thead><tr><th>Model</th><th>Description</th><th>Size</th><th></th></tr></thead><tbody>${PANELS.map(p => `<tr><td class="mono"><b>${p.model}</b></td><td><span data-nt>${esc(p.note)}</span></td><td class="mono">${p.dims || '–'}</td><td><a href="${p.src}" target="_blank" rel="noopener">source</a></td></tr>`).join('')}</tbody></table></div></div>
  <div class="card"><h3>Default device widths</h3><p class="muted" style="max-width:75ch">With no series selected, main switch and SPD take 2 or 4 modules, MCBs 1 module per pole (2 with double-pole marine switching), RCBOs ${S.rcboW === 1 ? '1 module (compact)' : '2 modules'} for 1P+N and 4 modules for 3P+N. Choose a manufacturer series in Setup or with Use above to replace these with real widths.</p></div>`;
}

/* ---------- checks ---------- */
function renderChecks(){
  const act = S.phases === 3 ? ['L1', 'L2', 'L3'] : ['L1'], mx = Math.max(R.inc.Imax, 1);
  const bars = act.map(p => `<div class="bar-r"><span class="mono">${busLab(p)}</span><div class="bar-t"><div class="bar-f" style="width:${R.ph[p] / mx * 100}%;background:${PHV[p]}"></div></div><span class="mono">${fmt(R.ph[p], 1)} A · ${fmt(R.power.phW[p] / 1000, 2)} kW</span></div>`).join('');
  const lv = {err:'Fail', warn:'Review', info:'Note'};
  const order = {err:0, warn:1, info:2};
  const items = R.checks.concat((() => { try { return daliChecks(); } catch (e) { return []; } })()).sort((a, b) => order[a.lvl] - order[b.lvl]);
  return `<div class="card"><h2>Phase balance and incomer</h2><div class="bars" style="margin-top:12px">${bars}</div>
   <div class="stats" style="margin-top:14px"><span>Connected load <b>${fmt(R.power.conn / 1000, 2)} kW</b></span><span>Demand <b>${fmt(R.power.dem / 1000, 2)} kW</b></span>${isDC(S) ? '' : `<span>Apparent <b>${fmt(R.power.kva / 1000, 2)} kVA</b></span><span>PF <b>${fmt(R.power.pf, 2)}</b></span>`}<span>Diversity <b>${S.diversity}</b></span><span>Max phase <b>${fmt(R.inc.Imax, 1)} A</b></span><span>Imbalance <b>${fmt(R.inc.imb, 0)} %</b></span><span>Incomer <b>${R.inc.In || '–'} A</b>, cable <b>${R.inc.cab.size} mm²</b></span><span>Worst end-to-end drop <b>${fmt(R.worstVd, 2)} %</b></span><span>Heat in enclosure ≈ <b>${fmt(R.heatW, 0)} W</b></span></div>
   ${S.phases === 3 ? '<div class="row" style="margin-top:12px"><button class="btn" data-a="bal">Auto-balance phases</button></div>' : ''}</div>
  <div class="card"><h2>Design checks</h2>${items.length ? `<ul class="checks" style="margin-top:12px">${items.map(c => `<li><span class="lvl ${c.lvl}">${lv[c.lvl]}</span><span class="mono">${esc(c.ref)}</span><span>${esc(c.msg)}</span></li>`).join('')}</ul>` : '<p class="muted" style="margin-top:8px">All checks pass for the current board.</p>'}
   <p class="note" style="margin-top:12px">Checks cover design current against breaker and cable rating, voltage drop, RCD expectation, fault level, Lutron input, zone and temperature limits. Earth-fault loop impedance, discrimination and selectivity are not calculated here.</p></div>`;
}

/* ---------- single-line diagram ---------- */
function brkSym(x, y, col){ return `<circle cx="${x - 8}" cy="${y}" r="2.4" fill="var(--surface)" stroke="${col}" stroke-width="1.4"/><line x1="${x - 8}" y1="${y}" x2="${x + 6}" y2="${y - 9}" stroke="${col}" stroke-width="1.8" stroke-linecap="round"/><line x1="${x + 6}" y1="${y}" x2="${x + 14}" y2="${y}" stroke="${col}" stroke-width="2"/><line x1="${x + 2}" y1="${y - 13}" x2="${x + 10}" y2="${y - 5}" stroke="${col}" stroke-width="1.3"/><line x1="${x + 10}" y1="${y - 13}" x2="${x + 2}" y2="${y - 5}" stroke="${col}" stroke-width="1.3"/>`; }
function loadSym(t, x, y){
  const st = 'fill="var(--surface)" stroke="var(--ink-2)" stroke-width="1.3"';
  if (t === 'lighting') return `<circle cx="${x}" cy="${y}" r="8" ${st}/><path d="M${x - 5.5} ${y - 5.5}L${x + 5.5} ${y + 5.5}M${x + 5.5} ${y - 5.5}L${x - 5.5} ${y + 5.5}" stroke="var(--ink-2)" stroke-width="1.3"/>`;
  if (t === 'sockets') return `<circle cx="${x}" cy="${y}" r="8" ${st}/><path d="M${x - 3} ${y - 4}v8M${x + 3} ${y - 4}v8" stroke="var(--ink-2)" stroke-width="1.5" stroke-linecap="round"/>`;
  if (t === 'av') return `<rect x="${x - 9}" y="${y - 7}" width="18" height="14" rx="2" ${st}/><path d="M${x - 6} ${y}q2-5 3 0t3 0t3 0" fill="none" stroke="var(--ink-2)" stroke-width="1.3"/>`;
  if (t === 'hvac') return `<circle cx="${x}" cy="${y}" r="8" ${st}/><text x="${x}" y="${y + 3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--ink-2)">M</text>`;
  if (t === 'heater') return `<rect x="${x - 9}" y="${y - 7}" width="18" height="14" rx="2" ${st}/><path d="M${x - 6} ${y}l2-4l3 8l3-8l2 4" fill="none" stroke="var(--ink-2)" stroke-width="1.3" stroke-linejoin="round"/>`;
  if (t === 'galley') return `<rect x="${x - 8}" y="${y - 8}" width="16" height="16" rx="3" ${st}/><circle cx="${x}" cy="${y}" r="3.4" fill="none" stroke="var(--ink-2)" stroke-width="1.3"/>`;
  if (t === 'critical') return `<path d="M${x} ${y - 9}L${x + 9} ${y + 7}H${x - 9}Z" ${st} stroke-linejoin="round"/><path d="M${x} ${y - 3}v5" stroke="var(--ink-2)" stroke-width="1.6" stroke-linecap="round"/><circle cx="${x}" cy="${y + 4.6}" r=".9" fill="var(--ink-2)"/>`;
  return `<rect x="${x - 8}" y="${y - 7}" width="16" height="14" rx="2" ${st}/>`;
}
function renderDiagram(){
  const three = S.phases === 3, rows = [], keys = S.order.slice();
  keys.forEach(k => { if (k[0] === 'c') rows.push({t:'c', c:S.circuits.find(x => x.id === k.slice(2))}); else if (k[0] === 'f') rows.push({t:'f', m:S.modules.find(x => x.id === k.slice(2))}); });
  const out = [];
  rows.forEach(r => {
    if (r.t === 'f'){ out.push(r); S.circuits.filter(c => c.mod === r.m.id).sort((a, b) => a.zone - b.zone).forEach(c => out.push({t:'z', c, m:r.m})); }
    else if (r.t === 'c') out.push(r);
  });
  const W = 1160, yT = 112, y0 = yT + 120;
  const hts = out.map(o => (o.t === 'c' && R.c[o.c.id].thr) ? 62 : 42);
  const ytop = []; let acc = y0; hts.forEach(h => { ytop.push(acc); acc += h; });
  const H = acc + 100;
  const buses = three ? ['L1', 'L2', 'L3', 'N'] : ['L1', 'N'];
  const bxs = {}; buses.forEach((p, i) => { bxs[p] = 40 + i * 14; });
  const busEnd = out.length ? ytop[out.length - 1] + hts[out.length - 1] - 6 : y0 + 20;
  const colX = {name: 222, prot: 520, cab: 700, load: 905, vd: 1075, st: 1135};
  const stCol = {ok:'var(--ok)', warn:'var(--warn)', bad:'var(--bad)'};
  const sys = SYSTEMS.find(x => x.id === S.sysId);
  let g = `<defs><pattern id="dgrid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="var(--line-2)" stroke-width=".7"/></pattern><linearGradient id="hdr" x1="0" x2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".16"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>`;
  g += `<rect width="${W}" height="${H}" fill="url(#dgrid)" opacity=".7"/><rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="5" fill="none" stroke="var(--ink-2)" stroke-width="1.2"/>`;
  /* title block */
  g += `<rect x="0" y="0" width="${W}" height="${yT - 14}" rx="6" fill="url(#hdr)" stroke="var(--line)"/>`;
  let tx = 20;
  if (S.logo && S.logoW){ const lh = Math.min(56, S.logoH), lw = lh * S.logoW / S.logoH; g += `<image href="${S.logo}" x="16" y="${(yT - 14 - lh) / 2}" width="${lw}" height="${lh}" preserveAspectRatio="xMinYMid meet"/>`; tx = 16 + lw + 18; }
  g += `<text class="ink" x="${tx}" y="34" font-size="20" font-weight="700" style="font-family:var(--font-d)">${esc(S.name)}</text>`;
  g += `<text class="ink2" x="${tx}" y="54" font-size="11">${esc(S.company || 'Multi-line diagram')} · ${esc(STD[S.std].n)} · ${esc(sys ? sys.label : '')} · Ik ${S.ik} kA</text>`;
  g += `<text class="ink2" x="${tx}" y="72" font-size="11">Connected ${fmt(R.power.conn / 1000, 2)} kW · demand ${fmt(R.power.dem / 1000, 2)} kW · ${fmt(R.power.kva / 1000, 2)} kVA · max phase ${fmt(R.inc.Imax, 1)} A</text>`;
  const leg = buses.map(p => ({p, t: isDC(S) ? (p === 'L1' ? 'Positive +' : 'Negative −') : p === 'N' ? 'Neutral' : p}));
  leg.forEach((l, i) => { const lx = W - 20 - (leg.length - i) * (isDC(S) ? 112 : 78); g += `<line x1="${lx}" y1="30" x2="${lx + 20}" y2="30" stroke="${PHV[l.p]}" stroke-width="3" stroke-linecap="round"/><text class="ink2" x="${lx + 26}" y="34" font-size="11">${l.t}</text>`; });
  g += `<text class="ink2" x="${W - 20}" y="60" text-anchor="end" font-size="10">${new Date().toLocaleDateString()}</text>`;
  /* incomer */
  const mid = (bxs[buses[0]] + bxs.N) / 2;
  g += `<circle cx="${mid}" cy="${yT + 8}" r="15" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.6"/><path d="M${mid - 8} ${yT + 8} q4 -8 8 0 t8 0" fill="none" stroke="var(--ink)" stroke-width="1.5"/>
   <text class="ink" x="${mid + 90}" y="${yT + 4}" font-size="12" font-weight="600">Supply ${esc(sys ? sys.label : '')}</text><text class="ink2" x="${mid + 90}" y="${yT + 20}" font-size="10">Incomer cable ${R.inc.cab.size} mm² ${S.incCable === 'pvc' ? 'PVC' : 'XLPE'} · ${S.incLen} m</text>
   <line x1="${mid}" y1="${yT + 23}" x2="${mid}" y2="${yT + 40}" stroke="var(--ink)" stroke-width="2.2"/>${brkSym(mid, yT + 56, 'var(--ink)')}<line x1="${mid + 6}" y1="${yT + 56}" x2="${mid + 6}" y2="${yT + 56}" stroke="var(--ink)"/>
   <rect x="${mid - 6}" y="${yT + 44}" width="0" height="0"/><line x1="${mid}" y1="${yT + 56}" x2="${mid}" y2="${y0 - 24}" stroke="var(--ink)" stroke-width="2.2"/>
   <rect x="${mid + 22}" y="${yT + 42}" width="188" height="30" rx="4" fill="var(--surface-2)" stroke="var(--line)"/><text class="ink" x="${mid + 30}" y="${yT + 55}" font-size="11" font-weight="600">Q0 main ${R.inc.In || '–'} A ${isLV(S) ? (dpOf(S) ? '2P' : '1P') + (isDC(S) ? ' DC' : '') : (three ? '3P+N' : '1P+N')}</text><text class="ink2" x="${mid + 30}" y="${yT + 68}" font-size="9.5">${esc(R.sel.mainS ? R.sel.mainS.mfr + ' ' + R.sel.mainS.series : 'generic')} · imbalance ${fmt(R.inc.imb, 0)} %</text>`;
  if (S.spd) g += `<line x1="${mid}" y1="${yT + 90}" x2="${mid + 40}" y2="${yT + 90}" stroke="var(--ink)"/><rect x="${mid + 40}" y="${yT + 82}" width="28" height="16" rx="2" fill="var(--surface)" stroke="var(--ink)"/><path d="M${mid + 50} ${yT + 84} l-4 7 h6 l-4 7" fill="none" stroke="var(--warn)" stroke-width="1.5"/><text class="ink2" x="${mid + 76}" y="${yT + 94}" font-size="10">SPD type 2</text>`;
  /* column heads */
  g += `<rect x="0" y="${y0 - 22}" width="${W}" height="20" fill="var(--surface-2)"/>`;
  [['CIRCUIT', colX.name], ['PROTECTION', colX.prot], ['CABLE', colX.cab], ['LOAD', colX.load], ['VD', colX.vd]].forEach(h => { g += `<text class="ink2" font-size="10" x="${h[1]}" y="${y0 - 8}" letter-spacing="1">${h[0]}</text>`; });
  out.forEach((o, i) => { if (i % 2 === 0) g += `<rect x="0" y="${ytop[i]}" width="${W}" height="${hts[i]}" fill="var(--surface-2)" opacity=".7"/>`; });
  /* bus bars */
  const topY = y0 - 24;
  g += `<rect x="${bxs[buses[0]] - 10}" y="${topY - 2}" width="${bxs.N - bxs[buses[0]] + 20}" height="6" rx="2" fill="var(--ink)"/>`;
  buses.forEach(p => { g += `<line x1="${bxs[p]}" y1="${topY + 4}" x2="${bxs[p]}" y2="${busEnd}" stroke="${PHV[p]}" stroke-width="${p === 'N' ? 2 : 3}" ${p === 'N' ? 'stroke-dasharray="6 3"' : ''} stroke-linecap="round"/><text x="${bxs[p]}" y="${busEnd + 16}" text-anchor="middle" font-size="9" font-weight="600" fill="${PHV[p]}">${busLab(p)}</text>`; });
  /* rows: every conductor is drawn, live(s) and neutral */
  const loadBar = (x, y, Ib, In) => { const f = In ? Math.min(1, Ib / In) : 0, c = f > .9 ? 'var(--warn)' : 'var(--accent)'; return `<rect x="${x}" y="${y - 4}" width="54" height="7" rx="3" fill="var(--surface-2)" stroke="var(--line)"/><rect x="${x}" y="${y - 4}" width="${54 * f}" height="7" rx="3" fill="${c}"/>`; };
  const NC = PHV.N, XB = 112, XE = 160;
  /* conductors from the buses to x=XE; pole device drawn over them at XB */
  const conductors = (lives, yN, ph3, poles, rcd) => {
    let t = '';
    lives.forEach((l, k) => { const p = ph3 ? ['L1', 'L2', 'L3'][k] : ph3 === false ? l.p : l.p; const col = PHV[l.p]; t += `<line x1="${bxs[l.p]}" y1="${l.y}" x2="${XE}" y2="${l.y}" stroke="${col}" stroke-width="2.2"/><circle cx="${bxs[l.p]}" cy="${l.y}" r="3.4" fill="${col}" stroke="var(--surface)" stroke-width="1"/>`; });
    t += `<line x1="${bxs.N}" y1="${yN}" x2="${XE}" y2="${yN}" stroke="${NC}" stroke-width="2" ${poles.n ? '' : 'stroke-dasharray="1 0"'}/><circle cx="${bxs.N}" cy="${yN}" r="3.4" fill="${NC}" stroke="var(--surface)" stroke-width="1"/>`;
    lives.forEach(l => { t += brkSym(XB, l.y, PHV[l.p]); });
    if (poles.n){ const top = lives[0].y - 15, bot = yN + 8; t += `<rect x="${XB - 17}" y="${top}" width="36" height="${bot - top}" rx="3" fill="none" stroke="${rcd ? 'var(--phN)' : 'var(--ink-2)'}" stroke-width="1.2" stroke-dasharray="${rcd ? '0' : '3 2'}"/><circle cx="${XB - 8}" cy="${yN}" r="2.4" fill="var(--surface)" stroke="${NC}" stroke-width="1.4"/><line x1="${XB - 8}" y1="${yN}" x2="${XB + 6}" y2="${yN - 8}" stroke="${NC}" stroke-width="1.8" stroke-linecap="round"/>`; }
    if (rcd) t += `<circle cx="${XB + 28}" cy="${(lives[0].y + yN) / 2}" r="7" fill="var(--surface)" stroke="var(--phN)" stroke-width="1.6"/><text x="${XB + 28}" y="${(lives[0].y + yN) / 2 + 3}" text-anchor="middle" font-size="8" fill="var(--phN)" font-weight="700">Δ</text>`;
    return t;
  };
  const dp = dpOf(S);
  out.forEach((o, i) => {
    const y = ytop[i] + hts[i] / 2 - 2, mid = y;
    const chip = (x, ref, col) => `<rect x="${x}" y="${y - 10}" width="38" height="20" rx="4" fill="none" stroke="${col}" stroke-width="1.5"/><text class="ink" x="${x + 19}" y="${y + 4}" text-anchor="middle" font-size="11" font-weight="600">${esc(clip(ref, 5))}</text>`;
    if (o.t === 'z'){
      const r = R.c[o.c.id], col = PHV[r.ph], sc = stCol[statusOf(o.c.ref)];
      g += `<line x1="150" y1="${y - 5}" x2="176" y2="${y - 5}" stroke="${col}" stroke-width="2"/><line x1="158" y1="${y + 7}" x2="196" y2="${y + 7}" stroke="${NC}" stroke-width="2"/><circle cx="158" cy="${y + 7}" r="2.6" fill="${NC}"/><rect x="176" y="${y - 14}" width="28" height="16" rx="3" fill="var(--surface)" stroke="var(--ink-2)"/><text class="ink2" x="190" y="${y - 2}" text-anchor="middle" font-size="10">Z${o.c.zone}</text>
       <text class="ink" x="${colX.name}" y="${y + 4}" font-size="11"><tspan font-weight="600">${esc(o.c.ref)}</tspan> ${esc(clip(o.c.name, 30))}</text><text class="ink2" x="${colX.prot}" y="${y + 4}" font-size="11">via ${o.m.id} (${R.m[o.m.id].In || '–'} A) · L + N</text><text class="ink2" x="${colX.cab}" y="${y + 4}" font-size="11">${cabTxt(r.cab, false, o.c.cable)} · ${o.c.len} m</text>
       ${loadSym(o.c.type, 884, y)}${loadBar(colX.load, y, r.Ib, R.m[o.m.id].In)}<text class="ink2" x="${colX.load + 62}" y="${y + 4}" font-size="11">${o.c.P} W · ${fmt(r.Ib, 1)} A</text><text fill="${r.vdTot > r.lim ? 'var(--bad)' : 'var(--ink-2)'}" font-weight="${r.vdTot > r.lim ? 700 : 400}" x="${colX.vd}" y="${y + 4}" font-size="11">${fmt(r.vdTot, 1)}%</text><circle cx="${colX.st}" cy="${y}" r="5" fill="${sc}"/>`;
    } else if (o.t === 'f'){
      const r = R.m[o.m.id], col = PHV[r.ph], sc = stCol[statusOf(o.m.id)], n = S.circuits.filter(c => c.mod === o.m.id).length;
      g += conductors([{p: r.ph, y: y - 5}], y + 7, false, {n: dp}, false);
      if (n){ const endY = ytop[i] + hts[i] + (n - 1) * 42 + 21; g += `<line x1="150" y1="${y - 5}" x2="150" y2="${endY - 7}" stroke="${col}" stroke-dasharray="3 3" stroke-width="1.6"/><line x1="158" y1="${y + 7}" x2="158" y2="${endY + 5}" stroke="${NC}" stroke-dasharray="3 3" stroke-width="1.6"/>`; }
      g += `<rect x="${colX.name - 4}" y="${y - 11}" width="260" height="22" rx="4" fill="var(--lut)" /><text class="lutink" x="${colX.name + 6}" y="${y + 4}" font-size="11" font-weight="600">${o.m.id} ${esc(o.m.model)}</text><text class="ink2" x="${colX.prot}" y="${y + 4}" font-size="11">MCB ${r.In} A · ${r.ph} + N</text><text class="ink2" x="${colX.cab}" y="${y + 4}" font-size="11">${S.phases === 3 ? '2' : '2'}×${r.cab.size} mm² · ${o.m.len} m</text>
       ${loadBar(colX.load, y, r.Ib, r.In)}<text class="ink2" x="${colX.load + 62}" y="${y + 4}" font-size="11">feed ${fmt(r.Ib, 1)} A</text><text class="ink2" x="${colX.vd}" y="${y + 4}" font-size="11">${fmt(r.cab.vd, 1)}%</text><circle cx="${colX.st}" cy="${y}" r="5" fill="${sc}"/>`;
    } else {
      const c = o.c, r = R.c[c.id], col = PHV[r.thr ? '3P' : r.ph], sc = stCol[statusOf(c.ref)], rcd = c.prot === 'RCBO';
      const lives = r.thr ? [{p:'L1', y: y - 21}, {p:'L2', y: y - 11}, {p:'L3', y: y - 1}] : [{p: r.ph, y: y - 5}];
      const yN = r.thr ? y + 11 : y + 7;
      g += conductors(lives, yN, r.thr, {n: rcd || dp || r.thr && rcd}, rcd);
      g += `${chip(XE + 6, c.ref, col)}<text class="ink" x="${colX.name + 0}" y="${y + 4}" font-size="11">${esc(clip(c.name, 32))}</text><text class="ink2" x="${colX.prot}" y="${y + 4}" font-size="11">${c.prot} ${r.curve === 'Std' ? '' : r.curve}${r.In} A${rcd ? ' 30 mA' : ''} · ${isDC(S) ? '+ / −' : (r.thr ? 'L1L2L3' : r.ph) + '+N'}</text><text class="ink2" x="${colX.cab}" y="${y + 4}" font-size="11">${cabTxt(r.cab, r.thr, c.cable)} · ${c.len} m</text>
       ${loadSym(c.type, 884, y)}${loadBar(colX.load, y, r.Ib, r.In)}<text class="ink2" x="${colX.load + 62}" y="${y + 4}" font-size="11">${c.P} W · ${fmt(r.Ib, 1)} A</text><text fill="${r.vdTot > r.lim ? 'var(--bad)' : 'var(--ink-2)'}" font-weight="${r.vdTot > r.lim ? 700 : 400}" x="${colX.vd}" y="${y + 4}" font-size="11">${fmt(r.vdTot, 1)}%</text><circle cx="${colX.st}" cy="${y}" r="5" fill="${sc}"/>`;
    }
  });
  /* footer */
  const fy = H - 52;
  g += `<line x1="0" y1="${fy}" x2="${W}" y2="${fy}" stroke="var(--line)"/>`;
  const ft = three ? ['L1', 'L2', 'L3'].map(p => `${p} ${fmt(R.ph[p], 1)} A / ${fmt(R.power.phW[p] / 1000, 2)} kW`).join('   ·   ') : `L1 ${fmt(R.ph.L1, 1)} A / ${fmt(R.power.phW.L1 / 1000, 2)} kW`;
  g += `<text class="ink" x="16" y="${fy + 22}" font-size="11" font-weight="600">${isLV(S) ? 'Bus loading' : 'Phase loading'} (after diversity ${S.diversity})</text><text class="ink2" x="16" y="${fy + 40}" font-size="11">${ft}</text>`;
  g += [['ok', 'OK'], ['warn', 'Check'], ['bad', 'Fail']].map((l, i) => `<circle cx="${560 + i * 74}" cy="${fy + 30}" r="5" fill="${stCol[l[0]]}"/><text class="ink2" x="${570 + i * 74}" y="${fy + 34}" font-size="11">${l[1]}</text>`).join('');
  { const bx0 = W - 400, by0 = fy + 8, cells = [['Project', clip(S.name, 24), 0, 0, 200], ['Company', clip(S.company || '–', 18), 200, 0, 190], ['Standard', clip(STD[S.std].n, 22), 0, 1, 200], ['Date', new Date().toLocaleDateString(), 200, 1, 190]];
    g += `<rect x="${bx0}" y="${by0}" width="390" height="40" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="1.2"/><line x1="${bx0}" y1="${by0 + 20}" x2="${bx0 + 390}" y2="${by0 + 20}" stroke="var(--ink-2)"/><line x1="${bx0 + 200}" y1="${by0}" x2="${bx0 + 200}" y2="${by0 + 40}" stroke="var(--ink-2)"/>`;
    cells.forEach(c => { g += `<text class="ink2" x="${bx0 + c[2] + 5}" y="${by0 + c[3] * 20 + 8}" font-size="7">${c[0]}</text><text class="ink" x="${bx0 + c[2] + 5}" y="${by0 + c[3] * 20 + 17}" font-size="10" font-weight="600">${esc(c[1])}</text>`; }); }
  return `<div class="card"><h2>Multi-line diagram</h2><p class="note" style="margin:6px 0 10px">${isDC(S) ? 'Every conductor is drawn: positive (red) and negative (dark) from the two busbars. A dashed box around the poles marks a double-pole breaker. Single-pole breakers sit in the positive only.' : 'Every conductor is drawn: each live from its phase bus and the neutral from the N bus. A dashed box around the poles marks a breaker that also switches the neutral; a Δ marks the RCD. Single-pole MCBs pass the neutral straight through. Dashed lines show circuits switched by a Lutron module zone.'}</p><div class="zoomrow"><span class="note">${fitD ? 'Fitted to the screen' : 'Full size, scroll sideways'}</span><button class="btn sm" data-a="zoomD">${fitD ? 'Full size' : 'Fit to screen'}</button></div><div class="scroll"><svg viewBox="0 0 ${W} ${H}" style="min-width:${fitD ? 0 : W}px;width:100%;height:auto;display:block;background:var(--surface)" role="img" aria-label="Multi-line diagram">${g}</svg></div></div>`;
}

/* ---------- export ---------- */
function slug(){ return (S.name || 'board').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'board'; }
function schedRows(){
  return S.circuits.map(c => {
    const r = R.c[c.id], m = c.mod;
    return [c.ref, c.name, T(TYPES[c.type].l), m ? T(`${m} zone ${c.zone}`) : T('Direct'), r.thr ? 'L1L2L3' : r.ph, +num(c.P, 0), +r.pf.toFixed(2), +num(c.dem, 1), +r.Ib.toFixed(2),
      m ? T(`Via ${m} feed`) : `${c.prot} ${r.curve === 'Std' ? '' : r.curve}${r.In}${c.prot === 'RCBO' ? ' 30mA' : ''}`.replace('  ', ' '), r.In || '', `${r.thr ? 4 : 3}x${r.cab.size} mm2 ${c.cable === 'xlpe' ? 'XLPE' : 'PVC'}`, +num(c.len, 0), +r.cab.Iz.toFixed(1), +r.vdTot.toFixed(2), T(stLabel[statusOf(c.ref)])];
  });
}
const SCHED_HEAD = ['Ref', 'Description', 'Type', 'Fed from', 'Phase', 'Load W', 'PF', 'Demand', 'Ib A', 'Protection', 'In A', 'Cable', 'Length m', 'Cable rating A', 'VD %', 'Status'];
function bomRows(){
  const map = {}, add = (k, d, q = 1) => { map[k] = map[k] || {d, q: 0}; map[k].q += q; };
  const sn = ser => ser ? ser.mfr + ' ' + ser.series + ' ' : '';
  const mS = R.sel.mcbS, rS = R.sel.rcboS, xS = R.sel.mainS;
  if (!S.mainOff) add('inc', `${sn(xS)}main ${isDC(S) ? 'DC isolator or breaker' : 'switch'} ${R.inc.In} A ${S.incPoles || (isLV(S) ? (dpOf(S) ? '2P' : '1P') : (S.phases === 3 ? '4P' : '2P'))}`);
  (S.custom || []).forEach(x => add('x' + x.id, `${x.name || 'Custom device'}${x.note ? ' (' + x.note + ')' : ''}${num(x.rating, 0) ? ' ' + x.rating + ' A' : ''}, ${Math.max(1, Math.round(num(x.w, 1)))} module`));
  if (S.spd) add('spd', `Surge protective device ${S.phases === 3 ? '3P+N' : '1P+N'} type 2`);
  S.modules.forEach(m => { const r = R.m[m.id]; if (!r.lv) add('f' + r.In, `${sn(mS)}MCB ${r.In} A (module feed)`); add('m' + m.model, `${r.lib.brand || 'Lutron'} ${m.model} (${r.lib.fam})`); });
  S.circuits.forEach(c => { if (c.mod) return; const r = R.c[c.id], ser = c.prot === 'RCBO' ? rS : mS; add(c.prot + r.curve + r.In + r.thr + (ser ? ser.id : ''), `${sn(ser)}${c.prot} ${r.thr ? (c.prot === 'RCBO' ? '3P+N' : '3P') : (isLV(S) ? (dpOf(S) ? '2P' : '1P') + (isDC(S) ? ' DC' : '') : (STD[S.std].dp || c.prot === 'RCBO' ? '1P+N' : '1P'))} ${r.curve === 'Std' ? '' : r.curve}${r.In} A${c.prot === 'RCBO' ? ' 30 mA' : ''}`); });
  return Object.values(map).map(x => [x.d, x.q]).concat((() => { try { return dBom(); } catch (e) { return []; } })());
}
async function dl(name, data){
  let d = null; try { d = await claude.use('downloads'); } catch (e) {}
  if (!d){
    try {
      const ext = (name.split('.').pop() || '').toLowerCase(), types = {pdf:'application/pdf', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv:'text/csv', json:'application/json'};
      const url = URL.createObjectURL(new Blob([data], {type: types[ext] || 'application/octet-stream'}));
      const l = document.createElement('a'); l.href = url; l.download = name; document.body.appendChild(l); l.click(); l.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000); toast('Saved ' + name);
    } catch (e) { toast('Could not save the file here.'); }
    return;
  }
  try { await d.save({filename: name, data}); toast('Saved ' + name); }
  catch (e) { if (!e || e.code !== 'declined') toast('Could not save: ' + ((e && e.message) || 'unavailable')); }
}
function csvOf(rows){ return rows.map(r => r.map(v => { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',')).join('\n'); }
function exportCSV(){ dl(slug() + '-schedule.csv', csvOf([SCHED_HEAD.map(h => T(h))].concat(schedRows()))); }
function exportXLSX(){
  if (!window.XLSX){ toast('Excel library did not load.'); return; }
  const wb = XLSX.utils.book_new();
  const sheetName = s => T(s).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31);
  const mk = (rows, widths) => { const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = widths.map(w => ({wch: w})); return ws; };
  XLSX.utils.book_append_sheet(wb, mk([SCHED_HEAD.map(h => T(h))].concat(schedRows()), [6, 28, 16, 14, 8, 9, 6, 8, 8, 18, 6, 20, 9, 12, 7, 8]), sheetName('Schedule'));
  const eq = [['Ref', 'Model', 'Family', 'Feed phase', 'Feed A', 'Feed breaker A', 'Feed cable mm2', 'Modules (18 mm)', 'Heat BTU/h'].map(h => T(h))].concat(S.modules.map(m => { const r = R.m[m.id]; return [m.id, m.model, r.lib.fam, r.ph, +r.Ib.toFixed(2), r.In, r.cab.size, r.lib.din, r.lib.btu]; }));
  XLSX.utils.book_append_sheet(wb, mk(eq, [6, 20, 24, 10, 8, 14, 14, 14, 11]), sheetName('DIN modules'));
  if (dS().units.length){ const A = dAnalyse(); XLSX.utils.book_append_sheet(wb, mk([['Ref', 'Model', 'Brand', 'Article', 'Type', 'Mounting', 'DIN DU', 'DALI line', 'Address', 'DALI mA', 'Name / location'].map(h => T(h))].concat(A.units.map(x => { const c = dCat(x.model), l = A.by[x.link]; return [x.id, c.m, c.b, c.art, DKIND[c.k], DMOUNT[c.mt], c.du || '', l ? l.label : '', l && c.k !== 'psu' ? dAddr(l, x) : '', c.k === 'master' || c.k === 'psu' ? '' : c.ma, x.label || '']; })), [6, 36, 10, 16, 24, 22, 8, 14, 10, 8, 24]), sheetName('DALI')); XLSX.utils.book_append_sheet(wb, mk([['Line', 'Master', 'Devices', 'Addresses (max 64)', 'Bus load mA', 'Bus supply mA', 'Supply from'].map(h => T(h))].concat(A.lines.map(l => [l.label, l.c.m, l.members.length, l.addr, +l.mA.toFixed(1), l.sup || '', l.supBy || ''])), [14, 30, 9, 18, 12, 14, 18]), sheetName('DALI lines')); }
  XLSX.utils.book_append_sheet(wb, mk([[T('Item'), T('Qty')]].concat(bomRows()), [52, 6]), sheetName('Bill of materials'));
  const ph = [[T('Phase'), T('Current A (after diversity)')]].concat((S.phases === 3 ? ['L1', 'L2', 'L3'] : ['L1']).map(p => [p + ' (A, ' + (R.power.phW[p] / 1000).toFixed(2) + ' kW)', +R.ph[p].toFixed(2)])).concat([[T('Incomer A'), R.inc.In], [T('Imbalance %'), +R.inc.imb.toFixed(1)], [T('Connected kW'), +(R.power.conn / 1000).toFixed(2)], [T('Demand kW (after diversity)'), +(R.power.dem / 1000).toFixed(2)], [T('Apparent kVA'), +(R.power.kva / 1000).toFixed(2)], [T('Power factor'), +R.power.pf.toFixed(2)], [T('Dissipation W'), +R.heatW.toFixed(0)]]);
  XLSX.utils.book_append_sheet(wb, mk(ph, [28, 26]), sheetName('Phases'));
  XLSX.utils.book_append_sheet(wb, mk([[T('Project'), S.name], [T('Company'), S.company || ''], [T('Standard'), STD[S.std].n], [T('System'), T((SYSTEMS.find(s => s.id === S.sysId) || {}).label)], [T('Fault level kA'), S.ik], [T('Cable ambient C'), S.ambient], [T('Diversity'), S.diversity], [T('MCB series'), R.sel.mcbS ? R.sel.mcbS.mfr + ' ' + R.sel.mcbS.series : T('Generic')], [T('RCBO series'), R.sel.rcboS ? R.sel.rcboS.mfr + ' ' + R.sel.rcboS.series : T('Generic')], [T('Main switch'), R.sel.mainS ? R.sel.mainS.mfr + ' ' + R.sel.mainS.series : T('Generic')]], [20, 36]), sheetName('Project'));
  dl(slug() + '.xlsx', XLSX.write(wb, {type: 'array', bookType: 'xlsx'}));
}
function exportJSON(){ dl(slug() + '.json', JSON.stringify(S, null, 1)); }
function importJSON(file){
  const fr = new FileReader();
  fr.onload = () => { try { const p = JSON.parse(fr.result); if (!p.circuits || !p.modules || !STD[p.std]) throw 0; S = p; S.order = S.order || []; sel = null; syncHeader(); refresh(true); toast('Project loaded'); } catch (e) { toast('That file is not a DBoard Designer project.'); } };
  fr.readAsText(file);
}
function diagRows(){
  const rows = [];
  S.order.forEach(k => { if (k[0] === 'c') rows.push({t:'c', c:S.circuits.find(x => x.id === k.slice(2))}); else if (k[0] === 'f') rows.push({t:'f', m:S.modules.find(x => x.id === k.slice(2))}); });
  const out = [];
  rows.forEach(r => { if (r.t === 'f'){ out.push(r); S.circuits.filter(c => c.mod === r.m.id).sort((a, b) => a.zone - b.zone).forEach(c => out.push({t:'z', c, m:r.m})); } else if (r.t === 'c') out.push(r); });
  return out.filter(o => (o.c || o.m));
}
function pdfLoadSym(doc, t, x, y){
  const g = [70, 80, 90]; doc.setDrawColor(...g); doc.setFillColor(255, 255, 255); doc.setLineWidth(.3);
  const box = () => doc.roundedRect(x - 2.1, y - 1.7, 4.2, 3.4, .5, .5, 'FD');
  if (t === 'lighting'){ doc.circle(x, y, 1.9, 'FD'); doc.line(x - 1.3, y - 1.3, x + 1.3, y + 1.3); doc.line(x + 1.3, y - 1.3, x - 1.3, y + 1.3); }
  else if (t === 'sockets'){ doc.circle(x, y, 1.9, 'FD'); doc.line(x - .7, y - 1, x - .7, y + 1); doc.line(x + .7, y - 1, x + .7, y + 1); }
  else if (t === 'av'){ box(); doc.lines([[.5, -1.1, .8, 0, 1.2, 0]], x - 1.5, y, [1, 1], 'S'); doc.lines([[.5, 1.1, .8, 0, 1.2, 0]], x, y, [1, 1], 'S'); }
  else if (t === 'hvac'){ doc.circle(x, y, 1.9, 'FD'); doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5); doc.setTextColor(...g); doc.text('M', x, y + .8, {align: 'center'}); }
  else if (t === 'heater'){ box(); doc.line(x - 1.4, y, x - .9, y - 1); doc.line(x - .9, y - 1, x - .2, y + 1); doc.line(x - .2, y + 1, x + .5, y - 1); doc.line(x + .5, y - 1, x + 1.4, y); }
  else if (t === 'galley'){ doc.roundedRect(x - 1.9, y - 1.9, 3.8, 3.8, .7, .7, 'FD'); doc.circle(x, y, .8, 'S'); }
  else if (t === 'critical'){ doc.triangle(x, y - 2.1, x + 2.1, y + 1.7, x - 2.1, y + 1.7, 'FD'); doc.line(x, y - .7, x, y + .6); doc.setFillColor(...g); doc.circle(x, y + 1.1, .2, 'F'); }
  else box();
  doc.setTextColor(0);
}
function pdfDiagram(doc, logo, PW, ML){
  const out = diagRows(), three = S.phases === 3, buses = three ? ['L1', 'L2', 'L3', 'N'] : ['L1', 'N'];
  const k = (PW - 2 * ML) / 1160, X = u => ML + u * k, bx = {}; buses.forEach((p, i) => { bx[p] = 40 + i * 14; });
  const hts = out.map(o => (o.t === 'c' && R.c[o.c.id].thr) ? 62 : 42), dp = dpOf(S);
  const col = p => PHRGB[p] || PHRGB.N, line = (x1, y1, x2, y2, c, w) => { doc.setDrawColor(...c); doc.setLineWidth(w || .35); doc.line(x1, y1, x2, y2); };
  const txt = (t, x, y, sz = 6.5, bold = false, c = [40, 48, 56]) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(sz); doc.setTextColor(...c); doc.text(String(t).replace(/²/g, '2').replace(/×/g, 'x').replace(/Δ/g, 'RCD').replace(/[·–]/g, '-'), x, y); };
  const stcL = { ok: [44, 122, 75], warn: [154, 106, 18], bad: [179, 38, 30] };
  const pages = []; let cur = [], hacc = 0; const first = 126, rest = 146;
  out.forEach((o, i) => { const h = hts[i] * k, lim = pages.length ? rest : first; if (hacc + h > lim && cur.length){ pages.push(cur); cur = []; hacc = 0; } cur.push(i); hacc += h; });
  pages.push(cur);
  const sys = SYSTEMS.find(x => x.id === S.sysId);
  pages.forEach((idxs, pg) => {
    doc.addPage(); logo();
    txt(PT('Multi-line diagram'), ML, 14, 13, true); txt(`${S.name}${S.company ? ' · ' + S.company : ''}   ${PT('(page ' + (pg + 1) + ' of ' + pages.length + ')')}`, ML, 19, 8);
    txt(`${STD[S.std].n} · ${sys ? sys.label : ''} · Ik ${S.ik} kA · ${buses.filter(p => p !== 'N').join(' ')} and N conductors shown`, ML, 23.5, 7.5, false, [90, 98, 106]);
    let y = 28;
    if (pg === 0){
      const mx = X((bx[buses[0]] + bx.N) / 2), ink = [30, 36, 42], gy = [110, 120, 130];
      doc.setDrawColor(...ink); doc.setFillColor(255, 255, 255); doc.setLineWidth(.4); doc.circle(mx, y + 4, 3.2, 'FD');
      doc.setLineWidth(.35); doc.lines([[.9, -1.8, 1.8, -1.8, 2.7, 0], [.9, 1.8, 1.8, 1.8, 2.7, 0]], mx - 2.7, y + 4, [1, 1], 'S');
      line(mx, y + 7.2, mx, y + 10, ink, .6);
      doc.setFillColor(255, 255, 255); doc.circle(mx - 1.8, y + 12.5, .55, 'FD'); line(mx - 1.8, y + 12.5, mx + 1.4, y + 10.4, ink, .5); line(mx, y + 14.6, mx, y + 27, ink, .6);
      doc.setFillColor(...ink); doc.circle(mx, y + 19.5, .5, 'F');
      txt(`Supply ${sys ? sys.label : ''}`, mx + 7, y + 3, 7.5, true);
      txt(`Incomer cable ${R.inc.cab.size} mm2 ${S.incCable === 'pvc' ? 'PVC' : 'XLPE'} - ${S.incLen} m`, mx + 7, y + 7, 6.5, false, [90, 98, 106]);
      txt(`Q0 main ${R.inc.In || '-'} A ${isLV(S) ? (dpOf(S) ? '2P' : '1P') + (isDC(S) ? ' DC' : '') : (three ? '3P+N' : '1P+N')}`, mx + 7, y + 12.5, 7.5, true);
      if (S.spd){ line(mx, y + 17, mx + 12, y + 17, ink, .4); doc.setFillColor(255, 255, 255); doc.setDrawColor(...ink); doc.rect(mx + 12, y + 15, 6, 4, 'FD'); txt('SPD', mx + 13, y + 18, 5.5, true); txt('Surge protective device type 2', mx + 20, y + 18, 6.5, false, [90, 98, 106]); }
      y += 21;
    }
    const heads = [[PT('CIRCUIT'), 222], [PT('PROTECTION'), 520], [PT('CABLE'), 700], [PT('LOAD'), 905], ['VD', 1075]];
    doc.setFillColor(232, 236, 240); doc.rect(ML, y + 1, PW - 2 * ML, 4.6, 'F'); heads.forEach(h => txt(h[0], X(h[1]), y + 4.3, 6, true, [90, 98, 106])); y += 6;
    const yEnd = y + idxs.reduce((a, i) => a + hts[i] * k, 0);
    { let by = y; idxs.forEach((i, n) => { const h = hts[i] * k; if (n % 2 === 0){ doc.setFillColor(244, 246, 248); doc.rect(X(60), by, PW - ML - X(60), h, 'F'); } by += h; }); }
    doc.setFillColor(30, 36, 42); doc.rect(X(bx[buses[0]] - 10), y - .2, (bx.N - bx[buses[0]] + 20) * k, 1.2, 'F');
    buses.forEach(p => { if (p === 'N') doc.setLineDashPattern([1.2, .8], 0); line(X(bx[p]), y, X(bx[p]), yEnd, col(p), p === 'N' ? .4 : .6); doc.setLineDashPattern([], 0); txt(busLab(p).replace('−', '-'), X(bx[p]) - 1.2, yEnd + 3, 6, true, col(p)); });
    let yy = y;
    idxs.forEach((i, n) => {
      const o = out[i], h = hts[i] * k, yc = yy + h / 2 - .5, next = out[i + 1] && idxs.includes(i + 1) ? out[i + 1] : null;
      const sym = (x, y2, c) => { doc.setDrawColor(...c); doc.setLineWidth(.35); doc.setFillColor(255, 255, 255); doc.circle(x, y2, .45, 'FD'); line(x, y2, x + 2.2, y2 - 1.8, c, .45); line(x + 1, y2 - 3, x + 2.6, y2 - 1.3, c, .25); line(x + 2.6, y2 - 3, x + 1, y2 - 1.3, c, .25); };
      const stc = { ok: [44, 122, 75], warn: [154, 106, 18], bad: [179, 38, 30] };
      const dot = (ref) => { doc.setFillColor(...stc[statusOf(ref)]); doc.circle(X(1135), yc, 1, 'F'); };
      const cond = (lives, yN, neutralSw, rcd) => {
        lives.forEach(l => { line(X(bx[l.p]), l.y, X(160), l.y, col(l.p), .55); doc.setFillColor(...col(l.p)); doc.circle(X(bx[l.p]), l.y, .6, 'F'); sym(X(112) - 1.6, l.y, col(l.p)); });
        line(X(bx.N), yN, X(160), yN, PHRGB.N, .45); doc.setFillColor(...PHRGB.N); doc.circle(X(bx.N), yN, .6, 'F');
        if (neutralSw){ const t = lives[0].y - 3.4, b = yN + 1.6; doc.setDrawColor(...(rcd ? PHRGB.N : [110, 120, 130])); doc.setLineWidth(.25); doc.setLineDashPattern(rcd ? [] : [.8, .6], 0); doc.rect(X(112) - 4.2, t, 8.4, b - t); doc.setLineDashPattern([], 0); sym(X(112) - 1.6, yN, PHRGB.N); }
        if (rcd) txt('Δ', X(112) + 4.6, (lives[0].y + yN) / 2 + 1, 6, true, PHRGB.N);
      };
      const colsTxt = (name, prot, cab, load, vd, ib, inn, ref, lt) => { if (lt) pdfLoadSym(doc, lt, X(884), yc); txt(name, X(222), yc + 1, 6.5); txt(prot, X(520), yc + 1, 6.5, false, [80, 88, 96]); txt(cab, X(700), yc + 1, 6.5, false, [80, 88, 96]);
        doc.setFillColor(226, 231, 236); doc.rect(X(905), yc - .8, 54 * k, 1.6, 'F'); const f = inn ? Math.min(1, ib / inn) : 0; doc.setFillColor(...(f > .9 ? [154, 106, 18] : [11, 107, 142])); doc.rect(X(905), yc - .8, 54 * k * f, 1.6, 'F');
        txt(load, X(905) + 54 * k + 1.5, yc + 1, 6.5, false, [80, 88, 96]); txt(vd, X(1075), yc + 1, 6.5, false, [80, 88, 96]); dot(ref); };
      if (o.t === 'z'){
        const r = R.c[o.c.id], c = col(r.ph);
        line(X(150), yc - 2.3, X(176), yc - 2.3, c, .5); line(X(158), yc + 2.3, X(196), yc + 2.3, PHRGB.N, .45);
        if (next) { doc.setLineDashPattern([.6, .6], 0); line(X(150), yy, X(150), yy + h, c, .4); line(X(158), yy, X(158), yy + h, PHRGB.N, .4); doc.setLineDashPattern([], 0); }
        else { doc.setLineDashPattern([.6, .6], 0); line(X(150), yy, X(150), yc - 2.3, c, .4); line(X(158), yy, X(158), yc + 2.3, PHRGB.N, .4); doc.setLineDashPattern([], 0); }
        doc.setDrawColor(90); doc.setLineWidth(.25); doc.rect(X(176), yc - 3.8, 28 * k, 3.4); txt('Z' + o.c.zone, X(180), yc - 1.2, 5.5);
        colsTxt(`${o.c.ref} ${clip(o.c.name, 30)}`, `via ${o.m.id} (${R.m[o.m.id].In || '-'} A) L+N`, `${cabTxt(r.cab, false, o.c.cable)} ${o.c.len} m`, `${o.c.P} W ${fmt(r.Ib, 1)} A`, fmt(r.vdTot, 1) + '%', r.Ib, R.m[o.m.id].In, o.c.ref, o.c.type);
      } else if (o.t === 'f'){
        const r = R.m[o.m.id];
        cond([{p: r.ph, y: yc - 2.2}], yc + 2.2, dp, false);
        if (next) { doc.setLineDashPattern([.6, .6], 0); line(X(150), yc - 2.2, X(150), yy + h, col(r.ph), .4); line(X(158), yc + 2.2, X(158), yy + h, PHRGB.N, .4); doc.setLineDashPattern([], 0); }
        doc.setFillColor(36, 44, 52); doc.rect(X(222) - 1, yc - 2.2, 62, 4.4, 'F'); txt(`${o.m.id} ${o.m.model}`, X(222) + 1, yc + .8, 6.5, true, [235, 238, 241]);
        txt(`MCB ${r.In} A ${r.ph}+N`, X(520), yc + 1, 6.5, false, [80, 88, 96]); txt(`2x${r.cab.size} mm2 ${o.m.len} m`, X(700), yc + 1, 6.5, false, [80, 88, 96]);
        doc.setFillColor(226, 231, 236); doc.rect(X(905), yc - .8, 54 * k, 1.6, 'F'); const f = r.In ? Math.min(1, r.Ib / r.In) : 0; doc.setFillColor(...(f > .9 ? [154, 106, 18] : [11, 107, 142])); doc.rect(X(905), yc - .8, 54 * k * f, 1.6, 'F');
        txt(`feed ${fmt(r.Ib, 1)} A`, X(905) + 54 * k + 1.5, yc + 1, 6.5, false, [80, 88, 96]); txt(fmt(r.cab.vd, 1) + '%', X(1075), yc + 1, 6.5, false, [80, 88, 96]); dot(o.m.id);
      } else {
        const c = o.c, r = R.c[c.id], rcd = c.prot === 'RCBO', cc = col(r.thr ? 'L1' : r.ph);
        const lives = r.thr ? [{p: 'L1', y: yc - 4.6}, {p: 'L2', y: yc - 2.4}, {p: 'L3', y: yc - .2}] : [{p: r.ph, y: yc - 2.2}];
        cond(lives, r.thr ? yc + 2.6 : yc + 2.2, rcd || dp, rcd);
        doc.setDrawColor(...cc); doc.setLineWidth(.3); doc.rect(X(166), yc - 2, 9, 4); txt(clip(c.ref, 5), X(166) + 1.1, yc + .8, 6, true);
        colsTxt(clip(c.name, 32), `${c.prot} ${r.curve === 'Std' ? '' : r.curve}${r.In} A${rcd ? ' 30 mA' : ''} ${isDC(S) ? '+/-' : (r.thr ? 'L1L2L3' : r.ph) + '+N'}`, `${cabTxt(r.cab, r.thr, c.cable)} ${c.len} m`, `${c.P} W ${fmt(r.Ib, 1)} A`, fmt(r.vdTot, 1) + '%', r.Ib, r.In, c.ref, c.type);
      }
      yy += h;
    });
    if (pg === pages.length - 1){ const ft = three ? ['L1', 'L2', 'L3'].map(p => `${p} ${fmt(R.ph[p], 1)} A / ${fmt(R.power.phW[p] / 1000, 2)} kW`).join('   ') : `L1 ${fmt(R.ph.L1, 1)} A / ${fmt(R.power.phW.L1 / 1000, 2)} kW`; txt(`${PT(isLV(S) ? 'Bus loading' : 'Phase loading')} (${PT('after diversity')} ${S.diversity}):  ${ft}`, ML, Math.min(yEnd + 8, 190), 7, true);
      [['ok', 'OK'], ['warn', 'Check'], ['bad', 'Fail']].forEach((l, i) => { doc.setFillColor(...stcL[l[0]]); doc.circle(ML + 3 + i * 20, Math.min(yEnd + 12.5, 194.5), 1, 'F'); txt(PT(l[1]), ML + 5.5 + i * 20, Math.min(yEnd + 13.3, 195.3), 6.5, false, [80, 88, 96]); }); }
    { const bx0 = PW - ML - 92, by0 = 187, cw = 46, rh = 6, cells = [['Project', S.name, 0, 0], ['Company', S.company || '-', 1, 0], ['Standard', STD[S.std].n, 0, 1], ['Date', new Date().toLocaleDateString(), 1, 1]];
      doc.setDrawColor(70, 80, 90); doc.setLineWidth(.3); doc.setFillColor(255, 255, 255); doc.rect(bx0, by0, cw * 2, rh * 2, 'FD'); doc.line(bx0, by0 + rh, bx0 + cw * 2, by0 + rh); doc.line(bx0 + cw, by0, bx0 + cw, by0 + rh * 2);
      cells.forEach(c => { txt(PT(c[0]), bx0 + c[2] * cw + 1, by0 + c[3] * rh + 2, 4.5, false, [110, 118, 126]); txt(clip(String(c[1]), 24), bx0 + c[2] * cw + 1, by0 + c[3] * rh + 4.8, 6, true); }); }
  });
}
const PDF_SECS = [['cover', 'Cover page with company details', 1], ['panel', 'Panel layout', 1], ['diagram', 'Multi-line diagram', 1], ['dali', 'DALI network and module layout', 1], ['sched', 'Circuit schedule', 1], ['bom', 'Bill of materials', 0]];
let pdfOpt = {};
PDF_SECS.forEach(x => { pdfOpt[x[0]] = !!x[2]; });
try { const sv = JSON.parse(localStorage.getItem('dbd_pdfsecs') || 'null'); if (sv) PDF_SECS.forEach(x => { if (typeof sv[x[0]] === 'boolean') pdfOpt[x[0]] = sv[x[0]]; }); } catch (e) {}
document.addEventListener('change', e => { const t = e.target; if (t && t.dataset && t.dataset.pdfsec){ pdfOpt[t.dataset.pdfsec] = t.checked; try { localStorage.setItem('dbd_pdfsecs', JSON.stringify(pdfOpt)); } catch (x) {} } });
function exportPDF(){
  if (!window.jspdf){ toast('PDF library did not load.'); return; }
  const doc = new window.jspdf.jsPDF({orientation: 'landscape', unit: 'mm', format: 'a4'});
  const PW = 297, ML = 12;
  const logo = () => { if (S.logo && S.logoW){ const h = 11, w = Math.min(50, h * S.logoW / S.logoH); try { doc.addImage(S.logo, 'PNG', PW - ML - w, 6, w, w * S.logoH / S.logoW); } catch (e) {} } };
  const sysLabel = (SYSTEMS.find(s => s.id === S.sysId) || {}).label || '';
  const summary1 = `${STD[S.std].n} · ${sysLabel} · Ik ${S.ik} kA · incomer ${R.inc.In || '-'} A · max phase ${fmt(R.inc.Imax, 1)} A · enclosure approx ${B.widthMm} x ${B.heightMm} mm`;
  const summary2 = PT(`Connected ${fmt(R.power.conn / 1000, 2)} kW · demand ${fmt(R.power.dem / 1000, 2)} kW · ${fmt(R.power.kva / 1000, 2)} kVA · PF ${fmt(R.power.pf, 2)}`);
  const a8 = t => String(t == null ? '' : t).replace(/[^\x20-\x7e\u00a0-\u00ff\n]/g, '');
  const want = k => !!pdfOpt[k];
  let firstPage = true, dropFirst = false;
  if (!PDF_SECS.some(x => want(x[0]))){ toast('Tick at least one section for the PDF.'); return; }
  const newPage = () => { if (firstPage) firstPage = false; else doc.addPage(); };
  const pageHead = (title) => { logo(); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(40); doc.text(a8(S.name), ML, 14); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90); doc.text(a8(S.company ? S.company + ' · ' + title : title), ML, 19); doc.setTextColor(0); };
  if (want('cover')){
    newPage();
    const LH = 24;
    if (S.logo && S.logoW){ const w = Math.min(70, LH * S.logoW / S.logoH), h = w * S.logoH / S.logoW; try { doc.addImage(S.logo, 'PNG', ML, 16, w, h); } catch (e) {} }
    let y = 56;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.setTextColor(20); doc.text(doc.splitTextToSize(a8(S.name), PW - 2 * ML).slice(0, 2), ML, y); y += 12 * Math.min(2, doc.splitTextToSize(a8(S.name), PW - 2 * ML).length);
    doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(90); doc.text(PT('Distribution board design'), ML, y); y += 12;
    doc.setDrawColor(11, 107, 142); doc.setLineWidth(0.8); doc.line(ML, y, ML + 40, y); y += 9;
    if (S.company){ doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(30); doc.text(a8(S.company), ML, y); y += 6.5; }
    if (S.companyInfo){ doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(70); a8(S.companyInfo).split('\n').forEach(l => doc.splitTextToSize(l, 120).forEach(w => { doc.text(w, ML, y); y += 5; })); }
    y = Math.max(y + 8, 112);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(40); doc.text(PT('Project summary'), ML, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70); doc.text(doc.splitTextToSize(a8(summary1), PW - 2 * ML), ML, y); y += 5.5 * doc.splitTextToSize(a8(summary1), PW - 2 * ML).length; doc.text(a8(summary2), ML, y); y += 10;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(40); doc.text(PT('Contents'), ML, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(70);
    PDF_SECS.filter(x => x[0] !== 'cover' && want(x[0])).forEach(x => { doc.text(PT(x[1]), ML, y); y += 5; });
    doc.setFontSize(8); doc.setTextColor(110); doc.text(PT('Design aid. Verify ratings against the standard edition, manufacturer datasheets and a qualified engineer before building.'), ML, 200);
    doc.setTextColor(0);
  }
  const RPP = 3;
  const u = Math.min(8.5, (PW - 2 * ML - 24) / B.cols), dh = Math.min(u * 3.2, 21), rp = Math.min(dh + 42, 52), x0 = ML + 14, y0 = 35;
  const panelPage = (r0, r1) => {
    const n = r1 - r0;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(40); doc.text(PT(r0 ? `Panel layout (rails ${r0 + 1} to ${r1})` : (B.rows > RPP ? `Panel layout (rails 1 to ${r1})` : 'Panel layout')), ML, y0 - 4.5); doc.setFont('helvetica', 'normal');
  doc.setDrawColor(120, 130, 140); doc.setLineWidth(0.5); doc.setFillColor(240, 243, 246); doc.roundedRect(x0 - 12, y0 - 2, B.cols * u + 20, n * rp + 3, 2, 2, 'FD'); doc.setLineWidth(0.2);
  for (let r = 0; r < n; r++){
    const ry = y0 + r * rp;
    doc.setFillColor(205, 212, 219); doc.rect(x0 - 3, ry + 2 + dh * 0.5 - 1.6, B.cols * u + 6, 3.2, 'F'); doc.setFillColor(160, 170, 180); doc.rect(x0 - 3, ry + 2 + dh * 0.5 - 0.3, B.cols * u + 6, 0.6, 'F');
    doc.setFillColor(11, 107, 142); doc.roundedRect(x0 - 10.5, ry + 2 + dh * 0.5 - 6, 5.5, 12, 1, 1, 'F'); doc.setTextColor(255); doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.text(String(r0 + r + 1), x0 - 7.75, ry + 2 + dh * 0.5 + 1.1, {align: 'center'}); doc.setFont('helvetica', 'normal');
  }
  const scr = (cx, cy) => { doc.setFillColor(150, 158, 166); doc.circle(cx, cy, 0.8, 'F'); doc.setDrawColor(70); doc.line(cx - 0.5, cy + 0.2, cx + 0.5, cy - 0.2); doc.setDrawColor(120, 130, 140); };
  B.place.filter(p => p.row >= r0 && p.row < r1).forEach(p => {
    const d = p.d, x = x0 + p.col * u, y = y0 + (p.row - r0) * rp + 2, w = d.w * u - 0.4, col = PHRGB[d.ph] || PHRGB.N;
    doc.setDrawColor(110, 120, 130);
    if (d.kind === 'lutron'){
      doc.setFillColor(42, 50, 59); doc.roundedRect(x, y, w, dh, 1, 1, 'FD'); doc.setFillColor(...col); doc.rect(x + 0.5, y, w - 1, 1.3, 'F');
      doc.setTextColor(240); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text(d.lib.model, x + 2, y + 6); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.2); doc.setTextColor(200); doc.text(`${d.ref} · ${d.lib.fam}`.slice(0, Math.floor(w / 1.3)), x + 2, y + 9.8);
      const zn = d.lib.zones || 0;
      if (zn){ const zw = (w - 4) / zn; for (let z = 1; z <= zn; z++){ const cs = S.circuits.filter(c => c.mod === d.mod && c.zone === z).map(c => c.ref).join(' '); const zx = x + 2 + (z - 1) * zw;
        doc.setFillColor(58, 69, 80); doc.roundedRect(zx, y + dh - 7.5, zw - 1, 6, 0.8, 0.8, 'F'); doc.setFillColor(cs ? 80 : 120, cs ? 200 : 128, cs ? 130 : 136); doc.circle(zx + 1.8, y + dh - 4.5, 0.7, 'F'); doc.setTextColor(235); doc.setFontSize(6); if (zw >= 14) doc.text(`Z${z} ${cs || 'free'}`.slice(0, Math.floor((zw - 4) / 1.25)), zx + 3.4, y + dh - 3.7); else if (cs || z === 1 || z === zn || z % 4 === 0) doc.text(String(z), zx + zw / 2 - 0.5, y + dh - 3.7, {align: 'center'}); } }
    }
    else if (d.kind === 'incomer'){
      doc.setFillColor(242, 193, 46); doc.roundedRect(x, y, w, dh, 1, 1, 'FD'); doc.setFillColor(...col); doc.rect(x, y, w, 1.2, 'F');
      doc.setFillColor(198, 40, 40); doc.roundedRect(x + w * 0.2, y + 4, w * 0.6, 4, 2, 2, 'F'); doc.setFillColor(40); doc.circle(x + w / 2, y + 6, 1, 'F');
      doc.setFillColor(255); doc.roundedRect(x + 1.5, y + dh - 9.5, w - 3, 8, 0.8, 0.8, 'F'); doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(`${d.rating || '-'}A`, x + w / 2, y + dh - 4.6, {align: 'center'}); doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(90); doc.text('MAIN', x + w / 2, y + dh - 2.4, {align: 'center'});
    }
    else if (d.kind === 'dali'){
      const a8 = s => String(s).replace(/[^\x20-\x7e]/g, ''), bc = hexRgb(d.band);
      doc.setFillColor(42, 50, 59); doc.roundedRect(x, y, w, dh, 1, 1, 'FD'); doc.setFillColor(...bc); doc.rect(x + 0.5, y, w - 1, 1.3, 'F'); doc.setTextColor(235); doc.setFont('helvetica', 'bold');
      if (w < 14){ doc.setFontSize(6); doc.text(a8(d.ref), x + w / 2, y + 6.5, {align: 'center'}); doc.setFontSize(4.5); doc.text(a8(d.addr || ''), x + w / 2, y + 10, {align: 'center'}); doc.setFont('helvetica', 'normal'); doc.setFontSize(5); doc.text(a8(d.dc.m.replace('DALI-2 ', '')).slice(0, 18), x + w / 2 + 1.2, y + dh - 1.5, {angle: 90}); }
      else { doc.setFontSize(7.5); doc.text(a8(d.dc.m).slice(0, Math.floor(w / 1.6)), x + 1.5, y + 7); doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.text(a8(d.ref + ' ' + (d.addr || '')), x + 1.5, y + 11.5); doc.text(a8(d.lnk || 'not connected'), x + 1.5, y + 15.5); }
      doc.setTextColor(0); doc.setFont('helvetica', 'normal');
    }
    else if (d.kind === 'spd'){
      doc.setFillColor(205, 212, 219); doc.roundedRect(x, y, w, dh, 1, 1, 'FD'); doc.setFillColor(30, 120, 70); doc.roundedRect(x + 1.5, y + 3, w - 3, 5, 0.8, 0.8, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.text('OK', x + w / 2, y + 6.5, {align: 'center'});
      doc.setFillColor(255); doc.roundedRect(x + 1.5, y + dh - 9.5, w - 3, 8, 0.8, 0.8, 'F'); doc.setTextColor(20); doc.setFontSize(8.5); doc.text('SPD', x + w / 2, y + dh - 4.6, {align: 'center'}); doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(90); doc.text('TYPE 2', x + w / 2, y + dh - 2.4, {align: 'center'});
    }
    else {
      doc.setFillColor(213, 220, 227); doc.roundedRect(x, y, w, dh, 0.8, 0.8, 'FD'); doc.setFillColor(...col); doc.rect(x + 0.3, y, w - 0.6, 1.2, 'F');
      if (u >= 5) { scr(x + w / 2, y + 3); scr(x + w / 2, y + dh - 1.8); }
      doc.setFillColor(35, 42, 50); doc.roundedRect(x + w / 2 - 1.5, y + 5, 3, 5.5, 0.6, 0.6, 'F'); doc.setFillColor(...col); doc.rect(x + w / 2 - 1.1, y + 5.5, 2.2, 1.6, 'F');
      doc.setFillColor(255); doc.rect(x + 0.6, y + dh - 9.2, w - 1.2, 6.8, 'F');
      const rt = (d.curve && d.curve !== 'Std' && d.kind !== 'feed' ? d.curve : '') + (d.rating || '-');
      doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(u < 6 ? 6 : 7.5); doc.text(rt, x + w / 2, y + dh - 5.4, {align: 'center'}); doc.setFont('helvetica', 'normal'); doc.setFontSize(5); doc.setTextColor(90); doc.text(d.ref, x + w / 2, y + dh - 3, {align: 'center'});
    }
  });
  /* circuit names under each device */
  doc.setTextColor(25); doc.setFont('helvetica', 'normal');
  B.place.filter(p => p.row >= r0 && p.row < r1).forEach(p => {
    const d = p.d, x = x0 + p.col * u, y = y0 + (p.row - r0) * rp + 2 + dh + 2.5, w = d.w * u - 0.4;
    const put = (tx, cx, ww) => { if (!tx) return; doc.setFontSize(7); if (ww >= 30){ doc.text(doc.splitTextToSize(tx, ww).slice(0, 2), cx, y + 2.5, {align: 'center'}); } else { doc.setDrawColor(190); doc.line(cx, y - 2, cx, y - 0.5); doc.text(String(tx).length > 21 ? String(tx).slice(0, 20) + '.' : String(tx), cx + 1.2, y, {angle: 270}); } };
    if (d.kind === 'lutron' && d.lib.zones){ for (let z = 1; z <= d.lib.zones; z++){ const cs = S.circuits.filter(c => c.mod === d.mod && c.zone === z); if (cs.length){ const zw = (w - 4) / d.lib.zones; put(cs.map(c => c.ref + ' ' + c.name).join(', '), x + 2 + (z - 1) * zw + zw / 2, zw); } } }
    else put(d.kind === 'incomer' ? PT('Main') : d.kind === 'spd' ? PT('Surge') : d.label, x + w / 2, w);
  });
  doc.setTextColor(0);
  };
  if (want('panel')) for (let r0 = 0; r0 < B.rows; r0 += RPP){ newPage(); pageHead(PT('Panel layout')); panelPage(r0, Math.min(B.rows, r0 + RPP)); }
  if (want('diagram')){ if (firstPage){ dropFirst = true; firstPage = false; } pdfDiagram(doc, logo, PW, ML); doc.setTextColor(0); firstPage = false; }
  if (want('dali')){ if (firstPage && dS().units.length){ dropFirst = true; firstPage = false; } try { dPdf(doc, logo, PW, ML); firstPage = false; } catch (e) { console.warn('DALI pages skipped', e); } }
  if (want('sched') || want('bom')){ newPage(); logo(); }
  if (want('sched')){ doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(PT('Circuit schedule'), ML, 14); }
  let y = 22;
  if (want('sched')){
  const cols = [['Ref', 12], ['Description', 48], ['Fed from', 22], ['Ph', 12], ['Load W', 16], ['Ib A', 13], ['Protection', 26], ['Cable', 38], ['Len m', 12], ['Iz A', 12], ['VD %', 13], ['Status', 14]];
  const rows = schedRows(); 
  const head = () => { doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setFillColor(230, 234, 238); doc.rect(ML, y - 4, PW - 2 * ML, 6, 'F'); let x = ML + 1; cols.forEach(c => { doc.text(String(PT(c[0])).slice(0, Math.max(3, Math.floor(c[1] / 1.45))), x, y); x += c[1]; }); y += 6; doc.setFont('helvetica', 'normal'); };
  head();
  rows.forEach(r => {
    if (y > 196){ doc.addPage(); logo(); y = 16; head(); }
    const v = [r[0], r[1], r[3], r[4], r[5], r[8], r[9], r[11], r[12], r[13], r[14], r[15]]; let x = ML + 1;
    v.forEach((t, i) => { doc.text(String(t).slice(0, Math.floor(cols[i][1] / 1.7)), x, y); x += cols[i][1]; }); y += 5.2;
  });
  }
  if (want('bom')){ if (want('sched')){ y += 8; if (y > 180){ doc.addPage(); logo(); y = 16; } } else y = 14;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text(PT('Bill of materials'), ML, y); y += 7; doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  bomRows().forEach(b => { if (y > 196){ doc.addPage(); y = 16; } doc.text(String(b[1]) + ' x', ML, y); doc.text(b[0], ML + 14, y); y += 5; }); }
  if (want('sched') || want('bom')){ y += 4; doc.setFontSize(7); doc.setTextColor(110); doc.text(PT('Design aid. Verify ratings against the standard edition, manufacturer datasheets and a qualified engineer before building.'), ML, Math.min(y, 200)); }
  if (dropFirst && doc.getNumberOfPages() > 1) doc.deletePage(1);
  dl(slug() + '.pdf', doc.output('arraybuffer'));
}
function renderExport(){
  return `<div class="exp">
   <div class="card"><h3>PDF drawing and schedule</h3><p class="muted">Choose what goes in the PDF. A4 landscape, with your logo on each page.</p><div class="pdfsecs">${PDF_SECS.map(x => `<label class="chk"><input type="checkbox" data-pdfsec="${x[0]}" ${pdfOpt[x[0]] ? 'checked' : ''}> ${x[1]}</label>`).join('')}</div><button class="btn pri" data-a="pdf">Save PDF</button></div>
   <div class="card"><h3>Excel workbook</h3><p class="muted">Schedule, Lutron modules, bill of materials, phase balance, power and project sheets. Holds the company name; Excel files from this tool cannot embed the logo image.</p><button class="btn pri" data-a="xlsx">Save Excel</button></div>
   <div class="card"><h3>CSV schedule</h3><p class="muted">Plain circuit schedule for import into other tools.</p><button class="btn" data-a="csv">Save CSV</button></div>
   <div class="card"><h3>Project file</h3><p class="muted">Save the whole design as JSON, or open one you saved earlier.</p><div class="row"><button class="btn" data-a="json">Save project</button><label class="btn" for="openfile" style="cursor:pointer">Open project…</label><input type="file" id="openfile" accept=".json,application/json" hidden></div></div></div>
   <p class="note">The board also saves in this browser while you work. Exports open a save prompt each time.</p>`;
}

/* ---------- router and events ---------- */
const TABS = [['setup', 'Setup'], ['panel', 'Panel'], ['circuits', 'Circuits'], ['equipment', 'Equipment'], ['checks', 'Checks'], ['diagram', 'Diagram'], ['dali', 'DALI'], ['tools', 'Tools'], ['export', 'Export']];
const TICON = {
  setup:'<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  panel:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M8 5v2M12 5v2M16 5v2M8 11v2M12 11v2M8 17v2M12 17v2"/>',
  circuits:'<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  equipment:'<path d="M12 3v4M9 3v4M15 3v4"/><rect x="6" y="7" width="12" height="7" rx="2"/><path d="M12 14v4a3 3 0 0 0 3 3h2"/>',
  checks:'<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
  diagram:'<path d="M3 5h5M3 12h5M3 19h5M8 5v14M8 12h6M14 9h7v6h-7zM8 19h13"/>',
  dali:'<circle cx="12" cy="5" r="2.2"/><path d="M12 7.2V12M5 12h14M5 12v3.5M12 12v3.5M19 12v3.5"/><rect x="3" y="15.5" width="4" height="5" rx="1"/><rect x="10" y="15.5" width="4" height="5" rx="1"/><rect x="17" y="15.5" width="4" height="5" rx="1"/>',
  tools:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3.5 17.5a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.1-.6-.6-2.1z"/>',
  export:'<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>'};

function renderHelp(){
  const steps = [
   ['Sign in, start or import a board', 'On the hosted version you start from your <b>Dashboard</b> after you sign in. Press <b>New board</b> to start from scratch, open a saved project, or press <b>Import a panel</b> to build a board from a photo of a built panel or from a PDF schematic or circuit schedule. Add up to four photos of one panel, or one PDF, then press <b>Read panel</b>. The reader lists every device it can see (breaker kind, rating, curve, poles, RCD, circuit name, load, phase, cable, make and model) next to your picture. <b>Check and correct the table</b>, then press <b>Create board</b>. The new board opens on <b>Circuits</b> and works like any other, so you can add or edit circuits and labels and export the schematic, bill of materials, PDF and Excel. Anything the reader could not see is left blank and flagged for you to fill in.'],
   ['Set up the project', 'Open <b>Setup</b>. Give the board a name, add your company name and logo (they appear at the top of the page and on the PDF), and pick the <b>standard</b> and <b>supply type</b>: single phase, three phase, or low voltage AC / DC (12, 24, 48 V DC or 24 V AC for marine and similar boards). Then set ambient temperatures, diversity factor, the incomer cable, voltage-drop limits, the breaker series you want to use, how many modules fit on a DIN rail, and whether RCBOs take 1 or 2 modules.'],
   ['Add your circuits', 'Open <b>Circuits</b> and press <b>Add circuit</b>. For each circuit enter a name, type, power in watts, power factor, phase, cable length, protection (MCB or RCBO) and curve. The tool sizes the cable, picks the breaker rating and works out current and voltage drop. <b>Auto-balance phases</b> spreads the load over L1, L2 and L3, and <b>Renumber</b> tidies the references. On a low-voltage board, the quick calculator at the top gives the breaker for a load straight away.'],
   ['Add DIN modules', 'Open <b>Equipment</b> to browse DIN-rail control equipment from Lutron, Crestron, Control4 and MDT KNX (processors, interfaces, power supplies, dimming, switching and shutter modules, gateways) with a brand filter, and the breaker library (Schneider, ABB, Siemens, Legrand, Hager, Eaton, Chint). Press <b>Add</b> on a module to place it on the board. Back in <b>Circuits</b>, choose the module and zone (channel) a circuit is fed from. Each module also gets its own feed breaker. Press <b>Use</b> on a breaker series to make it the default for MCBs, RCBOs or the main.'],
   ['Check the panel layout', 'Open <b>Panel</b> to see the DIN rails drawn with every device and its circuit name. Click a device to open the inspector: edit it, move it along the rail or to another rail, or delete it. Use <b>+ Circuit</b>, <b>+ DIN module</b> or <b>+ Custom device</b> to add things here too. You can change the main breaker, and bring back a deleted main or surge protector with the restore buttons. <b>Fit to screen</b> and <b>Full size</b> switch the zoom.'],
   ['Read the checks', 'Open <b>Checks</b>. The tool tests that each breaker covers the load and protects its cable, that voltage drop stays under your limit, that RCD protection is present where the standard asks for it, that breaker breaking capacity covers the fault level, and that Lutron module and zone limits (load, current, voltage, temperature) are respected. It also checks the incomer rating and cable, phase imbalance and enclosure heat. <b>Fail</b> means fix it before building, <b>Review</b> means look at it and decide, and notes are for information.'],
   ['Review the diagram', 'Open <b>Diagram</b> for the multi-line wiring diagram. Every live conductor is drawn from its phase bus and the neutral from the N bus. A dashed box marks breakers that switch the neutral, a triangle marks the RCD, and dashed lines show circuits switched by a Lutron zone. Each circuit shows cable, protection, load bar and status.'],
   ['Plan the DALI lighting network', 'Open <b>Equipment</b> and scroll to the <b>DALI equipment library</b>: Lunatone, OSRAM and LTECH masters and gateways, bus power supplies, push-button couplers, relays and dimmers or drivers, both DIN-rail and remote types. Filter by brand, type or <b>DIN rail only</b>, set a quantity and press <b>Add</b>. Then open the <b>DALI</b> tab. DALI controller modules you place in the panel (Lutron, Crestron, MDT) are listed there automatically under <b>DALI controllers in this project</b>, each with its links, and you can connect drivers to the link you choose. Under <b>Quantities</b> you can search the model list by name, brand or article, and filter it by type. If a driver is not in the library, use <b>Custom DALI device</b> to type in its addresses, DALI current, mounting and other figures; custom devices can be edited or deleted there. Also under Quantities you can add models, change a quantity or remove a model. In <b>DALI modules</b> give each device a name or location, choose the <b>DALI link</b> (a line of a master) it connects to, or delete it. The tool hands out addresses on each line (up to 64) and checks bus current against the bus supply. DIN-rail DALI devices are also drawn on the <b>Panel</b> tab: click one to rename it, change its model or DALI link, move it along or between rails, drag it, or delete it, and use <b>+ DALI module</b> in Panel notes to add more. The <b>DALI network schematic</b> and the <b>DALI module layout</b> (a DIN-rail strip plus a separate area for remote drivers) are drawn below, separate from the panel schematic, and both are included in the PDF, with a DALI sheet in the Excel file and DALI items in the bill of materials.'],
   ['Use the Tools', 'Open <b>Tools</b> for quick electrician\'s calculators that work on their own, away from the board. Use <b>Ohm\'s law and power</b> to find voltage, current, resistance or power from any two values. <b>AC power and power factor</b> covers single and three phase loads, and <b>Power factor correction</b> sizes a capacitor bank. <b>Cable size</b> picks the smallest copper cable for a load, length and voltage-drop limit using the same tables as the circuits, and <b>Voltage drop</b> checks a cable you have chosen. <b>Resistor networks</b> solves series and parallel circuits with Kirchhoff\'s laws, and <b>Star and delta</b> converts line and phase values. Each result shows the formula and the numbers used.'],
   ['Export', 'Open <b>Export</b>. <b>Save PDF</b> produces the panel layout, the multi-line diagram, the circuit schedule and power totals; tick <b>Include bill of materials</b> if you want that list added. <b>Save Excel</b> and <b>Save CSV</b> give the schedule for other tools. <b>Save project</b> stores the whole design as a file you can reopen later with <b>Open project</b>. Boards created by <b>Import a panel</b> export exactly the same way.']
  ];
  const tips = [
   ['Your work is saved automatically', 'When you are signed in, a board you open from your Dashboard saves to your account about a second after each change, and the chip at the top shows Saved, Saving or Offline. You can open it on any device you sign in on. If the same board was changed on another device, you choose which version to keep. A board kept only in this browser is not touched by cloud boards. Use Save project to keep a file copy.'],
   ['Reading a panel photo or PDF', 'A photo is read on a best-effort basis. Take it straight on with the door open and no glare, switch the flash off if labels reflect it, and add close-ups of each row for large boards. PDFs with real text read best. Always check ratings, phases and labels against the real panel before you issue the result as as-built documentation. Each person can run a limited number of readings per day.'],
   ['Your account', 'Use the profile menu for Account settings: edit your details, change your password, download all your data, or delete your account. Use Feedback on the Dashboard to tell us what to improve.'],
   ['Install it like an app', 'In the installable version, use your browser\'s Install or Add to Home Screen option. It then opens full screen and works offline.'],
   ['DALI figures','Lunatone figures were read from its product pages. Where LTECH or OSRAM pages did not state DALI current or mounting, the library marks the item Assumed (2 mA per device). Neither brand has a DIN-rail DALI driver in the library; the LTECH bus supply and relay are DIN-rail. Check each item on the datasheet before ordering.'],
   ['Start fresh or reload the example', 'At the bottom of Setup, <b>Start an empty board</b> clears everything and <b>Reload the example board</b> brings back the sample cabin and AV panel.'],
   ['Low voltage boards', 'Choose Low voltage AC / DC as the supply type. Breaker ratings and cable sizes then use DC-rated series, and the panel draws positive and negative bars instead of phases.'],
   ['Troubleshooting and standards', 'In Tools, <b>Cable resistance</b> finds the resistance, length or size of a copper or aluminium cable, for example to estimate how far away a fault is. The <b>Standards reference</b> at the bottom lists voltage-drop limits, breaker ratings, RCD rules, wire colours and earthing for each standard. It is for reference only, so confirm it against the current edition.'],
   ['Always verify', 'Ratings, voltage-drop limits and manufacturer data are indicative. Check them against the current edition of your standard, the manufacturer\'s submittal and a qualified engineer before building.']
  ];
  const x = T;
  return `<div class="card help" data-nt><h2>${x('How DBoard Designer works')}</h2><p class="muted">${x('Follow these steps from the first screen to the finished PDF. You can jump to any step at any time; every tab updates the same board.')}</p>
  <ol class="hsteps">${steps.map(t => `<li><div><h3>${x(t[0])}</h3><p>${x(t[1])}</p></div></li>`).join('')}</ol>
  <h3 class="htip">${x('Good to know')}</h3><dl class="hfaq">${tips.map(t => `<dt>${x(t[0])}</dt><dd>${x(t[1])}</dd>`).join('')}</dl>
  <div class="row"><button class="btn pri" data-a="tab" data-t="setup">${x('Start with Setup')}</button></div></div>`;
}
function renderTabs(){ $('#tabs').innerHTML = TABS.map(t => `<button role="tab" data-a="tab" data-t="${t[0]}" aria-selected="${tab === t[0]}"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${TICON[t[0]]}</svg><span>${t[1]}</span></button>`).join('');
  const hb = $('#helpbtn'); if (hb) hb.setAttribute('aria-pressed', String(tab === 'help')); }
function labelTables(){
  document.querySelectorAll('table.stack').forEach(t => {
    if (!t.tHead) return;
    const hs = [...t.tHead.rows[0].cells].map(c => c.textContent.trim());
    [...t.tBodies[0].rows].forEach(r => [...r.cells].forEach((c, i) => c.setAttribute('data-label', hs[i] || '')));
  });
}
function draw(){
  const v = $('#view');
  v.innerHTML = ({setup: renderSetup, panel: renderPanel, circuits: renderCircuits, equipment: renderEquipment, checks: renderChecks, diagram: renderDiagram, dali: () => { try { return renderDali(); } catch (e) { return '<div class="card"><p class="muted">The DALI page could not be drawn for this board.</p></div>'; } }, tools: renderTools, export: renderExport, help: renderHelp})[tab]();
  if (tab === 'panel') bindPanel();
  if (tab === 'circuits') updateCircuitCells();
  labelTables();
  if (tab === 'circuits') quickCalc();
  if (tab === 'export'){ const f = $('#openfile'); if (f) f.onchange = e => e.target.files[0] && importJSON(e.target.files[0]); }
}
function refresh(full){ calc(); persist(); if (full || tab !== 'circuits') draw(); else updateCircuitCells(); renderTabs(); }
function qtyOf(x){ const e = typeof x === 'string' ? $(x) : x; const n = Math.floor(Number(e && e.value)); return Math.min(50, Math.max(1, isFinite(n) ? n : 1)); }
function nextId(list, p){ let n = list.length + 1; while (list.some(x => x.id === p + n)) n++; return p + n; }
function addCircuit(){
  const id = nextId(S.circuits, 'c'), n = S.circuits.length + 1, std = STD[S.std];
  S.circuits.push({id, ref:'C' + n, name:'New circuit', type:'sockets', mod:'', zone:1, P:1000, pf:.95, phase:'L1', len:10, prot:isLV(S) ? 'MCB' : 'RCBO', curve:std.curves[0], dem:1, grp:1, cable:'pvc', size:'auto', inO:0});
}
function autoBalance(){
  if (S.phases !== 3) return;
  calc();
  const load = {L1:0, L2:0, L3:0}; S.circuits.forEach(c => { if (!c.mod && R.c[c.id].thr) { load.L1 += R.c[c.id].Ib; load.L2 += R.c[c.id].Ib; load.L3 += R.c[c.id].Ib; } });
  const items = [];
  S.circuits.forEach(c => { if (!c.mod && !R.c[c.id].thr) items.push({o:c, I:R.c[c.id].Ib}); });
  S.modules.forEach(m => items.push({o:m, I:R.m[m.id].Ib}));
  items.sort((a, b) => b.I - a.I).forEach(it => { const p = ['L1', 'L2', 'L3'].sort((a, b) => load[a] - load[b])[0]; it.o.phase = p; load[p] += it.I; });
  toast('Phases rebalanced');
}
function applyField(el){
  const k = el.dataset.k, f = el.dataset.f; let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.t === 'n') v = v === '' ? '' : +v;
  let structural = false;
  if (k === 's'){
    if ((f === 'vdL' || f === 'vdO')) v = v === '' ? null : v;
    if (f.endsWith('Sel')) v = v === '' ? null : v;
    S[f] = v;
    if (['incomer', 'enclW'].includes(f) && v === '') S[f] = 0;
    structural = true;
  } else if (k === 'c'){
    const c = S.circuits.find(x => x.id === el.dataset.id); if (!c) return;
    if (f === 'fed'){ if (!v) c.mod = ''; else { const [m, z] = v.split('|'); c.mod = m; c.zone = +z; } structural = true; }
    else if (f === 'type'){ c.type = v; const t = TYPES[v]; c.pf = t.pf; c.prot = (t.rcd && !isLV(S)) ? 'RCBO' : 'MCB'; const cs = STD[S.std].curves; c.curve = cs.includes(t.curve) ? t.curve : cs[0]; structural = true; }
    else { c[f] = (f === 'size' && v !== 'auto') ? +v : v; if (['phase', 'prot'].includes(f)) structural = false; }
  } else if (k === 'x'){
    const x = (S.custom || []).find(q => q.id === el.dataset.id); if (!x) return; x[f] = v; structural = false;
  } else if (k === 'm'){
    const m = S.modules.find(x => x.id === el.dataset.id); if (!m) return; m[f] = v; structural = (f === 'model');
  }
  return structural;
}
function setPhases(n){
  const wasLV = isLV(S);
  let pick1;
  if (n === 'lv'){ if (wasLV) return; pick1 = SYSTEMS.find(x => x.id === 'dc24'); if (S.ik >= 6) S.ik = 5; }
  else {
    if (!wasLV && S.phases === n) return;
    const cur = wasLV ? {vLN: 230, f: 50} : sysOf(S);
    const base = SYSTEMS.filter(x => x.phases === n && !x.lv), same = base.filter(x => x.f === cur.f);
    pick1 = (same.length ? same : base).slice().sort((a, b) => Math.abs(a.vLN - cur.vLN) - Math.abs(b.vLN - cur.vLN))[0];
    if (wasLV && S.ik < 6) S.ik = 6;
  }
  S.sysId = pick1.id; S.phases = pick1.phases; S.vLN = pick1.vLN; S.f = pick1.f;
  if (n === 3){ S.circuits.forEach((c, i) => { if (!c.mod) c.phase = ['L1', 'L2', 'L3'][i % 3]; }); S.modules.forEach((m, i) => { m.phase = ['L1', 'L2', 'L3'][i % 3]; }); }
  syncHeader(); refresh(true);
  toast(n === 'lv' ? 'Low-voltage supply: 24 V DC. Loads are in watts, current is P ÷ V.' : n === 3 ? 'Three-phase supply. Circuits spread across L1, L2 and L3.' : 'Single-phase supply.');
}
function setSystem(id){ const s2 = SYSTEMS.find(x => x.id === id); if (!s2) return; S.sysId = s2.id; S.phases = s2.phases; S.vLN = s2.vLN; S.f = s2.f; syncHeader(); refresh(true); }
function loadLogo(file){
  if (!file) return;
  if (file.size > 4e6){ toast('Choose an image under 4 MB.'); return; }
  const fr = new FileReader();
  fr.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 480 / img.width, 192 / img.height, 1), w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
      const cv = document.createElement('canvas'); cv.width = w * 2 > 960 ? w : w; cv.height = h;
      const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0, w, h);
      try { S.logo = cv.toDataURL('image/png'); S.logoW = w; S.logoH = h; } catch (e) { toast('That image could not be read.'); return; }
      syncHeader(); refresh(true); toast('Logo added');
    };
    img.onerror = () => toast('That image could not be read.');
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}
function onField(e){
  const el = e.target.closest('[data-k]'); if (!el) return;
  if (e.type === 'input' && el.tagName === 'SELECT') return;
  const structural = applyField(el);
  if (e.type === 'input'){ calc(); persist(); if (tab === 'circuits') updateCircuitCells(); else if (tab === 'panel') softPanel(false); return; }
  if (tab === 'setup'){ calc(); persist(); return; }
  if (tab === 'panel'){ calc(); persist(); if (el.tagName === 'SELECT') softPanel(true); return; }
  refresh(structural || tab !== 'circuits');
}
document.addEventListener('input', e => { if (e.target.id && e.target.id.indexOf('qc') === 0){ quickCalc(); return; } if (e.target.id === 'brkq'){ brkQ = e.target.value; $('#brkbody').innerHTML = brkRows(); return; } if (e.target.id === 'libq'){ libQ = e.target.value; $('#libbody').innerHTML = libRows(); return; } if (e.target.closest('#view')) onField(e); });
document.addEventListener('change', e => {
  if (e.target.id === 'lang'){ setLang(e.target.value); return; }
  if (e.target.id === 'brkmfr'){ brkMfr = e.target.value; $('#brkbody').innerHTML = brkRows(); return; }
  if (e.target.id === 'brkkind'){ brkKind = e.target.value; $('#brkbody').innerHTML = brkRows(); return; }
  if (e.target.id === 'libbrand'){ libBrand = e.target.value; libFam = ''; draw(); return; }
  if (e.target.id === 'libfam'){ libFam = e.target.value; $('#libbody').innerHTML = libRows(); return; }
  if (e.target.id === 'std'){ S.std = e.target.value; const std = STD[S.std]; S.vdL = null; S.vdO = null; refresh(true); return; }
  if (e.target.id === 'sys'){ setSystem(e.target.value); return; }
  if (e.target.id === 'qcT'){ quickCalc(); return; }
  if (e.target.id === 'sys2'){ setSystem(e.target.value); return; }
  if (e.target.id === 'logofile'){ loadLogo(e.target.files[0]); e.target.value = ''; return; }
  if (e.target.id === 'pname'){ S.name = e.target.value; refresh(true); return; }
  if (e.target.closest('#view')) onField(e);
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a;
  if (a === 'tab'){ tab = b.dataset.t; draw(); renderTabs(); return; }
  if (a === 'addc'){ addCircuit(); if (tab === 'panel') sel = 'c:' + S.circuits[S.circuits.length - 1].id; refresh(true); }
  else if (a === 'zoomP'){ fitP = !fitP; softPanel(false); }
  else if (a === 'zoomD'){ fitD = !fitD; draw(); }
  else if (a === 'phase') setPhases(b.dataset.p === 'lv' ? 'lv' : +b.dataset.p);
  else if (a === 'nologo'){ S.logo = ''; S.logoW = S.logoH = 0; syncHeader(); refresh(true); }
  else if (a === 'desel'){ sel = null; delArm = null; refresh(true); }
  else if (a === 'delarm'){ delArm = sel; $('#insp').innerHTML = inspector(); }
  else if (a === 'delcancel'){ delArm = null; $('#insp').innerHTML = inspector(); }
  else if (a === 'del'){
    const d = B.devs.find(x => x.key === sel); delArm = null;
    if (d && d.key === 'inc'){ S.mainOff = true; toast('Main breaker removed from the panel'); }
    else if (d && d.key === 'spd'){ S.spd = false; toast('SPD removed'); }
    else if (d && d.cx){ S.custom = S.custom.filter(q => q.id !== d.cx); S.order = S.order.filter(k => k !== sel); toast(`Deleted ${d.cx}`); }
    else if (d && d.cid){ S.circuits = S.circuits.filter(c => c.id !== d.cid); S.order = S.order.filter(k => k !== sel); toast(`Deleted ${d.ref}`); }
    else if (d && d.dali){ ddel(d.dali); S.order = S.order.filter(k => k !== sel); toast(`Deleted ${d.dali}`); }
    else if (d && d.mod){ S.modules = S.modules.filter(m => m.id !== d.mod); S.circuits.forEach(c => { if (c.mod === d.mod) c.mod = ''; }); toast(`Deleted ${d.mod}`); }
    sel = null; refresh(true);
  }
  else if (a === 'mvrail') moveRail(+b.dataset.d);
  else if (a === 'addx'){ S.custom = S.custom || []; const q = qtyOf('#addqty'); let n, last; for (let i = 0; i < q; i++){ n = S.custom.length + 1; while (S.custom.some(z => z.id === 'X' + n)) n++; S.custom.push({id:'X' + n, name:'Custom device', note:'', w:2, rating:'', ph:'N', heatW:0}); last = 'X' + n; } sel = 'x:' + last; delArm = null; refresh(true); }
  else if (a === 'restmain'){ S.mainOff = false; refresh(true); }
  else if (a === 'restspd'){ S.spd = true; refresh(true); }
  else if (a === 'addm2'){ const lib = libOf($('#addmodel').value); const q = qtyOf('#addqty'); let id; for (let i = 0; i < q; i++){ id = nextId(S.modules, 'M'); S.modules.push({id, model: lib.model, phase:'L1', len:8, inSel:0, cable:'pvc', size:'auto'}); } sel = lib.din === 0 ? null : 'm:' + id; delArm = null; refresh(true); }
  else if (a === 'delc'){ S.circuits = S.circuits.filter(c => c.id !== b.dataset.id); refresh(true); }
  else if (a === 'bal'){ autoBalance(); refresh(true); }
  else if (a === 'renum'){ S.circuits.forEach((c, i) => c.ref = 'C' + (i + 1)); refresh(true); }
  else if (a === 'usebrk'){ const bk = brkOf(b.dataset.id); const f = bk.kind === 'mcb' ? 'mcbSel' : bk.kind === 'rcbo' ? 'rcboSel' : 'mainSel'; S[f] = bk.id; calc(); persist(); $('#brkbody').innerHTML = brkRows(); toast(`${bk.mfr} ${bk.series} applied to ${bk.kind === 'mcb' ? 'MCBs' : bk.kind === 'rcbo' ? 'RCBOs' : 'the main switch'}.`); }
  else if (a === 'addm'){ const lib = libOf(b.dataset.model); const qe = b.parentNode.querySelector('.qty'); const q = qtyOf(qe); let id; for (let i = 0; i < q; i++){ id = nextId(S.modules, 'M'); S.modules.push({id, model: lib.model, phase:'L1', len:8, inSel:0, cable:'pvc', size:'auto'}); } sel = 'm:' + id; calc(); persist(); toast(q > 1 ? `${q} × ${lib.model} added. See them on the Panel tab.` : `${lib.model} added as ${id}. See it on the Panel tab.`); draw(); renderTabs(); }
  else if (a === 'delm'){ const id = b.dataset.id; S.modules = S.modules.filter(m => m.id !== id); S.circuits.forEach(c => { if (c.mod === id) c.mod = ''; }); refresh(true); }
  else if (a === 'edit'){ tab = 'circuits'; refresh(true); const row = $(`[data-row="${b.dataset.id}"]`); if (row){ row.scrollIntoView({block: 'center'}); row.style.outline = '2px solid var(--accent)'; } }
  else if (a === 'mv'){ const i = S.order.indexOf(sel), j = i + (+b.dataset.d); if (i >= 0 && j >= 0 && j < S.order.length){ [S.order[i], S.order[j]] = [S.order[j], S.order[i]]; refresh(true); } }
  else if (a === 'reset'){ S = exampleProject(); sel = null; syncHeader(); refresh(true); }
  else if (a === 'clear'){ const e0 = exampleProject(); S = Object.assign(e0, {name: 'New board', circuits: [], modules: [], order: [], dali: {units: []}}); sel = null; syncHeader(); refresh(true); }
  else if (a === 'pdf') exportPDF(); else if (a === 'xlsx') exportXLSX(); else if (a === 'csv') exportCSV(); else if (a === 'json') exportJSON();
});
let rzT = null;
window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { const n = window.innerWidth < 700 ? 'p' : window.innerWidth < 1100 ? 't' : 'd'; if (n !== bp){ if (bp){ fitP = fitD = n !== 'p'; } bp = n; document.documentElement.dataset.bp = n; if (S) draw(); } }, 150); });
bp = window.innerWidth < 700 ? 'p' : window.innerWidth < 1100 ? 't' : 'd'; document.documentElement.dataset.bp = bp;
S = load(); syncHeader(); calc(); draw(); renderTabs();
initLang();
