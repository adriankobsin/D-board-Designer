/* TEST-ONLY stand-in for the Anthropic Messages API. Returns a fixed, realistic tool_use result so the Worker and the
   browser import flow can be exercised without an API key. It does NOT read the uploaded image, so it says nothing about
   real recognition accuracy. */
const http = require('http');
let last = null, calls = 0, mode = 'photo';
const dev = (o) => Object.assign({kind: 'mcb', is_incomer: false, rating_a: null, curve: null, poles: 1, rcd_ma: null, circuit_ref: null, label: null, load_description: null, load_type: null, power_w: null, phase: 'unknown', cable_mm2: null, cable_length_m: null, manufacturer: null, model: null, confidence: 0.9, notes: null, rail: 1, slot: 1}, o);
const PHOTO = {source_type: 'photo', panel: {name: 'DB-1 Galley', standard: null, system: null, rails: 2, modules_per_rail: 18, notes: null}, devices: [
  dev({kind: 'isolator', is_incomer: true, rating_a: 63, poles: 4, label: 'MAIN', slot: 1}),
  dev({kind: 'spd', poles: 2, label: 'SPD', slot: 2, confidence: 0.8}),
  dev({kind: 'rccb', rating_a: 40, poles: 2, rcd_ma: 30, label: 'RCD A', slot: 3}),
  dev({kind: 'rcbo', rating_a: 16, curve: 'B', rcd_ma: 30, circuit_ref: 'C1', label: 'Salon sockets', load_type: 'sockets', phase: 'L1', slot: 4, power_w: 2300}),
  dev({kind: 'rcbo', rating_a: 16, curve: 'C', rcd_ma: 30, circuit_ref: 'C2', label: 'Galley sockets', phase: 'L2', slot: 5}),
  dev({kind: 'mcb', rating_a: 10, curve: 'B', circuit_ref: 'C3', label: 'Cabin lighting', phase: 'L3', slot: 6, cable_mm2: 1.5, cable_length_m: 18}),
  dev({kind: 'mcb', rating_a: 32, curve: 'C', poles: 3, circuit_ref: 'C4', label: 'Chiller pump', load_type: 'hvac', phase: '3P', slot: 7, power_w: 11000}),
  dev({kind: 'mcb', rating_a: null, curve: null, circuit_ref: 'C5', label: 'Bilge pump?', phase: 'unknown', slot: 8, confidence: 0.35, notes: 'Rating cut off by label holder'}),
  dev({kind: 'contactor', rating_a: 25, poles: 2, label: 'Heater contactor', rail: 2, slot: 1, manufacturer: 'Schneider', model: 'iCT25', confidence: 0.7}),
  dev({kind: 'meter', poles: 4, label: 'kWh', rail: 2, slot: 2}),
  dev({kind: 'psu', rating_a: 2.5, poles: 4, label: '24V PSU', rail: 2, slot: 3, manufacturer: 'Mean Well'}),
  dev({kind: 'mcb', rating_a: 20, curve: 'C', circuit_ref: 'C6', label: 'Aircon', phase: 'L1', rail: 2, slot: 4})
], issues: ['Glare on the right-hand label strip']};
const SCHEM = {source_type: 'single_line_schematic', panel: {name: 'SB-2 Engine room', standard: 'iso', system: '3p400', rails: null, modules_per_rail: null, notes: null}, devices: [
  dev({kind: 'mccb', is_incomer: true, rating_a: 100, poles: 4, label: 'Incomer Q0', rail: null, slot: null}),
  dev({kind: 'mcb', rating_a: 16, curve: 'C', poles: 3, circuit_ref: 'Q1', label: 'Fuel transfer pump', load_type: 'pump', phase: '3P', power_w: 4000, cable_mm2: 2.5, cable_length_m: 20, rail: null, slot: null}),
  dev({kind: 'mcb', rating_a: 10, curve: 'B', circuit_ref: 'Q2', label: 'Engine room lighting', load_type: 'lighting', phase: 'L1', rail: null, slot: null})
], issues: []};
http.createServer((req, res) => {
  let raw = ''; req.on('data', d => raw += d); req.on('end', () => {
    if (req.url === '/__last') { res.writeHead(200, {'content-type': 'application/json'}); return res.end(JSON.stringify({calls, last})); }
    if (req.url.startsWith('/__mode/')) { mode = req.url.split('/')[2]; res.writeHead(200); return res.end('ok'); }
    if (req.url === '/v1/messages' && req.method === 'POST') {
      calls++; let b = {}; try { b = JSON.parse(raw); } catch (e) {}
      last = {key: req.headers['x-api-key'], version: req.headers['anthropic-version'], model: b.model, tool_choice: b.tool_choice, tools: (b.tools || []).map(t => t.name), blocks: ((b.messages || [])[0] || {content: []}).content.map(c => c.type + (c.source ? ':' + c.source.media_type : '')), text: ((b.messages || [])[0] || {content: []}).content.filter(c => c.type === 'text').map(c => c.text).join(' | '), system_len: (b.system || '').length};
      if (mode === 'fail429') { res.writeHead(429, {'content-type': 'application/json'}); return res.end('{"error":{"type":"rate_limit_error"}}'); }
      if (mode === 'empty') { res.writeHead(200, {'content-type': 'application/json'}); return res.end(JSON.stringify({content: [{type: 'text', text: 'sorry'}], stop_reason: 'end_turn'})); }
      res.writeHead(200, {'content-type': 'application/json'});
      return res.end(JSON.stringify({id: 'msg_test', type: 'message', role: 'assistant', model: b.model, stop_reason: 'tool_use', content: [{type: 'tool_use', id: 'tu_1', name: 'record_panel', input: mode === 'schem' ? SCHEM : PHOTO}], usage: {input_tokens: 1000, output_tokens: 500}}));
    }
    res.writeHead(404); res.end('{}');
  });
}).listen(+process.env.PORT || 54400, () => console.log('mock anthropic up'));
