/* ========== DBoard Designer calculation core (no DOM) ========== */
const SQ3 = Math.sqrt(3);
/* standard main-breaker sizes: IEC 60898 / 60947 series, and NEC 240.6(A) standard sizes */
const INCOMER_IEC = [16,20,25,32,40,50,63,80,100,125,160,200,250,315,400,630];
const INCOMER_NEC = [15,20,25,30,35,40,45,50,60,70,80,90,100,110,125,150,175,200,225,250,300,350,400,450,500,600];
const STD = {
  iec:{n:'IEC 60364', ratings:[6,10,13,16,20,25,32,40,50,63,80,100,125], curves:['B','C','D'], vdL:4, vdO:4, cont:1, dp:false, icu:6, fam:'iec', zs:true, rcdMA:'30 mA', inc:INCOMER_IEC, tref:30,
    rcd:'IEC 60364-4-41 expects 30 mA RCD protection on socket-outlets and on circuits for portable equipment.'},
  bs:{n:'BS 7671', ratings:[6,10,16,20,25,32,40,50,63,80,100,125], curves:['B','C','D'], vdL:3, vdO:5, cont:1, dp:false, icu:6, fam:'iec', zs:true, rcdMA:'30 mA', inc:INCOMER_IEC, tref:30,
    rcd:'BS 7671 411.3.3 requires 30 mA RCD protection for socket-outlets rated up to 20 A and most final circuits in domestic premises.'},
  nec:{n:'NEC (NFPA 70)', ratings:[15,20,25,30,35,40,45,50,60,70,80,90,100,110,125], curves:['Std'], vdL:3, vdO:3, cont:1.25, dp:false, icu:10, fam:'ul', zs:false, rcdMA:'GFCI 4–6 mA', inc:INCOMER_NEC, tref:40,
    rcd:'NEC 210.8 and 210.12 call for GFCI and AFCI protection on many receptacle and branch circuits. Confirm the edition adopted locally.'},
  as:{n:'AS/NZS 3000', ratings:[6,10,13,16,20,25,32,40,50,63,80,100,125], curves:['B','C','D'], vdL:5, vdO:5, cont:1, dp:false, icu:6, fam:'iec', zs:true, rcdMA:'30 mA', inc:INCOMER_IEC, tref:30,
    rcd:'AS/NZS 3000 requires RCD protection on final subcircuits for socket-outlets and lighting.'},
  iso:{n:'ISO 13297 (marine AC)', ratings:[6,10,13,16,20,25,32,40,50,63,80,100,125], curves:['B','C','D'], vdL:3, vdO:5, cont:1, dp:true, icu:6, fam:'iec', zs:false, rcdMA:'30 mA', inc:INCOMER_IEC, tref:30,
    rcd:'Marine AC installations normally use double-pole switching and 30 mA RCD protection on final circuits. Confirm against class and flag rules.'},
  abyc:{n:'ABYC E-11 (marine AC)', ratings:[15,20,25,30,35,40,45,50,60,70,80,90,100,110,125], curves:['Std'], vdL:3, vdO:3, cont:1, dp:true, icu:10, fam:'ul', zs:false, rcdMA:'GFCI 4–6 mA', inc:INCOMER_NEC, tref:40,
    rcd:'ABYC E-11 expects GFCI protection on receptacles and double-pole branch protection. Confirm against the current edition.'}
};
const SYSTEMS = [
  {id:'1p230', label:'230 V · 1-ph · 50 Hz', phases:1, vLN:230, f:50},
  {id:'3p400', label:'400/230 V · 3-ph · 50 Hz', phases:3, vLN:230, f:50},
  {id:'3p415', label:'415/240 V · 3-ph · 50 Hz', phases:3, vLN:240, f:50},
  {id:'1p120', label:'120 V · 1-ph · 60 Hz', phases:1, vLN:120, f:60},
  {id:'1p240', label:'240 V · 1-ph · 60 Hz', phases:1, vLN:240, f:60},
  {id:'3p208', label:'208/120 V · 3-ph · 60 Hz', phases:3, vLN:120, f:60},
  {id:'3p480', label:'480/277 V · 3-ph · 60 Hz', phases:3, vLN:277, f:60},
  {id:'dc12', label:'12 V DC (low voltage)', phases:1, vLN:12, f:0, lv:true, dc:true},
  {id:'dc24', label:'24 V DC (low voltage)', phases:1, vLN:24, f:0, lv:true, dc:true},
  {id:'dc48', label:'48 V DC (low voltage)', phases:1, vLN:48, f:0, lv:true, dc:true},
  {id:'ac24', label:'24 V AC (low voltage)', phases:1, vLN:24, f:50, lv:true}
];
const LV_RATINGS = [1,2,3,4,5,6,8,10,13,16,20,25,32,40,50,63,80,100,125,160,200,250];
const sysOf = S => SYSTEMS.find(x => x.id === S.sysId) || SYSTEMS[1];
const isLV = S => !!sysOf(S).lv, isDC = S => !!sysOf(S).dc;
/* 240 V loads on a 60 Hz North American supply sit between two hot legs, so the breaker is 2-pole */
const dpOf = S => isLV(S) ? (isDC(S) ? S.dcPoles !== '1P' : true) : (STD[S.std].dp || (S.sysId === '1p240' && STD[S.std].fam === 'ul'));
/* pole text for a circuit device */
const polesOf = (S, prot, thr) => isLV(S) ? (dpOf(S) ? '2P' : '1P') + (isDC(S) ? ' DC' : '') : thr ? (prot === 'RCBO' ? '3P+N' : '3P') : (S.sysId === '1p240' && STD[S.std].fam === 'ul') ? '2P' : prot === 'RCBO' ? '1P+N' : dpOf(S) ? '2P' : '1P';
const ratingsOf = S => isLV(S) ? LV_RATINGS : STD[S.std].ratings;
const vdDef = S => isLV(S) ? {l:3, o:10} : {l:STD[S.std].vdL, o:STD[S.std].vdO};
const TYPES = {
  lighting:{l:'Lighting', pf:.95, min:1.5, rcd:false, curve:'B'},
  sockets:{l:'Socket outlets', pf:.95, min:2.5, rcd:true, curve:'B'},
  av:{l:'AV / electronics', pf:.9, min:1.5, rcd:true, curve:'C'},
  hvac:{l:'HVAC / pump', pf:.85, min:2.5, rcd:false, curve:'C'},
  ac:{l:'Air conditioning', pf:.85, min:2.5, rcd:false, curve:'C'},
  fan:{l:'Fan / ventilation', pf:.85, min:1.5, rcd:false, curve:'C'},
  motor:{l:'Motor', pf:.8, min:2.5, rcd:false, curve:'D'},
  pump:{l:'Water pump', pf:.8, min:2.5, rcd:false, curve:'C'},
  winch:{l:'Winch / thruster', pf:.8, min:4, rcd:false, curve:'D'},
  heater:{l:'Heater / boiler', pf:1, min:2.5, rcd:false, curve:'B'},
  galley:{l:'Galley / appliance', pf:.95, min:2.5, rcd:true, curve:'C'},
  cooker:{l:'Cooker / oven', pf:1, min:2.5, rcd:true, curve:'B'},
  fridge:{l:'Refrigeration', pf:.8, min:1.5, rcd:false, curve:'C'},
  laundry:{l:'Washer / dryer', pf:.9, min:2.5, rcd:true, curve:'C'},
  waterheater:{l:'Water heater', pf:1, min:2.5, rcd:true, curve:'B'},
  trace:{l:'Trace / underfloor heating', pf:1, min:1.5, rcd:true, curve:'B'},
  outdoor:{l:'Outdoor / deck sockets', pf:.95, min:2.5, rcd:true, curve:'B'},
  pool:{l:'Pool / spa equipment', pf:.85, min:2.5, rcd:true, curve:'C'},
  ev:{l:'EV charger', pf:1, min:4, rcd:true, curve:'B'},
  charger:{l:'Battery charger', pf:.8, min:2.5, rcd:true, curve:'C'},
  inverter:{l:'Inverter / UPS', pf:.9, min:4, rcd:true, curve:'C'},
  network:{l:'Networking / IT', pf:.95, min:1.5, rcd:true, curve:'C'},
  bilge:{l:'Bilge / sump pump', pf:.8, min:1.5, rcd:false, curve:'C'},
  workshop:{l:'Workshop / power tools', pf:.85, min:2.5, rcd:true, curve:'C'},
  nav:{l:'Navigation equipment', pf:.95, min:1.5, rcd:false, curve:'C'},
  comms:{l:'Communications', pf:.95, min:1.5, rcd:false, curve:'B'},
  security:{l:'Security / alarm', pf:.9, min:1.5, rcd:false, curve:'B'},
  emergency:{l:'Emergency lighting', pf:.95, min:1.5, rcd:false, curve:'B'},
  subboard:{l:'Sub-board feed', pf:.9, min:6, rcd:false, curve:'C'},
  critical:{l:'Critical (nav, bilge, comms)', pf:1, min:1.5, rcd:false, curve:'C'},
  other:{l:'Other', pf:.95, min:1.5, rcd:false, curve:'B'}
};
/* Load classes used by the protection rules.
   CONT_T: loads that run 3 h or more, so the NEC 125 % continuous-load rule applies (NEC 210.20, 215.2, 422.13).
   MOT_T: motor-type loads with starting current, where a B curve can trip on inrush.
   RCDA_T: loads with electronic or rectified current, which need a type A (pulsating DC sensitive) RCD (IEC 60364-5-53, BS 7671 531.3.3). */
const CONT_T = ['lighting','emergency','heater','waterheater','trace','ev','charger','inverter','network','nav','comms','security','critical','av'];
const MOT_T = ['hvac','ac','fan','motor','pump','winch','fridge','laundry','pool','bilge','workshop'];
const RCDA_T = ['av','network','charger','inverter','ev','laundry','ac','cooker','galley','pool'];
Object.keys(TYPES).forEach(k => { TYPES[k].ct = CONT_T.includes(k); TYPES[k].mot = MOT_T.includes(k); TYPES[k].ta = RCDA_T.includes(k); });
/* MCB magnetic trip upper limit as a multiple of In (IEC 60898-1: B 5, C 10, D 20) */
const TRIPK = {B:5, C:10, D:20};
/* breaker thermal derating inside the enclosure: 0.6 % per K above the calibration temperature (generic figure, series data sheets differ) */
const kTemp = S => { const t = num(S.cabinAmb, 30), ref = STD[S.std].tref || 30; return t > ref ? Math.max(0.6, 1 - 0.006 * (t - ref)) : 1; };
const stdFam = ser => !ser ? null : /UL ?(489|1077)/.test(ser.std || '') ? 'ul' : 'iec';
const rcdAcOnly = ser => { const m = ser && ser.rcd ? ser.rcd.match(/type (.*)$/i) : null; return !!m && !/\bA\b/.test(m[1]); };
const SZ = [1.5,2.5,4,6,10,16,25,35,50,70,95,120,150,185,240];
/* Cu, reference method C, 30 C ambient. Indicative values: verify against the edition you design to. */
const AMP = {
  pvc:{2:[19.5,27,36,46,63,85,112,138,168,213,258,299,344,392,461], 3:[17.5,24,32,41,57,76,101,125,151,192,232,269,309,353,415]},
  xlpe:{2:[24,33,45,58,80,107,138,171,209,269,328,382,441,506,599], 3:[22,30,40,52,71,96,119,147,179,229,278,322,371,424,500]}
};
const INCOMER_RATINGS = INCOMER_IEC;
const incRatings = S => isLV(S) ? LV_RATINGS.concat([315, 400, 630]) : (STD[S.std].inc || INCOMER_IEC);
const pick = (arr, x) => { const v = arr.find(r => r >= x - 1e-9); return v == null ? null : v; };
const num = (x, d) => (x === '' || x == null || isNaN(+x)) ? d : +x;
const BTU_W = 0.29307;

/* [model, family, line, volt, vmin, vmax, din, zones, inA, zoneA, zoneW, btu, g, amb, power, note, src] */
const L = (model,fam,line,volt,vmin,vmax,din,zones,inA,zoneA,zoneW,btu,g,amb,power,note,src)=>({model,fam,line,volt,vmin,vmax,din,zones,inA,zoneA,zoneW,btu,g,amb,power,note,src});
const AN = 'https://assets.lutron.com/a/documents/048466.pdf';
const LIB = [
 L('LQSE-4A-D','Phase-adaptive dimming','HomeWorks QS','230 V',220,240,12,4,10,null,[800,500,500,500],75,647,50,1,'4-zone phase-adaptive. Zone limits 800/500/500/500 W as shown in App Note #466. Needs 150 mm rail pitch.','https://assets.lutron.com/a/documents/369583_eng.pdf'),
 L('LQSE-4A-120-D','Phase-adaptive dimming','HomeWorks QS','120 V',100,127,12,4,10,null,[400,250,250,250],75,647,50,1,'4-zone phase-adaptive, 120 V. Zone limits 400/250/250/250 W as shown in the spec sheet.',AN),
 L('LQSE-4A5-120-D','Phase-adaptive dimming','HomeWorks QS','120 V',100,127,12,4,16,null,null,75,633,50,1,'PRO LED+ phase-adaptive, 120 V. Input rating taken from a distributor listing; confirm on the Lutron spec sheet.',AN),
 L('LQSE-4A5-230-D','Phase-adaptive dimming','HomeWorks QS','220–240 V',220,240,12,4,10,null,null,75,633,60,1,'PRO LED+ phase-adaptive. 216 mm wide, 10 A max input, 60 C max enclosure ambient.',AN),
 L('QSNE-4A-D','Phase-adaptive dimming','QS','230 V',220,240,12,4,10,null,[800,500,500,500],75,647,50,1,'Same footprint and heat as LQSE-4A-D. Voltage assumed from the 230 V derating notes.',AN),
 L('QSNE-4A5-230-D','Phase-adaptive dimming','QS','220–240 V',220,240,12,4,10,null,null,75,633,60,1,'Phase-adaptive, 230 V.',AN),
 L('QSN-4A5-D','Phase-adaptive dimming','QS','See spec',null,null,12,4,null,null,null,75,633,60,1,'Voltage not listed in App Note #466. Check the spec sheet.',AN),
 L('LQSE-4A1-D','Phase-adaptive dimming','HomeWorks QS','120–240 V',100,240,9,4,null,null,null,35,401,50,1,'Compact 4-zone phase-adaptive. Derate 25 W (120 V) or 50 W (240 V) per zone at 30–40 C room ambient.',AN),
 L('MQSE-4A1-D','Phase-adaptive dimming','myRoom','120–240 V',100,240,9,4,null,null,null,35,401,50,1,'myRoom 4-zone phase-adaptive.',AN),
 L('MQSE-3A1-D','Phase-adaptive dimming','myRoom','120–240 V',100,240,9,3,null,null,null,30,401,50,1,'myRoom 3-zone phase-adaptive.',AN),
 L('MQSE-2A1-D','Phase-adaptive dimming','myRoom','120–240 V',100,240,9,2,null,null,null,25,401,50,1,'myRoom 2-zone phase-adaptive.',AN),
 L('LQSE-4T10-D','0–10 V / switching','HomeWorks QS','230 V',220,240,9,4,null,10,null,4,371,55,1,'4 switched outputs at 10 A each plus 4 x 0–10 V control outputs.','https://assets.lutron.com/a/documents/369583_eng.pdf'),
 L('LQSE-4T5-120-D','0–10 V / switching','HomeWorks QS','120 V',100,127,9,4,null,5,null,4,371,55,1,'4 switched outputs at 5 A each plus 4 x 0–10 V control outputs.','https://www.lutron.com/TechnicalDocumentLibrary/3691054_ENG.pdf'),
 L('QSN-4T5-120-D','0–10 V / switching','QS','120 V',100,127,9,4,null,5,null,4,371,55,1,'QS version of the 4T5 module.',AN),
 L('QSNE-4T10-D','0–10 V / switching','QS','230 V',220,240,9,4,null,10,null,4,371,50,1,'0–10 V module, 50 C max enclosure ambient.',AN),
 L('QSNE-4T10-230-D','0–10 V / switching','QS','230 V',220,240,9,4,null,10,null,4,371,50,1,'0–10 V module, 230 V.',AN),
 L('LQSE-4T20-120-D','0–10 V / switching','HomeWorks QS','120 V',100,127,12,4,null,20,null,4,499,55,1,'4 x 20 A outputs with 0–10 V control.',AN),
 L('QSN-4T20-D','0–10 V / switching','QS','See spec',null,null,12,4,null,20,null,4,499,55,1,'20 A 0–10 V module. Voltage not listed in App Note #466.',AN),
 L('LQSE-4P20-D','Phase control / 20 A','HomeWorks QS','See spec',null,null,12,4,null,20,null,4,499,55,1,'20 A phase-control module. Check the spec sheet for supply voltage.',AN),
 L('QSN-4P20-D','Phase control / 20 A','QS','See spec',null,null,12,4,null,20,null,4,499,55,1,'20 A phase-control module.',AN),
 L('QSN-4S20-D','Switching','QS','See spec',null,null,12,4,null,20,null,4,499,55,1,'20 A switching module.',AN),
 L('LQSE-4S10-D','Switching','HomeWorks QS','230 V',220,240,9,4,null,10,null,4,371,55,1,'Latching-relay switching module, 50 mA control draw.','https://formwave.ie/products/lutron-homeworks-switching-power-module'),
 L('QSNE-4S10-D','Switching','QS','230 V',220,240,9,4,null,10,null,4,371,50,1,'Switching module, 50 C max enclosure ambient.',AN),
 L('LQSE-4S8-120-D','Switching','HomeWorks QS','120 V',100,127,9,4,16,8,null,24,309,50,1,'8 A per zone, 16 A max per module, 1/3 HP motor per zone. 161.7 mm wide.','https://assets.lutron.com/a/documents/3691060_eng.pdf'),
 L('QSN-4S8-120-D','Switching','QS','120 V',100,127,9,4,16,8,null,24,309,50,1,'QS version of the 4S8 module.',AN),
 L('LQSE-4S5-230-D','Switching','HomeWorks QS','220–240 V',220,240,9,4,16,null,null,24,309,50,1,'16 A max input, 1/2 HP motor loads, adaptive zero-cross switching.','https://assets.lutron.com/a/documents/3691061_ENG.pdf'),
 L('LQSE-4S5-120-D','Switching','HomeWorks QS','120 V',100,127,9,4,16,null,null,24,309,50,1,'120 V version of the 4S5 module.',AN),
 L('QSNE-4S5-230-D','Switching','QS','220–240 V',220,240,9,4,16,null,null,24,309,50,1,'QS 230 V switching module.',AN),
 L('QSNE-4S5-120-D','Switching','QS','120 V',100,127,9,4,16,null,null,24,309,50,1,'QS 120 V switching module.',AN),
 L('LQSE-4S1-D','Switching','HomeWorks QS','120–240 V',100,240,9,4,4,1,null,24,309,50,1,'Low-current 4-zone switching, 1 A per zone, 4 A max input. Width not in App Note #466; 9 modules assumed.','https://assets.lutron.com/a/documents/369844.pdf'),
 L('MQSE-4S1-D','Switching','myRoom','120–240 V',100,240,9,4,4,1,null,24,309,50,1,'myRoom 4-zone switching.',AN),
 L('MQSE-3S1-D','Switching','myRoom','120–240 V',100,240,9,3,4,1,null,24,309,50,1,'myRoom 3-zone switching.',AN),
 L('MQSE-2S1-D','Switching','myRoom','120–240 V',100,240,9,2,4,1,null,24,309,50,1,'myRoom 2-zone switching.',AN),
 L('LQSE-4M-D','Motor control','HomeWorks QS','See spec',null,null,9,4,null,null,null,5,360,55,1,'4 raise/lower motor outputs.',AN),
 L('LQSE-4M-120-D','Motor control','HomeWorks QS','120 V',100,127,9,4,null,null,null,5,360,55,1,'4 raise/lower motor outputs, 120 V.',AN),
 L('QSE-CI-4M-D','Motor control','QS','See spec',null,null,9,4,null,null,null,5,360,55,1,'Motor control interface.',AN),
 L('LQSE-2DAL-D','DALI','HomeWorks QS','120/230 V',100,240,9,0,0.08,null,null,24,272,55,0,'2 DALI buses, 64 devices each. Control power 80 mA at 230 V, 120 mA at 120 V.','https://www.lutron.com/TechnicalDocumentLibrary/369-650_ENG.pdf'),
 L('QSNE-2DAL-D','DALI','QS','See spec',null,null,9,0,null,null,null,24,299,55,0,'2 DALI buses.',AN),
 L('LQSE-1DAL2-D','DALI','HomeWorks QS','See spec',null,null,9,0,null,null,null,24,272,55,0,'DALI power module.',AN),
 L('LQSE-2DALUNV-D','DALI','HomeWorks QS','Universal',100,277,9,0,null,null,null,24,272,55,0,'2-bus universal-voltage DALI.',AN),
 L('QSN-2DALUNV-D','DALI','QS','Universal',100,277,9,0,null,null,null,24,272,55,0,'2-bus universal-voltage DALI.',AN),
 L('QSN2-1DALUNV-D','DALI','QS','Universal',100,277,9,0,null,null,null,24,272,55,0,'1-bus universal-voltage DALI.',AN),
 L('QSN2-2DALUNV-D','DALI','QS','Universal',100,277,9,0,null,null,null,24,272,55,0,'2-bus universal-voltage DALI.',AN),
 L('LQSE2-1DALUNV-D','DALI','HomeWorks QS','Universal',100,277,9,0,null,null,null,24,272,55,0,'1-bus universal-voltage DALI.',AN),
 L('LQSE2-2DALUNV-D','DALI','HomeWorks QS','Universal',100,277,9,0,null,null,null,24,272,55,0,'2-bus universal-voltage DALI.',AN),
 L('LQSE-2ECO-D','EcoSystem','HomeWorks QS','See spec',null,null,9,0,null,null,null,24,272,55,0,'2 EcoSystem links, 64 ballasts/drivers each.',AN),
 L('QSNE-2ECO-D','EcoSystem','QS','See spec',null,null,9,0,null,null,null,24,272,55,0,'2 EcoSystem links.',AN),
 L('LQSE-2HDC-D','Digital (HomeWorks)','HomeWorks QS','120 V',100,127,9,0,null,null,null,24,272,55,0,'HomeWorks digital power module, 128 mA per bus. For Lutron PD-series panels only.','https://assets.lutron.com/a/documents/3691217.pdf'),
 L('QSPS-DH-1-75','Power supply','QS','100–277 V',100,277,5,0,null,null,null,28,290,55,0,'QS link power supply, 5 modules wide. The -H variant has the same footprint.',AN),
 L('QSPS-DH-1-75-H','Power supply','QS','100–277 V',100,277,5,0,null,null,null,28,290,55,0,'QS link power supply, 100–277 V input.',AN),
 L('MQSPS-DH-1-30','Power supply','myRoom','120–240 V',100,240,2,0,null,null,null,12,148,50,0,'myRoom 24 V 1 A supply, 30 PDU. 1.25 modules wide, rounded up to 2. Needs MQSPS-BRK bracket in 60–100 mm deep enclosures.',AN),
 L('HQP7-1','QSX processor','HomeWorks QSX','24–36 V DC',24,36,6,0,null,null,null,15,0,40,0,'QSX processor, 1 link. Powered from a QSPS-DH-1-75-H supply (24–36 V DC, 250 mA, 4.2 W typical). 99 QS devices / 512 switch legs. Width taken from the 108 mm body, about 6 modules, so confirm the fit on the panel plate.','https://assets.lutron.com/a/documents/3691127_eng.pdf'),
 L('HQP7-2','QSX processor','HomeWorks QSX','24–36 V DC',24,36,6,0,null,null,null,15,0,40,0,'QSX processor, 2 links. Same body and supply as HQP7-1. Two RJ45 Ethernet ports, RS485. 108 mm wide, about 6 modules.','https://assets.lutron.com/a/documents/3691127_eng.pdf'),
 L('HQP7-MDU-1','QSX processor','HomeWorks QSX','24–36 V DC',24,36,6,0,null,null,null,15,0,40,0,'QSX processor for multi-dwelling projects, 1 link. 50 devices / 100 switch legs.','https://assets.lutron.com/a/documents/3691127_eng.pdf'),
 L('HQP7-MDU-2','QSX processor','HomeWorks QSX','24–36 V DC',24,36,6,0,null,null,null,15,0,40,0,'QSX processor for multi-dwelling projects, 2 links. 50 devices / 100 switch legs.','https://assets.lutron.com/a/documents/3691127_eng.pdf'),
 L('HQP7-RF-2','QSX processor','HomeWorks QSX','PoE 48 V',48,48,0,0,null,null,null,null,0,40,0,'Wireless processor, powered over PoE (802.3af/at/bt, 100 mA). Recess, junction box or shelf mount. Not for a metal enclosure, so it does not take a DIN position. 100 Clear Connect Type X devices.','https://assets.lutron.com/a/documents/3691222_eng.pdf'),
 L('HQP7-RF','QSX gateway','HomeWorks QSX','See spec',null,null,0,0,null,null,null,null,0,40,0,'Clear Connect Type X gateway for the QSX system. Wireless, mounted outside the metal enclosure. Ratings not confirmed, check the spec sheet.','https://assets.lutron.com/a/documents/Homeworks_QSX_Equipment.pdf'),
 L('QSE-IO','Interface / IO','QS','24 V DC',24,24,null,0,null,null,null,null,0,40,0,'Contact closure interface, installed in a control panel compartment. DIN width, input count and heat are not stated in the sources found, check the spec sheet.','https://assets.lutron.com/a/documents/3691055_eng.pdf'),
 L('QSE-CI-DMX','Interface / IO','QS','24 V DC',24,24,null,0,null,null,null,null,0,40,0,'DMX interface for the QS link. Installed in a control panel compartment. Width and heat not stated in the sources found, check the spec sheet.','https://assets.lutron.com/a/documents/369641_ENG.pdf'),
 L('QSE-CI-NWK-E','Interface / IO','QS','24 V DC',24,24,null,0,null,null,null,null,0,40,0,'QS Ethernet network interface. Not listed in the DIN panel spec, so check how it is mounted.','https://assets.lutron.com/a/documents/3691193_eng.pdf'),
 L('QSE-CI-WCI','Interface / IO','QS','24 V DC',24,24,null,0,null,null,null,null,0,40,0,'Wallbox closure interface. Not listed in the DIN panel spec, so check how it is mounted.','https://assets.lutron.com/a/documents/3691193_eng.pdf'),
 L('QS-WLB','Wire landing board','QS','24 V DC',24,24,null,0,null,null,null,0,0,40,0,'Wire landing board for QS link wiring. One is included with each PD panel. It sits on the panel plate, not on a DIN rail.','https://assets.lutron.com/a/documents/3691055_eng.pdf')
];
const PANELS = [
 {model:'PD4-16-F', note:'Dimming / switching panel, up to 4 DIN power modules (or 3 plus one QSPS supply). 120–240 V.', dims:'', src:'https://assets.lutron.com/a/documents/369867.pdf'},
 {model:'PD5-36F-120', note:'36 in satellite panel with DIN power modules and EcoSystem controllers.', dims:'', src:'https://assets.lutron.com/a/documents/369783_eng.pdf'},
 {model:'PD9-59F-120', note:'59 in satellite panel with DIN power modules and EcoSystem controllers.', dims:'1500 x 385 x 110.5 mm', src:'https://assets.lutron.com/a/documents/Homeworks_QSX_Equipment.pdf'},
 {model:'PD8-65A-120L3-15', note:'120/240 V 1-ph 3-wire DIN breaker panel with 15 A AFCI breakers.', dims:'1651 x 403 x 100 mm', src:'https://assets.lutron.com/a/documents/Homeworks_QSX_Equipment.pdf'},
 {model:'PD8-65A-120L3-20', note:'120/240 V 1-ph 3-wire DIN breaker panel with 20 A AFCI breakers.', dims:'', src:'https://assets.lutron.com/a/documents/Homeworks_QSX_Equipment.pdf'},
 {model:'PD8-65A-120L4-15', note:'120/208 V 3-ph 4-wire DIN breaker panel with 15 A AFCI breakers.', dims:'1651 x 403 x 100 mm', src:'https://assets.lutron.com/a/documents/Homeworks_QSX_Equipment.pdf'},
 {model:'PD6-42T-DV', note:'120 V DIN rail panel with terminal blocks.', dims:'', src:'https://assets.lutron.com/a/documents/Homeworks_QSX_Equipment.pdf'},
 {model:'HQ-LV21-120', note:'HomeWorks QS low-voltage enclosure.', dims:'533 x 365 x 104 mm', src:'https://assets.lutron.com/a/documents/Homeworks_QSX_Equipment.pdf'},
 {model:'HWBP-2S-xx-120Lx', note:'Control power panel with 8 branch circuit breakers and module interfaces.', dims:'', src:AN},
 {model:'HWI-PNL-5', note:'Feed-through panel enclosure with module interfaces.', dims:'', src:AN}
];

/* ---- Crestron DIN Rail (specs read from crestron.com product pages) ---- */
const CR = 'https://www.crestron.com/Products/Catalog/';
const CRL = CR + 'Lighting-and-Environmental/Integrated-Lighting-Systems/DIN-Modules/';
const CRC = 'Crestron DIN Rail';
LIB.push(
 L('DIN-AP4','Control processor',CRC,'24 V DC or PoE',24,24,9,0,null,null,null,33,null,45,0,'4-Series DIN rail control processor. 8 Versiport I/O, 4 IR/serial, 4 relays (1 A at 30 V), 2 COM ports, 2 Cresnet master ports, LAN with PoE, SD slot. 9.7 W; 5 to 45 C. 24 V DC power pack is sold separately.',CR + 'Control-and-Management/Control-System/DIN-Rail/DIN-AP4'),
 L('DIN-IO8','Interface / IO',CRC,'24 V DC (Cresnet)',24,24,6,0,null,null,null,5,null,40,0,'8 Versiport ports, each a digital or analog input or a digital output (250 mA sink). 1.5 W from Cresnet.',CRL + 'DIN-IO8'),
 L('DIN-8SW8-I','Switching',CRC,'120–240 V AC',100,240,9,8,null,16,null,18,null,40,1,'8 relay channels, 16 A resistive, 10 A incandescent, 5 A fluorescent and 0.5 HP motor per channel; module totals 80 A incandescent, 40 A fluorescent. 8 isolated inputs. 5.4 W from Cresnet. Channels are wired individually, so this tool models one shared feed.',CRL + 'DIN-8SW8-I'),
 L('DIN-1DIMU4','Dimming',CRC,'120–240 V AC',100,240,12,4,10,5,[1150,1150,1150,1150],60,null,40,1,'4 universal dimmer channels from one live feed. 5 A per channel, 10 A per module; 1150 W per channel at 230 V. 60 BTU/hr at 240 V.',CRL + 'DIN-1DIMU4'),
 L('DIN-4DIMFLV4','Dimming',CRC,'120–240 V AC',100,240,9,4,20,5,null,17,null,40,1,'4 dimming outputs (0 to 10 V control) with 4 isolated relays. Module total 20 A; the channel limit here is the 5 A lighting rating (relays are 16 A resistive). 4.2 W from Cresnet.',CRL + 'DIN-4DIMFLV4'),
 L('DIN-2MC2','Motor control',CRC,'120–240 V AC',100,240,6,2,null,null,null,10,null,40,1,'2 motor channels, 0.5 HP each and 1 HP per module at 240 V. 3 W from Cresnet.',CRL + 'DIN-2MC2'),
 L('DIN-DALI-2','DALI gateway',CRC,'24 V DC (Cresnet) or PoE',24,24,9,0,null,null,null,44,null,40,0,'Two DALI loops of 64 drivers each (128 total). Listed as discontinued on the Crestron site, shown for existing projects. 9 W with internal DALI power.',CRL + 'DIN-DALI-2'),
 L('DIN-PWS60','Power supply',CRC,'100–277 V AC in, 24 V DC 60 W out',100,277,6,0,1.1,null,null,26,null,null,0,'24 V DC, 60 W Cresnet power supply (replaces DIN-PWS50). Input 1.1 A at 120 V, 0.65 A at 230 V.','https://www.crestron.com/Products/Catalog/Lighting-and-Environmental/Power-Supplies/Cresnet-Power-Supplies/DIN-PWS60'),
 L('DIN-HUB','Network / distribution',CRC,'24 V DC (Cresnet)',24,24,6,0,null,null,null,2,null,40,0,'3-segment Cresnet hub for networks with more than 20 devices. No programming needed.','https://www.crestron.com/Products/Catalog/Control-and-Management/Control-System/DIN-Rail/DIN-HUB'),
 L('DIN-BLOCK','Network / distribution',CRC,'24 V DC (Cresnet)',24,24,6,0,null,null,null,1,null,40,0,'12 Cresnet distribution ports in two groups of 6, 75 W (3.13 A at 24 V) per group.','https://www.crestron.com/Products/Catalog/Control-and-Management/Control-System/DIN-Rail/DIN-BLOCK'),
 L('DIN-CENCN-2','Network / distribution',CRC,'24 V DC (Cresnet)',24,24,null,0,null,null,null,null,null,null,0,'Ethernet to Cresnet bridge. Width and heat not confirmed here; check the Crestron spec sheet.','https://www.crestron.com/Products/Catalog/Control-and-Management/Control-System/DIN-Rail/DIN-CENCN-2')
);
LIB.forEach(l => { if (l.brand === undefined && l.line === CRC) l.brand = 'Crestron'; });

/* ---- Control4 DIN-Rail (specs read from docs.control4.com data sheets) ---- */
const C4 = 'Control4 DIN-Rail', C4D = 'https://docs.control4.com/docs/product/';
LIB.push(
 L('C4-DIN-8RELSW-E','Switching',C4,'100–277 V AC',100,277,12,8,null,16,null,10,null,40,1,'8 relay channels on 4 line feeds, 16 A per channel at 120, 240 and 277 V, motors 1 HP at 120 V and 2 HP at 240 V, module maximum 64 A. 3.5 W, Ethernet control. Heat is 10 BTU/hr at 120 V. This tool models one shared feed.',C4D + '8-channel-relay/data-sheet/english/latest/8-channel-relay-data-sheet-rev-f.pdf'),
 L('C4-DIN-8DIM-E','Dimming',C4,'100–277 V AC',100,277,12,8,null,null,null,175,null,40,1,'8-channel dimmer, 2 line feeds. Per channel up to 1000 W at 120 V, 2000 W at 240 V and 2300 W at 277 V dimmable (half that for non-dimmable loads). Module total 6000 W at 240 V in a Control4 panel, 3840 W in a standard DIN panel. 4 W, Ethernet control.',C4D + '8-channel-dimmer/data-sheet/english/revision/D/8-channel-dimmer-data-sheet-rev-d.pdf'),
 L('C4-DIN-8APD-E','Phase-adaptive dimmer',C4,'100–277 V AC',100,277,12,8,null,null,null,175,null,40,1,'8-channel adaptive phase dimmer. Per channel up to 1000 W at 120 V, 2000 W at 240 V incandescent or halogen, and 200 W for LED loads. 5 W, 175 BTU/hr at 120 V.',C4D + '8-channel-dimmer-277v/data-sheet/english/latest/8-channel-dimmer-277v-data-sheet-rev-a.pdf'),
 L('C4-DIN-8TV-E','0–10 V dimmer',C4,'100–277 V AC',100,277,12,8,null,null,null,9,null,40,0,'8-channel 0 to 10 V dimmer. Each channel sinks up to 100 mA (about 50 ballasts) or sources 25 mA. Controls ballasts and drivers only, loads are switched elsewhere. 2.5 W, Ethernet control.',C4D + '8-channel-0-10v-dimmer/data-sheet/english/latest/8-channel-0-10v-dimmer-data-sheet-rev-b.pdf'),
 L('C4-DIN-8ESW-E','Network / distribution',C4,'110–277 V AC',110,277,12,0,null,null,null,7,null,40,0,'8-port 10/100 Ethernet switch for the other panel modules. 2 W, 7 BTU/hr at 120 V.','https://cn.control4.com/docs/product/8-port-ethernet-switch/data-sheet/english/latest'),
 L('C4-DIN-BEG-V2','Interface / IO',C4,'24–48 V DC',24,48,6,0,null,null,null,4.7,null,40,0,'Bus Ethernet gateway: connects wired keypads on the RS-485 bus and converts to Ethernet. 1 W.',C4D + 'bus-ethernet-gateway/data-sheet/english/latest/bus-ethernet-gateway-data-sheet-rev-c.pdf'),
 L('C4-DIN-BPS48','Power supply',C4,'100–277 V AC in, 48 V bus out',100,277,6,0,1.25,null,null,151,null,40,0,'48 V bus power supply for wired keypads and RS-485 bus devices. Input 1.0 A at 120 V, 0.6 A at 240 V. 151 BTU/hr at 120 V.',C4D + 'bus-power-supply-48v/data-sheet/english/latest/bus-power-supply-48v-data-sheet-rev-d.pdf')
);
LIB.forEach(l => { if (l.brand === undefined && l.line === C4) l.brand = 'Control4'; });

/* ---- MDT KNX DIN rail (MDT product list and price list, 1 module = 18 mm) ---- */
const MDTL = 'https://www.mdt.de/download/MDT_Productlist_EN.pdf', MDTP = 'https://www.mdt.de/fileadmin/user_upload/user_upload/download/MDT_Pricelist.pdf';
const KX = (model, fam, din, zones, zoneA, power, note, o = {}) => Object.assign(L(model, fam, 'KNX · MDT', o.volt || 'Bus 30 V DC', o.vmin === undefined ? 30 : o.vmin, o.vmax === undefined ? 30 : o.vmax, din, zones, null, zoneA, null, null, null, null, power, note, o.src || MDTL), {brand: 'MDT KNX'});
const KXM = {volt: '230 V AC load, bus 30 V DC', vmin: null, vmax: null};
const sw = (ch, a, din, kind) => KX(`AKS-${String(ch).padStart(2, '0')}${a}.03`, 'KNX switch actuator', din, ch, a, 1, `${ch}-channel switch actuator, ${a} A per channel, 140 µF. ${kind || ''}Heat not listed.`.trim(), KXM);
[[4,10,4],[8,10,6],[12,10,8],[4,16,4],[8,16,6],[12,16,8],[16,16,8],[24,16,12]].forEach(r => LIB.push(sw(r[0], r[1], r[2])));
[[4,2],[8,4],[16,8],[24,12]].forEach(r => LIB.push(KX(`AKK-${String(r[0]).padStart(2, '0')}16.03`, 'KNX switch actuator', r[1], r[0], 16, 1, `Compact ${r[0]}-channel switch actuator, 16 A ohmic, 70 µF. ${r[0] >= 8 ? 'Bus powered.' : ''} Heat not listed.`, KXM)));
[[8,4],[16,8]].forEach(r => LIB.push(KX(`AKU-${String(r[0]).padStart(2, '0')}16.03`, 'KNX universal actuator', r[1], r[0], 16, 1, `Universal ${r[0]}-channel actuator (switch or shutter), 16 A ohmic, 100 µF. Heat not listed.`, KXM)));
LIB.push(
 KX('JAL-0410.02','KNX shutter actuator',4,4,8,1,'4-channel shutter actuator, 230 V AC motors, 8 A and 300 W per channel.',KXM),
 KX('JAL-0810.02','KNX shutter actuator',8,8,8,1,'8-channel shutter actuator, 230 V AC motors, 8 A and 300 W per channel.',KXM),
 KX('JAL-0410D.02','KNX shutter actuator',4,4,8,1,'4-channel shutter actuator for 24 V DC motors, 8 A and 180 W per channel, with pole-changing circuit.',{volt:'24 V DC load, bus 30 V DC',vmin:null,vmax:null}),
 KX('JAL-0810D.02','KNX shutter actuator',8,8,8,1,'8-channel shutter actuator for 24 V DC motors, 8 A and 180 W per channel, with pole-changing circuit.',{volt:'24 V DC load, bus 30 V DC',vmin:null,vmax:null}),
 KX('AKD-0201.02','KNX dimming actuator',3,2,null,1,'2-channel 230 V dimmer, 250 W per channel, 500 W with both channels in parallel.',KXM),
 KX('AKD-0401.02','KNX dimming actuator',6,4,null,1,'4-channel 230 V dimmer, 250 W per channel, 500 W with two channels in parallel.',KXM),
 KX('AKD-0410V.02','KNX dimming actuator',4,4,16,1,'4-channel 1 to 10 V control device with 16 A relay outputs, 140 µF.',KXM),
 KX('AKD-0424R2.02','KNX dimming actuator',2,4,null,0,'4-channel constant-voltage LED controller, 12/24 V, 2 A or 4 A per channel.',{volt:'12/24 V DC LED load',vmin:null,vmax:null}),
 KX('AKD-0424R.02','KNX dimming actuator',4,4,null,0,'4-channel constant-voltage LED controller, 12/24 V, 4 A or 8 A per channel.',{volt:'12/24 V DC LED load',vmin:null,vmax:null}),
 KX('AKH-0600.03','KNX heating actuator',3,6,null,1,'6 outputs for electrothermal valve drives, 230 V AC, up to 4 drives per output.',KXM),
 KX('AKH-0800.03','KNX heating actuator',4,8,null,1,'8 outputs for electrothermal valve drives, 230 V AC, up to 4 drives per output.',KXM),
 KX('AIO-0410V.01','KNX analogue I/O',2,0,null,0,'4-channel analogue I/O, 0 to 10 V and 0/4 to 20 mA inputs. Output voltage is generated internally.'),
 KX('EZ-0320.01','KNX energy meter',4,0,null,0,'3-phase energy meter, direct measurement 10 mA to 20 A.',KXM),
 KX('EZ-0363.01','KNX energy meter',4,0,null,0,'3-phase energy meter for transformer measurement, 30 mA to 63 A with the supplied split-core CTs.',KXM),
 KX('SCN-DABC4.01','KNX DALI gateway',4,0,null,0,'DALI broadcast gateway, 4 channels, up to 32 ECGs per channel. KNX Secure. Needs separate DALI supplies.'),
 KX('SCN-DA641.04','KNX DALI gateway',4,0,null,0,'DALI control gateway, 1 output, up to 64 ECGs and 16 groups. DALI-2 certified.'),
 KX('SCN-DA642.04','KNX DALI gateway',4,0,null,0,'DALI control gateway, 2 outputs, up to 64 ECGs and 16 groups each. DALI-2 certified.'),
 KX('SCN-DA641P.04S','KNX DALI gateway',4,0,null,0,'DALI PRO64 gateway with Ethernet and web interface, up to 64 ECGs, supports up to 8 DALI-2 sensors. KNX Secure.')
);
[['STV-0160.02',2,'160 mA'],['STV-0320.02',2,'320 mA'],['STV-0640.02',4,'640 mA'],['STC-0640.01',4,'640 mA, with diagnostics'],['STC-0960.01',6,'960 mA, with diagnostics'],['STC-1280.01',6,'1280 mA, with diagnostics'],['STR-0640.01',6,'640 mA, redundant, with diagnostics']].forEach(r =>
  LIB.push(KX(r[0], 'KNX power supply', r[1], 0, null, 0, `KNX bus power supply, ${r[2]}. Mains input details and losses are on the MDT datasheet.`, {volt: 'Mains in, bus 30 V DC out', vmin: null, vmax: null, src: MDTP})));
LIB.push(KX('STV-0024.01','KNX power supply',4,0,null,0,'24 V DC SELV power supply, 750 mA (not a KNX bus supply).',{volt: 'Mains in, 24 V DC out', vmin: null, vmax: null, src: MDTP}));
[['SCN-IP000.03','KNX IP interface',2,'IP interface for programming and bus access.'],['SCN-IP100.03','KNX IP router',2,'IP router (line or area coupler over Ethernet).'],['SCN-IP100.04S','KNX IP router',1,'IP router with proxy function. KNX Secure.'],['SCN-USBR.03','KNX IP interface',1,'USB interface.'],['SCN-LK001.03S','KNX IP router',2,'Line coupler with proxy function. KNX Secure.'],
 ['SCN-LOG1.02','KNX logic / control',2,'Logic module.'],['SCN-SAFE.01','KNX logic / control',2,'Safety module.'],['SCN-RTC20.02','KNX logic / control',4,'20-channel time switch.'],['SCN-MBGRTU.01','KNX logic / control',2,'Modbus RTU485 gateway.']].forEach(r =>
  LIB.push(KX(r[0], r[1], r[2], 0, null, 0, r[3] + ' Bus powered.', {src: MDTP})));
[['BE-04024.02',2,'4-channel, 24 V AC/DC'],['BE-08024.02',4,'8-channel, 24 V AC/DC'],['BE-16024.02',8,'16-channel, 24 V AC/DC'],['BE-04000.02',2,'4-channel, potential-free'],['BE-08000.02',4,'8-channel, potential-free'],['BE-16000.02',8,'16-channel, potential-free'],['BE-32000.02',12,'32-channel, potential-free'],['BE-04230.02',2,'4-channel, 230 V AC'],['BE-08230.02',4,'8-channel, 230 V AC'],['BE-16230.02',8,'16-channel, 230 V AC']].forEach(r =>
  LIB.push(KX(r[0], 'KNX binary input', r[1], 0, null, 0, `Binary input, ${r[2]} inputs. Bus powered.`, {src: MDTP})));
LIB.forEach(l => { if (!l.brand) l.brand = 'Lutron'; });

const libOf = model => LIB.find(l => l.model === model);
/* ---------- circuit protection library (series level, typical catalogue values) ---------- */
/* w1 = 1P (or 1P+N for RCBOs), wdp = 2P / 1P+N MCB, w3 = 3P, w4 = 4P / 3P+N, widths in DIN modules (17.5-18 mm) */
const BR = (id,mfr,series,kind,poles,rMin,rMax,curves,icn,icu,w1,wdp,w3,w4,rcd,std,note,src,conf)=>({id,mfr,series,kind,poles,rMin,rMax,curves,icn,icu,w1,wdp,w3,w4,rcd,std,note,src,conf});
const BRK = [
 BR('sch-ic60n','Schneider Electric','Acti9 iC60N','mcb','1P, 2P, 3P, 4P',0.5,63,['B','C','D'],6,10,1,2,3,4,'','IEC 60898-1 / 60947-2','K and Z curves on some references. Icu is a typical value and varies with rating and poles.','https://stoklink.com/blogs/technical/schneider-acti9-ic60-mcb-range-review','v'),
 BR('sch-ic60h','Schneider Electric','Acti9 iC60H','mcb','1P, 2P, 3P, 4P',0.5,63,['B','C','D'],10,15,1,2,3,4,'','IEC 60898-1 / 60947-2','Higher breaking capacity on the iC60 housing. K and Z curves on some references.','https://stoklink.com/blogs/technical/schneider-acti9-ic60-mcb-range-review','v'),
 BR('sch-ic60l','Schneider Electric','Acti9 iC60L','mcb','1P, 2P, 3P, 4P',0.5,63,['B','C'],15,25,1,2,3,4,'','IEC 60898-1 / 60947-2','Current-limiting version. The highest breaking capacity applies to the lower ratings.','https://stoklink.com/blogs/technical/schneider-acti9-ic60-mcb-range-review','v'),
 BR('sch-ik60n','Schneider Electric','Acti9 iK60N','mcb','1P, 2P, 3P, 4P',0.5,63,['B','C','D'],6,null,1,2,3,4,'','IEC 60898-1','Domestic and light commercial series. Typical catalogue values; confirm on the datasheet.','https://www.se.com','c'),
 BR('sch-idpnn','Schneider Electric','Acti9 iDPN N','mcb','1P+N',6,40,['B','C'],4.5,null,null,1,null,null,'','IEC 60898-1','Compact 1P+N MCB, one module wide. Confirm width and rating range on the datasheet.','https://no.rs-online.com/web/p/mcbs/2091332','c'),
 BR('sch-idpnvigi','Schneider Electric','Acti9 iDPN N Vigi','rcbo','1P+N',6,40,['C'],6,null,2,null,null,null,'30 / 300 mA, type AC or A','IEC 61009-1','1P+N RCBO, 36 mm (4 x 9 mm) wide. Other curves exist; the C curve was confirmed.','https://eshop.se.com/id/acti-9-idpn-n-vigi-rcbo-1p-n-10a-c-curve-6000a-30ma-type-ac-a9d31610.html','v'),
 BR('abb-s200','ABB','System pro M compact S200','mcb','1P, 2P, 3P, 4P',0.5,63,['B','C','D','K','Z'],6,10,1,2,3,4,'','IEC 60898-1 / 60947-2','S201 to S204. 17.5 mm per pole.','https://www.relayspec.com/specs/001/2CSC400002D0204.pdf','v'),
 BR('abb-s200m','ABB','System pro M compact S200M','mcb','1P, 2P, 3P, 4P',0.5,63,['B','C'],10,15,1,2,3,4,'','IEC 60898-1 / 60947-2','10 kA version of the S200.','https://www.relayspec.com/specs/001/2CSC400002D0204.pdf','v'),
 BR('abb-s200p','ABB','System pro M compact S200P','mcb','1P, 2P, 3P, 4P',0.5,63,['B','C','D','K','Z'],15,25,1,2,3,4,'','IEC 60898-1 / 60947-2','Icn is 25 kA up to 25 A and 15 kA from 32 to 63 A.','https://www.relayspec.com/specs/001/2CSC400002D0204.pdf','v'),
 BR('abb-s200u','ABB','S200U / S200UP (UL 489)','mcb','1P, 2P, 3P',0.5,63,['K','Z'],15,null,1,2,3,null,'','UL 489','UL-listed DIN-rail breaker for NEC installations. Curves are K and Z.','https://www.relayspec.com/specs/001/2CSC400002D0204.pdf','v'),
 BR('abb-ds201','ABB','DS201 / DS201 M RCBO','rcbo','1P+N',6,40,['B','C'],6,null,2,null,null,null,'30 mA (others available), type AC or A','IEC 61009-1','Two modules wide. DS201 M is the 10 kA version.','https://www.ipd.com.au/rcbo-10ka-1p-n-6a-30ma-type-a-c-curve-2-module-ds201mc6a30','c'),
 BR('abb-dsn201','ABB','eRCBO DSN201','rcbo','1P+N',6,25,['B','C'],6,null,1,null,null,null,'10 / 30 mA, type A or AC','IEC 61009-1','ABB lists one module; some distributors list 36 mm. Confirm before drawing the final layout.','https://new.abb.com/low-voltage/products/system-pro-m/residual-current-devices/dsn201','v'),
 BR('abb-f200','ABB','F202 / F204 RCCB','rccb','2P, 4P',16,125,[],null,null,null,2,null,4,'30 / 100 / 300 mA, type AC or A','IEC 61008-1','Group RCD for several MCBs. Typical catalogue values.','https://new.abb.com/low-voltage/products/system-pro-m','c'),
 BR('abb-sd200','ABB','SD200 isolator','isolator','1P, 2P, 3P, 4P',16,125,[],null,null,1,2,3,4,'','IEC 60947-3','Main switch-disconnector. Typical catalogue values.','https://new.abb.com/low-voltage/products/system-pro-m','c'),
 BR('sie-5sy6','Siemens','SENTRON 5SY6 / 5SY7','mcb','1P, 1P+N, 2P, 3P, 4P',0.3,63,['B','C','D'],6,null,1,2,3,4,'','IEC 60898-1','5SY6 is 6 kA, 5SY7 is 10 kA. 17.5 mm per pole.','https://stoklink.com/blogs/technical/siemens-5sy-5sl-mcb-range-review','v'),
 BR('sie-5sl6','Siemens','SENTRON 5SL6','mcb','1P, 2P, 3P, 4P',0.3,63,['B','C'],6,null,1,2,3,4,'','IEC 60898-1','Standard 6 kA series. D curve only on some frame sizes.','https://stoklink.com/blogs/technical/siemens-5sy-5sl-mcb-range-review','v'),
 BR('sie-5sv1','Siemens','SENTRON 5SV1 compact RCBO','rcbo','1P+N',6,40,['B','C'],6,null,1,null,null,null,'30 mA, type A','IEC 61009-1','Compact 1P+N RCBO, 18 mm wide.','https://uk.rs-online.com/web/p/rcbos/1873281','v'),
 BR('leg-dx3','Legrand','DX³ 10000 MCB','mcb','1P, 2P, 3P, 4P',0.5,63,['C','D'],10,null,1,2,3,4,'','IEC 60898-1','One module per pole up to 63 A.','https://cdn.legrand.co.in/legrand/public/PDF/downloads/electrical-infrastructure/dx3.pdf','v'),
 BR('leg-dx3-125','Legrand','DX³ 10000 MCB 80–125 A','mcb','1P, 2P, 3P, 4P',80,125,['C'],10,null,1.5,3,4.5,6,'','IEC 60947-2','1.5 modules per pole. Curves not confirmed in the source.','https://cdn.legrand.co.in/legrand/public/PDF/downloads/electrical-infrastructure/dx3.pdf','v'),
 BR('leg-dx3-rcbo','Legrand','DX³ 6000 compact RCBO','rcbo','1P+N',6,32,['C'],6,null,2,null,null,null,'30 mA, type AC or A','IEC 61009-1','Compact 2-pole RCBO, two modules.','https://cdn.legrand.co.in/legrand/public/PDF/downloads/electrical-infrastructure/dx3.pdf','v'),
 BR('leg-dx3-rcbo4a','Legrand','DX³ 6000 RCBO 4P (10–32 A)','rcbo','3P+N',10,32,['C'],6,null,null,null,null,4,'30 mA, type A','IEC 61009-1','Four modules wide.','https://cdn.legrand.co.in/legrand/public/PDF/downloads/electrical-infrastructure/dx3.pdf','v'),
 BR('leg-dx3-rcbo4b','Legrand','DX³ 6000 RCBO 4P (6–63 A)','rcbo','3P+N',6,63,['C'],6,null,null,null,null,7,'30 mA, type AC','IEC 61009-1','Seven modules wide.','https://cdn.legrand.co.in/legrand/public/PDF/downloads/electrical-infrastructure/dx3.pdf','v'),
 BR('hag-nt','Hager (AU/NZ)','NT / NDN MCB','mcb','1P, 2P, 3P, 4P',2,63,['C','D'],10,15,1,2,3,4,'','AS/NZS 60898.1','NT is C curve, NDN is D curve. Icu 15 kA applies to NDN.','https://assets1.sc.hager.com/australia/files/03_Modular_Circuit_Protection_NZ.pdf','v'),
 BR('hag-msn','Hager (AU/NZ)','MSN / MDN MCB','mcb','1P, 2P, 3P',6,63,['C','D'],6,null,1,2,3,null,'','AS/NZS 60898.1','MSN is C curve, MDN is D curve.','https://assets1.sc.hager.com/australia/files/03_Modular_Circuit_Protection_NZ.pdf','v'),
 BR('hag-hmf','Hager (AU/NZ)','HMF / HMC / HMD 80–125 A','mcb','1P, 2P, 3P, 4P',80,125,['C','D'],10,15,1.5,3,4.5,6,'','AS/NZS 60898.1','1.5 modules per pole. HMC and HMD are 15 kA.','https://assets1.sc.hager.com/australia/files/03_Modular_Circuit_Protection_NZ.pdf','v'),
 BR('hag-adc','Hager (AU/NZ)','ADC / ACC / ADD RCBO','rcbo','1P+N',6,32,['C','D'],6,null,1,null,null,null,'10 / 30 mA, type A','IEC 61009-1','One module wide.','https://assets1.sc.hager.com/australia/files/03_Modular_Circuit_Protection_NZ.pdf','v'),
 BR('hag-ada','Hager (AU/NZ)','ADA / AEA RCBO','rcbo','1P+N',6,40,['C'],6,null,2,null,null,null,'30 / 100 mA, type A','IEC 61009-1','Two modules wide.','https://assets1.sc.hager.com/australia/files/03_Modular_Circuit_Protection_NZ.pdf','v'),
 BR('hag-adm','Hager (AU/NZ)','ADM / AEM RCBO 4P','rcbo','3P+N',6,40,['C'],6,null,null,null,null,4,'30 / 100 mA, type A','IEC 61009-1','Four modules wide.','https://assets1.sc.hager.com/australia/files/03_Modular_Circuit_Protection_NZ.pdf','v'),
 BR('eat-pls6','Eaton','xPole PLS6','mcb','1P, 2P, 3P, 4P',1,63,['B','C','D'],6,null,1,2,3,4,'','IEC 60898-1','Capacity is 6 or 10 kA depending on variant. Module widths are typical, not confirmed from the page.','https://www.eaton.com/gb/en-gb/catalog/electrical-circuit-protection/pls6-m-xpole-miniature-circuit-breaker.html','c'),
 BR('eat-pfl6','Eaton','xPole PFL6 / PFL7 RCBO','rcbo','1P+N',6,40,['B','C'],6,null,2,null,null,null,'30 mA (others available)','IEC 61009-1','Two modular spacings wide.','https://www.eaton.com/dk/da-dk/skuPage.286471.html','v'),
 BR('chi-nxb63','Chint','NXB-63 MCB','mcb','1P, 2P, 3P, 4P',1,63,['B','C','D'],6,null,1,2,3,4,'','IEC 60898-1','Typical catalogue values.','https://baoanjsc.com.vn/products/miniature-circuit-breakers--small-type--chint_801491_en.aspx','c'),
 BR('chi-nxble','Chint','NXBLE-32 / NXBLE-63 RCBO','rcbo','1P+N',10,63,['C'],6,null,2,null,null,null,'30 / 100 / 300 mA','IEC 61009-1','Typical catalogue values; confirm width.','https://www.sntelec.com/product/chint-nxble-32-rcbo/','c'),
 BR('sch-nsx','Schneider Electric','Compact NSXm / NSX','mccb','3P, 4P',16,630,[],null,null,null,null,null,null,'','IEC 60947-2','Moulded-case breakers for incomers and sub-mains. Not DIN-rail width; check mounting.','https://www.se.com','c'),
 BR('abb-tmax','ABB','Tmax XT','mccb','3P, 4P',10,1600,[],null,null,null,null,null,null,'','IEC 60947-2','XT1 to XT7 frames. Typical range only.','https://new.abb.com/low-voltage','c'),
 BR('sie-3va','Siemens','SENTRON 3VA','mccb','3P, 4P',16,1600,[],null,null,null,null,null,null,'','IEC 60947-2','3VA1 to 3VA2 frames. Typical range only.','https://www.siemens.com','c'),
 BR('eat-nzm','Eaton','NZM1–NZM4','mccb','3P, 4P',16,1600,[],null,null,null,null,null,null,'','IEC 60947-2','Frame sizes NZM1 to NZM4. Typical range only.','https://www.eaton.com','c'),
 BR('leg-dpx3','Legrand','DPX³ 160 / 250 / 630 / 1600','mccb','3P, 4P',16,1600,[],null,null,null,null,null,null,'','IEC 60947-2','Typical range only.','https://www.legrand.com','c')
];
BRK.push(
 Object.assign(BR('sch-c60h-dc','Schneider Electric','Acti9 C60H-DC','mcb','1P, 2P',0.5,63,['C'],null,null,1,2,null,null,'','IEC 60947-2 (DC)','DC series. RS Components listings show 1-pole units at 250 V DC and 6 kA. The rating range is assumed 0.5 to 63 A, so confirm it in the Schneider catalogue. The 2P version is the one for ungrounded 24 V systems.','https://hken.rs-online.com/web/p/mcbs/7763161','c'),{vdc:250, dcIcn:6}),
 Object.assign(BR('abb-s200-dc','ABB','S200 (S201 1P, DC rated)','mcb','1P, 2P',0.5,63,['B','C','D'],6,null,1,2,null,null,'','IEC 60898-1 / 60947-2','Standard S200 MCBs carry a DC rating. RS Components lists the S201 at 110 V DC and 6 kA for the 1P version. Range and curves are typical, confirm them on the ABB datasheet. 2P units are rated for higher DC voltages.','https://uk.rs-online.com/web/p/mcbs/2876353','c'),{vdc:110, dcIcn:6})
);
const brkOf = id => id ? (BRK.find(b => b.id === id) || null) : null;

/* ---------- cable maths ---------- */
function ambF(S, ty){ const tm = ty === 'xlpe' ? 90 : 70; return S.ambient >= tm ? 0 : Math.sqrt((tm - S.ambient) / (tm - 30)); }
function vdPct(S, size, ty, I, Lm, pf, three){
  const rho = ty === 'xlpe' ? 0.02235 : 0.02094;
  const R = rho / size, X = size >= 25 ? 0.00008 : 0, sin = Math.sqrt(Math.max(0, 1 - pf * pf));
  const k = three ? SQ3 : 2;
  return k * I * Lm * (R * pf + X * sin) / (three ? S.vLN * SQ3 : S.vLN) * 100;
}
function sizeCable(S, o){
  const n = o.three ? 3 : 2, tab = AMP[o.cable][n], f = ambF(S, o.cable) * (o.grp || 1), need = Math.max(o.In || 0, o.Ib);
  let idx = -1;
  if (o.size === 'auto' || !o.size){
    for (let i = 0; i < SZ.length; i++){
      if (SZ[i] < o.min) continue;
      if (tab[i] * f < need) continue;
      if (vdPct(S, SZ[i], o.cable, o.Ib, o.len, o.pf, o.three) > o.lim) continue;
      idx = i; break;
    }
    if (idx < 0) idx = SZ.length - 1;
  } else { idx = SZ.indexOf(+o.size); if (idx < 0) idx = SZ.findIndex(s => s >= +o.size); if (idx < 0) idx = SZ.length - 1; }
  const size = SZ[idx], Iz = tab[idx] * f;
  return {size, Iz, vd: vdPct(S, size, o.cable, o.Ib, o.len, o.pf, o.three), n};
}

/* ---------- main compute ---------- */
function compute(S){
  const std = STD[S.std], V = S.vLN, three = S.phases === 3;
  const R = {std, c:{}, m:{}, ph:{L1:0, L2:0, L3:0}, phC:{L1:0, L2:0, L3:0}, checks:[], heatW:0, lossW:0, connectedW:0};
  const kT = kTemp(S), V2 = three ? V * SQ3 : (S.sysId === '1p240' ? 240 : V);
  const chk = (lvl, ref, msg) => R.checks.push({lvl, ref, msg});
  const lv = isLV(S), dc = isDC(S), dflt = vdDef(S), RT = ratingsOf(S), dpm = dpOf(S);
  const limOf = t => (t === 'lighting' || t === 'critical') ? num(S.vdL, dflt.l) : num(S.vdO, dflt.o);
  const rcdW = S.rcboW === 1 ? 1 : 2;
  const mcbS = brkOf(S.mcbSel), rcboS = brkOf(S.rcboSel), mainS = brkOf(S.mainSel);
  R.sel = {mcbS, rcboS, mainS};
  const wOf = (ser, k) => ser && ser[k] != null ? Math.ceil(ser[k]) : null;
  const serChk = (ser, In, curve, ref) => {
    if (!ser || !In) return;
    if (In < ser.rMin || In > ser.rMax) chk('warn', ref, `${ser.mfr} ${ser.series} covers ${ser.rMin}–${ser.rMax} A; ${In} A is outside that range.`);
    if (curve && curve !== 'Std' && ser.curves && ser.curves.length && !ser.curves.includes(curve)) chk('warn', ref, `${ser.mfr} ${ser.series} does not list a ${curve} curve (${ser.curves.join(', ')}).`);
  };
  const icnOf = ser => dc ? (ser && ser.dcIcn != null ? ser.dcIcn : 5) : (ser && ser.icn != null ? ser.icn : std.icu);
  /* load currents */
  S.circuits.forEach(c => {
    const m = c.mod ? S.modules.find(x => x.id === c.mod) : null;
    const ph = m ? (three ? m.phase : 'L1') : (three ? c.phase : 'L1');
    const thr = ph === '3P';
    const pf = dc ? 1 : Math.min(1, Math.max(.1, num(c.pf, .95)));
    const Ib = num(c.P, 0) * num(c.dem, 1) / (V * pf * (thr ? 3 : 1));
    const tp0 = TYPES[c.type] || TYPES.other;
    R.c[c.id] = {ph, thr, pf, Ib, mod: m, ct: std.cont > 1 && !!tp0.ct};
    R.connectedW += num(c.P, 0);
  });
  /* module feeds */
  S.modules.forEach(m => {
    const lib = libOf(m.model) || {};
    const loads = S.circuits.filter(c => c.mod === m.id);
    const idle = lib.inA != null && lib.inA <= 1 ? lib.inA : 0.1;
    const Ib = loads.length ? loads.reduce((a, c) => a + R.c[c.id].Ib, 0) : idle;
    const lv = lib.vmax != null && lib.vmax <= 48;
    const ctM = loads.some(c => R.c[c.id].ct);
    const In = lv ? 0 : num(m.inSel, 0) > 0 ? +m.inSel : pick(RT, Math.max(Ib * (ctM ? std.cont : 1) / kT, RT[0]));
    const pf = loads.length ? (loads.reduce((a, c) => a + R.c[c.id].pf * R.c[c.id].Ib, 0) / Math.max(Ib, 1e-9)) : 1;
    const cab = sizeCable(S, {cable: m.cable || 'pvc', In: In || 0, Ib, len: num(m.len, 5), pf, three: false, grp: 1, min: 1.5, lim: limOf('other'), size: m.size || 'auto'});
    const ph = three ? m.phase : 'L1';
    R.m[m.id] = {lib, Ib, In, pf, cab, ph, loads, ct: ctM, w: lib.din == null ? 4 : Math.ceil(lib.din), nodin: lib.din === 0, lv, poles: 1};
    if (!lv && lib.inA && Ib > lib.inA + 1e-9) chk('err', m.id, `${m.model} feed carries ${Ib.toFixed(1)} A, above its ${lib.inA} A input rating.`);
    if (!lv && lib.vmin != null && (V < lib.vmin || V > lib.vmax)) chk('err', m.id, `${m.model} is rated ${lib.volt}; the system line-neutral voltage is ${V} V.`);
    if (lib.amb && S.cabinAmb > lib.amb) chk('warn', m.id, `${m.model} allows ${lib.amb} C inside the enclosure; the design value is ${S.cabinAmb} C.`);
    if (In && Ib > In) chk('err', m.id, `${m.model} feed breaker ${In} A is below its load of ${Ib.toFixed(1)} A.`);
    else if (In && Ib > In * kT + 1e-9) chk('err', m.id, `${m.model} feed breaker ${In} A is derated to ${(In * kT).toFixed(1)} A at ${S.cabinAmb} C inside the enclosure, below its load of ${Ib.toFixed(1)} A.`);
    if (In && ctM && In < Ib * std.cont - 1e-9) chk('warn', m.id, `${m.model} feed carries continuous lighting or similar load: ${std.n} sizes the breaker at ${Math.round(std.cont * 100)} % of the load (${(Ib * std.cont).toFixed(1)} A).`);
    if (In && cab.Iz < In) chk('err', m.id, `${m.model} feed cable carries ${cab.Iz.toFixed(0)} A, below the ${In} A breaker.`);
    if (cab.vd > limOf('other')) chk('warn', m.id, `${m.model} feed voltage drop is ${cab.vd.toFixed(2)} %.`);
    if (!lv && !In) chk('err', m.id, `${m.model} feed current is above the largest breaker in this series.`);
    serChk(mcbS, In, null, m.id);
    if (In && num(S.ik, 0) > icnOf(mcbS)) chk('warn', m.id, `Fault level ${S.ik} kA is above the ${icnOf(mcbS)} kA breaking capacity of the feed breaker.`);
    R.heatW += (lib.btu || 0) * BTU_W;
    if (lv) return;
    const f = Math.min(1, Ib / Math.max(In || 1, 1));
    R.lossW += 2.5 * f * f;
    if (three) R.ph[R.m[m.id].ph] += Ib; else R.ph.L1 += Ib;
    if (ctM) R.phC[three ? R.m[m.id].ph : 'L1'] += Ib;
  });
  /* circuits */
  S.circuits.forEach(c => {
    const r = R.c[c.id], tp = TYPES[c.type] || TYPES.other, m = r.mod;
    const lim = limOf(c.type);
    const mm = m ? R.m[m.id] : null;
    const cf = r.ct ? std.cont : 1;
    r.In = mm ? mm.In : (num(c.inO, 0) > 0 ? +c.inO : pick(RT, Math.max(r.Ib * cf / kT, RT[0])));
    r.kT = kT; r.rcdMA = (!lv && c.prot === 'RCBO' && !mm) ? std.rcdMA : ''; r.rcdType = (!lv && c.prot === 'RCBO' && !mm) ? (c.type === 'ev' ? 'type A + 6 mA DC detection, or type B' : tp.ta ? 'type A' : 'type AC or A') : '';
    r.curve = std.curves.includes(c.curve) ? c.curve : std.curves[0];
    r.prot = mm ? 'Via module' : c.prot;
    const cab = sizeCable(S, {cable: c.cable || 'pvc', In: r.In || 0, Ib: r.Ib, len: num(c.len, 1), pf: r.pf, three: r.thr, grp: num(c.grp, 1), min: tp.min, lim, size: c.size});
    r.cab = cab; r.lim = lim;
    r.feedVd = mm ? mm.cab.vd : 0;
    r.vdTot = cab.vd + r.feedVd;
    r.w = mm ? 0 : (r.thr ? (c.prot === 'RCBO' ? (wOf(rcboS, 'w4') || 4) : (wOf(mcbS, 'w3') || 3)) : (c.prot === 'RCBO' ? (wOf(rcboS, 'w1') || rcdW) : (dpm ? (wOf(mcbS, 'wdp') || 2) : (wOf(mcbS, 'w1') || 1))));
    if (!mm && num(c.wSel, 0) > 0) r.w = +c.wSel;
    const ref = c.ref;
    if (!r.In) chk('err', ref, 'Design current exceeds the largest breaker in this series.');
    if (r.In && r.Ib > r.In + 1e-9) chk('err', ref, `Design current ${r.Ib.toFixed(1)} A is above the ${r.In} A breaker.`);
    else if (r.In && !mm && r.Ib > r.In * kT + 1e-9) chk('err', ref, `The ${r.In} A breaker is derated to ${(r.In * kT).toFixed(1)} A at ${S.cabinAmb} C inside the enclosure, below the ${r.Ib.toFixed(1)} A load. Choose the next size up.`);
    if (r.In && !mm && cf > 1 && r.In < r.Ib * cf - 1e-9) chk('warn', ref, `${std.n} sizes the breaker at ${Math.round(cf * 100)} % of a continuous load: ${(r.Ib * cf).toFixed(1)} A needed, ${r.In} A chosen.`);
    if (!mm && !lv && tp.mot && r.curve === 'B') chk('warn', ref, `${tp.l} has a starting current. A B curve can trip on inrush; use C or D.`);
    if (!mm && !lv && c.prot === 'RCBO'){
      if (tp.ta && rcboS && rcdAcOnly(rcboS)) chk('warn', ref, `${rcboS.mfr} ${rcboS.series} is type AC only. ${tp.l} has electronic or rectified current and needs a type A RCD.`);
      if (c.type === 'ev') chk('info', ref, 'EV charger: IEC 60364-7-722 and BS 7671 722.531.3.101 need type A plus 6 mA DC detection (often built into the charger), or a type B RCD.');
    }
    if (!mm && std.zs && !lv && !dc && r.In && TRIPK[r.curve] && c.prot !== 'RCBO'){
      const ze = num(S.ze, 0);
      if (ze > 0){
        const rho = c.cable === 'xlpe' ? 0.02235 : 0.02094, zc = 2 * rho * num(c.len, 1) / cab.size, zs = ze + zc, zmax = V / (TRIPK[r.curve] * r.In);
        r.zs = zs; r.zsMax = zmax;
        if (zs > zmax) chk('err', ref, `Earth-fault loop impedance ${zs.toFixed(2)} ohm (Ze ${ze} + cable ${zc.toFixed(2)}) is above the ${zmax.toFixed(2)} ohm limit for a ${r.curve}${r.In} A MCB (${V} V ÷ ${TRIPK[r.curve]} × ${r.In} A). Shorten the run, use a larger cable or a lower curve or rating.`);
      }
    }
    if (r.In && cab.Iz < r.In) chk('err', ref, `Cable ${cab.size} mm² carries ${cab.Iz.toFixed(0)} A, below the ${r.In} A breaker. Size up or lower the breaker.`);
    if (r.vdTot > lim) chk('warn', ref, `Voltage drop ${r.vdTot.toFixed(2)} % is above the ${lim} % target.`);
    if (!lv && !mm && tp.rcd && c.prot !== 'RCBO') chk('warn', ref, `${tp.l} circuit has no RCBO. ${std.rcd}`);
    if (!mm){
      const ser = c.prot === 'RCBO' ? rcboS : mcbS;
      if (r.In && num(S.ik, 0) > icnOf(ser)) chk('warn', ref, `Fault level ${S.ik} kA is above the ${icnOf(ser)} kA breaking capacity${ser ? ' of ' + ser.series : ' assumed for this standard'}.`);
      serChk(ser, r.In, r.curve, ref);
      if (r.thr && c.prot === 'RCBO' && rcboS && rcboS.w4 == null) chk('warn', ref, `${rcboS.series} has no 3-phase version. Pick a 4P RCBO series or use an MCB with a group RCD.`);
      if (!r.thr && c.prot === 'RCBO' && rcboS && rcboS.w1 == null) chk('warn', ref, `${rcboS.series} is a 4P device and cannot protect a single-phase circuit.`);
    }
    if (mm && c.zone > (mm.lib.zones || 0)) chk('err', ref, `${mm.lib.model} has ${mm.lib.zones || 0} zones; zone ${c.zone} does not exist.`);
    if (mm && mm.lib.zoneA && r.Ib > mm.lib.zoneA + 1e-9) chk('err', ref, `Zone current ${r.Ib.toFixed(1)} A is above the ${mm.lib.zoneA} A zone rating.`);
    if (mm && mm.lib.zoneW && mm.lib.zoneW[c.zone - 1] && num(c.P, 0) * num(c.dem, 1) > mm.lib.zoneW[c.zone - 1]) chk('err', ref, `Zone load ${c.P} W is above the ${mm.lib.zoneW[c.zone - 1]} W limit for zone ${c.zone}.`);
    if (mm && !mm.lib.power) chk('err', ref, `${mm.lib.model} does not switch loads.`);
    if (r.thr && !three) r.thr = false;
    if (!mm){
      const f = r.In ? Math.min(1, r.Ib / r.In) : 1;
      R.lossW += (r.thr ? 3 : 1) * 2.5 * f * f;
      if (r.thr){ R.ph.L1 += r.Ib; R.ph.L2 += r.Ib; R.ph.L3 += r.Ib; if (r.ct){ R.phC.L1 += r.Ib; R.phC.L2 += r.Ib; R.phC.L3 += r.Ib; } } else { R.ph[r.ph] += r.Ib; if (r.ct) R.phC[r.ph] += r.Ib; }
    }
  });
  /* module zones used twice */
  S.modules.forEach(m => {
    const seen = {};
    S.circuits.filter(c => c.mod === m.id).forEach(c => { if (seen[c.zone]) chk('warn', c.ref, `Zone ${c.zone} of ${m.id} is shared with ${seen[c.zone]}.`); else seen[c.zone] = c.ref; });
  });
  /* totals and incomer */
  const dv = num(S.diversity, 1);
  ['L1', 'L2', 'L3'].forEach(p => { R.ph[p] *= dv; R.phC[p] *= dv; });
  const phW = {L1:0, L2:0, L3:0}; let kvaSum = 0;
  S.circuits.forEach(c => {
    const r = R.c[c.id], w = num(c.P, 0) * num(c.dem, 1) * dv;
    kvaSum += w / r.pf;
    if (r.thr){ phW.L1 += w / 3; phW.L2 += w / 3; phW.L3 += w / 3; } else phW[r.ph] += w;
  });
  const demW = phW.L1 + phW.L2 + phW.L3;
  R.power = {conn: R.connectedW, dem: demW, phW, kva: kvaSum, pf: kvaSum > 0 ? demW / kvaSum : 1, loss: 0};
  const act = three ? ['L1', 'L2', 'L3'] : ['L1'];
  const imax = Math.max(...act.map(p => R.ph[p]));
  const iavg = act.reduce((a, p) => a + R.ph[p], 0) / act.length;
  const imin = Math.min(...act.map(p => R.ph[p]));
  const incNeed = Math.max(0, ...act.map(p => R.ph[p] + (std.cont - 1) * R.phC[p]));
  const incList = incRatings(S);
  const incIn = num(S.incomer, 0) > 0 ? +S.incomer : pick(incList, Math.max(incNeed / kT, lv ? 1 : incList[0]));
  const pfAvg = 0.93;
  const incCab = sizeCable(S, {cable: S.incCable || 'xlpe', In: incIn || 0, Ib: imax, len: num(S.incLen, 10), pf: pfAvg, three, grp: 1, min: 4, lim: limOf('other'), size: 'auto'});
  R.inc = {Imax: imax, Iavg: iavg, Imin: imin, In: incIn, cab: incCab, imb: iavg > 0 ? (imax - iavg) / iavg * 100 : 0};
  R.inc.kVA = three ? SQ3 * V * SQ3 * imax / 1000 : V * imax / 1000;
  serChk(mainS, incIn, null, 'Incomer');
  [['Breakers', 'MCB', mcbS], ['RCBOs', 'RCBO', rcboS], ['Incomer', 'Main', mainS]].forEach(([ref, nm, ser]) => {
    if (!ser || lv) return;
    const fam = stdFam(ser);
    if (std.fam && fam !== std.fam) chk('warn', ref, fam === 'ul' ? `${ser.mfr} ${ser.series} is a UL 489 device. ${std.n} installations use IEC 60898 / 60947 devices; check that it is accepted locally.` : `${ser.mfr} ${ser.series} is an IEC-type device. ${std.n} installations need UL listed (UL 489 or UL 1077) devices. Check that it is accepted before using it.`);
    if (fam === 'iec' && ['mcb', 'rcbo', 'rccb'].includes(ser.kind) && (V > 253 || V2 > 440)) chk('err', ref, `${ser.mfr} ${ser.series} is an IEC 60898 / 61009 device rated 230/400 V (440 V maximum). This supply is ${V} V line-to-neutral and ${Math.round(V2)} V line-to-line. Use a device rated for it.`);
  });
  if (std.zs && !lv && S.circuits.some(c => !c.mod && c.prot !== 'RCBO' && TRIPK[R.c[c.id].curve]) && num(S.ze, 0) <= 0) chk('info', 'Earth fault', `Enter the supply loop impedance Ze in Setup to check automatic disconnection of the MCB circuits (${std.n}).`);
  if (lv){
    const need = S.vLN * 1.25;
    [['MCB', mcbS], ['Main', mainS]].forEach(([nm, ser]) => { if (ser && dc && (ser.vdc == null || ser.vdc < need)) chk('warn', nm === 'MCB' ? 'Breakers' : 'Incomer', `${ser.mfr} ${ser.series} is not listed as DC rated for ${S.vLN} V here. Pick a DC series, or use Generic and specify a DC-rated device.`); });
    chk('info', 'Low voltage', dc ? `Direct current: I = P ÷ V with no power factor. DC arcs do not self-extinguish, so every breaker must be DC rated for at least the charging voltage (about 1.25 × the ${S.vLN} V nominal), and any polarity marked on the device must be followed. Breaking capacity is set by the battery or source short-circuit current (${S.ik} kA entered).` : `${S.vLN} V AC extra-low voltage: I = P ÷ (V × PF). Breakers are standard AC types; the low voltage makes the current high, so cable size and voltage drop usually decide the cable.`);
    if (dc && !S.mcbSel) chk('info', 'Breakers', 'No DC series chosen, so a generic DC-rated thermal-magnetic breaker is assumed at 5 kA.');
  }
  if (!incIn) chk('err', 'Incomer', 'Maximum phase current is above the largest incomer rating in the library.');
  else if (imax > incIn) chk('err', 'Incomer', `Maximum phase current ${imax.toFixed(1)} A is above the ${incIn} A incomer.`);
  else if (imax > incIn * kT + 1e-9) chk('err', 'Incomer', `The ${incIn} A incomer is derated to ${(incIn * kT).toFixed(1)} A at ${S.cabinAmb} C inside the enclosure, below the ${imax.toFixed(1)} A maximum phase current.`);
  else if (incIn && incNeed > incIn + 1e-9 && std.cont > 1) chk('warn', 'Incomer', `${std.n} sizes the main at 100 % of the non-continuous plus 125 % of the continuous load: ${incNeed.toFixed(1)} A needed, ${incIn} A chosen.`);
  if (incIn && incCab.Iz < incIn) chk('err', 'Incomer', `Incomer cable ${incCab.size} mm² carries ${incCab.Iz.toFixed(0)} A, below the ${incIn} A incomer.`);
  if (incCab.vd > limOf('other')) chk('warn', 'Incomer', `Incomer voltage drop ${incCab.vd.toFixed(2)} % uses part of the total allowance.`);
  const worstVd = Math.max(0, ...S.circuits.map(c => R.c[c.id].vdTot + incCab.vd));
  R.worstVd = worstVd;
  if (three && R.inc.imb > 15 && imax > 0) chk('warn', 'Balance', `Phase imbalance is ${R.inc.imb.toFixed(0)} % above the average. Use Auto-balance or move circuits.`);
  if (S.modules.some(m => /^(LQSE-4A|QSNE-4A|MQSE-\dA)/.test(m.model)) && S.cabinAmb > 30) chk('info', 'Thermal', 'Phase-adaptive modules need zone derating at 30–40 C room ambient. See Lutron App Note #466.');
  if (S.modules.length && S.modules.some(m => /^(LQSE-4A|QSNE-4A)/.test(m.model))) chk('info', 'Layout', 'Phase-adaptive modules want 150 mm between DIN rails and 200 mm clear above the top rail.');
  (S.custom || []).forEach(x => { R.heatW += num(x.heatW, 0); });
  R.heatW += R.lossW;
  R.power.loss = R.lossW;
  if (num(S.enclW, 0) > 0 && R.heatW > S.enclW) chk('warn', 'Thermal', `Estimated dissipation ${R.heatW.toFixed(0)} W exceeds the ${S.enclW} W enclosure rating.`);
  R.hasAdaptive = S.modules.some(m => /^(LQSE-4A|QSNE-4A|QSN-4A|MQSE-\dA)/.test(m.model));
  return R;
}

/* ---------- devices & layout ---------- */
function buildDevices(S, R){
  const three = S.phases === 3, devs = [], std = STD[S.std];
  const rcdW = S.rcboW === 1 ? 1 : 2;
  const mcbS = brkOf(S.mcbSel), rcboS = brkOf(S.rcboSel), mainS = brkOf(S.mainSel);
  const sn = s => s ? s.mfr + ' ' + s.series : '';
  const dpm = dpOf(S), pol = S.incPoles || (isLV(S) ? (dpm ? '2P' : '1P') : (three ? '4P' : '2P')), pn = parseInt(pol, 10) || 2;
  const mw = num(S.incW, 0) > 0 ? Math.round(+S.incW) : (mainS && (pn >= 3 ? mainS.w4 : mainS.wdp) != null ? Math.ceil(pn >= 3 ? mainS.w4 : mainS.wdp) : pn);
  if (!S.mainOff) devs.push({key:'inc', kind:'incomer', ref:'Q0', rating:R.inc.In, label:pol + ' main', w: mw, sec:0, ph:'N', series:sn(mainS)});
  if (S.spd) devs.push({key:'spd', kind:'spd', ref:'SPD', rating:null, label:'Surge protection', w: three ? 4 : 2, sec:0, ph:'N'});
  S.modules.forEach(m => {
    const r = R.m[m.id];
    if (r.lv) return;
    devs.push({key:'f:' + m.id, kind:'feed', ref:'F-' + m.id, rating:r.In, label:'Feed ' + m.id, w: dpm ? (mcbS && mcbS.wdp != null ? Math.ceil(mcbS.wdp) : 2) : (mcbS && mcbS.w1 != null ? Math.ceil(mcbS.w1) : 1), sec:1, ph:r.ph, mod:m.id, series:sn(mcbS)});
  });
  S.circuits.forEach(c => {
    if (c.mod) return;
    const r = R.c[c.id];
    devs.push({key:'c:' + c.id, kind: c.prot === 'RCBO' ? 'rcbo' : 'mcb', ref:c.ref, rating:r.In, curve:r.curve, label:c.name, w:r.w, sec:1, ph:r.thr ? '3P' : r.ph, cid:c.id, series:sn(c.prot === 'RCBO' ? rcboS : mcbS)});
  });
  (S.custom || []).forEach(x => devs.push({key:'x:' + x.id, kind:'custom', ref:x.id, rating:num(x.rating, 0) || null, label:x.name || 'Custom', w:Math.max(1, Math.round(num(x.w, 1))), sec:1, ph:x.ph || 'N', cx:x.id}));
  S.modules.forEach(m => {
    const r = R.m[m.id];
    if (r.nodin) return;
    devs.push({key:'m:' + m.id, kind:'lutron', ref:m.id, rating:null, label:m.model, w:r.w, sec:S.seg ? 2 : 1, ph:r.ph, mod:m.id, lib:r.lib});
  });
  if (typeof daliPanelDevs === 'function'){ try { daliPanelDevs(S).forEach(d => devs.push(d)); } catch (e) {} }
  const keys = devs.map(d => d.key);
  S.order = (S.order || []).filter(k => keys.includes(k));
  keys.forEach(k => { if (k !== 'inc' && k !== 'spd' && !S.order.includes(k)) S.order.push(k); });
  const rank = k => k === 'inc' ? -2 : k === 'spd' ? -1 : S.order.indexOf(k);
  devs.sort((a, b) => (a.sec - b.sec) || (rank(a.key) - rank(b.key)));
  const cols = Math.max(6, S.cols | 0), place = [];
  let row = 0, col = 0, lastSec = devs.length ? devs[0].sec : 0;
  devs.forEach(d => {
    if (d.sec !== lastSec && d.sec === 2 && col > 0){ row++; col = 0; }
    lastSec = d.sec;
    if (col > 0 && col + d.w > cols){ row++; col = 0; }
    place.push({d, row, col});
    col += d.w;
  });
  const rows = place.length ? row + 1 : 1;
  const used = place.reduce((a, p) => a + p.d.w, 0);
  const pitch = R.hasAdaptive ? 150 : 125;
  return {devs, place, rows, cols, used, free: rows * cols - used, pitch,
    widthMm: cols * 18 + 80, heightMm: rows * pitch + 160};
}
