/* Checks the MCB / RCBO / incomer selection rules against the standard and the supply voltage. Run: node test/calc_protection.js */
const X = require('./calc_load.js')();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(a === b, `${m}: got ${a}, want ${b}`);
const near = (a, b, m, t = 0.01) => ok(Math.abs(a - b) <= t, `${m}: got ${a}, want ${b}`);
const base = (std, sysId, extra = {}) => {
  const sys = X.SYSTEMS.find(s => s.id === sysId);
  return Object.assign({name:'t', company:'', custom:[], dcPoles:'2P', std, sysId, phases:sys.phases, vLN:sys.vLN, f:sys.f, ik:6, ambient:30, cabinAmb:30, diversity:1, incomer:0, incLen:10, incCable:'xlpe', enclW:0, cols:24, seg:false, spd:false, rcboW:1, vdL:null, vdO:null, order:[], modules:[], circuits:[]}, extra);
};
const ckt = (o) => Object.assign({id:'c1', ref:'C1', name:'x', type:'sockets', mod:'', zone:1, P:1000, pf:1, phase:'L1', len:10, prot:'MCB', curve:'B', dem:1, grp:1, cable:'pvc', size:'auto', inO:0}, o);
const run = S => X.compute(S);
const has = (R, re, lvl) => R.checks.some(c => re.test(c.msg) && (!lvl || c.lvl === lvl));

/* 1. ratings: IEC series vs NEC standard sizes */
ok(X.incRatings(base('iec', '3p400')).includes(63) && !X.incRatings(base('iec', '3p400')).includes(150), 'IEC incomer list');
ok(X.incRatings(base('nec', '3p208')).includes(150) && X.incRatings(base('nec', '3p208')).includes(15) && !X.incRatings(base('nec', '3p208')).includes(63), 'NEC incomer list');
let S = base('nec', '1p120', {circuits:[ckt({type:'sockets', P:12000, id:'c1'})]});   // 100 A at 120 V
let R = run(S); ok(X.incRatings(S).includes(R.inc.In), 'NEC incomer is a standard NEC size, got ' + R.inc.In);
eq(R.inc.In, 100, 'NEC non-continuous 100 A -> 100 A main');
S = base('nec', '1p120', {circuits:[ckt({type:'lighting', P:12000})]}); R = run(S);
eq(R.inc.In, 125, 'NEC continuous 100 A -> 125 A main (125 % rule)');
S = base('iec', '1p230', {circuits:[ckt({type:'lighting', P:23000})]}); R = run(S);   // 100 A
eq(R.inc.In, 100, 'IEC continuous load gets no 125 % factor');

/* 2. NEC continuous-load rule at circuit level */
S = base('nec', '1p120', {circuits:[ckt({id:'a', ref:'A', type:'lighting', P:1800}), ckt({id:'b', ref:'B', type:'sockets', P:1800})]}); R = run(S);   // 15 A each
eq(R.c.a.In, 20, 'NEC lighting 15 A continuous -> 20 A breaker');
eq(R.c.b.In, 15, 'NEC socket 15 A non-continuous -> 15 A breaker');
S = base('iec', '1p230', {circuits:[ckt({id:'a', type:'lighting', P:3450}), ckt({id:'b', type:'sockets', P:3450})]}); R = run(S);   // 15 A
eq(R.c.a.In, 16, 'IEC 15 A -> 16 A breaker'); eq(R.c.b.In, 16, 'IEC socket 15 A -> 16 A');

/* 3. enclosure temperature derating of the breaker (30 C reference for IEC 60898, 40 C for UL 489) */
near(X.kTemp(base('iec', '1p230', {cabinAmb:40})), 0.94, 'IEC kT at 40 C'); near(X.kTemp(base('iec', '1p230', {cabinAmb:25})), 1, 'IEC kT below ref');
near(X.kTemp(base('nec', '1p120', {cabinAmb:40})), 1, 'NEC kT at 40 C'); near(X.kTemp(base('nec', '1p120', {cabinAmb:50})), 0.94, 'NEC kT at 50 C');
S = base('iec', '1p230', {cabinAmb:40, circuits:[ckt({P:3565, pf:1})]}); R = run(S);   // 15.5 A: 16 A breaker derates to 15.04
eq(R.c.c1.In, 20, 'hot enclosure pushes 15.5 A load to a 20 A breaker');
S = base('iec', '1p230', {cabinAmb:40, circuits:[ckt({P:3565, pf:1, inO:16})]}); R = run(S);
ok(has(R, /derated to 15\.0 A/, 'err'), 'forced 16 A breaker flagged as derated');

/* 4. poles follow the supply and standard */
eq(X.polesOf(base('nec', '1p240'), 'MCB', false), '2P', 'NEC 240 V MCB 2P'); eq(X.polesOf(base('nec', '1p240'), 'RCBO', false), '2P', 'NEC 240 V GFCI breaker 2P');
eq(X.polesOf(base('nec', '1p120'), 'MCB', false), '1P', 'NEC 120 V 1P'); eq(X.polesOf(base('iec', '1p230'), 'RCBO', false), '1P+N', 'IEC RCBO 1P+N');
eq(X.polesOf(base('iec', '1p230'), 'MCB', false), '1P', 'IEC MCB 1P'); eq(X.polesOf(base('iec', '3p400'), 'RCBO', true), '3P+N', '3P RCBO'); eq(X.polesOf(base('iso', '1p230'), 'MCB', false), '2P', 'marine MCB double pole');
S = base('nec', '1p240', {circuits:[ckt({P:4800, prot:'MCB', curve:'Std'})]}); R = run(S); eq(X.buildDevices(S, R).devs.find(d => d.cid === 'c1').w, 2, 'NEC 240 V breaker is 2 modules wide');

/* 5. RCD sensitivity follows the standard */
S = base('iec', '1p230', {circuits:[ckt({prot:'RCBO'})]}); eq(run(S).c.c1.rcdMA, '30 mA', 'IEC RCBO 30 mA');
S = base('nec', '1p120', {circuits:[ckt({prot:'RCBO', curve:'Std'})]}); ok(/GFCI/.test(run(S).c.c1.rcdMA), 'NEC RCBO is a GFCI device');
S = base('abyc', '1p120', {circuits:[ckt({prot:'RCBO', curve:'Std'})]}); ok(/GFCI/.test(run(S).c.c1.rcdMA), 'ABYC GFCI');

/* 6. type A needed for electronic loads */
const acOnly = X.BRK.find(b => b.id === 'leg-dx3-rcbo4b').id, aOk = X.BRK.find(b => b.id === 'sie-5sv1').id;
S = base('iec', '3p400', {rcboSel:acOnly, circuits:[ckt({type:'av', prot:'RCBO', curve:'C', phase:'3P', P:6000})]}); ok(has(run(S), /type AC only/, 'warn'), 'AC-only RCBO on AV load warns');
S = base('iec', '1p230', {rcboSel:aOk, circuits:[ckt({type:'av', prot:'RCBO', curve:'C'})]}); ok(!has(run(S), /type AC only/), 'type A RCBO accepted');
S = base('iec', '1p230', {circuits:[ckt({type:'ev', prot:'RCBO', P:7000})]}); ok(has(run(S), /DC detection/, 'info'), 'EV circuit notes DC detection');

/* 7. device standard and rated voltage */
S = base('nec', '1p120', {mcbSel:'sch-ic60n', circuits:[ckt()]}); ok(has(run(S), /IEC-type device/, 'warn'), 'NEC with IEC series warns');
S = base('iec', '1p230', {mcbSel:'abb-s200u', circuits:[ckt()]}); ok(has(run(S), /UL 489 device/, 'warn'), 'IEC with UL 489 series warns');
S = base('iec', '1p230', {mcbSel:'abb-s200', circuits:[ckt()]}); ok(!has(run(S), /UL 489 device|IEC-type device|rated 230\/400/), 'IEC with IEC series is clean');
S = base('iec', '3p480', {mcbSel:'abb-s200', circuits:[ckt()]}); ok(has(run(S), /rated 230\/400 V/, 'err'), 'IEC MCB on 480/277 V is an error');
S = base('iec', '3p415', {mcbSel:'abb-s200', circuits:[ckt({phase:'L1'})]}); ok(!has(run(S), /rated 230\/400/), 'IEC MCB on 415/240 V is fine');
S = base('as', '3p400', {mcbSel:'hag-nt', circuits:[ckt()]}); ok(!has(run(S), /rated 230\/400|IEC-type/), 'AS/NZS series fine');

/* 8. earth-fault loop impedance: Zs <= U0 / (k x In) */
S = base('iec', '1p230', {ze:0.35, circuits:[ckt({P:3000, pf:.95, size:2.5, len:50, prot:'MCB', curve:'C'})]}); R = run(S);
eq(R.c.c1.In, 16, 'C16 chosen'); near(R.c.c1.zsMax, 230 / (10 * 16), 'Zs max C16 = 1.44 ohm'); near(R.c.c1.zs, 0.35 + 2 * 0.02094 * 50 / 2.5, 'Zs = Ze + 2 rho L / S'); ok(!has(R, /loop impedance/), '50 m passes');
S = base('iec', '1p230', {ze:0.35, circuits:[ckt({P:3000, pf:.95, size:2.5, len:80, prot:'MCB', curve:'C'})]}); ok(has(run(S), /loop impedance .* above the 1\.44 ohm/, 'err'), '80 m on C16 fails Zs');
S = base('iec', '1p230', {ze:0.35, circuits:[ckt({P:3000, pf:.95, size:2.5, len:80, prot:'MCB', curve:'B'})]}); ok(!has(run(S), /loop impedance/), 'same run on B16 passes (limit 2.88 ohm)');
S = base('bs', '1p230', {ze:0.35, circuits:[ckt({P:3000, pf:.95, size:2.5, len:80, prot:'RCBO', curve:'C'})]}); ok(!has(run(S), /loop impedance/), 'RCBO circuit relies on the RCD');
S = base('nec', '1p120', {ze:0.5, circuits:[ckt({curve:'Std', len:300})]}); ok(!has(run(S), /loop impedance/), 'NEC has no Zs table');
S = base('iec', '1p230', {circuits:[ckt()]}); ok(has(run(S), /Enter the supply loop impedance/, 'info'), 'asks for Ze when blank');
S = base('iec', '1p230', {ze:0.3, circuits:[ckt()]}); ok(!has(run(S), /Enter the supply loop impedance/), 'no prompt once Ze set');

/* 9. motors on B curve */
S = base('iec', '1p230', {circuits:[ckt({type:'pump', curve:'B', P:1500, pf:.8})]}); ok(has(run(S), /starting current/, 'warn'), 'motor on B curve warns');
S = base('iec', '1p230', {circuits:[ckt({type:'pump', curve:'C', P:1500, pf:.8})]}); ok(!has(run(S), /starting current/), 'motor on C curve ok');

/* 10. phase current formulas by voltage */
S = base('iec', '3p400', {circuits:[ckt({P:9000, pf:1, phase:'3P', curve:'C'})]}); near(run(S).c.c1.Ib, 9000 / (3 * 230), '3-ph load 400 V', .001);
S = base('nec', '3p208', {circuits:[ckt({P:9000, pf:1, phase:'3P', curve:'Std'})]}); near(run(S).c.c1.Ib, 9000 / (3 * 120), '3-ph load 208 V', .001);
S = base('nec', '3p480', {circuits:[ckt({P:9000, pf:1, phase:'3P', curve:'Std'})]}); near(run(S).c.c1.Ib, 9000 / (3 * 277), '3-ph load 480 V', .001);
S = base('iec', '1p230', {circuits:[ckt({P:2300, pf:1})]}); near(run(S).c.c1.Ib, 10, '1-ph 230 V', .001);
S = base('nec', '1p240', {circuits:[ckt({P:2400, pf:1, curve:'Std'})]}); near(run(S).c.c1.Ib, 10, '1-ph 240 V', .001);

/* 11. the example board still computes and stays clean of new errors */
S = X.exampleProject(); R = run(S); ok(R.checks.filter(c => c.lvl === 'err').length === 0, 'example board has no errors');
console.log(`calc protection: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
