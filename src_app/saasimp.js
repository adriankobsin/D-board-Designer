
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
    r = await fetch(saUrl('/api/import/analyze'), {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + SA.session.access_token}, body: JSON.stringify({files: I.files.map(f => ({mime: f.mime, data: f.data})), hints: {standard: I.std || undefined, notes: I.notes || undefined}})});
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
  if (!saFull()){ el.innerHTML = saFrame('import', `<h1 class="sa-h1">${saEsc(T('Import a panel'))}</h1><div class="sa-msg warn">${saEsc(T('Panel import is part of the full plan.'))}</div><p><button class="sa-btn pri" data-sa="upgrade" data-w="Panel import">${saEsc(T('Upgrade'))}</button></p>`); return; }
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
