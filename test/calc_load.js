/* loads designer/calc.js (+ seed.js) into a plain object for node tests */
const fs = require('fs'), vm = require('vm'), path = require('path');
module.exports = function(){
  const ctx = vm.createContext({console, Math});
  const d = path.join(__dirname, '..', 'designer');
  vm.runInContext(fs.readFileSync(path.join(d, 'calc.js'), 'utf8') + '\n' + fs.readFileSync(path.join(d, 'seed.js'), 'utf8') +
    '\nthis.X = {STD, SYSTEMS, TYPES, BRK, compute, buildDevices, exampleProject, polesOf, dpOf, incRatings, kTemp, rcdAcOnly, TRIPK, stdFam};', ctx);
  return ctx.X;
};
