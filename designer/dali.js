/* ========== DALI: catalogue, lines, network schematic and module layout ========== */
/* Record fields: b brand, m model, art article no., k kind, mt mounting, du DIN width in 17.5 mm units (0 when not on a rail),
   ch channels, ad DALI short addresses used, ma DALI bus current drawn (mA), ln lines (masters), sup bus supply per line (mA, 0 = needs an external supply),
   w power W, out output text, v 1 = key figures read from the manufacturer page, as = assumptions made where the page was silent. */
const DKIND = {master:'Master / gateway', psu:'Bus power supply', input:'Input / push-button coupler', relay:'Relay / switch', driver:'Driver / dimmer'};
const DMOUNT = {din:'DIN rail', box:'Back box', rem:'Remote (not DIN)', lum:'Own housing / in luminaire'};
const DPAL = ['#0B6B8E', '#C2571A', '#2F8F5B', '#8A4FBF', '#B8324F', '#8C7A12'];
const DALI_CAT = (() => {
  const out = [];
  const D = (b, m, k, mt, o) => out.push(Object.assign({b, m, art:'', k, mt, du:0, ch:0, ad:0, ma:2, ln:0, sup:0, w:0, out:'', note:'', src:'', v:0, as:''}, o));
  const LU = 'https://www.lunatone.com/en/product/', LS = a => 'https://www.lunatone.com/en/?s=' + a;
  const noMa = 'DALI current not stated; 2 mA assumed (typical for a DALI-2 device).';
  /* ---- Lunatone: masters and gateways ---- */
  D('Lunatone', 'DALI-2 IoT', 'master', 'din', {art:'89453886', du:1.5, ln:1, ad:0, ma:0, out:'1 line, Ethernet / Modbus TCP, 24-48 V DC', note:'DALI-LAN interface and central control module. Needs a separate bus power supply.', src:'https://www.lunatone.com/wp-content/uploads/2021/08/89453886_DALI2_IOT_EN_D0099.pdf', v:1});
  D('Lunatone', 'DALI-2 IoT4 Gateway', 'master', 'din', {art:'22176625', du:2, ln:4, ad:0, ma:0, out:'4 isolated lines, up to 256 devices, 24-48 V DC', note:'Four galvanically isolated lines. Each line needs its own bus power supply.', src:LS('22176625'), v:1});
  D('Lunatone', 'DALI-2 IoT4 Gateway PS', 'master', 'din', {art:'22176625-PS', du:2, ln:4, ad:0, ma:0, sup:120, out:'4 isolated lines, 120 mA bus supply per line', note:'Version with built-in bus power supply. The page also lists 250 mA as the maximum output; 120 mA per line is used here.', src:LS('22176625'), v:1});
  /* ---- Lunatone: bus power supplies ---- */
  D('Lunatone', 'DALI-2 PS', 'psu', 'din', {art:'24033444', du:1, ma:0, sup:200, w:5.3, out:'250 mA max, 200 mA guaranteed, 120/240 V AC in', note:'Single-line bus power supply. DIN width taken from the 17.5 mm housing.', src:LU + 'dali-ps-en/', v:1, as:'Width of 1 DU taken from the 17.5 mm housing.'});
  D('Lunatone', 'DALI-2 PS128', 'psu', 'rem', {art:'24033444-128', ma:0, sup:128, out:'150 mA max, 128 mA guaranteed', note:'Compact bus supply, 120 x 30 x 22 mm, for remote mounting.', src:LU + 'dali-ps128/', v:1});
  /* ---- Lunatone: inputs and relays ---- */
  D('Lunatone', 'DALI-2 MC4L DIN Rail', 'input', 'din', {art:'86458507-4L-HS-2', du:1, ch:4, ad:1, ma:3.5, out:'4 mains-voltage switch inputs', note:'Push-button coupler, 4 isolated mains inputs, powered from the DALI bus.', src:LU + 'dali-2-mc4l-din-rail/', v:1, as:'One short address assumed for the four inputs (they are instances of one device). Width of 1 DU from the 17.5 mm housing.'});
  D('Lunatone', 'DALI-2 RM25 HS', 'relay', 'din', {du:1, ch:1, ad:1, out:'1 NO contact, loads up to 4000 VA', note:'DIN rail relay module.', src:LS('RM25'), v:0, as:noMa + ' Width of 1 DU assumed.'});
  D('Lunatone', 'DALI-2 4xRM16 I HS', 'relay', 'din', {du:4, ch:4, ad:4, out:'4 relays, non-dimmable loads up to 3.6 kW (DT7)', note:'Four-channel relay module.', src:LS('4xRM16'), v:0, as:noMa + ' Width of 4 DU and four addresses assumed.'});
  /* ---- Lunatone: dimmers and drivers ---- */
  const cv = LU + 'dali-4ch-led-dimmer-cv/';
  D('Lunatone', 'DALI-2 4Ch LED Dimmer CV 16A DIN', 'driver', 'din', {art:'89453832-HS', du:1, ch:4, ad:4, out:'4 x PWM, 12-48 V DC, 16 A total', note:'DT6 with 4 addresses (2 in Colour&Dim mode). 98 x 17.5 x 56 mm.', src:cv, v:1, as:'Width of 1 DU from the 17.5 mm housing.'});
  D('Lunatone', 'DALI-2 4Ch LED Dimmer CV 8A', 'driver', 'box', {art:'89453835', ch:4, ad:4, out:'4 x PWM, 12-48 V DC, 8 A total', note:'Back-box version, 59 x 33 x 15 mm.', src:cv, v:1});
  D('Lunatone', 'DALI-2 4Ch LED Dimmer CV 10A', 'driver', 'rem', {art:'86459560', ch:4, ad:4, out:'4 x PWM, 12-48 V DC, 10 A total', note:'Remote / ceiling version, 120 x 30 x 22 mm.', src:cv, v:1});
  D('Lunatone', 'DALI-2 4Ch LED Dimmer CV 16A', 'driver', 'rem', {art:'89453832', ch:4, ad:4, out:'4 x PWM, 12-48 V DC, 16 A total', note:'Remote / ceiling version, 120 x 30 x 22 mm.', src:cv, v:1});
  const rg = LU + 'dali-rgbw-led-dimmer-cv-dt8/';
  D('Lunatone', 'DALI-2 RGBW LED Dimmer CV DT8 16A DIN', 'driver', 'din', {art:'89453843-HS', du:1, ch:4, ad:1, out:'RGBW, 4 x 16-bit PWM, 12-48 V DC, 16 A', note:'DT8: 1 address (2 in Colour&Dim mode).', src:rg, v:1, as:'Width of 1 DU from the 17.5 mm housing.'});
  D('Lunatone', 'DALI-2 RGBW LED Dimmer CV DT8 8A', 'driver', 'box', {art:'86458509', ch:4, ad:1, out:'RGBW, 12-48 V DC, 8 A', note:'Back-box version.', src:rg, v:1});
  D('Lunatone', 'DALI-2 RGBW LED Dimmer CV DT8 10A', 'driver', 'rem', {art:'89453840', ch:4, ad:1, out:'RGBW, 12-48 V DC, 10 A', note:'Remote / ceiling version.', src:rg, v:1});
  D('Lunatone', 'DALI-2 RGBW LED Dimmer CV DT8 16A', 'driver', 'rem', {art:'89453843', ch:4, ad:1, out:'RGBW, 12-48 V DC, 16 A', note:'Remote / ceiling version.', src:rg, v:1});
  D('Lunatone', 'DALI-2 4Ch PD', 'driver', 'din', {art:'86451975-HS', du:1, ch:4, ad:4, ma:4, w:40, out:'4 x 10 W phase-cut, 230 V AC', note:'Phase dimmer for small loads (DT4, DT7 switch mode). 1 DU, 98 x 18 x 56 mm.', src:'https://www.lunatone.com/wp-content/uploads/2024/01/86451975_DALI-2_4Ch_PD_EN_D0126.pdf', v:1});
  [['350', 'box', '350DE'], ['500', 'box', '500DE'], ['700', 'rem', '700GM'], ['1000', 'rem', '1000GM']].forEach(x => {
    D('Lunatone', `DALI-2 2Ch LED Dimmer CC ${x[0]} mA`, 'driver', x[1], {art:'89453845-' + x[0], ch:2, ad:2, out:`2 x ${x[0]} mA, 12-48 V DC in, 3-45 V out`, note:`Common-plus version. Common-minus article ${'89453845-' + x[2]} also exists. DT6, 2 addresses.`, src:LU + 'dali-2ch-led-dimmer-cc/', v:1});
  });
  [['250', '12-44 V'], ['350', '12-44 V'], ['500', '12-36 V'], ['700', '12-26 V'], ['1050', '12-17 V']].forEach(x => {
    D('Lunatone', `DALI-2 1Ch LED Power Supply ${x[0]} mA`, 'driver', 'rem', {art:'89453849-' + x[0], ch:1, ad:1, out:`${x[0]} mA, ${x[1]}, 220-240 V AC in`, note:'DT6 constant-current driver, 120 x 41 x 22 mm, remote ceiling mounting.', src:LU + 'dali-1ch-led-dimmer-cc/', v:1});
  });
  D('Lunatone', 'DALI-2 1Ch LED Power Supply 24 V CV', 'driver', 'rem', {art:'89453849-24V', ch:1, ad:1, out:'24 V CV, 1 A, 220-240 V AC in', note:'DT6 constant-voltage driver, remote ceiling mounting.', src:LU + 'dali-1ch-led-dimmer-cc/', v:1});
  /* ---- LTECH ---- */
  D('LTECH', 'DALI-PS-DIN', 'psu', 'din', {art:'2268600', du:2, ma:0, sup:220, w:3.3, out:'15 V DC, 220 mA, 100-240 V AC in', note:'DALI bus power supply, short-circuit protected. Housing 112 x 35 x 67 mm.', src:'https://www.ltech-led.eu/en-us/dali-other/1444-led-dali-psu-dinrail.html', v:1, as:'Width of 2 DU from the 35 mm housing. 220 mA is the maximum output; the guaranteed value is not stated.'});
  D('LTECH', 'DALI-2 Relay Unit', 'relay', 'din', {du:2, ch:1, ad:1, out:'LED switching, max 3.6 A per channel', note:'DALI-2 certified relay, listed with the DIN rail products.', src:'https://www.ltech-led.eu/shop/category/dali-31?search=din', v:0, as:noMa + ' Width of 2 DU assumed.'});
  const LT = 'http://www.ltechonline.com/html/en/products/DALI-Series/', ltAs = 'LTECH page does not state DALI current or mounting; 2 mA assumed and treated as a remote driver.';
  [['SE-8-100-450-G1D', 'DALI-2 DT6 CC driver, NFC', 1, '100-450 mA, 9-42 V', 8], ['SE-8-350-700-G1D', 'DALI-2 DT6 CC driver, NFC', 1, '350-700 mA, 2-12 V', 8],
   ['SE-10-350-700-W1DS', 'DALI DT6 CC driver, UL', 1, '350-700 mA, 2-12 V', 10], ['SE-10-500-1000-W1D', 'DALI CC driver, push dim', 1, '500-1000 mA, 9-42 V', 10],
   ['SE-12-100-400-W1DS', 'DALI DT6 CC driver, UL', 1, '100-400 mA, 9-42 V', 12], ['SE-12-100-450-W1D', 'DALI DT6 CC driver', 1, '100-450 mA, 9-42 V', 12],
   ['SE-12-100-500-W1D', 'DALI DT6 CC driver, NFC, UL', 1, '100-500 mA, 9-42 V', 12], ['SE-12-100-500-W2D', 'DALI DT6/DT8 CC driver, NFC, UL', 2, '2 x 100-500 mA, 9-42 V', 12],
   ['SE-12-350-700-W1DS', 'DALI DT6 CC driver', 1, '350-700 mA, 9-24 V', 12], ['SE-20-100-700-W1D', 'DALI DT6 CC driver, NFC, UL', 1, '100-700 mA, 9-42 V', 20],
   ['SE-20-100-700-W2D', 'DALI DT6/DT8 CC driver, NFC, UL', 2, '2 x 100-700 mA, 9-42 V', 20], ['SE-30-200-800-W1D', 'DALI DT6 CC driver, NFC, UL', 1, '200-800 mA, 9-42 V', 30],
   ['SE-30-200-800-W2D', 'DALI DT6/DT8 CC driver, NFC, UL', 2, '2 x 200-800 mA, 9-42 V', 30], ['SE-40-300-1050-W1D', 'DALI DT6 CC driver, NFC, UL', 1, '300-1050 mA, 9-42 V', 40],
   ['SE-40-300-1050-W2D', 'DALI DT6/DT8 CC driver, NFC, UL', 2, '2 x 300-1050 mA, 9-42 V', 40], ['LU-75-500-1750-U1D2', 'DALI-2 CC driver, push dim, UL', 1, '500-1750 mA, 10-54 V', 75],
   ['MT-100-250-D2D1', 'DALI-2 DT8 CC track driver, 48 V DC in', 2, '100-250 mA, 9-45 V', 11.5], ['MT-300-450-D2D1', 'DALI-2 DT8 CC track driver, 48 V DC in', 2, '300-450 mA, 9-42 V', 18.9],
   ['MT-500-650-D2D1', 'DALI-2 DT8 CC track driver, 48 V DC in', 2, '500-650 mA, 9-39 V', 23.35], ['LM-36-12-G1D2', 'DALI-2 CV driver, push dim', 1, '12 V CV', 36],
   ['LM-36-24-G1D2', 'DALI-2 CV driver, push dim', 1, '24 V CV', 36], ['LM-75-24-G1D2F', 'DALI-2 CV driver, NFC, push dim', 1, '24 V CV', 75],
   ['LM-75-24-G2D2F', 'DALI-2 DT6/DT8 CV driver, push dim', 2, '24 V CV', 75], ['LM-100-24-G1D2F', 'DALI-2 CV driver, NFC', 1, '24 V CV', 100],
   ['LM-100-24-G2D2F', 'DALI-2 DT6/DT8 CV driver, NFC', 2, '24 V CV', 100], ['SN-150-24-G2D', 'DALI-2 DT6/DT8 CV driver', 2, '24 V CV', 150], ['LM-150-12-G1D2F', 'DALI-2 CV driver, NFC', 1, '12 V CV', 150]
  ].forEach(x => D('LTECH', x[0], 'driver', 'rem', {ch:x[2], ad:x[2], w:x[4], out:x[3], note:x[1] + '. Mains driver, ' + (x[0][0] === 'M' ? '48 V DC in.' : '100-240 V AC in.'), src:LT, v:0, as:ltAs}));
  D('LTECH', 'LT-834', 'driver', 'rem', {ad:1, w:500, out:'DALI / DMX to TRIAC, 100-240 V AC, 500 W', note:'DALI to TRIAC converter with push dim.', src:LT, v:0, as:ltAs});
  /* ---- OSRAM: no DIN-rail DALI drivers were found; these are built-in / independent-housing drivers ---- */
  const OS = 'https://www.ledvance.com/en-int/professional-lighting/products/led-drivers/osram-led-drivers/constant-current-indoor-dimmable/constant-current-indoor-c201259', osAs = 'Power and current read from the model name; DALI current not stated, 2 mA assumed. Mounting assumed to be a luminaire or independent housing.';
  [['OTi DALI 50/220-240/24 4CH DT6/8 G3', 4, 50, '4 ch CV, 24.2 V', 'https://www.ledvance.com/00_Free_To_Use/asset-13095973_oti_dali50-220-240-244chdt6-8.pdf', 1], ['OTi DALI 80/220-240/24 4CH DT6/8 G3', 4, 80, '4 ch CV, 24.2 V', 'https://www.ledvance.com/00_Free_To_Use/asset-13095973_oti_dali50-220-240-244chdt6-8.pdf', 1],
   ['OT 110/170-240/1A04 DIMLT2 G2', 1, 110, '1A04 (see model name)', OS, 0], ['OT 165/170-240/1A0 4DIM NFC G3', 1, 165, '1.0 A (see model name)', OS, 0], ['OT 165/170-240/1A0 4DIMLT2 G2', 1, 165, '1.0 A (see model name)', OS, 0],
   ['OT 75/170-240/1A0 4DIM NFC G3', 1, 75, '1.0 A (see model name)', OS, 0], ['OT 75/170-240/1A0 4DIMLT2 G2', 1, 75, '1.0 A (see model name)', OS, 0], ['OT 40/120-277/1A0 4DIMLT2 E', 1, 40, '1.0 A (see model name)', OS, 0],
   ['OTi DALI 100/220-240/700 D NFC L', 1, 100, '700 mA', OS, 0], ['OTi DALI 100/220-240/750 D NFC L', 1, 100, '750 mA', OS, 0], ['OTi DALI 25/220-240/700 LT2', 1, 25, '700 mA', OS, 0], ['OTI DALI 25/220-240/700 NFC', 1, 25, '700 mA', OS, 0],
   ['OTI DALI 30/220-240/700 NFC I', 1, 30, '700 mA', OS, 0], ['OTi DALI 35/220-240/1A0 LT2', 1, 35, '1.0 A (see model name)', OS, 0], ['OTi DALI 35/220-240/1A0 NFC L', 1, 35, '1.0 A (see model name)', OS, 0]
  ].forEach(x => D('OSRAM', x[0], 'driver', 'rem', {ch:x[1], ad:x[1], w:x[2], out:x[3], note:'OPTOTRONIC DALI LED driver. No DIN-rail OSRAM DALI driver was found.', src:x[4], v:x[5], as:osAs}));
  return out;
})();
const dCat = m => DALI_CAT.find(x => x.m === m) || ((typeof S !== 'undefined' && S && S.dali && S.dali.custom) || []).find(x => x.m === m);
let dQ = '', dBrand = '', dKindF = '', dMountF = '';

/* ---------- state ---------- */
function dS(){ if (!S.dali || !Array.isArray(S.dali.units)) S.dali = {units: []}; if (!Array.isArray(S.dali.custom)) S.dali.custom = []; return S.dali; }
/* DALI controllers that sit in the main panel (Lutron, Crestron, MDT modules on the Panel tab) */
function dPanelCtl(lib){
  const m = lib.model, f = lib.fam || '';
  if (f === 'DALI'){ const ln = /(^|[^0-9])1DAL/.test(m) ? 1 : 2; return {ln, max:64, sup:250, as:'Bus current per link is not given in the data used. 250 mA (the DALI-2 maximum) is assumed. Confirm it in the controller datasheet.'}; }
  if (/DALI gateway/.test(f) && lib.brand === 'Crestron') return {ln:2, max:64, sup:250, as:'Internal DALI power assumed at 250 mA per loop. Confirm it in the datasheet.'};
  if (/DALI gateway/.test(f)){ const ln = /DABC4/.test(m) ? 4 : /DA642/.test(m) ? 2 : 1; return {ln, max: /DABC4/.test(m) ? 32 : 64, sup:0, as:'Bus supply not stated; add a DALI bus power supply to each line.'}; }
  return null;
}
function dControllers(){
  const out = [];
  S.modules.forEach(m => { const lib = libOf(m.model), pc = lib && dPanelCtl(lib); if (pc) out.push({u: m, panel: true, c: {m: m.model, b: lib.brand || '', art: '', k:'master', mt:'din', du: lib.din || 0, ln: pc.ln, sup: pc.sup, max: pc.max, as: pc.as, panel: true}}); });
  dS().units.forEach(u => { const c = dCat(u.model); if (c && c.k === 'master') out.push({u, panel: false, c: Object.assign({max: 64}, c)}); });
  return out;
}
function dLines(){
  const out = [];
  dControllers().forEach(k => { for (let n = 1; n <= k.c.ln; n++) out.push({id: k.u.id + ':' + n, u: k.u, c: k.c, n, max: k.c.max || 64, panel: k.panel, label: k.u.id + (k.panel ? ' link ' : ' line ') + n}); });
  return out;
}
function daliFix(){
  const ids = dLines().map(l => l.id), us = dS().units;
  S.dali.units = us.filter(u => dCat(u.model));
  S.dali.units.forEach(u => { if (u.link && !ids.includes(u.link)) u.link = ''; if (dCat(u.model).k === 'master') u.link = ''; u.label = u.label || ''; });
}
function dAnalyse(){
  const units = dS().units, lines = dLines(), by = {};
  lines.forEach((l, i) => { by[l.id] = Object.assign(l, {ci: i % DPAL.length, members: [], psus: [], addr: 0, mA: 0, sup: 0, supBy: '', assign: {}}); });
  units.forEach(u => { const c = dCat(u.model), l = c && by[u.link]; if (l && c.k !== 'master') (c.k === 'psu' ? l.psus : l.members).push(u); });
  lines.forEach(l => {
    let a = 0; l.members.forEach(u => { const c = dCat(u.model); l.assign[u.id] = c.ad ? [a, a + c.ad - 1] : null; a += c.ad; l.mA += c.ma; });
    l.addr = a;
    if (l.psus.length){ l.sup = Math.max(...l.psus.map(u => dCat(u.model).sup)); l.supBy = 'bus power supply'; }
    else if (l.c.sup){ l.sup = l.c.sup; l.supBy = 'master'; }
  });
  const free = units.filter(u => { const c = dCat(u.model); return c.k !== 'master' && !by[u.link]; });
  return {lines, by, free, units};
}
const dAddr = (l, u) => { const r = l && l.assign[u.id]; return r ? 'A' + String(r[0]).padStart(2, '0') + (r[1] > r[0] ? '-' + String(r[1]).padStart(2, '0') : '') : ''; };
function daliChecks(){
  const A = dAnalyse(), out = [], n = A.units.length;
  if (!n) return out;
  if (!A.lines.length) out.push({lvl:'warn', ref:'DALI', msg:'There is no DALI master or gateway, so no DALI line exists. Add one to connect the drivers.'});
  A.lines.forEach(l => {
    if (l.addr > l.max) out.push({lvl:'err', ref:l.label, msg:`${l.addr} DALI addresses are used. This line allows ${l.max}.`});
    if (!l.sup && (l.members.length || l.psus.length)) out.push({lvl:'warn', ref:l.label, msg:'No bus power supply is connected to this line. Link a DALI power supply to it.'});
    else if (l.sup && l.mA > l.sup) out.push({lvl:'err', ref:l.label, msg:`Devices draw ${+l.mA.toFixed(1)} mA but the ${l.supBy} guarantees ${l.sup} mA.`});
    else if (l.sup && l.mA > l.sup * 0.8) out.push({lvl:'warn', ref:l.label, msg:`Bus load is ${Math.round(l.mA / l.sup * 100)} % of the ${l.sup} mA supply. Keep some margin.`});
    if (l.psus.length > 1) out.push({lvl:'warn', ref:l.label, msg:`${l.psus.length} bus power supplies are linked. A DALI line normally has one; only the largest is counted.`});
    if (l.psus.length && l.c.sup) out.push({lvl:'info', ref:l.label, msg:'The master has a built-in bus supply, but a separate one is linked. Only the separate one is counted.'});
  });
  if (A.free.length) out.push({lvl:'warn', ref:'DALI', msg:`${A.free.length} DALI device${A.free.length > 1 ? 's are' : ' is'} not connected to a line: ${A.free.slice(0, 6).map(u => u.id).join(', ')}${A.free.length > 6 ? '...' : ''}.`});
  [...new Set(A.lines.filter(l => l.c.as && (l.members.length || l.psus.length)).map(l => l.u.id))].forEach(id => out.push({lvl:'info', ref:id, msg:A.lines.find(l => l.u.id === id).c.as}));
  const asu = [...new Set(A.units.filter(u => dCat(u.model).as).map(u => u.model))];
  if (asu.length) out.push({lvl:'info', ref:'DALI', msg:`${asu.length} DALI model${asu.length > 1 ? 's use' : ' uses'} assumed figures (shown as Assumed in the library). Confirm them on the datasheet.`});
  return out;
}
function dBom(){
  const m = {}; dS().units.forEach(u => { const c = dCat(u.model); if (c) m[u.model] = (m[u.model] || 0) + 1; });
  return Object.keys(m).map(k => { const c = dCat(k); return [`${c.b} ${c.m}${c.art ? ' (' + c.art + ')' : ''} - DALI ${DKIND[c.k].toLowerCase()}, ${DMOUNT[c.mt].toLowerCase()}`, m[k]]; });
}
function dadd(model, q, want){
  const c = dCat(model); if (!c) return;
  for (let i = 0; i < q; i++){
    const A = dAnalyse(), us = dS().units; let link = '';
    if (c.k !== 'master' && want && A.by[want]) link = want;
    else if (c.k !== 'master'){ const l = A.lines.find(x => c.k === 'psu' ? !x.psus.length && !x.c.sup : x.addr + c.ad <= x.max); link = l ? l.id : ''; }
    us.push({id: nextId(us, 'D'), model, label:'', link});
  }
}
function dsetQty(model, n){
  const us = dS().units, cur = us.filter(u => u.model === model);
  if (n > cur.length) dadd(model, n - cur.length);
  else for (let i = cur.length - 1; i >= n; i--) ddel(cur[i].id);
}
function ddel(id){ const us = dS().units; S.dali.units = us.filter(u => u.id !== id); S.dali.units.forEach(u => { if (u.link && u.link.split(':')[0] === id) u.link = ''; }); }

/* ---------- drawing primitives (shared by the screen and the PDF) ---------- */
const DCK = {ink:'var(--ink)', ink2:'var(--ink-2)', line:'var(--line)', surf:'var(--surface)', surf2:'var(--surface-2)', acc:'var(--accent)', accs:'var(--accent-soft)', bad:'var(--bad)', warn:'var(--warn)', ok:'var(--ok)', warnbg:'var(--warn-bg)', none:'none'};
const DCP = {ink:[21,32,42], ink2:[75,89,102], line:[201,210,218], surf:[250,251,252], surf2:[240,243,246], acc:[11,107,142], accs:[214,234,242], bad:[179,38,30], warn:[154,106,18], ok:[44,122,75], warnbg:[246,233,201], none:null};
const dRect = (x, y, w, h, f, s, o = {}) => Object.assign({t:'r', x, y, w, h, f, s, rx:3}, o);
const dLine = (x1, y1, x2, y2, s, o = {}) => Object.assign({t:'l', x1, y1, x2, y2, s, sw:1.5}, o);
const dText = (x, y, s, o = {}) => Object.assign({t:'t', x, y, s, z:11, c:'ink', a:'start'}, o);
const dClip = (t, n) => { t = String(t || ''); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const dCol = (k, p) => (p ? (k in DCP ? DCP[k] : hexRgb(k)) : (DCK[k] || k));
function hexRgb(h){ h = String(h || '#000').replace('#', ''); return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0]; }
function dSvg(items, W, H){
  const c = k => dCol(k, false);
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" style="display:block;max-width:none">${items.map(i => {
    if (i.t === 'r') return `<rect x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" rx="${i.rx}" fill="${c(i.f || 'none')}" stroke="${c(i.s || 'none')}" stroke-width="${i.sw || 1.2}" ${i.d ? 'stroke-dasharray="5 4"' : ''}/>`;
    if (i.t === 'l') return `<line x1="${i.x1}" y1="${i.y1}" x2="${i.x2}" y2="${i.y2}" stroke="${c(i.s)}" stroke-width="${i.sw}" ${i.d ? 'stroke-dasharray="5 4"' : ''} stroke-linecap="round"/>`;
    return `<text x="${i.x}" y="${i.y}" font-size="${i.z}" ${i.b ? 'font-weight="700"' : ''} text-anchor="${i.a}" fill="${c(i.c)}" ${i.rot ? `transform="rotate(${i.rot} ${i.x} ${i.y})"` : ''} style="font-family:var(--font-b,system-ui,sans-serif)">${esc(i.s)}</text>`;
  }).join('')}</svg>`;
}
const dShift = (items, dy) => items.map(i => i.t === 'l' ? Object.assign({}, i, {y1: i.y1 + dy, y2: i.y2 + dy}) : Object.assign({}, i, {y: i.y + dy}));

/* ---------- network schematic ---------- */
const DW = 1220, DX0 = 232, DPITCH = 130, DPER = 7, DBH = 66, DROW = 110;
function dBox(it, x, y, u, A, col, o = {}){
  const c = dCat(u.model), l = A.by[u.link], isP = c.k === 'psu', din = c.mt === 'din';
  it.push(dRect(x, y, 118, DBH, isP ? 'accs' : 'surf2', o.warn ? 'warn' : col, {d: !din, sw: din ? 1.8 : 1.4}));
  it.push(dRect(x, y, 5, DBH, col, 'none', {rx:2}));
  it.push(dText(x + 10, y + 15, u.id, {b:1, z:11}));
  const ad = isP ? '' : dAddr(l, u); if (ad) it.push(dText(x + 112, y + 15, ad, {a:'end', z:10, c:'acc', b:1}));
  it.push(dText(x + 10, y + 29, dClip(c.m.replace('DALI-2 ', '').replace('LED ', ''), 20), {z:10}));
  it.push(dText(x + 10, y + 42, isP ? `Bus supply ${c.sup} mA` : `${din ? 'DIN ' + c.du + ' DU' : DMOUNT[c.mt].split(' (')[0]}${c.ma ? ' · ' + c.ma + ' mA' : ''}`, {z:9, c:'ink2'}));
  it.push(dText(x + 10, y + 56, dClip(u.label || c.b, 22), {z:9, c:'ink2'}));
}
function dNet(){
  const A = dAnalyse(), secs = [], masters = dControllers();
  masters.forEach(({u: mu, c: mc}) => {
    const info = A.lines.filter(l => l.u === mu).map(l => { const items = l.psus.concat(l.members); const rows = Math.max(1, Math.ceil(items.length / DPER)); return {l, items, rows, h: 34 + rows * DROW}; });
    const H = info.reduce((a, i) => a + i.h, 0) + 6, it = [];
    it.push(dRect(16, 3, 190, H - 6, 'surf2', 'ink', {sw:1.8}));
    it.push(dText(28, 24, mu.id, {b:1, z:13})); it.push(dText(28, 41, dClip(mc.m, 24), {z:11, b:1}));
    it.push(dText(28, 56, mc.panel ? `${mc.b} · in the main panel` : `${mc.b} ${mc.art}`, {z:9, c:'ink2'})); it.push(dText(28, 70, `${mc.ln} ${mc.panel ? 'link' : 'line'}${mc.ln > 1 ? 's' : ''}${mc.panel ? '' : ' · DIN ' + mc.du + ' DU'}`, {z:9, c:'ink2'}));
    it.push(dText(28, 84, mc.sup ? `${mc.as && mc.panel ? 'Assumed supply' : 'Built-in supply'} ${mc.sup} mA / ${mc.panel ? 'link' : 'line'}` : 'Needs bus power supply', {z:9, c:'ink2'}));
    if (mu.label) it.push(dText(28, 98, dClip(mu.label, 26), {z:9, c:'ink2'}));
    let y0 = 3;
    info.forEach(({l, items, rows, h}) => {
      const col = DPAL[l.ci], over = l.addr > l.max || (l.sup && l.mA > l.sup) || (!l.sup && items.length);
      const rng = l.members.length ? `A00-${String(Math.max(0, l.addr - 1)).padStart(2, '0')}` : 'no devices';
      it.push(dRect(DX0, y0 + 6, 12, 12, col, 'none', {rx:2}));
      it.push(dText(DX0 + 20, y0 + 16, `${l.panel ? 'Link' : 'Line'} ${l.n} · ${rng} · ${l.addr}/${l.max} addresses · ${+l.mA.toFixed(1)}/${l.sup || '?'} mA${l.sup ? ' (' + l.supBy + ')' : ' · no bus supply'}`, {z:11, b:1, c: over ? 'bad' : 'ink'}));
      const by0 = y0 + 40;
      it.push(dLine(206, by0, 222, by0, col, {sw:3}));
      if (rows > 1) it.push(dLine(222, by0, 222, by0 + (rows - 1) * DROW, col, {sw:3}));
      for (let r = 0; r < rows; r++){
        const by = by0 + r * DROW, row = items.slice(r * DPER, r * DPER + DPER), n = Math.max(1, row.length);
        if (r) it.push(dLine(222, by, DX0, by, col, {sw:3}));
        it.push(dLine(DX0, by, DX0 + n * DPITCH - 8, by, col, {sw:3}));
        it.push(dText(DX0 + n * DPITCH - 4, by - 5, 'DA+ / DA-', {z:8, c:'ink2', a:'end'}));
        row.forEach((u, i) => { const x = DX0 + i * DPITCH; it.push(dLine(x + 59, by, x + 59, by + 14, col, {sw:2})); dBox(it, x, by + 14, u, A, col); });
        if (!row.length) it.push(dText(DX0 + 6, by + 30, 'Nothing connected to this line yet.', {z:10, c:'ink2'}));
      }
      y0 += h;
    });
    secs.push({h: H, items: it});
  });
  if (A.free.length){
    const rows = Math.ceil(A.free.length / DPER), it = [];
    it.push(dText(16, 20, `Not connected to a DALI line (${A.free.length})`, {b:1, z:12, c:'warn'}));
    A.free.forEach((u, i) => dBox(it, 16 + (i % DPER) * DPITCH, 32 + Math.floor(i / DPER) * 82, u, A, 'warn', {warn:1}));
    secs.push({h: 38 + rows * 82, items: it});
  }
  return secs;
}

/* ---------- module layout: DIN rail strip and remote area ---------- */
const DU = 44, DRH = 150;
function dLay(){
  const A = dAnalyse(), secs = [], cols = Math.max(12, Math.min(48, +S.cols || 24)), din = [], rem = [];
  const place = (u, bands) => { const c = dCat(u.model); (c.mt === 'din' ? din : rem).push({u, c, bands}); };
  const panelCtl = [];
  dControllers().forEach(k => {
    const ls = A.lines.filter(l => l.u === k.u);
    if (k.panel) panelCtl.push({k, ls}); else place(k.u, ls.map(l => DPAL[l.ci]));
    ls.forEach(l => l.psus.concat(l.members).forEach(u => place(u, [DPAL[l.ci]])));
  });
  A.free.forEach(u => place(u, ['#8A929B']));
  /* wrap the DIN strip into rail rows */
  const railRows = []; let cur = [], used = 0;
  din.forEach(d => { if (used + d.c.du > cols && cur.length){ railRows.push(cur); cur = []; used = 0; } cur.push(d); used += d.c.du; });
  if (cur.length) railRows.push(cur);
  railRows.forEach((row, ri) => {
    const it = [], n = row.reduce((a, d) => a + d.c.du, 0), RW = cols * DU, x0 = 40;
    it.push(dText(x0 - 24, 18, `DALI rail ${ri + 1} · ${n} of ${cols} DU used`, {b:1, z:12}));
    it.push(dRect(x0 - 24, 28, RW + 48, DRH + 66, 'surf', 'line', {sw:1.4}));
    it.push(dRect(x0 - 12, 28 + 64, RW + 24, 14, 'line', 'none', {rx:2})); it.push(dRect(x0 - 12, 28 + 69, RW + 24, 3, 'surf2', 'none', {rx:1}));
    let x = x0;
    row.forEach(d => {
      const w = d.c.du * DU - 3, y = 36, k = d.c.k, lab = A.by[d.u.link];
      it.push(dRect(x, y, w, DRH, 'surf2', 'ink', {sw:1.4, rx:3}));
      const bw = w / d.bands.length; d.bands.forEach((b, i) => it.push(dRect(x + i * bw, y, bw, 9, b, 'none', {rx:2})));
      it.push(dText(x + w / 2, y + 26, d.u.id, {b:1, z:12, a:'middle'}));
      const ad = k === 'master' || k === 'psu' ? '' : dAddr(lab, d.u); if (ad) it.push(dText(x + w / 2, y + 40, ad, {z:8, c:'acc', b:1, a:'middle'}));
      it.push(dText(x + w / 2 + 4, y + DRH - 8, dClip(d.c.m.replace('DALI-2 ', '').replace('LED ', ''), 16), {z:10, rot:-90, c:'ink'}));
      it.push(dText(x + w / 2, y + DRH + 14, k === 'master' ? `${d.c.ln} line${d.c.ln > 1 ? 's' : ''}` : k === 'psu' ? `${d.c.sup} mA` : (lab ? 'L' + lab.n : '-'), {z:9, c:'ink2', a:'middle'}));
      it.push(dText(x + w / 2, y + DRH + 27, dClip(d.u.label, Math.max(4, Math.floor(w / 6))), {z:9, c:'ink2', a:'middle'}));
      x += d.c.du * DU;
    });
    secs.push({h: DRH + 94, items: it});
  });
  if (panelCtl.length){
    const it = [], h = 30 + panelCtl.reduce((n, p) => n + p.ls.length, 0) * 18;
    it.push(dText(16, 18, 'DALI controllers in the main panel (drawn on the Panel tab)', {b:1, z:12}));
    let y = 38; panelCtl.forEach(p => p.ls.forEach(l => { it.push(dRect(16, y - 10, 12, 12, DPAL[l.ci], 'none', {rx:2})); it.push(dText(36, y, `${p.k.u.id} ${p.k.c.m} · link ${l.n} · ${l.members.length} device${l.members.length === 1 ? '' : 's'} · ${l.addr}/${l.max} addresses`, {z:11})); y += 18; }));
    secs.unshift({h, items: it});
  }
  if (rem.length){
    const it = [], CW = 230, per = 5;
    it.push(dText(16, 18, `Remote drivers and devices (${rem.length}), not on the rail`, {b:1, z:12}));
    rem.forEach((d, i) => {
      const x = 16 + (i % per) * (CW + 10), y = 30 + Math.floor(i / per) * 84, lab = A.by[d.u.link], ad = d.c.k === 'psu' ? '' : dAddr(lab, d.u);
      it.push(dRect(x, y, CW, 76, 'surf2', 'line', {d:1, sw:1.3}));
      it.push(dRect(x, y, 6, 76, d.bands[0], 'none', {rx:2}));
      it.push(dText(x + 14, y + 17, d.u.id, {b:1, z:12})); if (ad) it.push(dText(x + CW - 8, y + 17, ad, {a:'end', z:10, b:1, c:'acc'}));
      it.push(dText(x + 14, y + 32, dClip(d.c.m, 34), {z:10}));
      it.push(dText(x + 14, y + 46, `${DMOUNT[d.c.mt]}${d.c.ma ? ' · ' + d.c.ma + ' mA' : ''}`, {z:9, c:'ink2'}));
      it.push(dText(x + 14, y + 60, `${lab ? lab.label : 'Not connected'}${d.u.label ? ' · ' + dClip(d.u.label, 22) : ''}`, {z:9, c: lab ? 'ink2' : 'warn'}));
    });
    secs.push({h: 38 + Math.ceil(rem.length / per) * 84, items: it});
  }
  return {secs, cols, dinCount: din.length, remCount: rem.length, dinDU: din.reduce((a, d) => a + d.c.du, 0)};
}
const dStack = secs => { let y = 0; const out = []; secs.forEach(s => { out.push(...dShift(s.items, y)); y += s.h + 8; }); return {items: out, H: y}; };

/* ---------- PDF ---------- */
function dPdf(doc, logo, PW, ML){
  if (!dS().units.length) return;
  const asc = s => String(s).replace(/²/g, '2').replace(/×/g, 'x').replace(/[·–]/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7e]/g, '');
  const draw = (secs, title, sub) => {
    const k = (PW - 2 * ML) / DW; let y = 24, first = true;
    const head = () => { doc.addPage(); logo(); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(40); doc.text(asc(title), ML, 14); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90); doc.text(asc(sub), ML, 19); y = 24; };
    secs.forEach(s => {
      const h = s.h * k;
      if (first || y + h > 200){ head(); first = false; }
      s.items.forEach(i => {
        const X = v => ML + v * k, Y = v => y + v * k;
        if (i.t === 'r'){
          const f = dCol(i.f || 'none', true), st = dCol(i.s || 'none', true);
          if (f) doc.setFillColor(...f); if (st){ doc.setDrawColor(...st); doc.setLineWidth(Math.max(0.15, (i.sw || 1) * k * 0.7)); }
          doc.setLineDashPattern(i.d ? [1.2, 1] : [], 0);
          doc.roundedRect(X(i.x), Y(i.y), i.w * k, i.h * k, i.rx * k, i.rx * k, f && st ? 'FD' : f ? 'F' : 'S'); doc.setLineDashPattern([], 0);
        } else if (i.t === 'l'){ doc.setDrawColor(...dCol(i.s, true)); doc.setLineWidth(Math.max(0.15, i.sw * k * 0.7)); doc.line(X(i.x1), Y(i.y1), X(i.x2), Y(i.y2)); }
        else { doc.setTextColor(...dCol(i.c, true)); doc.setFont('helvetica', i.b ? 'bold' : 'normal'); doc.setFontSize(Math.max(3.5, i.z * k * 2.55)); const o = {align: i.a === 'middle' ? 'center' : i.a === 'end' ? 'right' : 'left'}; if (i.rot) o.angle = 90; doc.text(asc(i.s), X(i.x), Y(i.y), o); }
      });
      y += h + 3;
    });
    doc.setTextColor(0);
  };
  const A = dAnalyse(), sub = `${A.lines.length} DALI line${A.lines.length === 1 ? '' : 's'} · ${A.units.length} device${A.units.length === 1 ? '' : 's'} · figures are catalogue values, confirm on the datasheet`;
  const net = dNet(); if (net.length) draw(net, 'DALI network schematic', sub);
  const lay = dLay(); if (lay.secs.length) draw(lay.secs, 'DALI module layout', `${lay.dinCount} on the DIN rail (${lay.dinDU} DU), ${lay.remCount} remote`);
}

/* ---------- Equipment tab: library ---------- */
function dRows(){
  const q = dQ.trim().toLowerCase();
  return DALI_CAT.filter(c => (!dBrand || c.b === dBrand) && (!dKindF || c.k === dKindF) && (!dMountF || (dMountF === 'din' ? c.mt === 'din' : c.mt !== 'din')) && (!q || (c.m + ' ' + c.b + ' ' + c.art + ' ' + c.out + ' ' + c.note + ' ' + DKIND[c.k]).toLowerCase().includes(q))).map(c => `<tr>
   <td class="mono"><b>${esc(c.m)}</b>${c.art ? `<div class="note">${esc(c.art)}</div>` : ''}</td><td>${c.b}</td><td>${DKIND[c.k]}</td><td>${DMOUNT[c.mt]}</td>
   <td class="mono" style="text-align:right">${c.du || '–'}</td><td class="mono" style="text-align:right">${c.k === 'master' ? c.ln + ' lines' : c.ch || '–'}</td><td class="mono" style="text-align:right">${c.k === 'psu' ? c.sup + ' mA' : c.k === 'master' ? (c.sup ? c.sup + ' mA/line' : 'external') : c.ad}</td><td class="mono" style="text-align:right">${c.k === 'psu' || c.k === 'master' ? '–' : c.ma}</td>
   <td class="note">${esc(c.out || '–')}</td>
   <td style="min-width:240px" class="note"><span data-nt>${esc(c.note)}</span> <span class="tag ${c.as ? 'warn' : 'ok'}">${c.as ? 'Assumed' : 'Source checked'}</span>${c.as ? `<div class="note" title="${esc(c.as)}">${esc(c.as)}</div>` : ''} <a href="${c.src}" target="_blank" rel="noopener">source</a></td>
   <td><input type="number" class="qty" value="1" min="1" max="50" step="1" aria-label="Quantity" title="Quantity" inputmode="numeric"><button class="btn sm pri" data-a="dadd" data-model="${esc(c.m)}">Add</button></td></tr>`).join('') || '<tr><td colspan="11" class="muted" style="padding:16px">No DALI equipment matches.</td></tr>';
}
function daliLibCard(){
  const brands = [...new Set(DALI_CAT.map(c => c.b))];
  return `<div class="card"><div class="row" style="justify-content:space-between"><h2>DALI equipment library</h2><div class="row"><input type="text" id="dq" placeholder="Search model, article, type" value="${esc(dQ)}" style="min-width:200px" aria-label="Search DALI equipment"><select id="dbrand" aria-label="DALI brand"><option value="">All brands</option>${brands.map(b => `<option ${dBrand === b ? 'selected' : ''}>${b}</option>`).join('')}</select><select id="dkind" aria-label="DALI type"><option value="">All types</option>${Object.keys(DKIND).map(k => `<option value="${k}" ${dKindF === k ? 'selected' : ''}>${DKIND[k]}</option>`).join('')}</select><select id="dmount" aria-label="Mounting"><option value="">DIN and remote</option><option value="din" ${dMountF === 'din' ? 'selected' : ''}>DIN rail only</option><option value="rem" ${dMountF === 'rem' ? 'selected' : ''}>Remote only</option></select></div></div>
  <p class="note" style="margin:6px 0 10px">${DALI_CAT.length} DALI products from Lunatone, OSRAM and LTECH, both DIN-rail and remote drivers. Pressing Add puts the quantity you choose on the <b>DALI</b> tab, where you pick the DALI line each one connects to and see the network schematic and the module layout. Lunatone figures were read from its product pages. LTECH and OSRAM pages did not give DALI current or mounting, so those are marked Assumed. OSRAM and LTECH DALI drivers are not DIN-rail types; only the LTECH bus supply and relay are. Lunatone has more variants than listed. Confirm everything on the datasheet before ordering.</p>
  <div class="scroll" style="max-height:520px;overflow-y:auto"><table style="min-width:1180px"><thead><tr><th>Model</th><th>Brand</th><th>Type</th><th>Mounting</th><th>DIN DU</th><th>Channels</th><th>Addresses</th><th>DALI mA</th><th>Output</th><th>Notes</th><th></th></tr></thead><tbody id="dbody">${dRows()}</tbody></table></div></div>`;
}

/* ---------- DALI tab ---------- */
function dLinkSelect(u, A){
  const c = dCat(u.model); if (c.k === 'master') return '<span class="muted">is a master</span>';
  return `<select data-dk="link" data-id="${u.id}" aria-label="DALI link for ${u.id}"><option value="">${A.lines.length ? 'Not connected' : 'No controller yet'}</option>${dLineOpts(A, u.link)}</select>`;
}
function dLineOpts(A, cur){
  const groups = []; A.lines.forEach(l => { let g = groups.find(x => x.u === l.u); if (!g) groups.push(g = {u: l.u, c: l.c, ls: []}); g.ls.push(l); });
  return groups.map(g => `<optgroup label="${esc(g.u.id + ' · ' + g.c.m + (g.c.panel ? ' (in panel)' : ''))}">${g.ls.map(l => `<option value="${l.id}" ${cur === l.id ? 'selected' : ''}>${l.panel ? 'Link' : 'Line'} ${l.n} · ${l.addr}/${l.max} addr · ${+l.mA.toFixed(1)}/${l.sup || '?'} mA</option>`).join('')}</optgroup>`).join('');
}
function dCtlCard(A){
  const cs = dControllers();
  if (!cs.length) return '<div class="card"><h3>DALI controllers in this project</h3><p class="muted" style="margin-top:8px">No DALI controller yet. Add a DALI module from the Equipment tab (Lutron, Crestron or MDT, shown on the Panel tab) or a DALI master or gateway below, then connect drivers to its links.</p></div>';
  return `<div class="card"><h3>DALI controllers in this project</h3><div class="scroll"><table style="min-width:640px"><thead><tr><th>Controller</th><th>Where</th><th>Link</th><th>Devices</th><th>Addresses</th><th>Bus load</th></tr></thead><tbody>${cs.map(k => A.lines.filter(l => l.u === k.u).map((l, i) => `<tr>${i ? '<td></td><td></td>' : `<td class="mono"><b>${k.u.id}</b> ${esc(k.c.m)}<div class="note">${esc(k.c.b)}</div></td><td>${k.panel ? 'Main panel (Panel tab)' : 'DALI tab'}</td>`}<td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${DPAL[l.ci]};margin-right:6px"></span>${l.panel ? 'Link' : 'Line'} ${l.n}</td><td class="mono">${l.members.length}</td><td class="mono">${l.addr}/${l.max}</td><td class="mono">${+l.mA.toFixed(1)}/${l.sup || '?'} mA</td></tr>`).join('')).join('')}</tbody></table></div></div>`;
}
let dpQ = '', dpKind = '';
const dAllCat = () => DALI_CAT.concat(dS().custom);
function dPickList(){
  const q = dpQ.trim().toLowerCase();
  return dAllCat().filter(c => (!dpKind || c.k === dpKind) && (!q || (c.m + ' ' + c.b + ' ' + c.art + ' ' + c.out + ' ' + DKIND[c.k]).toLowerCase().includes(q)));
}
function dPickOpts(keep){
  const list = dPickList(), brands = [...new Set(list.map(c => c.b))];
  return list.length ? brands.map(b => `<optgroup label="${esc(b)}">${list.filter(c => c.b === b).map(c => `<option value="${esc(c.m)}" ${c.m === keep ? 'selected' : ''}>${esc(c.m)} · ${c.mt === 'din' ? 'DIN' : 'remote'}</option>`).join('')}</optgroup>`).join('') : '<option value="">No match</option>';
}
function dPicker(){
  return `<input type="search" id="dsearch" placeholder="Search driver, brand, article" value="${esc(dpQ)}" style="min-width:210px" aria-label="Search DALI devices"><select id="dfkind" aria-label="Filter by type"><option value="">All types</option>${Object.keys(DKIND).map(k => `<option value="${k}" ${dpKind === k ? 'selected' : ''}>${DKIND[k]}</option>`).join('')}</select><select id="daddmodel" aria-label="DALI model">${dPickOpts('')}</select><span class="note" id="dcount">${dPickList().length} match${dPickList().length === 1 ? '' : 'es'}</span>`;
}
const dNum = (v, lo, hi, d) => { v = parseFloat(v); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
function dFixCustom(c){
  c.k = DKIND[c.k] ? c.k : 'driver'; c.mt = DMOUNT[c.mt] ? c.mt : 'rem';
  c.du = c.mt === 'din' ? dNum(c.du, 0.5, 12, 1) : 0; c.ch = Math.round(dNum(c.ch, 0, 16, 0));
  const dev = c.k !== 'master' && c.k !== 'psu';
  c.ad = dev ? Math.round(dNum(c.ad, 0, 64, 1)) : 0; c.ma = dev ? dNum(c.ma, 0, 250, 2) : 0;
  c.ln = c.k === 'master' ? Math.round(dNum(c.ln, 1, 4, 1)) : 0; c.sup = c.k === 'master' || c.k === 'psu' ? dNum(c.sup, 0, 500, 0) : 0;
  c.w = dNum(c.w, 0, 100000, 0); c.b = 'Custom'; c.custom = 1; c.art = c.art || ''; c.src = ''; c.as = ''; return c;
}
function dCustomAdd(f){
  const name = String(f.name || '').trim().slice(0, 40); if (!name){ toast('Give the custom device a name.'); return false; }
  const cust = dS().custom; let m = name; if (DALI_CAT.some(x => x.m === m) || cust.some(x => x.m === m)) m = name + ' (custom)'; let n = 2; while (DALI_CAT.some(x => x.m === m) || cust.some(x => x.m === m)) m = name + ' (custom ' + n++ + ')';
  cust.push(dFixCustom({m, k: f.k, mt: f.mt, du: f.du, ch: f.ch, ad: f.ad, ma: f.ma, ln: f.ln, sup: f.sup, w: f.w, out: f.out || '', note: 'Custom device entered by hand.'}));
  return m;
}
function dCustomCard(){
  const cu = dS().custom, us = dS().units, sel = (o, v) => Object.keys(o).map(k => `<option value="${k}" ${v === k ? 'selected' : ''}>${o[k]}</option>`).join('');
  const f = (id, label, inp) => `<label class="fld"><span>${label}</span>${inp}</label>`, n = (id, v, extra = '') => `<input type="number" id="${id}" value="${v}" ${extra}>`;
  return `<div class="card"><h3>Custom DALI device</h3>
   <p class="note" style="margin:6px 0 10px;max-width:80ch">Add a driver, supply, controller or input that is not in the library and type in its figures. It then appears in the model list above and can be connected to a link like any other device.</p>
   <div class="grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">
   ${f('', 'Name', '<input type="text" id="cname" placeholder="e.g. Tridonic 75 W CC" maxlength="40">')}${f('', 'Type', `<select id="ckind">${sel(DKIND, 'driver')}</select>`)}${f('', 'Mounting', `<select id="cmount">${sel(DMOUNT, 'rem')}</select>`)}
   ${f('', 'DIN width, DU (17.5 mm)', n('cdu', 1, 'min="0.5" max="12" step="0.5"'))}${f('', 'DALI addresses used', n('cad', 1, 'min="0" max="64" step="1"'))}${f('', 'DALI current, mA', n('cma', 2, 'min="0" max="250" step="0.5"'))}
   ${f('', 'Channels', n('cch', 1, 'min="0" max="16" step="1"'))}${f('', 'Lines (controller)', n('cln', 1, 'min="1" max="4" step="1"'))}${f('', 'Bus supply mA (supply or controller)', n('csup', 0, 'min="0" max="500" step="10"'))}
   ${f('', 'Power, W', n('cw', 0, 'min="0" step="1"'))}${f('', 'Output / notes', '<input type="text" id="cout" placeholder="e.g. 700 mA, 2-42 V" maxlength="60">')}${f('', 'Quantity', n('ccqty', 1, 'min="1" max="50" step="1"'))}</div>
   <div class="row" style="margin-top:12px"><button class="btn pri" data-a="dcust">Create and add</button><span class="note">Address and mA apply to drivers and inputs. Lines and bus supply apply to controllers and supplies. DIN width applies when the mounting is DIN rail.</span></div>
   ${cu.length ? `<h3 style="margin-top:18px">Your custom devices</h3><div class="scroll"><table style="min-width:1000px"><thead><tr><th>Name</th><th>Type</th><th>Mounting</th><th>DU</th><th>Addr.</th><th>mA</th><th>Ch.</th><th>Lines</th><th>Supply mA</th><th>W</th><th>Output</th><th>In use</th><th></th></tr></thead><tbody>${cu.map(c => { const q = (k, v, w, ex = '') => `<td style="width:${w}px"><input type="number" data-ck="${k}" data-model="${esc(c.m)}" value="${v}" ${ex} aria-label="${k} of ${esc(c.m)}"></td>`; return `<tr><td><input type="text" data-ck="m" data-model="${esc(c.m)}" value="${esc(c.m)}" maxlength="40" aria-label="Name"></td><td><select data-ck="k" data-model="${esc(c.m)}">${sel(DKIND, c.k)}</select></td><td><select data-ck="mt" data-model="${esc(c.m)}">${sel(DMOUNT, c.mt)}</select></td>${q('du', c.du, 70, 'step="0.5"')}${q('ad', c.ad, 66)}${q('ma', c.ma, 70, 'step="0.5"')}${q('ch', c.ch, 60)}${q('ln', c.ln, 60)}${q('sup', c.sup, 80, 'step="10"')}${q('w', c.w, 70)}<td><input type="text" data-ck="out" data-model="${esc(c.m)}" value="${esc(c.out)}" maxlength="60"></td><td class="mono">${us.filter(u => u.model === c.m).length}</td><td><button class="btn sm" data-a="dcustdel" data-model="${esc(c.m)}" aria-label="Delete ${esc(c.m)}">✕</button></td></tr>`; }).join('')}</tbody></table></div>` : ''}</div>`;
}
function renderDali(){
  const A = dAnalyse(), us = A.units, ck = daliChecks(), models = [...new Set(us.map(u => u.model))], lay = dLay(), net = dNet();
  const lv = {err:'Fail', warn:'Review', info:'Note'}, ord = {err:0, warn:1, info:2};
  const brands = [...new Set(DALI_CAT.map(c => c.b))];
  const picker = dPicker();
  const stack1 = dStack(net.map(s => s)), stack2 = dStack(lay.secs);
  return `<div class="card"><div class="row" style="justify-content:space-between"><h2>DALI network</h2><div class="stats"><span>Lines <b>${A.lines.length}</b></span><span>Devices <b>${us.length}</b></span><span>On DIN rail <b>${lay.dinCount}</b> (${lay.dinDU} DU)</span><span>Remote <b>${lay.remCount}</b></span><span>Not connected <b>${A.free.length}</b></span></div></div>
   <p class="note" style="margin:6px 0 0;max-width:80ch">Add DALI masters, bus supplies and drivers here or from the DALI library on the Equipment tab. Each driver is connected to one link of a DALI controller. Controllers placed in the panel (for example a Lutron QSN2-2DALUNV-D) appear here automatically, as do masters added below. Addresses are handed out in order on each line, up to 64.</p>
   ${ck.length ? `<ul class="checks" style="margin-top:12px">${ck.sort((a, b) => ord[a.lvl] - ord[b.lvl]).map(c => `<li><span class="lvl ${c.lvl}">${lv[c.lvl]}</span><span class="mono">${esc(c.ref)}</span><span>${esc(c.msg)}</span></li>`).join('')}</ul>` : us.length ? '<p class="muted" style="margin-top:10px">All DALI line checks pass.</p>' : ''}</div>
  ${dCtlCard(A)}
  <div class="card"><h3>Quantities</h3>
   <div class="row" style="margin:8px 0 12px">${picker}<select id="daddlink" aria-label="Connect to"><option value="">Connect to: first free link</option>${dLineOpts(A, '')}</select><input type="number" id="daddqty" class="qty" value="1" min="1" max="50" step="1" aria-label="Quantity" inputmode="numeric"><button class="btn pri" data-a="dadd2">Add to DALI network</button>${us.length ? '<button class="btn" data-a="dclear">Remove all DALI</button>' : ''}</div>
   ${models.length ? `<div class="scroll"><table style="min-width:620px"><thead><tr><th>Model</th><th>Type</th><th>Mounting</th><th>Quantity</th><th></th></tr></thead><tbody>${models.map(m => { const c = dCat(m), n = us.filter(u => u.model === m).length; return `<tr><td class="mono"><b>${esc(m)}</b><div class="note">${c.b}${c.art ? ' · ' + esc(c.art) : ''}</div></td><td>${DKIND[c.k]}</td><td>${c.mt === 'din' ? 'DIN ' + c.du + ' DU' : DMOUNT[c.mt]}</td><td style="width:110px"><input type="number" class="dqty" data-model="${esc(m)}" value="${n}" min="1" max="99" step="1" aria-label="Quantity of ${esc(m)}" inputmode="numeric"></td><td><button class="btn sm" data-a="dgone" data-model="${esc(m)}" aria-label="Remove all ${esc(m)}">Remove</button></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">No DALI equipment yet. Pick a model above, or browse the DALI library on the Equipment tab.</p>'}</div>
  ${dCustomCard()}
  ${us.length ? `<div class="card"><h3>DALI modules</h3><div class="scroll"><table class="stack" style="min-width:900px"><thead><tr><th>Ref</th><th>Model</th><th>Mounting</th><th>Name / location</th><th>DALI link</th><th>Address</th><th>mA</th><th></th></tr></thead><tbody>${us.map(u => { const c = dCat(u.model), l = A.by[u.link]; return `<tr><td class="mono">${u.id}</td><td><b>${esc(c.m)}</b><div class="note">${c.b} · ${DKIND[c.k]}</div></td><td>${c.mt === 'din' ? 'DIN ' + c.du + ' DU' : DMOUNT[c.mt]}</td><td><input type="text" data-dk="label" data-id="${u.id}" value="${esc(u.label)}" placeholder="e.g. Kitchen downlights" aria-label="Name for ${u.id}" maxlength="40"></td><td style="min-width:220px">${dLinkSelect(u, A)}</td><td class="mono">${c.k === 'master' ? c.ln + ' lines' : c.k === 'psu' ? 'bus supply' : l ? dAddr(l, u) || '–' : '–'}</td><td class="mono" style="text-align:right">${c.k === 'master' || c.k === 'psu' ? '–' : c.ma}</td><td><button class="btn sm" data-a="ddel" data-id="${u.id}" aria-label="Remove ${u.id}">✕</button></td></tr>`; }).join('')}</tbody></table></div></div>` : ''}
  ${(A.lines.length || us.length) ? `<div class="card"><div class="row" style="justify-content:space-between"><h2>DALI network schematic</h2><span class="note">Separate from the panel schematic. Colour = DALI line; dashed boxes are remote devices.</span></div>
   <div class="scroll" style="margin-top:10px">${stack1.items.length ? dSvg(stack1.items, DW, stack1.H) : '<p class="muted">Add a DALI controller to the panel, or a master below, to draw the network.</p>'}</div></div>
  <div class="card"><div class="row" style="justify-content:space-between"><h2>DALI module layout</h2><span class="note">DIN-rail strip for DIN items (${lay.cols} DU per rail, 1 DU = 17.5 mm) and a separate area for remote drivers.</span></div>
   <div class="scroll" style="margin-top:10px">${stack2.items.length ? dSvg(stack2.items, DW, stack2.H) : '<p class="muted">Nothing to lay out yet.</p>'}</div></div>` : ''}`;
}

/* ---------- events ---------- */
document.addEventListener('input', e => {
  if (e.target.id === 'dsearch'){ dpQ = e.target.value; const sl = $('#daddmodel'), keep = sl.value; sl.innerHTML = dPickOpts(keep); $('#dcount').textContent = dPickList().length + ' match' + (dPickList().length === 1 ? '' : 'es'); return; }
  if (e.target.id === 'dq'){ dQ = e.target.value; const b = $('#dbody'); if (b) b.innerHTML = dRows(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'dfkind'){ dpKind = t.value; const sl = $('#daddmodel'); sl.innerHTML = dPickOpts(sl.value); $('#dcount').textContent = dPickList().length + ' match' + (dPickList().length === 1 ? '' : 'es'); return; }
  if (t.dataset && t.dataset.ck){ dCustomEdit(t); return; }
  if (t.id === 'dbrand'){ dBrand = t.value; $('#dbody').innerHTML = dRows(); return; }
  if (t.id === 'dkind'){ dKindF = t.value; $('#dbody').innerHTML = dRows(); return; }
  if (t.id === 'dmount'){ dMountF = t.value; $('#dbody').innerHTML = dRows(); return; }
  if (t.dataset && t.dataset.dk){ const u = dS().units.find(x => x.id === t.dataset.id); if (u){ u[t.dataset.dk] = t.value; refresh(true); } return; }
  if (t.classList && t.classList.contains('dqty')){ dsetQty(t.dataset.model, Math.min(99, Math.max(1, Math.floor(+t.value) || 1))); refresh(true); }
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
  if (a === 'dadd'){ const q = qtyOf(b.parentNode.querySelector('.qty')); dadd(b.dataset.model, q); calc(); persist(); toast(q > 1 ? `${q} × ${b.dataset.model} added. Open the DALI tab to connect them.` : `${b.dataset.model} added. Open the DALI tab to connect it.`); renderTabs(); }
  else if (a === 'dadd2'){ dadd($('#daddmodel').value, qtyOf('#daddqty'), $('#daddlink').value); refresh(true); }
  else if (a === 'ddel'){ ddel(b.dataset.id); refresh(true); }
  else if (a === 'dgone'){ dS().units.filter(u => u.model === b.dataset.model).map(u => u.id).forEach(ddel); refresh(true); }
  else if (a === 'dcust'){
    const g = id => ($('#' + id) || {}).value, m = dCustomAdd({name: g('cname'), k: g('ckind'), mt: g('cmount'), du: g('cdu'), ad: g('cad'), ma: g('cma'), ch: g('cch'), ln: g('cln'), sup: g('csup'), w: g('cw'), out: g('cout')});
    if (m){ dadd(m, qtyOf('#ccqty'), $('#daddlink').value); refresh(true); toast(m + ' added.'); }
  }
  else if (a === 'dcustdel'){ const m = b.dataset.model; dS().units.filter(u => u.model === m).map(u => u.id).forEach(ddel); S.dali.custom = S.dali.custom.filter(c => c.m !== m); refresh(true); }
  else if (a === 'dclear'){ S.dali = {units: []}; refresh(true); }
});

function dCustomEdit(t){
  const c = dS().custom.find(x => x.m === t.dataset.model); if (!c) return; const k = t.dataset.ck;
  if (k === 'm'){
    let v = String(t.value || '').trim().slice(0, 40) || c.m, nm = v, n = 2;
    while (nm !== c.m && (DALI_CAT.some(x => x.m === nm) || S.dali.custom.some(x => x.m === nm))) nm = v + ' (' + n++ + ')';
    S.dali.units.forEach(u => { if (u.model === c.m) u.model = nm; }); c.m = nm;
  } else c[k] = (k === 'out' || k === 'kind' || k === 'k' || k === 'mt') ? t.value : t.value;
  dFixCustom(c);
  daliFix(); refresh(true);
}
