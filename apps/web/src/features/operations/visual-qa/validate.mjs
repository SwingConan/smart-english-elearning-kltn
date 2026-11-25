import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkedSteps, checkedNative } from './guard-core.mjs';

/** Parse/check ONLY. No collector invocation, OS snapshot, listener or browser. */
export function validateHarness(execute = spawnSync) {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const steps = ['run.mjs', 'guard-core.mjs', 'guard-core.test.mjs', 'validate.mjs'].map((n) => ({
    file: process.execPath,
    args: ['--check', path.join(dir, n)],
    options: { encoding: 'utf8', windowsHide: true, timeout: 15000 },
  }));
  const result = checkedSteps(steps, execute);
  if (!process.env.SystemRoot || !path.win32.isAbsolute(process.env.SystemRoot))
    throw Error('WINDOWS_NATIVE_CONTEXT_UNVERIFIED');
  const powershell = path.win32.join(
    process.env.SystemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  const psPath = path.join(dir, 'os-snapshot.ps1');
  const program = `$ErrorActionPreference='Stop'; $tokens=$null; $parseErrors=$null; $ast=[System.Management.Automation.Language.Parser]::ParseFile('${psPath.replaceAll("'", "''")}',[ref]$tokens,[ref]$parseErrors); if($parseErrors.Count){$parseErrors | ForEach-Object { Write-Error $_.Message }; exit 1}; $names=@($ast.ParamBlock.Parameters | ForEach-Object {$_.Name.VariablePath.UserPath}); if(($names -join ',') -ne 'RootNodePid,ChromePid,QaProfilePath'){throw 'COLLECTOR_PARAM_SCHEMA_MISMATCH'}; [PSCustomObject]@{PowerShellParseOnly=$true;ParameterNames=$names;Errors=0} | ConvertTo-Json -Compress`;
  const native = checkedNative(
    execute,
    powershell,
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(program, 'utf16le').toString('base64'),
    ],
    { encoding: 'utf8', windowsHide: true, timeout: 15000 },
  );
  return { nodeChecks: result.length, powerShell: JSON.parse(native.stdout) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(validateHarness()));
  } catch (e) {
    console.error(JSON.stringify({ failure: e.message, native: e.receipt ?? null }));
    process.exitCode = 1;
  }
}
