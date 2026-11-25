import { createRequire } from 'node:module';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import {
  assessGate,
  processIdentity,
  tcpState,
  parseNativeRow,
  windowsArgv,
  recordThenAssert,
  checkedSteps,
  checkedNative,
  snapshotArgs,
  executionOptions,
  allowQaRequest,
  withLogHandles,
} from './guard-core.mjs';
import { validateHarness } from './validate.mjs';

// Register the same assertions with the runner that actually owns this process.
const { test } = process.env.VITEST
  ? await import('vitest')
  : createRequire(import.meta.url)('node:test');

const root = 'D:\\KLTN_Project\\smart-english-elearning-kltn';
for (const character of [String.fromCharCode(0), '\r', '\n'])
  test('argv rejects injected control code ' + character.charCodeAt(0), () =>
    assert.throws(() => windowsArgv('node.exe ' + character + ' injected')),
  );
const executable = 'C:\\Program Files\\nodejs\\node.exe';
const node = {
  kind: 'node',
  pid: 100,
  parentPid: 50,
  executable,
  argv: [executable, 'apps/web/src/features/operations/visual-qa/run.mjs'],
  cwd: root,
  createdAt: '2026-11-06T00:00:00.000Z',
};
const chrome = {
  kind: 'chrome',
  pid: 200,
  parentPid: 100,
  executable: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  argv: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    "--user-data-dir=D:\\QA path\\O'Brien",
    'about:blank',
  ],
  cwd: root,
  createdAt: '2026-11-06T00:00:05.000Z',
};
const quote = (s) => '"' + s.replaceAll('"', '\\"') + '"';
const record = (e) => ({
  PID: e.pid,
  ParentPID: e.parentPid,
  Name: e.kind === 'chrome' ? 'chrome.exe' : 'node.exe',
  CreatedAt: e.createdAt,
  Executable: e.executable,
  CommandLine: e.argv.map(quote).join(' '),
});
const row = (port = 55831, pid = 100) => ({
  PID: pid,
  LocalAddress: '127.0.0.1',
  LocalPort: port,
  RemoteAddress: '0.0.0.0',
  RemotePort: 0,
  StateRaw: 'Listen',
  StateNumeric: 2,
});
const native = (port = 55831, pid = 100) => ` TCP 127.0.0.1:${port} 0.0.0.0:0 LISTENING ${pid}`;
const options = (phase = 'http') => ({
  phase,
  node,
  server: {
    pid: 100,
    listening: true,
    address: { address: '127.0.0.1', port: 55831, family: 'IPv4' },
  },
});
function snapshot() {
  return {
    SchemaVersion: 2,
    At: '2026-11-06T00:00:20.000Z',
    Identity: 'SYNTHETIC\\Operator',
    Elevated: false,
    TcpOk: true,
    ProcessesOk: true,
    NativeScanComplete: true,
    NetstatExit: 0,
    CollectorErrors: [],
    Records: [row()],
    NativeLines: [native()],
    Processes: [record(node)],
  };
}
const blocked = (s, expected = options()) => {
  const result = assessGate(s, expected);
  assert.equal(result.ok, false, result.reason);
  return result;
};

test('positive requires actual bind tuple, exact process generation and two OS sources', () =>
  assert.equal(assessGate(snapshot(), options()).ok, true));
test('preflight is only no collision observed, not proof of future availability', () => {
  const s = snapshot();
  s.Records = [];
  s.NativeLines = [];
  assert.deepEqual(assessGate(s, options('preflight')), {
    ok: true,
    reason: 'NO_COLLISION_OBSERVED_NOT_A_FREE_PORT_GUARANTEE',
  });
});
test('occupied preflight target is denied even for the expected PID', () =>
  blocked(snapshot(), options('preflight')));
for (const field of ['TcpOk', 'ProcessesOk', 'NativeScanComplete'])
  test('incomplete collector ' + field, () => {
    const s = snapshot();
    s[field] = false;
    blocked(s);
  });
for (const errors of [['ACCESS_DENIED'], ['TCP_COLLECTION_FAILED'], ['NETSTAT_ROW_UNPARSEABLE']])
  test('collector errors never mean empty/safe ' + errors, () => {
    const s = snapshot();
    s.CollectorErrors = errors;
    blocked(s);
  });
for (const exit of [null, 1, -1])
  test('native exit ' + exit + ' cannot attest', () => {
    const s = snapshot();
    s.NetstatExit = exit;
    blocked(s);
  });
for (const context of [
  { Identity: 'HOST\\CodexSandboxOffline' },
  { Identity: '' },
  { Elevated: true },
  { Elevated: null },
])
  test('unverified context ' + JSON.stringify(context), () =>
    blocked({ ...snapshot(), ...context }),
  );
for (const [raw, n] of [
  [null, null],
  ['', 0],
  ['0', 0],
  ['Unknown', 0],
  ['Listen', 0],
  ['Established', 2],
  ['Listen', null],
  ['Listen', 999],
])
  test('UNKNOWN/contradictory TCP ' + raw + '/' + n, () => {
    const s = snapshot();
    s.Records[0].StateRaw = raw;
    s.Records[0].StateNumeric = n;
    blocked(s);
    assert.equal(tcpState(s.Records[0]).ok, false);
  });
test('NULL/0 unexpected owned record cannot disappear behind valid QA records', () => {
  const s = snapshot();
  s.Records.push({ ...row(9999), StateRaw: null, StateNumeric: 0 });
  assert.equal(blocked(s).reason, 'TCP_STATE_UNKNOWN');
});
test('extra owned listener outside QA is denied from GetNetTCP', () => {
  const s = snapshot();
  s.Records.push(row(9999));
  assert.equal(blocked(s).reason, 'UNEXPECTED_OWNED_LISTENER');
});
test('extra owned listener outside QA is denied from native output independently', () => {
  const s = snapshot();
  s.NativeLines.push(native(9999));
  assert.equal(blocked(s).reason, 'UNEXPECTED_NATIVE_LISTENER');
});
for (const address of ['0.0.0.0', '::', '::1', '192.0.2.10'])
  test('wildcard/IPv6/LAN listener ' + address, () => {
    const s = snapshot();
    s.Records[0].LocalAddress = address;
    blocked(s);
  });
for (const pid of [0, 101, 9999])
  test('foreign PID on QA port ' + pid, () => {
    const s = snapshot();
    s.Records[0].PID = pid;
    blocked(s);
  });
test('port only / PID only / absent native witness are insufficient', () => {
  const s = snapshot();
  s.NativeLines = [];
  assert.equal(blocked(s).reason, 'TCP_SOURCES_CONTRADICTORY');
});
test('native-only listener cannot rescue absent GetNetTCP witness', () => {
  const s = snapshot();
  s.Records = [];
  blocked(s);
});
test('duplicate TCP/native listener rows fail closed', () => {
  const s = snapshot();
  s.NativeLines.push(native());
  blocked(s);
});
test('malformed native state is UNKNOWN', () => {
  const s = snapshot();
  s.NativeLines = [' TCP 127.0.0.1:55831 0.0.0.0:0 0 100'];
  assert.equal(parseNativeRow(s.NativeLines[0]), null);
  blocked(s);
});
for (const port of [3000, 5432, 55401, 55419, 443])
  test('owned outgoing non-QA loopback endpoint ' + port, () => {
    const s = snapshot();
    s.Records.push({
      ...row(61000),
      StateRaw: 'Established',
      StateNumeric: 5,
      RemoteAddress: '127.0.0.1',
      RemotePort: port,
    });
    assert.equal(blocked(s).reason, 'NON_QA_CONNECTION');
  });
test('owned remote Internet endpoint is denied', () => {
  const s = snapshot();
  s.Records.push({
    ...row(61000),
    StateRaw: 'Established',
    StateNumeric: 5,
    RemoteAddress: '203.0.113.5',
    RemotePort: 443,
  });
  blocked(s);
});
test('a QA local port cannot conceal a foreign remote address', () => {
  const s = snapshot();
  s.Records.push({
    ...row(),
    StateRaw: 'Established',
    StateNumeric: 5,
    RemoteAddress: '203.0.113.5',
    RemotePort: 61000,
  });
  s.NativeLines.push(' TCP 127.0.0.1:55831 203.0.113.5:61000 ESTABLISHED 100');
  blocked(s);
});
test('a QA local port alone cannot authorize a connection to an unowned local service', () => {
  const s = snapshot();
  s.Records.push({
    ...row(),
    StateRaw: 'Established',
    StateNumeric: 5,
    RemoteAddress: '127.0.0.1',
    RemotePort: 5432,
  });
  s.NativeLines.push(' TCP 127.0.0.1:55831 127.0.0.1:5432 ESTABLISHED 100');
  assert.equal(blocked(s).reason, 'QA_PEER_PROCESS_UNVERIFIED');
});
test('paired owned sockets on QA endpoints are accepted without trusting port alone', () => {
  const s = snapshot();
  s.Processes.push(record(chrome));
  s.Records.push(
    row(55832, 200),
    {
      ...row(),
      StateRaw: 'Established',
      StateNumeric: 5,
      RemoteAddress: '127.0.0.1',
      RemotePort: 61000,
    },
    {
      ...row(61000, 200),
      StateRaw: 'Established',
      StateNumeric: 5,
      RemoteAddress: '127.0.0.1',
      RemotePort: 55831,
    },
  );
  s.NativeLines.push(
    native(55832, 200),
    ' TCP 127.0.0.1:55831 127.0.0.1:61000 ESTABLISHED 100',
    ' TCP 127.0.0.1:61000 127.0.0.1:55831 ESTABLISHED 200',
  );
  assert.equal(assessGate(s, { ...options('chrome'), chrome }).ok, true);
});
test('native remote endpoint is denied even if missing from GetNetTCP', () => {
  const s = snapshot();
  s.NativeLines.push(' TCP 127.0.0.1:61000 127.0.0.1:3000 ESTABLISHED 100');
  assert.equal(blocked(s).reason, 'NON_QA_NATIVE_CONNECTION');
});
for (const delta of [-1, 1, -5000, 5000])
  test('PID generation reuse/change ' + delta + 'ms is denied', () => {
    const s = snapshot();
    s.Processes[0].CreatedAt = new Date(Date.parse(node.createdAt) + delta).toISOString();
    assert.equal(blocked(s).reason, 'PROCESS_GENERATION_UNKNOWN_OR_CHANGED');
  });
test('initial timestamp tolerance is two-sided and bounded', () => {
  const e = { ...node, toleranceMs: 2000 };
  for (const n of [-2000, 2000])
    assert.equal(
      processIdentity(
        { ...record(node), CreatedAt: new Date(Date.parse(node.createdAt) + n).toISOString() },
        e,
        snapshot().At,
      ).ok,
      true,
    );
  assert.equal(processIdentity(record(node), { ...e, toleranceMs: 9999 }, snapshot().At).ok, false);
});
for (const changes of [
  { Executable: null },
  { CommandLine: null },
  { Executable: 'C:\\other\\node.exe' },
  { ParentPID: 999 },
  { Name: 'other.exe' },
  { CreatedAt: 'invalid' },
  { CommandLine: '"C:\\Program Files\\nodejs\\node.exe" unexpected.mjs' },
  { CommandLine: '"unclosed' },
])
  test('incomplete/conflicting process ' + JSON.stringify(changes), () => {
    const s = snapshot();
    s.Processes[0] = { ...s.Processes[0], ...changes };
    blocked(s);
  });
test('duplicate process rows are ambiguous', () => {
  const s = snapshot();
  s.Processes.push(record(node));
  blocked(s);
});
test('unverified child ancestry cannot be classified unrelated', () => {
  const s = snapshot();
  s.Processes.push({ ...record(chrome), ParentPID: 999 });
  blocked(s);
});
test('child with missing executable metadata is UNKNOWN', () => {
  const s = snapshot();
  s.Processes.push({ ...record(chrome), Executable: null });
  blocked(s);
});
for (const changes of [
  { listening: false },
  { pid: 999 },
  { address: { address: '0.0.0.0', port: 55831, family: 'IPv4' } },
  { address: { address: '127.0.0.1', port: 55832, family: 'IPv4' } },
  { address: null },
])
  test('server bind evidence ' + JSON.stringify(changes), () =>
    blocked(snapshot(), { ...options(), server: { ...options().server, ...changes } }),
  );
test('Chrome root requires exact parent, generation, executable/argv and its own listener', () => {
  const s = snapshot();
  s.Processes.push(record(chrome));
  s.Records.push(row(55832, 200));
  s.NativeLines.push(native(55832, 200));
  assert.equal(assessGate(s, { ...options('chrome'), chrome }).ok, true);
  s.Processes[1].ParentPID = 999;
  blocked(s, { ...options('chrome'), chrome });
});
test('profile marker alone cannot establish Chrome ownership', () => {
  const s = snapshot();
  s.Processes.push({
    ...record(chrome),
    CommandLine: 'chrome.exe --user-data-dir=D:\\QA path',
    ProfileMatches: true,
  });
  s.Records.push(row(55832, 200));
  s.NativeLines.push(native(55832, 200));
  blocked(s, { ...options('chrome'), chrome });
});
test('collector is bound to native spawn PID, parent, generation and literal argv', () => {
  const e = {
    kind: 'collector',
    pid: 300,
    parentPid: 100,
    executable: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    argv: [
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      '-File',
      root + '\\os-snapshot.ps1',
    ],
    createdAt: '2026-11-06T00:00:10.000Z',
    cwd: root,
  };
  const s = snapshot();
  s.CollectorPid = 300;
  s.Processes.push({ ...record(e), Name: 'powershell.exe' });
  assert.equal(assessGate(s, { ...options(), collector: e }).ok, true);
  s.CollectorPid = 301;
  blocked(s, { ...options(), collector: e });
});
test('teardown emptiness needs complete collectors and verified surviving supervisor', () => {
  const s = snapshot();
  s.Records = [];
  s.NativeLines = [];
  assert.equal(assessGate(s, options('teardown')).ok, true);
  s.TcpOk = false;
  blocked(s, options('teardown'));
});
test('teardown NULL state is UNKNOWN, not portsClosed', () => {
  const s = snapshot();
  s.Records[0].StateRaw = null;
  s.Records[0].StateNumeric = 0;
  blocked(s, options('teardown'));
});
test('teardown with remaining listener is not closed', () =>
  blocked(snapshot(), options('teardown')));
test('known matching kernel TIME_WAIT is not a listener but never proves readiness', () => {
  const s = snapshot();
  s.Records = [
    {
      ...row(),
      PID: 0,
      StateRaw: 'TimeWait',
      StateNumeric: 11,
      RemoteAddress: '127.0.0.1',
      RemotePort: 61000,
    },
  ];
  s.NativeLines = [' TCP 127.0.0.1:55831 127.0.0.1:61000 TIME_WAIT 0'];
  assert.equal(assessGate(s, options('teardown')).ok, true);
  blocked(s, options('preflight'));
});
test('receipt saved before failed assertion and original native error is retained', () => {
  const events = [],
    evidence = {
      snapshot: { CollectorErrors: ['NATIVE_FAILED'] },
      native: { status: 1, stderr: 'synthetic failure' },
    };
  assert.throws(() =>
    recordThenAssert(
      evidence,
      (x) => events.push(['save', x]),
      () => {
        events.push(['assess']);
        return { ok: false, reason: 'OS_METADATA_INCOMPLETE' };
      },
    ),
  );
  assert.deepEqual(events, [['save', evidence], ['assess']]);
});
test('cannot proceed when evidence save itself fails', () => {
  let checked = false;
  assert.throws(() =>
    recordThenAssert(
      {},
      () => {
        throw Error('READ_ONLY_SYNTHETIC_WRITER_FAILURE');
      },
      () => {
        checked = true;
        return { ok: true };
      },
    ),
  );
  assert.equal(checked, false);
});
for (const r of [
  { status: 1 },
  { status: null, error: { code: 'ENOENT' } },
  { status: 0, signal: 'SIGTERM' },
])
  test('native failure stops subsequent steps ' + JSON.stringify(r), () => {
    const seen = [];
    assert.throws(() =>
      checkedSteps(
        [
          { file: 'first', args: [] },
          { file: 'must-not-run', args: [] },
        ],
        (f) => {
          seen.push(f);
          return r;
        },
      ),
    );
    assert.deepEqual(seen, ['first']);
  });
test('checked native explicitly disables shell and preserves failure receipt', () => {
  let args;
  try {
    checkedNative(
      (...a) => {
        args = a;
        return { status: 1, stderr: 'original synthetic error' };
      },
      'node',
      ['--check', 'path with spaces'],
      {},
    );
  } catch (e) {
    assert.equal(e.receipt.stderr, 'original synthetic error');
  }
  assert.equal(args[2].shell, false);
});
test('collector uses -File and separate arguments including spaces/apostrophes', () => {
  const script = root + '\\QA path\\os-snapshot.ps1',
    profile = root + "\\O'Brien QA\\profile";
  const a = snapshotArgs(script, 100, 0, profile);
  assert.equal(a[2], '-File');
  assert.equal(a[3], script);
  assert.equal(a.at(-1), profile);
  assert.equal(a.includes('-Command'), false);
});
test('Windows argv handles quoted data without treating it as code', () =>
  assert.deepEqual(windowsArgv('"C:\\Program Files\\node.exe" "O\'Brien & $value" plain'), [
    'C:\\Program Files\\node.exe',
    "O'Brien & $value",
    'plain',
  ]));
test('validator is parse-only and fail-fast; never invokes collector -File', () => {
  const seen = [];
  const r = validateHarness((file, args) => {
    seen.push({ file, args });
    return {
      status: 0,
      stdout: file.toLowerCase().endsWith('powershell.exe')
        ? JSON.stringify({ PowerShellParseOnly: true, Errors: 0 })
        : '',
    };
  });
  assert.equal(r.nodeChecks, 4);
  const ps = seen.at(-1).args;
  assert.equal(ps[2], '-EncodedCommand');
  const source = Buffer.from(ps[3], 'base64').toString('utf16le');
  assert.match(source, /Parser\]::ParseFile/);
  assert.doesNotMatch(source, /Get-NetTCPConnection|Get-CimInstance|& .*snapshot/);
});
test('validator cannot mask a first native failure with later successes', () => {
  let calls = 0;
  assert.throws(() =>
    validateHarness(() => {
      calls++;
      return { status: 1, stderr: 'syntax error' };
    }),
  );
  assert.equal(calls, 1);
});
for (const openFailure of [0, 1, 2])
  test('unused log handles close when open/launch fails ' + openFailure, () => {
    const closed = [];
    let opens = 0;
    assert.throws(() =>
      withLogHandles(
        () => {
          if (opens === openFailure) throw Error('open failure');
          return ++opens;
        },
        (h) => closed.push(h),
        () => {
          throw Error('launch failure');
        },
      ),
    );
    assert.deepEqual(
      closed,
      Array.from({ length: openFailure }, (_, i) => i + 1),
    );
  });
for (const args of [
  [],
  ['--execute-reviewed-session'],
  [
    '--execute-reviewed-session',
    '--artifact-dir=' + root + '\\.local-storage\\v2-wave10-s5b-visualqa',
  ],
  ['--execute-reviewed-session', '--artifact-dir=C:\\outside'],
])
  test('old/bare/unreviewed execution path rejected ' + JSON.stringify(args), () =>
    assert.throws(() => executionOptions(args, root)),
  );
test('future artifact selection is explicit/fresh namespace, not authority proof', () =>
  assert.equal(
    executionOptions(
      [
        '--execute-reviewed-session',
        '--artifact-dir=' + root + '\\.local-storage\\v2-wave10-s5b-review-ticket',
      ],
      root,
    ).base.endsWith('review-ticket'),
    true,
  ));
for (const url of [
  'https://example.invalid/',
  'http://127.0.0.1:3000/api',
  'http://127.0.0.1:55831/api',
  'http://localhost:55831/qa.js',
  'http://127.0.0.1:55832/',
  'http://user:secret@127.0.0.1:55831/',
  'http://127.0.0.1:55831/qa.js#x',
])
  test('request allowlist rejects ' + url.replace('secret', 'REDACTED'), () =>
    assert.equal(allowQaRequest(url), false),
  );
test('only exact QA GET assets are accepted, CONNECT/POST denied', () => {
  assert.equal(allowQaRequest('http://127.0.0.1:55831/qa.js'), true);
  assert.equal(allowQaRequest('http://127.0.0.1:55831/', 'CONNECT'), false);
  assert.equal(allowQaRequest('http://127.0.0.1:55831/', 'POST'), false);
});
test('importing runner does not create listener/connection or start a session', async () => {
  const originalListen = net.Server.prototype.listen,
    originalConnect = net.Socket.prototype.connect;
  let attempts = 0;
  const deny = () => {
    attempts++;
    throw Error('CF01_RUNTIME_FORBIDDEN');
  };
  net.Server.prototype.listen = deny;
  net.Socket.prototype.connect = deny;
  try {
    const r = await import('./run.mjs');
    assert.equal(typeof r.executeReviewedSession, 'function');
    assert.equal(attempts, 0);
  } finally {
    net.Server.prototype.listen = originalListen;
    net.Socket.prototype.connect = originalConnect;
  }
});
test('old receipts cannot prove the missing post-bind snapshot', () => {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../.local-storage/v2-wave10-s5b-visualqa');
  assert.equal(fs.existsSync(path.join(dir, 'session.json')), true);
  assert.equal(fs.existsSync(path.join(dir, 'ports-http.json')), false);
});
