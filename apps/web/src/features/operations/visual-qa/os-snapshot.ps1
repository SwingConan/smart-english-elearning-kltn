param(
    [Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$RootNodePid,
    [ValidateRange(0,2147483647)][int]$ChromePid = 0,
    [Parameter(Mandatory=$true)][string]$QaProfilePath
)
# Read-only collector for a FUTURE separately approved session. CF01 parses this
# file's AST only; it does not invoke the collector or any network/OS probe.
$ErrorActionPreference = 'Stop'
$collectorErrors = New-Object 'System.Collections.Generic.List[string]'
$observed = [DateTime]::UtcNow.ToString('o')
$tcpRows = @(); $allProcesses = @(); $nativeLines = @()
$tcpOk = $false; $processesOk = $false; $nativeExit = $null; $nativeComplete = $false
try { $tcpRows = @(Get-NetTCPConnection -ErrorAction Stop); $tcpOk = $true } catch { $collectorErrors.Add('TCP_COLLECTION_FAILED') }
try { $allProcesses = @(Get-CimInstance Win32_Process -ErrorAction Stop); $processesOk = $true } catch { $collectorErrors.Add('PROCESS_COLLECTION_FAILED') }
$owned = @($RootNodePid)
if ($ChromePid -gt 0) { $owned += @($ChromePid) }
do {
    $priorCount = $owned.Count
    foreach ($candidate in $allProcesses) {
        if (($owned -contains [int]$candidate.ParentProcessId) -and !($owned -contains [int]$candidate.ProcessId)) { $owned += @([int]$candidate.ProcessId) }
    }
} while ($owned.Count -gt $priorCount)
try {
    $rawNative = @(& "$env:SystemRoot\System32\netstat.exe" -ano -p tcp)
    $nativeExit = $LASTEXITCODE
    if ($nativeExit -ne 0) { $collectorErrors.Add('NETSTAT_NATIVE_FAILED') }
    else {
        $nativeComplete = $true
        foreach ($line in $rawNative) {
            if ($line -notmatch '^\s*TCP\s+') { continue }
            if ($line -notmatch '^\s*TCP\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s*$') { $nativeComplete=$false; $collectorErrors.Add('NETSTAT_ROW_UNPARSEABLE'); continue }
            $localEndpoint=$Matches[1]; $nativePid=[int]$Matches[4]
            if (($owned -contains $nativePid) -or ($localEndpoint -match ':(55831|55832)$')) { $nativeLines += @([string]$line) }
        }
    }
} catch { $collectorErrors.Add('NETSTAT_COLLECTION_FAILED') }
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$records = @($tcpRows | Where-Object { ($owned -contains [int]$_.OwningProcess) -or (@(55831,55832) -contains [int]$_.LocalPort) } | ForEach-Object {
    $stateValue=$_.State; $stateNumber=$null
    if ($null -ne $stateValue -and [string]$stateValue -ne '') { try { $stateNumber=[Convert]::ToInt32($stateValue) } catch {} }
    $cimState=$null; if ($null -ne $_.CimInstanceProperties['State']) { $cimState=$_.CimInstanceProperties['State'].Value }
    [PSCustomObject]@{ LocalAddress=$_.LocalAddress; LocalPort=[int]$_.LocalPort; RemoteAddress=$_.RemoteAddress; RemotePort=[int]$_.RemotePort; StateRaw=if($null -eq $stateValue){$null}else{[string]$stateValue}; StateNumeric=$stateNumber; CimStateRaw=$cimState; PID=[int]$_.OwningProcess }
})
$processRows = @($allProcesses | Where-Object { $owned -contains [int]$_.ProcessId } | ForEach-Object {
    $created=$null; if ($null -ne $_.CreationDate) { try { $created=([DateTime]$_.CreationDate).ToUniversalTime().ToString('o') } catch {} }
    [PSCustomObject]@{ PID=[int]$_.ProcessId; ParentPID=[int]$_.ParentProcessId; Name=$_.Name; CreatedAt=$created; Executable=$_.ExecutablePath; CommandLine=$_.CommandLine }
})
[PSCustomObject]@{
    SchemaVersion=2; At=$observed; CollectorPid=$PID; Identity=$identity.Name; Elevated=$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    TcpOk=$tcpOk; ProcessesOk=$processesOk; NativeScanComplete=$nativeComplete; NetstatExit=$nativeExit
    Records=$records; NativeLines=@($nativeLines); Processes=$processRows; CollectorErrors=@($collectorErrors.ToArray())
    # Audit metadata only. This marker NEVER establishes process ownership.
    RequestedProfilePath=$QaProfilePath
} | ConvertTo-Json -Depth 8
