/* ---------- Tools tab: electrician's calculators ---------- */
const TX = s => s;                                   /* marker: every TX('…') string is a translation key */
const TL = {};                                      /* tool state, kept while the page is open */
const tn = x => { const v = parseFloat(String(x).replace(',', '.')); return isFinite(v) ? v : NaN; };
const tf = x => {                                   /* friendly number */
  if (x == null || !isFinite(x)) return '–';
  const a = Math.abs(x), d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 4 : 5;
  let s = x.toFixed(d); if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
};
const OPT = (a, v) => a.map(o => `<option value="${o[0]}" ${String(v) === String(o[0]) ? 'selected' : ''}>${esc(o[1])}</option>`).join('');
const pos = (...v) => v.every(x => isFinite(x) && x > 0);
const SUPPLY = [['1', TX('Single phase')], ['3', TX('Three phase')], ['dc', TX('DC')]];
const CABTYPE = [['pvc', TX('Cu PVC 70 °C')], ['xlpe', TX('Cu XLPE 90 °C')]];

/* Ohm's law: derive all four values from any two */
function ohmAll(v){
  const {V, I, R, P} = v;
  if (pos(V, I)) return {V, I, R: V / I, P: V * I};
  if (pos(V, R)) return {V, R, I: V / R, P: V * V / R};
  if (pos(V, P)) return {V, P, I: P / V, R: V * V / P};
  if (pos(I, R)) return {I, R, V: I * R, P: I * I * R};
  if (pos(I, P)) return {I, P, V: P / I, R: P / (I * I)};
  if (pos(R, P)) return {R, P, V: Math.sqrt(P * R), I: Math.sqrt(P / R)};
  return null;
}
const OHM = {
  V: [['IR', 'I × R'], ['PI', 'P ÷ I'], ['PR', '√(P × R)']],
  I: [['VR', 'V ÷ R'], ['PV', 'P ÷ V'], ['PR', '√(P ÷ R)']],
  R: [['VI', 'V ÷ I'], ['VP', 'V² ÷ P'], ['PI', 'P ÷ I²']],
  P: [['VI', 'V × I'], ['IR', 'I² × R'], ['VR', 'V² ÷ R']]
};
const OHMN = {V: TX('Voltage (V)'), I: TX('Current (A)'), R: TX('Resistance (Ω)'), P: TX('Power (W)')};
const OHMU = {V: 'V', I: 'A', R: 'Ω', P: 'W'};

const TOOLS = [
 {id: 'ohm', title: TX("Ohm's law and power"), hint: TX('Pick what to find, then enter the two values you know.'), def: {solve: 'I', use: 0, V: '230', I: '', R: '46', P: ''},
  fields(s){
    const o = OHM[s.solve], u = o[Math.min(s.use, 2)][0], f = [
      {k: 'solve', t: 'sel', label: TX('Find'), opts: [['V', OHMN.V], ['I', OHMN.I], ['R', OHMN.R], ['P', OHMN.P]]},
      {k: 'use', t: 'sel', label: TX('Formula'), opts: o.map((x, i) => [i, x[1]]), nt: 1}];
    [u[0], u[1]].forEach(k => f.push({k, t: 'num', label: OHMN[k]}));
    return f;
  },
  calc(s){
    const o = OHM[s.solve], pair = o[Math.min(s.use, 2)][0], v = {};
    [pair[0], pair[1]].forEach(k => v[k] = tn(s[k]));
    const a = ohmAll(v); if (!a || !pos(v[pair[0]], v[pair[1]])) return {err: TX('Enter values above zero.')};
    const rows = ['V', 'I', 'R', 'P'].map(k => [OHMN[k], tf(a[k]) + ' ' + OHMU[k], k === s.solve]);
    const k1 = pair[0], k2 = pair[1], f = {
      V: {IR: `V = I × R = ${tf(a.I)} × ${tf(a.R)}`, PI: `V = P ÷ I = ${tf(a.P)} ÷ ${tf(a.I)}`, PR: `V = √(P × R) = √(${tf(a.P)} × ${tf(a.R)})`},
      I: {VR: `I = V ÷ R = ${tf(a.V)} ÷ ${tf(a.R)}`, PV: `I = P ÷ V = ${tf(a.P)} ÷ ${tf(a.V)}`, PR: `I = √(P ÷ R) = √(${tf(a.P)} ÷ ${tf(a.R)})`},
      R: {VI: `R = V ÷ I = ${tf(a.V)} ÷ ${tf(a.I)}`, VP: `R = V² ÷ P = ${tf(a.V)}² ÷ ${tf(a.P)}`, PI: `R = P ÷ I² = ${tf(a.P)} ÷ ${tf(a.I)}²`},
      P: {VI: `P = V × I = ${tf(a.V)} × ${tf(a.I)}`, IR: `P = I² × R = ${tf(a.I)}² × ${tf(a.R)}`, VR: `P = V² ÷ R = ${tf(a.V)}² ÷ ${tf(a.R)}`}
    }[s.solve][k1 + k2];
    return {rows, f: [f + ` = ${tf(a[s.solve])} ${OHMU[s.solve]}`]};
  }},

 {id: 'ac', title: TX('AC power and power factor'), hint: TX('Works out current, real, apparent and reactive power for single and three phase loads.'), def: {ph: '3', V: '400', known: 'ipf', I: '16', pf: '0.9', P: '', S: '', Q: ''},
  fields(s){
    const f = [{k: 'ph', t: 'sel', label: TX('Supply'), opts: SUPPLY.slice(0, 2)},
      {k: 'V', t: 'num', label: s.ph === '3' ? TX('Line voltage (V)') : TX('Voltage (V)')},
      {k: 'known', t: 'sel', label: TX('Known values'), opts: [['ipf', TX('Current and power factor')], ['ppf', TX('Real power and power factor')], ['spf', TX('Apparent power and power factor')], ['pq', TX('Real and reactive power')]]}];
    if (s.known === 'ipf') f.push({k: 'I', t: 'num', label: TX('Current (A)')}, {k: 'pf', t: 'num', label: TX('Power factor'), step: .05});
    if (s.known === 'ppf') f.push({k: 'P', t: 'num', label: TX('Real power (kW)')}, {k: 'pf', t: 'num', label: TX('Power factor'), step: .05});
    if (s.known === 'spf') f.push({k: 'S', t: 'num', label: TX('Apparent power (kVA)')}, {k: 'pf', t: 'num', label: TX('Power factor'), step: .05});
    if (s.known === 'pq') f.push({k: 'P', t: 'num', label: TX('Real power (kW)')}, {k: 'Q', t: 'num', label: TX('Reactive power (kvar)')});
    return f;
  },
  calc(s){
    const V = tn(s.V), k = s.ph === '3' ? SQ3 : 1, pf0 = tn(s.pf); let I, S, P, Q, pf;
    if (!pos(V)) return {err: TX('Enter values above zero.')};
    if (s.known !== 'pq' && !(pf0 > 0 && pf0 <= 1)) return {err: TX('Power factor must be between 0 and 1.')};
    if (s.known === 'ipf'){ I = tn(s.I); if (!pos(I)) return {err: TX('Enter values above zero.')}; S = k * V * I / 1000; pf = pf0; P = S * pf; }
    else if (s.known === 'ppf'){ P = tn(s.P); if (!pos(P)) return {err: TX('Enter values above zero.')}; pf = pf0; S = P / pf; I = S * 1000 / (k * V); }
    else if (s.known === 'spf'){ S = tn(s.S); if (!pos(S)) return {err: TX('Enter values above zero.')}; pf = pf0; P = S * pf; I = S * 1000 / (k * V); }
    else { P = tn(s.P); Q = tn(s.Q); if (!pos(P) || !isFinite(Q)) return {err: TX('Enter values above zero.')}; S = Math.sqrt(P * P + Q * Q); pf = P / S; I = S * 1000 / (k * V); }
    if (Q == null || s.known !== 'pq') Q = Math.sqrt(Math.max(0, S * S - P * P));
    const rows = [[TX('Current'), tf(I) + ' A'], [TX('Real power'), tf(P) + ' kW'], [TX('Apparent power'), tf(S) + ' kVA'], [TX('Reactive power'), tf(Q) + ' kvar'], [TX('Power factor'), tf(pf)], [TX('Phase angle'), tf(Math.acos(Math.min(1, pf)) * 180 / Math.PI) + '°']];
    return {rows, f: [s.ph === '3' ? `S = √3 × V × I ÷ 1000 = 1.732 × ${tf(V)} × ${tf(I)} ÷ 1000 = ${tf(S)} kVA` : `S = V × I ÷ 1000 = ${tf(V)} × ${tf(I)} ÷ 1000 = ${tf(S)} kVA`, `P = S × cos φ = ${tf(S)} × ${tf(pf)} = ${tf(P)} kW`, `Q = √(S² − P²) = ${tf(Q)} kvar`, `cos φ = P ÷ S = ${tf(pf)}`]};
  }},

 {id: 'pfc', title: TX('Power factor correction'), hint: TX('Size the capacitor bank needed to raise the power factor.'), def: {P: '30', pf1: '0.78', pf2: '0.95'},
  fields: () => [{k: 'P', t: 'num', label: TX('Real power (kW)')}, {k: 'pf1', t: 'num', label: TX('Present power factor'), step: .01}, {k: 'pf2', t: 'num', label: TX('Target power factor'), step: .01}],
  calc(s){
    const P = tn(s.P), a = tn(s.pf1), b = tn(s.pf2);
    if (!pos(P)) return {err: TX('Enter values above zero.')};
    if (!(a > 0 && a <= 1 && b > 0 && b <= 1)) return {err: TX('Power factor must be between 0 and 1.')};
    if (b <= a) return {err: TX('The target must be higher than the present power factor.')};
    const t = x => Math.tan(Math.acos(x)), Qc = P * (t(a) - t(b));
    return {rows: [[TX('Capacitor size (kvar)'), tf(Qc) + ' kvar', true], [TX('Apparent power before'), tf(P / a) + ' kVA'], [TX('Apparent power after'), tf(P / b) + ' kVA'], [TX('Current reduction'), tf((1 - a / b) * 100) + ' %']],
      f: [`Qc = P × (tan φ1 − tan φ2) = ${tf(P)} × (${tf(t(a))} − ${tf(t(b))}) = ${tf(Qc)} kvar`, `S = P ÷ cos φ`]};
  }},

 {id: 'cab', title: TX('Cable size'), hint: TX('Finds the smallest copper cable that carries the load and keeps voltage drop within the limit.'), def: {ph: '3', V: '400', by: 'P', P: '15', I: '', pf: '0.9', len: '40', lim: '4', cable: 'pvc', amb: '30', grp: '1'},
  fields(s){
    const f = [{k: 'ph', t: 'sel', label: TX('Supply'), opts: SUPPLY}, {k: 'V', t: 'num', label: s.ph === '3' ? TX('Line voltage (V)') : TX('Voltage (V)')},
      {k: 'by', t: 'sel', label: TX('Load is given as'), opts: [['P', TX('Power (kW)')], ['I', TX('Current (A)')]]}];
    f.push(s.by === 'P' ? {k: 'P', t: 'num', label: TX('Power (kW)')} : {k: 'I', t: 'num', label: TX('Current (A)')});
    if (s.ph !== 'dc') f.push({k: 'pf', t: 'num', label: TX('Power factor'), step: .05});
    f.push({k: 'len', t: 'num', label: TX('Cable length (m)')}, {k: 'lim', t: 'num', label: TX('Voltage drop limit (%)'), step: .5}, {k: 'cable', t: 'sel', label: TX('Cable type'), opts: CABTYPE},
      {k: 'amb', t: 'num', label: TX('Ambient (°C)')}, {k: 'grp', t: 'num', label: TX('Grouping factor'), step: .05});
    return f;
  },
  calc(s){
    const c = cabIn(s); if (c.err) return c;
    const RT = ratingsOf(S), In = pick(RT, c.Ib), cab = sizeCable(c.Sx, {cable: s.cable, In: In || 0, Ib: c.Ib, len: c.len, pf: c.pf, three: c.three, grp: c.grp, min: 1.5, lim: c.lim, size: 'auto'});
    const ok = cab.vd <= c.lim + 1e-9 && cab.Iz >= Math.max(In || 0, c.Ib) - 1e-9;
    const rows = [[TX('Design current'), tf(c.Ib) + ' A'], [TX('Cable size'), tf(cab.size) + ' mm²', true], [TX('Cable rating'), tf(cab.Iz) + ' A'], [TX('Voltage drop'), `${tf(cab.vd)} % · ${tf(cab.vd * c.V / 100)} V`], [TX('Suggested breaker'), In ? In + ' A' : '–']];
    const f = [c.ibf, 'VD % = k × I × L × (R × cos φ + X × sin φ) ÷ V × 100', 'k = 2 (1φ, DC) · √3 (3φ) · R = ρ ÷ S · ρ = 0.02094 (PVC) · 0.02235 (XLPE) Ω·mm²/m'];
    return {rows, f, note: ok ? TX('Copper conductors, reference method C. Confirm against your standard and the installation method.') : TX('No cable in the table meets the limit. Shorten the run, relax the limit or use parallel cables.'), warn: !ok};
  }},

 {id: 'vd', title: TX('Voltage drop'), hint: TX('Voltage drop for a cable you have chosen, and the longest run it can serve.'), def: {ph: '1', V: '230', size: '4', I: '16', pf: '1', len: '30', lim: '3', cable: 'pvc', amb: '30'},
  fields(s){
    const f = [{k: 'ph', t: 'sel', label: TX('Supply'), opts: SUPPLY}, {k: 'V', t: 'num', label: s.ph === '3' ? TX('Line voltage (V)') : TX('Voltage (V)')},
      {k: 'size', t: 'sel', label: TX('Cable size (mm²)'), opts: SZ.map(z => [z, z]), nt: 1}, {k: 'I', t: 'num', label: TX('Current (A)')}];
    if (s.ph !== 'dc') f.push({k: 'pf', t: 'num', label: TX('Power factor'), step: .05});
    f.push({k: 'len', t: 'num', label: TX('Cable length (m)')}, {k: 'lim', t: 'num', label: TX('Voltage drop limit (%)'), step: .5}, {k: 'cable', t: 'sel', label: TX('Cable type'), opts: CABTYPE}, {k: 'amb', t: 'num', label: TX('Ambient (°C)')});
    return f;
  },
  calc(s){
    const c = cabIn(Object.assign({}, s, {by: 'I', grp: 1})); if (c.err) return c;
    const size = +s.size, vp = vdPct(c.Sx, size, s.cable, c.Ib, c.len, c.pf, c.three), vv = vp * c.V / 100, tab = AMP[s.cable][c.three ? 3 : 2], Iz = tab[SZ.indexOf(size)] * ambF(c.Sx, s.cable);
    const ok = vp <= c.lim, mx = vp > 0 ? c.len * c.lim / vp : Infinity;
    const rows = [[TX('Voltage drop (V)'), tf(vv) + ' V'], [TX('Voltage drop (%)'), tf(vp) + ' %', true], [TX('Voltage at the load'), tf(c.V - vv) + ' V'], [TX('Longest run within the limit'), tf(mx) + ' m'], [TX('Cable rating'), tf(Iz) + ' A']];
    return {rows, f: ['VD % = k × I × L × (R × cos φ + X × sin φ) ÷ V × 100', 'k = 2 (1φ, DC) · √3 (3φ) · R = ρ ÷ S · ρ = 0.02094 (PVC) · 0.02235 (XLPE) Ω·mm²/m', `${tf(vp)} % × ${tf(c.V)} ÷ 100 = ${tf(vv)} V`], note: ok ? TX('Within the limit.') : TX('Over the limit. Use a larger cable or a shorter run.'), warn: !ok || c.Ib > Iz};
  }},

 {id: 'res', title: TX('Cable resistance'), hint: TX('Resistance of a copper or aluminium conductor. Solve for resistance, length or size, for example to estimate fault distance.'), def: {mat: 'cu', find: 'R', cfg: '1', T: '20', R: '0.69', L: '100', A: '2.5'},
  fields(s){
    const f = [{k: 'mat', t: 'sel', label: TX('Material'), opts: [['cu', TX('Copper')], ['al', TX('Aluminium')]]},
      {k: 'find', t: 'sel', label: TX('Find'), opts: [['R', TX('Resistance (Ω)')], ['L', TX('Cable length (m)')], ['A', TX('Cable size (mm²)')]]},
      {k: 'cfg', t: 'sel', label: TX('Measured as'), opts: [['1', TX('One conductor')], ['2', TX('Loop (out and back)')]]},
      {k: 'T', t: 'num', label: TX('Conductor temperature (°C)')}];
    if (s.find !== 'R') f.push({k: 'R', t: 'num', label: TX('Resistance (Ω)')});
    if (s.find !== 'L') f.push({k: 'L', t: 'num', label: TX('Cable length (m)')});
    if (s.find !== 'A') f.push({k: 'A', t: 'num', label: TX('Cable size (mm²)')});
    return f;
  },
  calc(s){
    const RHO = {cu: 0.017241, al: 0.028264}, AL = {cu: 0.00393, al: 0.00403}, T = tn(s.T), m = s.cfg === '2' ? 2 : 1;
    if (!isFinite(T)) return {err: TX('Enter values above zero.')};
    const rho = RHO[s.mat] * (1 + AL[s.mat] * (T - 20));
    let R = tn(s.R), Ln = tn(s.L), A = tn(s.A);
    if (s.find === 'R'){ if (!pos(Ln, A)) return {err: TX('Enter values above zero.')}; R = rho * m * Ln / A; }
    else if (s.find === 'L'){ if (!pos(R, A)) return {err: TX('Enter values above zero.')}; Ln = R * A / (rho * m); }
    else { if (!pos(R, Ln)) return {err: TX('Enter values above zero.')}; A = rho * m * Ln / R; }
    const rows = [[TX('Resistance (Ω)'), tf(R) + ' Ω', s.find === 'R'], [TX('Cable length (m)'), tf(Ln) + ' m', s.find === 'L'], [TX('Cable size (mm²)'), tf(A) + ' mm²', s.find === 'A']];
    if (s.find === 'A'){ const nx = pick(SZ, A); rows.push([TX('Next standard size'), nx ? nx + ' mm²' : '–']); }
    rows.push([TX('Resistivity at this temperature'), rho.toFixed(6) + ' Ω·mm²/m'], [TX('Resistance per metre'), tf(rho * m / A * 1000) + ' mΩ/m']);
    const mk = s.mat === 'cu' ? 'Cu' : 'Al';
    return {rows, f: [`R = ρ × ${m === 2 ? '2 × ' : ''}L ÷ A${s.find === 'R' ? ` = ${rho.toFixed(6)} × ${m === 2 ? '2 × ' : ''}${tf(Ln)} ÷ ${tf(A)} = ${tf(R)} Ω` : s.find === 'L' ? ` → L = R × A ÷ (ρ × ${m === 2 ? '2 × ' : ''}1) = ${tf(Ln)} m` : ` → A = ρ × ${m === 2 ? '2 × ' : ''}L ÷ R = ${tf(A)} mm²`}`, `ρ(T) = ρ20 × (1 + α × (T − 20)) = ${RHO[s.mat]} × (1 + ${AL[s.mat]} × (${tf(T)} − 20)) = ${rho.toFixed(6)} Ω·mm²/m`, `${mk}: ρ20 = ${RHO[s.mat]} Ω·mm²/m · α = ${AL[s.mat]} /°C`],
      note: m === 2 ? TX('A loop reading covers the conductor out and back, so the length shown is the one-way distance.') : TX('Resistivity at 20 °C: copper 0.017241, aluminium 0.028264 Ω·mm²/m. Temperature coefficient: copper 0.00393, aluminium 0.00403 per °C.')};
  }},

 {id: 'net', title: TX("Resistor networks and Kirchhoff's laws"), hint: TX('Series and parallel resistors with the voltage and current in each one.'), def: {mode: 's', R: '100, 220, 330', V: '12'},
  fields: s => [{k: 'mode', t: 'sel', label: TX('Network'), opts: [['s', TX('Series')], ['p', TX('Parallel')]]}, {k: 'V', t: 'num', label: TX('Supply voltage (V)')}, {k: 'R', t: 'text', label: TX('Resistor values (Ω), separated by commas or spaces'), wide: 1}],
  calc(s){
    const V = tn(s.V), R = String(s.R).split(/[\s,;]+/).filter(Boolean).map(tn);
    if (!pos(V)) return {err: TX('Enter values above zero.')};
    if (!R.length || R.length > 12 || !R.every(x => x > 0)) return {err: TX('Enter between 1 and 12 resistor values above zero.')};
    const ser = s.mode === 's', Rt = ser ? R.reduce((a, b) => a + b, 0) : 1 / R.reduce((a, b) => a + 1 / b, 0), It = V / Rt;
    const th = [TX('Resistor'), TX('Resistance (Ω)'), TX('Voltage (V)'), TX('Current (A)'), TX('Power (W)')];
    const tb = R.map((r, i) => { const i2 = ser ? It : V / r, v2 = ser ? It * r : V; return ['R' + (i + 1), tf(r), tf(v2), tf(i2), tf(v2 * i2)]; });
    const sumV = R.map((r, i) => 'V' + (i + 1)).join(' + '), sumI = R.map((r, i) => 'I' + (i + 1)).join(' + ');
    const f = [ser ? 'Rt = R1 + R2 + …' : 'Rt = 1 ÷ (1 ÷ R1 + 1 ÷ R2 + …)', `Rt = ${tf(Rt)} Ω · I = V ÷ Rt = ${tf(V)} ÷ ${tf(Rt)} = ${tf(It)} A`,
      ser ? `KVL: ${sumV} = ${tf(tb.reduce((a, r) => a + +r[2], 0))} V` : `KCL: ${sumI} = ${tf(tb.reduce((a, r) => a + +r[3], 0))} A`];
    return {rows: [[TX('Total resistance'), tf(Rt) + ' Ω', true], [TX('Total current'), tf(It) + ' A'], [TX('Total power'), tf(V * It) + ' W']], f, table: {th, tb}, note: ser ? TX('Kirchhoff’s voltage law (KVL): the voltages around a closed loop add up to zero, so the drops across the resistors add up to the supply.') : TX('Kirchhoff’s current law (KCL): the current into a node equals the current out of it, so the branch currents add up to the total.')};
  }},

 {id: 'sd', title: TX('Star and delta relationships'), hint: TX('Line and phase voltage and current in a three phase load.'), def: {conn: 'y', given: 'line', V: '400', I: '10'},
  fields(s){
    const l = s.given === 'line';
    return [{k: 'conn', t: 'sel', label: TX('Connection'), opts: [['y', TX('Star (wye)')], ['d', TX('Delta')]]}, {k: 'given', t: 'sel', label: TX('Known values'), opts: [['line', TX('Line values')], ['phase', TX('Phase values')]]},
      {k: 'V', t: 'num', label: l ? TX('Line voltage (V)') : TX('Phase voltage (V)')}, {k: 'I', t: 'num', label: l ? TX('Line current (A)') : TX('Phase current (A)')}];
  },
  calc(s){
    const a = tn(s.V), b = tn(s.I); if (!pos(a, b)) return {err: TX('Enter values above zero.')};
    const y = s.conn === 'y', line = s.given === 'line'; let VL, VP, IL, IP;
    if (y){ if (line){ VL = a; IL = b; VP = VL / SQ3; IP = IL; } else { VP = a; IP = b; VL = VP * SQ3; IL = IP; } }
    else { if (line){ VL = a; IL = b; VP = VL; IP = IL / SQ3; } else { VP = a; IP = b; VL = VP; IL = IP * SQ3; } }
    const S = SQ3 * VL * IL / 1000;
    return {rows: [[TX('Line voltage (V)'), tf(VL) + ' V'], [TX('Phase voltage (V)'), tf(VP) + ' V'], [TX('Line current (A)'), tf(IL) + ' A'], [TX('Phase current (A)'), tf(IP) + ' A'], [TX('Apparent power (kVA)'), tf(S) + ' kVA']],
      f: [y ? 'V line = √3 × V phase · I line = I phase' : 'V line = V phase · I line = √3 × I phase', `S = √3 × V line × I line ÷ 1000 = 3 × V phase × I phase ÷ 1000 = ${tf(S)} kVA`]};
  }}
];

/* shared input handling for cable tools */
function cabIn(s){
  const three = s.ph === '3', dc = s.ph === 'dc', V = tn(s.V), len = tn(s.len), lim = tn(s.lim), grp = tn(s.grp == null ? 1 : s.grp), amb = tn(s.amb), pf = dc ? 1 : tn(s.pf);
  const bad = TX('Enter values above zero.');
  if (!pos(V, len, lim, grp)) return {err: bad};
  if (!isFinite(amb)) return {err: bad};
  if (!dc && !(pf > 0 && pf <= 1)) return {err: TX('Power factor must be between 0 and 1.')};
  const k = three ? SQ3 : 1; let Ib, ibf;
  if (s.by === 'P'){ const P = tn(s.P); if (!pos(P)) return {err: bad}; Ib = P * 1000 / (k * V * pf); ibf = three ? `Ib = P × 1000 ÷ (√3 × V × cos φ) = ${tf(P)} × 1000 ÷ (1.732 × ${tf(V)} × ${tf(pf)}) = ${tf(Ib)} A` : `Ib = P × 1000 ÷ (V${dc ? '' : ' × cos φ'}) = ${tf(P)} × 1000 ÷ (${tf(V)}${dc ? '' : ' × ' + tf(pf)}) = ${tf(Ib)} A`; }
  else { Ib = tn(s.I); if (!pos(Ib)) return {err: bad}; ibf = `Ib = ${tf(Ib)} A`; }
  return {three, dc, V, len, lim, grp: Math.min(1, grp), pf, Ib, ibf, Sx: {ambient: amb, vLN: three ? V / SQ3 : V}};
}

function toolForm(t){
  const s = TL[t.id] = TL[t.id] || Object.assign({}, t.def);
  return t.fields(s).map(f => {
    const v = s[f.k] == null ? '' : s[f.k];
    const inp = f.t === 'sel' ? `<select data-tl="${t.id}" data-f="${f.k}" ${f.nt ? 'data-nt' : ''}>${OPT(f.opts, v)}</select>` :
      `<input ${f.t === 'text' ? 'type="text" inputmode="text"' : `type="number" inputmode="decimal" step="${f.step || 'any'}" min="0"`} data-tl="${t.id}" data-f="${f.k}" value="${esc(v)}">`;
    return `<label class="fld" ${f.wide ? 'style="grid-column:1/-1"' : ''}><span>${f.label}</span>${inp}</label>`;
  }).join('');
}
function toolOut(t){
  const r = t.calc(TL[t.id]);
  if (r.err) return `<p class="muted">${r.err}</p>`;
  let h = `<dl class="qcd">${r.rows.map(x => `<dt>${x[0]}</dt><dd>${x[2] ? '<b>' : ''}<span data-nt>${esc(x[1])}</span>${x[2] ? '</b>' : ''}</dd>`).join('')}</dl>`;
  if (r.table) h += `<div style="overflow-x:auto;margin-top:10px"><table class="tltab"><thead><tr>${r.table.th.map(x => `<th>${x}</th>`).join('')}</tr></thead><tbody>${r.table.tb.map(row => `<tr>${row.map((x, i) => `<td ${i ? 'data-nt' : ''}>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  h += `<div class="tlf" data-nt>${r.f.map(x => `<code>${esc(x)}</code>`).join('')}</div>`;
  if (r.note) h += `<p class="note ${r.warn ? 'tlwarn' : ''}" style="margin:8px 0 0">${r.note}</p>`;
  return h;
}
/* ---------- Standards reference (values come from the STD table in calc.js) ---------- */
const REFX = {
  iec: {col: TX('Line 1 brown, line 2 black, line 3 grey, neutral blue, protective earth green-yellow (IEC 60446).'), earth: TX('Protective earthing with automatic disconnection of supply (TN, TT or IT systems), main equipotential bonding of incoming metal services and exposed conductive parts.')},
  bs: {col: TX('Line 1 brown, line 2 black, line 3 grey, neutral blue, protective earth green-yellow. Older installations use red, yellow, blue and black.'), earth: TX('Protective earthing with automatic disconnection. Earth-fault loop impedance must stay within the table limits, with main protective bonding of services.')},
  nec: {col: TX('Only the neutral (white or grey) and the equipment ground (green or bare) are fixed. Phase colours follow local practice, commonly black, red and blue at 208 V.'), earth: TX('Article 250: grounding electrode system, equipment grounding conductors, and one neutral-to-ground bond at the service disconnect only.')},
  as: {col: TX('Earth green-yellow, neutral black or light blue, actives in other colours such as red, white and blue, or brown, black and grey.'), earth: TX('Multiple earthed neutral (MEN) system with the neutral linked to earth at the main switchboard, and a main earthing conductor to the earth electrode.')},
  iso: {col: TX('Line brown, neutral blue, protective earth green-yellow (IEC 60446 practice).'), earth: TX('Protective conductor joined to the boat bonding system. Neutral and earth are joined only at the source (generator or isolation transformer), never at the shore connection.')},
  abyc: {col: TX('Hot black, second hot red, third hot blue, neutral white, grounding conductor green or green-yellow.'), earth: TX('AC grounding conductor joined to the boat DC negative at one point. Neutral and ground are joined only at the source (generator or isolation transformer).')}
};
function refBody(){
  const k = TL.ref || S.std, st = STD[k], x = REFX[k] || {}, yes = TX('Yes'), no = TX('No');
  const rows = [[TX('Voltage drop, lighting'), st.vdL + ' %'], [TX('Voltage drop, other circuits'), st.vdO + ' %'], [TX('Continuous load factor'), '× ' + st.cont], [TX('Breaker ratings'), st.ratings.join(', ') + ' A'], [TX('Trip curves'), st.curves.join(', ')],
    [TX('Double-pole switching'), st.dp ? TX('Yes, double-pole') : TX('No, single-pole is normal'), 2], [TX('RCD or GFCI protection'), st.rcd, 1], [TX('Wire colours'), x.col, 1], [TX('Earthing and bonding'), x.earth, 1]];
  const cmp = Object.keys(STD).map(q => `<tr class="${q === k ? 'on' : ''}"><td data-nt>${esc(STD[q].n)}</td><td data-nt>${STD[q].vdL} %</td><td data-nt>${STD[q].vdO} %</td><td data-nt>× ${STD[q].cont}</td><td>${STD[q].dp ? yes : no}</td><td data-nt>${esc(STD[q].curves.join(', '))}</td></tr>`).join('');
  return `<dl class="qcd refdl">${rows.map(r => `<dt>${r[0]}</dt><dd>${r[2] === 1 ? esc(r[1]) : r[2] === 2 ? '<b>' + esc(r[1]) + '</b>' : '<b data-nt>' + esc(r[1]) + '</b>'}</dd>`).join('')}</dl>
  <h4 style="margin:18px 0 6px;font-size:14px">${TX('Compare standards')}</h4>
  <div style="overflow-x:auto"><table class="tltab"><thead><tr><th>${TX('Standard')}</th><th>${TX('Lighting drop')}</th><th>${TX('Other drop')}</th><th>${TX('Continuous load')}</th><th>${TX('Double-pole')}</th><th>${TX('Trip curves')}</th></tr></thead><tbody>${cmp}</tbody></table></div>`;
}
function renderRef(){
  const k = TL.ref || S.std;
  return `<div class="card" id="refcard"><h2>${TX('Standards reference')}</h2><p class="note tlwarn" style="margin:6px 0 12px;max-width:70ch">${TX('Reference only. Confirm every value against the current edition of the standard and local amendments before you rely on it.')}</p>
  <div class="form"><label class="fld"><span>${TX('Standard')}</span><select data-tl="ref" data-f="ref" data-nt>${Object.keys(STD).map(q => `<option value="${q}" ${q === k ? 'selected' : ''}>${esc(STD[q].n)}</option>`).join('')}</select></label></div>
  <div id="refbody" style="margin-top:14px">${refBody()}</div></div>`;
}
function renderTools(){
  return `<div class="card"><h2>${TX("Electrician's tools")}</h2><p class="muted" style="max-width:70ch">${TX('Quick calculators for everyday work. Each result shows the formula and the numbers behind it. Treat them as guides and check against your standard.')}</p></div>
  <div class="toolgrid">${TOOLS.map(t => `<div class="card tool" data-tool="${t.id}"><h3>${t.title}</h3><p class="note" style="margin:4px 0 12px">${t.hint}</p><div class="form tlform">${toolForm(t)}</div><div class="qc tlout" aria-live="polite">${toolOut(t)}</div></div>`).join('')}</div>${renderRef()}`;
}
function onTool(e){
  const el = e.target.closest && e.target.closest('[data-tl]'); if (!el) return;
  if (el.dataset.tl === 'ref'){ TL.ref = el.value; const b = document.getElementById('refbody'); if (b) b.innerHTML = refBody(); return; }
  const t = TOOLS.find(x => x.id === el.dataset.tl), card = el.closest('.tool'); if (!t || !card) return;
  const s = TL[t.id]; s[el.dataset.f] = el.value;
  if (el.tagName === 'SELECT'){
    if (el.dataset.f === 'solve') s.use = 0;
    card.querySelector('.tlform').innerHTML = toolForm(t);
  }
  card.querySelector('.tlout').innerHTML = toolOut(t);
}
document.addEventListener('input', onTool);
document.addEventListener('change', onTool);
