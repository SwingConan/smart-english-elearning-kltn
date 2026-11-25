import path from 'node:path';
import { URL } from 'node:url';

export const qaPorts = Object.freeze([55831, 55832]);
const fail = (reason) => ({ ok: false, reason });
const pass = (reason) => ({ ok: true, reason });
const ms = (v) => (typeof v === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(v) ? Date.parse(v) : NaN);
const winPath = (v, cwd = 'D:\\') =>
  typeof v === 'string' && v.length ? path.win32.resolve(cwd, v).toLowerCase() : null;
const states = [
  'Unknown',
  'Closed',
  'Listen',
  'SynSent',
  'SynReceived',
  'Established',
  'FinWait1',
  'FinWait2',
  'CloseWait',
  'Closing',
  'LastAck',
  'TimeWait',
  'DeleteTCB',
];
const nativeStates = {
  CLOSED: 1,
  LISTENING: 2,
  SYN_SENT: 3,
  SYN_RECEIVED: 4,
  ESTABLISHED: 5,
  FIN_WAIT_1: 6,
  FIN_WAIT_2: 7,
  CLOSE_WAIT: 8,
  CLOSING: 9,
  LAST_ACK: 10,
  TIME_WAIT: 11,
  DELETE_TCB: 12,
};

/** Windows native argv decoder for our controlled Node/Chrome commands. No
 * shell evaluation, substring identity, expansion, or malformed-quote fallback.
 */
export function windowsArgv(line) {
  if (
    typeof line !== 'string' ||
    line.includes(String.fromCharCode(0)) ||
    line.includes('\r') ||
    line.includes('\n')
  )
    throw Error('ARGV_INVALID');
  const args = [];
  let i = 0;
  while (i < line.length) {
    while (/[ \t]/.test(line[i] ?? '') && i < line.length) i++;
    if (i === line.length) break;
    let word = '',
      quoted = false;
    while (i < line.length) {
      if (!quoted && /[ \t]/.test(line[i])) break;
      let slashes = 0;
      while (line[i] === '\\') {
        slashes++;
        i++;
      }
      if (line[i] === '"') {
        word += '\\'.repeat(Math.floor(slashes / 2));
        if (slashes % 2) word += '"';
        else quoted = !quoted;
        i++;
      } else {
        word += '\\'.repeat(slashes);
        if (i < line.length) word += line[i++];
      }
    }
    if (quoted) throw Error('ARGV_UNBALANCED_QUOTES');
    args.push(word);
  }
  return args;
}
export function processIdentity(record, expected, observedAt) {
  if (
    !record ||
    !expected ||
    !Number.isSafeInteger(expected.pid) ||
    expected.pid <= 0 ||
    record.PID !== expected.pid
  )
    return fail('PROCESS_PID_MISMATCH');
  const tolerance = expected.toleranceMs ?? 0,
    created = ms(record.CreatedAt),
    pinned = ms(expected.createdAt),
    observed = ms(observedAt);
  if (
    !Number.isFinite(created) ||
    !Number.isFinite(pinned) ||
    !Number.isFinite(observed) ||
    tolerance < 0 ||
    tolerance > 2000 ||
    Math.abs(created - pinned) > tolerance ||
    created > observed ||
    (tolerance === 0 && record.CreatedAt !== expected.createdAt)
  )
    return fail('PROCESS_GENERATION_UNKNOWN_OR_CHANGED');
  if (record.ParentPID !== expected.parentPid || !Number.isSafeInteger(record.ParentPID))
    return fail('PROCESS_PARENT_MISMATCH');
  if (
    winPath(record.Executable) !== winPath(expected.executable) ||
    String(record.Name).toLowerCase() !== path.win32.basename(expected.executable).toLowerCase()
  )
    return fail('PROCESS_EXECUTABLE_UNVERIFIED');
  try {
    const actual = windowsArgv(record.CommandLine),
      wanted = expected.argv;
    if (!Array.isArray(wanted) || actual.length !== wanted.length || !actual.length)
      return fail('PROCESS_ARGV_MISMATCH');
    for (let i = 0; i < actual.length; i++) {
      const same =
        i === 0 || (expected.kind === 'node' && i === 1)
          ? winPath(actual[i], expected.cwd) === winPath(wanted[i], expected.cwd)
          : actual[i] === wanted[i];
      if (!same) return fail('PROCESS_ARGV_MISMATCH');
    }
  } catch {
    return fail('PROCESS_ARGV_UNVERIFIED');
  }
  return pass('PROCESS_GENERATION_AND_IMAGE_METADATA_MATCH');
}
export function tcpState(row) {
  const n = row?.StateNumeric,
    raw = row?.StateRaw;
  if (
    !Number.isInteger(n) ||
    n <= 0 ||
    n >= states.length ||
    typeof raw !== 'string' ||
    !raw.trim()
  )
    return fail('TCP_STATE_UNKNOWN');
  if (raw.toLowerCase() !== states[n].toLowerCase() && raw !== String(n))
    return fail('TCP_STATE_CONTRADICTORY');
  return { ok: true, state: n };
}
export function parseNativeRow(line) {
  const m =
    typeof line === 'string' && /^\s*TCP\s+(\S+)\s+(\S+)\s+([A-Z_0-9]+)\s+(\d+)\s*$/.exec(line);
  if (!m || !Object.hasOwn(nativeStates, m[3])) return null;
  const endpoint = (s) => {
    const x = /^(.*):(\d+)$/.exec(s);
    return x ? { address: x[1].replace(/^\[|\]$/g, ''), port: Number(x[2]) } : null;
  };
  const local = endpoint(m[1]),
    remote = endpoint(m[2]);
  if (!local || !remote || local.port > 65535 || remote.port > 65535) return null;
  return {
    PID: Number(m[4]),
    LocalAddress: local.address,
    LocalPort: local.port,
    RemoteAddress: remote.address,
    RemotePort: remote.port,
    StateNumeric: nativeStates[m[3]],
  };
}
function health(s) {
  if (
    !s ||
    s.SchemaVersion !== 2 ||
    s.TcpOk !== true ||
    s.ProcessesOk !== true ||
    s.NativeScanComplete !== true ||
    s.NetstatExit !== 0 ||
    !Array.isArray(s.CollectorErrors) ||
    s.CollectorErrors.length ||
    !Array.isArray(s.Records) ||
    !Array.isArray(s.NativeLines) ||
    !Array.isArray(s.Processes) ||
    !Number.isFinite(ms(s.At))
  )
    return fail('OS_METADATA_INCOMPLETE');
  if (
    s.Elevated !== false ||
    typeof s.Identity !== 'string' ||
    !s.Identity ||
    s.Identity.includes('CodexSandboxOffline')
  )
    return fail('OPERATOR_CONTEXT_UNVERIFIED');
  if (new Set(s.Processes.map((p) => p.PID)).size !== s.Processes.length)
    return fail('PROCESS_ROWS_AMBIGUOUS');
  if (s.NativeLines.some((l) => !parseNativeRow(l))) return fail('NATIVE_TCP_ROW_UNINTERPRETABLE');
  return pass('COLLECTOR_COMPLETE');
}
export function assessGate(s, { phase, node, chrome = null, collector = null, server = null }) {
  try {
    const complete = health(s);
    if (!complete.ok) return complete;
    if ((s.CollectorPid ?? 0) !== (collector?.pid ?? 0)) return fail('COLLECTOR_IDENTITY_UNBOUND');
    const roots = [node, ...(chrome ? [chrome] : []), ...(collector ? [collector] : [])],
      owned = new Set();
    for (const p of roots) {
      const checked = processIdentity(
        s.Processes.find((r) => r.PID === p.pid),
        p,
        s.At,
      );
      if (!checked.ok) return checked;
      owned.add(p.pid);
    }
    if (chrome && (chrome.parentPid !== node.pid || ms(chrome.createdAt) < ms(node.createdAt)))
      return fail('CHROME_ANCESTRY_CONTRADICTORY');
    if (
      collector &&
      (collector.parentPid !== node.pid || ms(collector.createdAt) < ms(node.createdAt))
    )
      return fail('COLLECTOR_ANCESTRY_CONTRADICTORY');
    // Collector candidates are only roots/descendants. Verify every candidate;
    // missing ancestry/metadata is not an unrelated-process allowlist.
    const remaining = s.Processes.filter((p) => !owned.has(p.PID));
    while (remaining.length) {
      const i = remaining.findIndex((p) => owned.has(p.ParentPID));
      if (i < 0) return fail('PROCESS_ANCESTRY_UNKNOWN');
      const p = remaining.splice(i, 1)[0],
        parent = s.Processes.find((r) => r.PID === p.ParentPID);
      if (
        !chrome ||
        winPath(p.Executable) !== winPath(chrome.executable) ||
        p.Name?.toLowerCase() !== 'chrome.exe' ||
        !Number.isFinite(ms(p.CreatedAt)) ||
        ms(p.CreatedAt) < ms(parent.CreatedAt) ||
        ms(p.CreatedAt) > ms(s.At) ||
        !p.CommandLine
      )
        return fail('CHILD_PROCESS_IDENTITY_UNKNOWN');
      const argv = windowsArgv(p.CommandLine);
      if (winPath(argv[0]) !== winPath(chrome.executable) || !argv.some((a) => /^--type=/.test(a)))
        return fail('CHILD_PROCESS_ARGV_UNKNOWN');
      owned.add(p.PID);
    }
    const native = s.NativeLines.map(parseNativeRow);
    const relevant = (r) => owned.has(r.PID) || qaPorts.includes(r.LocalPort);
    const rows = s.Records.filter(relevant);
    for (const r of rows) {
      const state = tcpState(r);
      if (!state.ok) return state;
      if (!owned.has(r.PID) && !(phase === 'teardown' && r.PID === 0 && state.state === 11))
        return fail('UNOWNED_QA_PORT_RECORD');
      if (state.state === 2) {
        if (r.LocalAddress !== '127.0.0.1' || !qaPorts.includes(r.LocalPort))
          return fail('UNEXPECTED_OWNED_LISTENER');
      } else if (
        r.RemotePort &&
        !(r.LocalAddress === '127.0.0.1' && qaPorts.includes(r.LocalPort)) &&
        !(r.RemoteAddress === '127.0.0.1' && qaPorts.includes(r.RemotePort))
      )
        return fail('NON_QA_CONNECTION');
    }
    for (const r of native.filter(relevant)) {
      if (!owned.has(r.PID) && !(phase === 'teardown' && r.PID === 0 && r.StateNumeric === 11))
        return fail('UNOWNED_NATIVE_QA_RECORD');
      if (
        r.StateNumeric === 2 &&
        (r.LocalAddress !== '127.0.0.1' || !qaPorts.includes(r.LocalPort))
      )
        return fail('UNEXPECTED_NATIVE_LISTENER');
      if (
        r.StateNumeric !== 2 &&
        r.RemotePort &&
        !(r.LocalAddress === '127.0.0.1' && qaPorts.includes(r.LocalPort)) &&
        !(r.RemoteAddress === '127.0.0.1' && qaPorts.includes(r.RemotePort))
      )
        return fail('NON_QA_NATIVE_CONNECTION');
      if (
        !rows.some(
          (x) =>
            x.PID === r.PID &&
            x.LocalAddress === r.LocalAddress &&
            x.LocalPort === r.LocalPort &&
            x.RemoteAddress === r.RemoteAddress &&
            x.RemotePort === r.RemotePort &&
            x.StateNumeric === r.StateNumeric,
        )
      )
        return fail('TCP_SOURCES_CONTRADICTORY');
    }
    for (const r of rows)
      if (
        !native.some(
          (x) =>
            x.PID === r.PID &&
            x.LocalAddress === r.LocalAddress &&
            x.LocalPort === r.LocalPort &&
            x.RemoteAddress === r.RemoteAddress &&
            x.RemotePort === r.RemotePort &&
            x.StateNumeric === r.StateNumeric,
        )
      )
        return fail('TCP_SOURCES_CONTRADICTORY');
    // A QA local port alone does not establish direction or peer ownership.
    // Non-listening flows need a reverse tuple in another owned socket record.
    for (const r of rows) {
      if (
        r.StateNumeric === 2 ||
        !r.RemotePort ||
        (phase === 'teardown' && r.PID === 0 && r.StateNumeric === 11)
      )
        continue;
      if (r.LocalAddress !== '127.0.0.1' || r.RemoteAddress !== '127.0.0.1')
        return fail('NON_QA_PEER_ADDRESS');
      if (
        !rows.some(
          (p) =>
            owned.has(p.PID) &&
            p.LocalAddress === r.RemoteAddress &&
            p.LocalPort === r.RemotePort &&
            p.RemoteAddress === r.LocalAddress &&
            p.RemotePort === r.LocalPort,
        )
      )
        return fail('QA_PEER_PROCESS_UNVERIFIED');
    }
    if (phase === 'preflight')
      return rows.some((r) => qaPorts.includes(r.LocalPort)) ||
        native.some((r) => qaPorts.includes(r.LocalPort))
        ? fail('QA_PORT_COLLISION')
        : pass('NO_COLLISION_OBSERVED_NOT_A_FREE_PORT_GUARANTEE');
    if (!['http', 'chrome', 'active', 'teardown'].includes(phase)) return fail('PHASE_INVALID');
    if (phase === 'teardown')
      return rows.some((r) => r.StateNumeric === 2) || native.some((r) => r.StateNumeric === 2)
        ? fail('QA_LISTENER_REMAINS')
        : chrome
          ? fail('CHROME_PROCESS_REMAINS')
          : pass('NO_OWNED_QA_LISTENER_OBSERVED');
    if (
      !server ||
      server.listening !== true ||
      server.address?.address !== '127.0.0.1' ||
      server.address?.port !== 55831 ||
      server.address?.family !== 'IPv4' ||
      server.pid !== node.pid
    )
      return fail('HTTP_BIND_EVENT_OR_TUPLE_UNVERIFIED');
    const listeners = [
      { port: 55831, pid: node.pid },
      ...(chrome ? [{ port: 55832, pid: chrome.pid }] : []),
    ];
    for (const l of listeners) {
      const m = rows.filter((r) => r.LocalPort === l.port && r.StateNumeric === 2);
      const n = native.filter((r) => r.LocalPort === l.port && r.StateNumeric === 2);
      if (m.length !== 1 || n.length !== 1 || m[0].PID !== l.pid || n[0].PID !== l.pid)
        return fail('LISTENER_GENERATION_OWNER_NOT_ATTESTED');
    }
    if (!chrome && rows.some((r) => r.LocalPort === 55832)) return fail('CDP_RESERVED_PORT_IN_USE');
    return pass('BIND_PROCESS_AND_TWO_OS_TCP_SOURCES_MATCH');
  } catch {
    return fail('GUARD_INPUT_MALFORMED');
  }
}
/** Raw input saved before any assertion, including collector/native failures. */
export function recordThenAssert(evidence, save, assess) {
  save(evidence);
  const verdict = assess(evidence);
  if (!verdict?.ok) {
    const e = Error(verdict?.reason ?? 'GUARD_RESULT_INVALID');
    e.verdict = verdict;
    throw e;
  }
  return verdict;
}
/** Structured child-process arguments only; a later success never masks failure. */
export function checkedNative(execute, file, args, options = {}) {
  const r = execute(file, args, { ...options, shell: false });
  if (r.error || r.signal || r.status !== 0) {
    const e = Error('NATIVE_COMMAND_FAILED');
    e.receipt = {
      file,
      args,
      status: r.status ?? null,
      signal: r.signal ?? null,
      error: r.error?.code ?? null,
      stdout: r.stdout ?? '',
      stderr: r.stderr ?? '',
    };
    throw e;
  }
  return r;
}
export function checkedSteps(steps, execute) {
  return steps.map((s) => checkedNative(execute, s.file, s.args, s.options));
}
export function withLogHandles(open, close, launch) {
  const handles = [];
  try {
    handles.push(open('stdout'));
    handles.push(open('stderr'));
    return launch(handles);
  } finally {
    for (const h of handles) close(h);
  }
}
export function snapshotArgs(script, nodePid, chromePid, profile) {
  if (
    !path.win32.isAbsolute(script) ||
    !path.win32.isAbsolute(profile) ||
    !Number.isSafeInteger(nodePid) ||
    nodePid <= 0 ||
    !Number.isSafeInteger(chromePid) ||
    chromePid < 0
  )
    throw Error('COLLECTOR_ARGUMENTS_INVALID');
  return [
    '-NoProfile',
    '-NonInteractive',
    '-File',
    script,
    '-RootNodePid',
    String(nodePid),
    '-ChromePid',
    String(chromePid),
    '-QaProfilePath',
    profile,
  ];
}
export function allowQaRequest(url, method = 'GET', host = '127.0.0.1:55831') {
  try {
    const u = new URL(url);
    return (
      method === 'GET' &&
      host === '127.0.0.1:55831' &&
      u.origin === 'http://127.0.0.1:55831' &&
      !u.username &&
      !u.password &&
      !u.hash &&
      ['/', '/qa.js', '/qa.css', '/favicon.ico'].includes(u.pathname)
    );
  } catch {
    return false;
  }
}
export function executionOptions(args, root) {
  if (
    !Array.isArray(args) ||
    args.length !== 2 ||
    args[0] !== '--execute-reviewed-session' ||
    !args[1].startsWith('--artifact-dir=')
  )
    throw Error('NEW_PO_EXECUTION_AUTHORITY_REQUIRED');
  const base = args[1].slice('--artifact-dir='.length),
    parent = path.win32.join(root, '.local-storage');
  if (
    !path.win32.isAbsolute(base) ||
    winPath(path.win32.dirname(base)) !== winPath(parent) ||
    !/^v2-wave10-s5b-review-[a-z0-9-]+$/.test(path.win32.basename(base))
  )
    throw Error('FRESH_REVIEWED_ARTIFACT_PATH_REQUIRED');
  return { base: path.win32.normalize(base) };
}
