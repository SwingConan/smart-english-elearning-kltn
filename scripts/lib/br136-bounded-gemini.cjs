'use strict';
// Local demo transport control. No key, prompt, response, cookie or user ID is persisted.
const fs = require('node:fs');
const path = require('node:path');
const MODEL = 'gemini-3.5-flash-lite';
const OID = '1313121';
function createBoundedGemini({ directory, machineBinding, transport, now = Date.now }) {
  const controlFile = path.join(directory, 'control.json');
  const ledgerFile = path.join(directory, 'dispatches.jsonl');
  const lockFile = path.join(directory, 'dispatch.lock');
  function control() {
    let p;
    try { p = JSON.parse(fs.readFileSync(controlFile, 'utf8')); }
    catch { throw Error('OPERATOR_AI_DISABLED'); }
    if (p.enabled !== true || p.databaseOid !== OID || p.model !== MODEL
      || p.machineBinding !== machineBinding || !/^[A-Z0-9_-]{8,100}$/.test(p.approvalId || '')
      || !Number.isSafeInteger(p.dailyBudgetCalls) || p.dailyBudgetCalls < 1 || p.dailyBudgetCalls > 10
      || !Number.isSafeInteger(p.totalBudgetCalls) || p.totalBudgetCalls < 1 || p.totalBudgetCalls > 10
      || !Number.isFinite(Date.parse(p.approvedAt)) || Date.parse(p.approvedAt) > now()
      || !Number.isFinite(Date.parse(p.expiresAt)) || Date.parse(p.expiresAt) <= now()
      || Date.parse(p.expiresAt) - Date.parse(p.approvedAt) > 24 * 60 * 60 * 1000)
      throw Error('OPERATOR_AI_DISABLED');
    return p;
  }
  function readLedger() {
    if (!fs.existsSync(ledgerFile)) return [];
    // Invalid/truncated state fails closed; never truncate or reset historical usage.
    return fs.readFileSync(ledgerFile, 'utf8').split('\n').filter(Boolean).map(line => {
      const r = JSON.parse(line);
      if (!Number.isFinite(r.at) || typeof r.approvalId !== 'string') throw Error('AI_LEDGER_INVALID');
      return r;
    });
  }
  function summary() {
    let p; try { p = control(); } catch { return { enabled: false, model: MODEL, databaseOid: OID }; }
    const rows = readLedger();
    return { enabled: true, model: MODEL, databaseOid: OID, dailyBudgetCalls: p.dailyBudgetCalls,
      totalBudgetCalls: p.totalBudgetCalls, expiresAt: p.expiresAt,
      reservedToday: rows.filter(r => new Date(r.at).toISOString().slice(0, 10) === new Date(now()).toISOString().slice(0, 10)).length,
      reservedForApproval: rows.filter(r => r.approvalId === p.approvalId).length };
  }
  async function dispatch(input, options = {}) {
    control();
    const url = new URL(input instanceof URL ? input.href : typeof input === 'string' ? input : input.url);
    if (url.href !== `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
      || options.method !== 'POST' || typeof options.body !== 'string'
      || Buffer.byteLength(options.body) > 32768) throw Error('AI_DISPATCH_SCOPE_BLOCKED');
    const body = JSON.parse(options.body);
    if (body.generationConfig?.maxOutputTokens !== 1024 || body.tools !== undefined)
      throw Error('AI_DISPATCH_SCOPE_BLOCKED');
    let fd;
    try { fd = fs.openSync(lockFile, 'wx', 0o600); }
    catch { throw Error('PROVIDER_BUSY_OR_CRASH_REVIEW_REQUIRED'); }
    try {
      const p = control(), rows = readLedger(), at = now(), day = new Date(at).toISOString().slice(0, 10);
      if (rows.some(r => r.at > at)) throw Error('AI_CLOCK_ROLLBACK_BLOCKED');
      if (rows.filter(r => new Date(r.at).toISOString().slice(0, 10) === day).length >= p.dailyBudgetCalls
        || rows.filter(r => r.approvalId === p.approvalId).length >= p.totalBudgetCalls)
        throw Error('DAILY_BUDGET_EXCEEDED');
      if (rows.some(r => at - r.at < 15000)) throw Error('PROVIDER_RATE_LIMITED_429');
      const log = fs.openSync(ledgerFile, 'a', 0o600);
      try { fs.writeSync(log, JSON.stringify({ at, approvalId: p.approvalId, databaseOid: OID, model: MODEL }) + '\n'); fs.fsyncSync(log); }
      finally { fs.closeSync(log); }
      control(); // emergency off immediately before outbound request
      // Reservation is never refunded on failure, timeout, cancellation or process exit. No retries.
      return await transport(input, { ...options, redirect: 'error' });
    } finally {
      fs.closeSync(fd);
      fs.unlinkSync(lockFile); // only the lock this process acquired; crash locks require operator review
    }
  }
  return { control, summary, dispatch, controlFile };
}
module.exports = { createBoundedGemini, MODEL, OID };
