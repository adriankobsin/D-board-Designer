function exampleProject(){
  return {
    name:'Example cabin and AV board', company:'', custom:[], dcPoles:'2P', logo:'', logoW:0, logoH:0, std:'iec', sysId:'3p400', phases:3, vLN:230, f:50, ik:6, ambient:30, cabinAmb:40, diversity:0.8,
    incomer:0, incLen:12, incCable:'xlpe', enclW:0, cols:24, seg:true, spd:true, rcboW:1, vdL:null, vdO:null, order:[],
    modules:[
      {id:'M1', model:'LQSE-4A5-230-D', phase:'L1', len:10, inSel:0, cable:'pvc', size:'auto'},
      {id:'M2', model:'LQSE-4S5-230-D', phase:'L2', len:10, inSel:0, cable:'pvc', size:'auto'},
      {id:'M3', model:'LQSE-2DAL-D', phase:'L3', len:6, inSel:0, cable:'pvc', size:'auto'}
    ],
    dali:{units:[
      {id:'D1', model:'DALI-2 IoT4 Gateway PS', label:'Panel gateway', link:''},
      {id:'D2', model:'DALI-2 4Ch LED Dimmer CV 16A DIN', label:'Salon LED strips', link:'D1:1'},
      {id:'D3', model:'DALI-2 MC4L DIN Rail', label:'Salon wall switches', link:'D1:1'},
      {id:'D4', model:'DALI-2 RGBW LED Dimmer CV DT8 16A DIN', label:'Owner cabin mood light', link:'D1:2'},
      {id:'D5', model:'DALI-2 1Ch LED Power Supply 700 mA', label:'Corridor downlight', link:'D1:3'},
      {id:'D6', model:'DALI-2 2Ch LED Dimmer CC 500 mA', label:'Galley spots', link:'D1:3'}
    ]},
    circuits:[
      {id:'c1', ref:'C1', name:'Salon sockets', type:'sockets', mod:'', zone:1, P:2300, pf:.95, phase:'L1', len:18, prot:'RCBO', curve:'B', dem:1, grp:1, cable:'pvc', size:'auto', inO:0},
      {id:'c2', ref:'C2', name:'Galley sockets', type:'galley', mod:'', zone:1, P:3000, pf:.95, phase:'L2', len:22, prot:'RCBO', curve:'C', dem:1, grp:1, cable:'pvc', size:'auto', inO:0},
      {id:'c3', ref:'C3', name:'Crew mess sockets', type:'sockets', mod:'', zone:1, P:2300, pf:.95, phase:'L3', len:15, prot:'RCBO', curve:'B', dem:1, grp:1, cable:'pvc', size:'auto', inO:0},
      {id:'c4', ref:'C4', name:'AV rack 1 (UPS)', type:'av', mod:'', zone:1, P:1500, pf:.9, phase:'L1', len:12, prot:'RCBO', curve:'C', dem:1, grp:1, cable:'pvc', size:'auto', inO:0},
      {id:'c5', ref:'C5', name:'AV rack 2', type:'av', mod:'', zone:1, P:1200, pf:.9, phase:'L2', len:12, prot:'RCBO', curve:'C', dem:1, grp:1, cable:'pvc', size:'auto', inO:0},
      {id:'c6', ref:'C6', name:'Chilled-water pump', type:'hvac', mod:'', zone:1, P:2200, pf:.8, phase:'3P', len:25, prot:'MCB', curve:'C', dem:1, grp:1, cable:'pvc', size:'auto', inO:0},
      {id:'c7', ref:'C7', name:'Calorifier', type:'heater', mod:'', zone:1, P:2000, pf:1, phase:'L3', len:14, prot:'MCB', curve:'B', dem:1, grp:1, cable:'pvc', size:'auto', inO:0},
      {id:'c8', ref:'C8', name:'Salon downlights', type:'lighting', mod:'M1', zone:1, P:480, pf:.95, phase:'L1', len:14, prot:'MCB', curve:'B', dem:1, grp:1, cable:'pvc', size:'auto', inO:0},
      {id:'c9', ref:'C9', name:'Salon cove lighting', type:'lighting', mod:'M1', zone:2, P:300, pf:.95, phase:'L1', len:16, prot:'MCB', curve:'B', dem:1, grp:1, cable:'pvc', size:'auto', inO:0},
      {id:'c10', ref:'C10', name:'Owner cabin lighting', type:'lighting', mod:'M1', zone:3, P:500, pf:.95, phase:'L1', len:20, prot:'MCB', curve:'B', dem:1, grp:1, cable:'pvc', size:'auto', inO:0},
      {id:'c11', ref:'C11', name:'Corridor lighting', type:'lighting', mod:'M2', zone:1, P:400, pf:.95, phase:'L2', len:24, prot:'MCB', curve:'B', dem:1, grp:1, cable:'pvc', size:'auto', inO:0},
      {id:'c12', ref:'C12', name:'Deck lighting', type:'lighting', mod:'M2', zone:2, P:360, pf:.95, phase:'L2', len:30, prot:'MCB', curve:'B', dem:1, grp:1, cable:'pvc', size:'auto', inO:0}
    ]
  };
}
