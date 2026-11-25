'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createBoundedGemini, MODEL, OID } = require('./lib/br136-bounded-gemini.cjs');
const input = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const options = { method: 'POST', body: JSON.stringify({ contents: [], generationConfig: { maxOutputTokens: 1024 } }) };
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'br136-bounded-offline-'));
  let at = Date.now(), calls = 0;
  const policy = { enabled: true, databaseOid: OID, model: MODEL, machineBinding: 'TEST_ONLY', approvalId: 'OFFLINE_TEST_ONLY',
    approvedAt: new Date(at - 1000).toISOString(), expiresAt: new Date(at + 3600000).toISOString(), dailyBudgetCalls: 2, totalBudgetCalls: 2 };
  const write = () => fs.writeFileSync(path.join(directory, 'control.json'), JSON.stringify(policy));
  write();
  const make = transport => createBoundedGemini({ directory, machineBinding: 'TEST_ONLY', now: () => at, transport: transport || (async () => { calls++; return { ok: true }; }) });
  return { directory, policy, write, make, advance: n => { at += n; }, calls: () => calls };
}
test('disabled, expired, wrong target and excessive budgets: zero fake dispatch', async () => {
  for (const patch of [{ enabled: false }, { expiresAt: '2000-01-01' }, { databaseOid: '953322' }, { dailyBudgetCalls: 11 }]) {
    const f = fixture(); Object.assign(f.policy, patch); f.write();
    await assert.rejects(f.make().dispatch(input, options), /OPERATOR_AI_DISABLED/); assert.equal(f.calls(), 0);
  }
});
test('durable budget survives new adapter instance and process', async () => {
  const f = fixture(); f.policy.totalBudgetCalls = 1; f.write();
  await f.make().dispatch(input, options); f.advance(16000);
  await assert.rejects(f.make().dispatch(input, options), /DAILY_BUDGET_EXCEEDED/);
  const result = await worker(f.directory); assert.equal(result, 'DAILY_BUDGET_EXCEEDED'); assert.equal(f.calls(), 1);
});
test('minimum 15 second spacing, emergency disable and prompt size bound', async () => {
  const f = fixture(); await f.make().dispatch(input, options);
  await assert.rejects(f.make().dispatch(input, options), /PROVIDER_RATE_LIMITED/);
  f.advance(16000); f.policy.enabled = false; f.write();
  await assert.rejects(f.make().dispatch(input, options), /OPERATOR_AI_DISABLED/);
  f.policy.enabled = true; f.write();
  await assert.rejects(f.make().dispatch(input, { ...options, body: 'x'.repeat(32769) }), /AI_DISPATCH_SCOPE_BLOCKED/);
  assert.equal(f.calls(), 1);
});
test('transport timeout/failure consumes durable reservation, never retries', async () => {
  const f = fixture(); f.policy.totalBudgetCalls = 1; f.write(); let calls = 0;
  await assert.rejects(f.make(async () => { calls++; throw Error('PROVIDER_TIMEOUT'); }).dispatch(input, options), /PROVIDER_TIMEOUT/);
  f.advance(16000); await assert.rejects(f.make().dispatch(input, options), /DAILY_BUDGET_EXCEEDED/); assert.equal(calls, 1);
});
test('two independent processes compete: at most one fake dispatch', async () => {
  const f = fixture(); f.policy.totalBudgetCalls = 1; f.write();
  const results = await Promise.all([worker(f.directory), worker(f.directory)]);
  assert.equal(results.filter(r => r === 'FAKE_DISPATCH').length, 1);
  assert.equal(fs.readFileSync(path.join(f.directory, 'dispatches.jsonl'), 'utf8').trim().split('\n').length, 1);
});
test('crash lock and corrupt ledger fail closed without implicit reset', async () => {
  const f = fixture(); fs.writeFileSync(path.join(f.directory, 'dispatch.lock'), '');
  await assert.rejects(f.make().dispatch(input, options), /CRASH_REVIEW_REQUIRED/); assert.equal(f.calls(), 0);
  const other = fixture(); fs.writeFileSync(path.join(other.directory, 'dispatches.jsonl'), 'broken');
  await assert.rejects(other.make().dispatch(input, options)); assert.equal(other.calls(), 0);
});
function worker(directory) {
  const code = `const {createBoundedGemini}=require(${JSON.stringify(require.resolve('./lib/br136-bounded-gemini.cjs'))});
    const gate=createBoundedGemini({directory:process.argv[1],machineBinding:'TEST_ONLY',transport:async()=>{process.stdout.write('FAKE_DISPATCH');await new Promise(r=>setTimeout(r,100));}});
    gate.dispatch(${JSON.stringify(input)},${JSON.stringify(options)}).catch(e=>process.stdout.write(e.message));`;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', code, directory], { windowsHide: true }); let out = '';
    child.stdout.on('data', b => { out += b; }); child.once('error', reject); child.once('close', c => c === 0 ? resolve(out) : reject(Error('WORKER_FAILED')));
  });
}
