'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { windowsPrivateIdentity } = require('./lib/gemini-live-runtime.cjs');
const { createBoundedGemini, MODEL, OID } = require('./lib/br136-bounded-gemini.cjs');
const action = process.argv[2];
if (!['prepare', 'status', 'disable'].includes(action) || process.argv.length !== 3) {
  console.error('USAGE: node scripts/br136-gemini-control.cjs prepare|status|disable'); process.exit(1);
}
const identity = windowsPrivateIdentity();
const directory = path.join(identity.privateRoot, 'bounded-web');
fs.mkdirSync(directory, { recursive: true });
const gate = createBoundedGemini({ directory, machineBinding: identity.machineBinding, transport: () => { throw Error('NO_LIVE_IN_CONTROL_TOOL'); } });
if (action === 'prepare') {
  try { fs.writeFileSync(gate.controlFile, JSON.stringify({ enabled: false, approvalId: null, approvedAt: null, expiresAt: null,
    databaseOid: OID, machineBinding: identity.machineBinding, model: MODEL, dailyBudgetCalls: 0, totalBudgetCalls: 0 }, null, 2), { flag: 'wx', mode: 0o600 }); }
  catch (e) { if (e.code !== 'EEXIST') throw e; }
}
if (action === 'disable') {
  const policy = JSON.parse(fs.readFileSync(gate.controlFile, 'utf8'));
  // Atomic replacement: readers see either the previous complete policy or disabled policy.
  const temp = gate.controlFile + '.disable-' + process.pid;
  fs.writeFileSync(temp, JSON.stringify({ ...policy, enabled: false }, null, 2), { flag: 'wx', mode: 0o600 });
  fs.renameSync(temp, gate.controlFile);
}
console.log(JSON.stringify({ action, ...gate.summary(), networkRequests: 0, secretsPrinted: false }));
