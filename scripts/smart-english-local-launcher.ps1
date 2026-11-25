param([ValidateSet('Start','Stop','Status')][string]$Action='Start')
$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
$StateDir=Join-Path $Root '.local-storage\local-launcher'
$StateFile=Join-Path $StateDir 'managed.json'
$NgrokStateFile=Join-Path $Root '.local-storage\br136-launcher\managed.json'
$DemoStateDir=Join-Path $Root '.local-storage\br136-working-demo'
$LocalUrl='http://127.0.0.1:5173'
$Data=Join-Path $Root '.local-storage\v2-wave01\postgres'
$script:State=$null
$script:Stage='Chuan bi'
New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
Set-Location -LiteralPath $Root

function Save-State {
  $script:State.updatedAt=[DateTime]::UtcNow.ToString('o')
  $json=$script:State|ConvertTo-Json -Depth 8
  [IO.File]::WriteAllText($StateFile,$json,[Text.UTF8Encoding]::new($false))
}
function Load-State {
  if(Test-Path -LiteralPath $StateFile){return Get-Content -LiteralPath $StateFile -Raw|ConvertFrom-Json}
  return $null
}
function Hash-Text([string]$Text){
  $h=[Security.Cryptography.SHA256]::Create()
  try{return [BitConverter]::ToString($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}
}
function Process-Record([string]$Name,[int]$Id){
  $p=Get-CimInstance Win32_Process -Filter "ProcessId=$Id"
  if(-not $p){throw "Tien trinh $Name da dung khi khoi dong."}
  return [pscustomobject]@{name=$Name;pid=$Id;createdUtc=$p.CreationDate.ToUniversalTime().ToString('o');exe=$p.ExecutablePath;commandHash=(Hash-Text $p.CommandLine)}
}
function Owned-Process($Record){
  $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$Record.pid) -ErrorAction SilentlyContinue
  if(-not $p){return $null}
  if($p.CreationDate.ToUniversalTime().ToString('o') -ne $Record.createdUtc -or $p.ExecutablePath -ne $Record.exe -or (Hash-Text $p.CommandLine) -ne $Record.commandHash){return $null}
  return $p
}
function Port-Open([int]$Port){
  $c=[Net.Sockets.TcpClient]::new()
  try{$t=$c.ConnectAsync('127.0.0.1',$Port);if(-not $t.Wait(400)){return $false};return $c.Connected}catch{return $false}finally{$c.Dispose()}
}
function Start-Owned([string]$Name,[string]$Exe,[string[]]$Arguments,[string]$WorkDir=$Root){
  $p=Start-Process -FilePath $Exe -ArgumentList $Arguments -WorkingDirectory $WorkDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $StateDir ($Name+'.stdout.log')) -RedirectStandardError (Join-Path $StateDir ($Name+'.stderr.log')) -PassThru
  $record=Process-Record $Name $p.Id
  $script:State.processes=@($script:State.processes)+@($record)
  Save-State
  return $record
}
function Wait-Http([string]$Url,[int]$Seconds=60,[int[]]$AcceptedCodes=@(200)){
  $end=[DateTime]::UtcNow.AddSeconds($Seconds)
  do{
    try{
      $r=Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 4 -ErrorAction Stop
      if($AcceptedCodes -contains [int]$r.StatusCode){return}
    }catch{
      $resp=$_.Exception.Response
      if($resp -and ($AcceptedCodes -contains [int]$resp.StatusCode)){return}
    }
    Start-Sleep -Milliseconds 300
  }while([DateTime]::UtcNow -lt $end)
  throw "Het thoi gian cho dich vu tai $Url. Xem log trong .local-storage\local-launcher."
}
function Stop-Managed {
  if(-not $script:State){Write-Host 'Khong co phien local nao dang chay.';return}
  $stopMarker=Join-Path $DemoStateDir 'STOP_REQUESTED'
  foreach($name in @('web','learner-api','backend','postgres')){
    foreach($record in @($script:State.processes|Where-Object {$_.name -eq $name})){
      $p=Owned-Process $record;if(-not $p){continue}
      if($name -eq 'backend'){
        New-Item -ItemType Directory -Path $DemoStateDir -Force | Out-Null
        [IO.File]::WriteAllText($stopMarker,'stop')
        $end=[DateTime]::UtcNow.AddSeconds(8);do{Start-Sleep -Milliseconds 200;$p=Owned-Process $record}while($p -and [DateTime]::UtcNow -lt $end)
        Remove-Item -LiteralPath $stopMarker -Force -ErrorAction SilentlyContinue
      }
      if($name -eq 'postgres'){
        $ctl=Join-Path (Split-Path -Parent $record.exe) 'pg_ctl.exe'
        $pgStop=Start-Process -FilePath $ctl -ArgumentList @('stop','-D',('"'+$Data+'"'),'-m','fast','-w','-t','60') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $StateDir 'postgres-stop.log') -RedirectStandardError (Join-Path $StateDir 'postgres-stop.stderr.log') -PassThru
        $null=$pgStop.Handle
        if(-not $pgStop.WaitForExit(70000) -or (Port-Open 55401)){throw 'Khong dung duoc PostgreSQL local.'}
        continue
      }
      if(Owned-Process $record){
        try{Stop-Process -Id $record.pid -ErrorAction Stop}catch{if(Owned-Process $record){[Diagnostics.Process]::GetProcessById($record.pid).Kill()}}
        $end=[DateTime]::UtcNow.AddSeconds(8);do{Start-Sleep -Milliseconds 150;$remaining=Owned-Process $record}while($remaining -and [DateTime]::UtcNow -lt $end)
        if($remaining){throw "Khong dung duoc tien trinh $name."}
      }
    }
  }
  $script:State.status='STOPPED';Save-State
  Write-Host 'Da dung tat ca dich vu local. Du lieu va cau hinh duoc giu nguyen.'
}
function Show-Status {
  $s=Load-State
  Write-Host ('Website local: '+$LocalUrl)
  if(-not $s){Write-Host 'Trang thai: chua khoi dong che do local.';return}
  Write-Host ('Trang thai: '+$s.status)
  foreach($r in @($s.processes)){Write-Host ($r.name+': '+$(if(Owned-Process $r){'dang chay'}else{'da dung'})+' (PID '+$r.pid+')')}
  Write-Host ('PostgreSQL local (55401): '+$(if(Port-Open 55401){'dang chay'}else{'da dung'}))
  if($s.lastError){Write-Host ('Loi gan nhat: '+$s.lastError)}
}

$lock=$null
try {
  $script:Node=(Get-Command node.exe -ErrorAction Stop).Source
  if($Action -eq 'Status'){Show-Status;exit 0}
  $deadline=[DateTime]::UtcNow.AddSeconds(180)
  do{try{$lock=[IO.File]::Open((Join-Path $StateDir 'operation.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{if([DateTime]::UtcNow -gt $deadline){throw 'Mot thao tac Start/Stop local khac dang chay.'};Start-Sleep -Milliseconds 400}}while(-not $lock)
  $script:State=Load-State
  if($Action -eq 'Stop'){Stop-Managed;exit 0}

  if($script:State -and $script:State.status -eq 'RUNNING'){
    $running=@($script:State.processes|Where-Object {$_.name -in @('backend','learner-api','web') -and (Owned-Process $_)})
    if($running.Count -eq 3 -and (Port-Open 5173)){
      Write-Host "He thong local da chay tai $LocalUrl."
      Show-Status
      Start-Process $LocalUrl
      exit 0
    }
    Stop-Managed
  }

  $script:Stage='Kiem tra cong va phien ngrok cu'
  if(Test-Path -LiteralPath $NgrokStateFile){
    $ngrokState=Get-Content -LiteralPath $NgrokStateFile -Raw|ConvertFrom-Json
    if($ngrokState.status -eq 'RUNNING'){
      Write-Host 'Dang tat phien launcher ngrok cu de chuyen sang che do local...'
      & (Join-Path $PSScriptRoot 'smart-english-launcher.ps1') -Action Stop
    }
  }
  foreach($port in @(3000,3001,5173)){
    if(Port-Open $port){throw "Cong $port dang bi chiem boi tien trinh khac. Hay tat ung dung dang dung cong nay truoc."}
  }

  $pgBin=Join-Path $env:ProgramFiles 'PostgreSQL\14\bin'
  $pgCtl=Join-Path $pgBin 'pg_ctl.exe'
  $pgReady=Join-Path $pgBin 'pg_isready.exe'
  $control=Join-Path $pgBin 'pg_controldata.exe'
  foreach($file in @('apps\api\.env','node_modules\vite\bin\vite.js','node_modules\pg\package.json')){
    if(-not(Test-Path -LiteralPath (Join-Path $Root $file))){throw "Thieu tep can thiet: $file"}
  }
  if(-not(Test-Path -LiteralPath $pgCtl) -or -not(Test-Path -LiteralPath $control)){throw 'Thieu PostgreSQL 14 trong Program Files.'}

  $script:State=[pscustomobject]@{status='STARTING';runId=[guid]::NewGuid().ToString();processes=@();lastError=$null;updatedAt=$null;localUrl=$LocalUrl;postgresReused=$false};Save-State

  $script:Stage='Kiem tra va khoi dong PostgreSQL (55401)'
  $physical=& $control -D $Data 2>$null
  if($LASTEXITCODE -ne 0 -or -not($physical -match '7702384118803149788')){throw 'Physical identity PostgreSQL khong khop.'}
  if(-not(Port-Open 55401)){
    $pgStart=Start-Process -FilePath $pgCtl -ArgumentList @('start','-D',('"'+$Data+'"'),'-o','"-p 55401 -h 127.0.0.1"','-l',('"'+(Join-Path $StateDir 'postgres.log')+'"'),'-w','-t','120') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $StateDir 'postgres-start.log') -RedirectStandardError (Join-Path $StateDir 'postgres-start.stderr.log') -PassThru
    $null=$pgStart.Handle
    if(-not $pgStart.WaitForExit(130000) -or -not(Port-Open 55401)){throw 'Khong khoi dong duoc PostgreSQL. Xem postgres-start.log.'}
    $pgId=[int](Get-Content -LiteralPath (Join-Path $Data 'postmaster.pid') -TotalCount 1)
    $script:State.processes=@(Process-Record 'postgres' $pgId);Save-State
  }else{$script:State.postgresReused=$true;Save-State}
  if(Test-Path -LiteralPath $pgReady){
    $pgWait=[DateTime]::UtcNow.AddSeconds(60)
    do{& $pgReady -h 127.0.0.1 -p 55401 -q 2>$null;if($LASTEXITCODE -eq 0){break};Start-Sleep -Milliseconds 400}while([DateTime]::UtcNow -lt $pgWait)
  }
  & $script:Node scripts/br136-launcher-preflight.cjs;if($LASTEXITCODE -ne 0){throw 'Kiem tra database preflight that bai.'}

  $stopMarker=Join-Path $DemoStateDir 'STOP_REQUESTED'
  Remove-Item -LiteralPath $stopMarker -Force -ErrorAction SilentlyContinue

  $script:Stage='Khoi dong Backend API (3000)'
  Write-Host 'Dang khoi dong Backend API (cong 3000)...'
  [void](Start-Owned 'backend' $script:Node @('--env-file=apps/api/.env','scripts/br136-demo-runtime.cjs'))
  Wait-Http 'http://127.0.0.1:3000/api/demo/environment' 75 @(200)

  $script:Stage='Khoi dong Placement & Local Learner API (3001)'
  Write-Host 'Dang khoi dong Placement & Learner API (cong 3001)...'
  [void](Start-Owned 'learner-api' $script:Node @('--env-file=apps/api/.env','scripts/learner-local-api.cjs'))
  Wait-Http 'http://127.0.0.1:3001/api/v2/placement/config' 60 @(200,401,403)

  $script:Stage='Khoi dong giao dien Vite local (5173)'
  Write-Host 'Dang khoi dong Frontend Vite (http://127.0.0.1:5173)...'
  $viteBin=Join-Path $Root 'node_modules\vite\bin\vite.js'
  $webDir=Join-Path $Root 'apps\web'
  [void](Start-Owned 'web' $script:Node @($viteBin,'--host','127.0.0.1','--port','5173','--strictPort') $webDir)
  Wait-Http $LocalUrl 60 @(200)

  $script:State.status='RUNNING';Save-State;Show-Status
  Start-Process $LocalUrl
  Write-Host ''
  Write-Host "Website local da san sang tai: $LocalUrl" -ForegroundColor Green
  Write-Host 'Day du chuc nang: Kiem tra dau vao (L&R + 4 ky nang), Quen mat khau SMTP, Lop hoc, Hoc vu, Giang vien, Admin, Thu ngan.'
  Write-Host 'De dung tat ca dich vu local, hay chay: STOP_SMART_ENGLISH_LOCAL.bat'
} catch {
  $message='Khong hoan tat o buoc: '+$script:Stage+'. '+$_.Exception.Message
  Write-Host $message -ForegroundColor Red
  if($script:State -and $Action -eq 'Start'){$script:State.lastError=$message;try{Stop-Managed}catch{};$script:State.status='FAILED';Save-State}
  exit 1
} finally {if($lock){$lock.Dispose()}}