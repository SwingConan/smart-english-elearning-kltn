param([ValidateSet('Start','Stop','Status','Access')][string]$Action='Start')
$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
$StateDir=Join-Path $Root '.local-storage\br136-launcher'
$StateFile=Join-Path $StateDir 'managed.json'
$Public='https://oink-crazed-frosting.ngrok-free.dev'
$Local='http://127.0.0.1:3040'
$Data=Join-Path $Root '.local-storage\v2-wave01\postgres'
$Db='v2_wave01_dev_test_w04b_br136_demo_20261111_42db33'
$script:State=$null
$script:Stage='Chuẩn bị'
New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
Set-Location -LiteralPath $Root

function Save-State { $script:State.updatedAt=[DateTime]::UtcNow.ToString('o'); $json=$script:State|ConvertTo-Json -Depth 8; [IO.File]::WriteAllText($StateFile,$json,[Text.UTF8Encoding]::new($false)) }
function Load-State { if(Test-Path -LiteralPath $StateFile){return Get-Content -LiteralPath $StateFile -Raw|ConvertFrom-Json};return $null }
function Hash-Text([string]$Text){$h=[Security.Cryptography.SHA256]::Create();try{return [BitConverter]::ToString($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function Process-Record([string]$Name,[int]$Id){$p=Get-CimInstance Win32_Process -Filter "ProcessId=$Id";if(-not $p){throw "Tiến trình $Name đã dừng khi khởi động."};return [pscustomobject]@{name=$Name;pid=$Id;createdUtc=$p.CreationDate.ToUniversalTime().ToString('o');exe=$p.ExecutablePath;commandHash=(Hash-Text $p.CommandLine)}}
function Owned-Process($Record){$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$Record.pid) -ErrorAction SilentlyContinue;if(-not $p){return $null};if($p.CreationDate.ToUniversalTime().ToString('o') -ne $Record.createdUtc -or $p.ExecutablePath -ne $Record.exe -or (Hash-Text $p.CommandLine) -ne $Record.commandHash){return $null};return $p}
function Port-Open([int]$Port){$c=[Net.Sockets.TcpClient]::new();try{$t=$c.ConnectAsync('127.0.0.1',$Port);if(-not $t.Wait(400)){return $false};return $c.Connected}catch{return $false}finally{$c.Dispose()}}
function Read-Health([string]$Url){try{$r=Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 -UserAgent 'SmartEnglishLauncher/1.0';return $r.Content|ConvertFrom-Json}catch{return $null}}
function Wait-Health([string]$Url,[string]$Kind,[int]$Seconds=75){$end=[DateTime]::UtcNow.AddSeconds($Seconds);do{$h=Read-Health $Url;if($Kind -eq 'backend' -and $h.mode -eq 'demo'){return};if($Kind -eq 'gateway' -and $h.runId -eq $script:State.runId -and $h.staticBuild){return};Start-Sleep -Milliseconds 300}while([DateTime]::UtcNow -lt $end);throw "Hết thời gian chờ $Kind. Xem log trong .local-storage\br136-launcher."}
function Start-Owned([string]$Name,[string]$Exe,[string[]]$Arguments){$p=Start-Process -FilePath $Exe -ArgumentList $Arguments -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $StateDir ($Name+'.stdout.log')) -RedirectStandardError (Join-Path $StateDir ($Name+'.stderr.log')) -PassThru;$record=Process-Record $Name $p.Id;$script:State.processes=@($script:State.processes)+@($record);Save-State;return $record}
function Stop-Managed {
  if(-not $script:State){Write-Host 'Không có tiến trình do launcher quản lý.';return}
  foreach($name in @('ngrok','gateway','backend','sepay-proxy','postgres')){
    foreach($record in @($script:State.processes|Where-Object {$_.name -eq $name})){
      $p=Owned-Process $record;if(-not $p){continue}
      if($name -eq 'backend' -or $name -eq 'gateway'){
        [IO.File]::WriteAllText((Join-Path $StateDir ($name+'.stop.'+$script:State.runId)),'stop');$end=[DateTime]::UtcNow.AddSeconds(8);do{Start-Sleep -Milliseconds 200;$p=Owned-Process $record}while($p -and [DateTime]::UtcNow -lt $end)
      }
      if($name -eq 'postgres'){
        $ctl=Join-Path (Split-Path -Parent $record.exe) 'pg_ctl.exe';$pgStop=Start-Process -FilePath $ctl -ArgumentList @('stop','-D',('"'+$Data+'"'),'-m','fast','-w','-t','60') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $StateDir 'postgres-stop.log') -RedirectStandardError (Join-Path $StateDir 'postgres-stop.stderr.log') -PassThru;$null=$pgStop.Handle;if(-not $pgStop.WaitForExit(70000) -or (Port-Open 55401)){throw 'Không dừng được PostgreSQL do launcher khởi tạo; không cưỡng bức dừng tiến trình khác.'};continue
      }
      if(Owned-Process $record){
        try{Stop-Process -Id $record.pid -ErrorAction Stop}catch{
          # Some packaged Windows executables make Stop-Process throw after
          # termination. Recheck identity before a narrowly targeted fallback.
          if(Owned-Process $record){[Diagnostics.Process]::GetProcessById($record.pid).Kill()}
        }
        $end=[DateTime]::UtcNow.AddSeconds(8);do{Start-Sleep -Milliseconds 150;$remaining=Owned-Process $record}while($remaining -and [DateTime]::UtcNow -lt $end)
        if($remaining){throw "Không dừng được thành phần $name thuộc launcher."}
      }
    }
  }
  $script:State.status='STOPPED';Save-State;Write-Host 'Đã dừng các thành phần do launcher quản lý. Dữ liệu và cấu hình riêng tư được giữ nguyên.'
}
function Show-Status {
  $s=Load-State
  Write-Host ('Website local: '+$Local);Write-Host ('Website HTTPS: '+$Public);Write-Host ('Callback SePay: '+$Public+'/api/v2/payments/sepay/webhook')
  if(-not $s){Write-Host 'Trạng thái: chưa được khởi động bằng launcher.';return}
  Write-Host ('Trạng thái: '+$s.status)
  foreach($r in @($s.processes)){Write-Host ($r.name+': '+$(if(Owned-Process $r){'đang chạy'}else{'đã dừng hoặc không còn thuộc phiên này'})+' (PID '+$r.pid+')')}
  Write-Host ('PostgreSQL local: '+$(if(Port-Open 55401){'đang lắng nghe; Start sẽ kiểm tra identity'}else{'đã dừng'}))
  if($s.lastError){Write-Host ('Lỗi gần nhất: '+$s.lastError)}
}
function Private-Identity { $text=& $script:Node -e "process.stdout.write(JSON.stringify(require('./scripts/lib/gemini-live-runtime.cjs').windowsPrivateIdentity()))";if($LASTEXITCODE -ne 0){throw 'Không xác minh được tài khoản Windows.'};return $text|ConvertFrom-Json }
function Prepare-Private {
  $identity=Private-Identity;$dir=Join-Path $identity.privateRoot 'public-demo';New-Item -ItemType Directory -Path $dir -Force|Out-Null
  # Set the DACL only. Reapplying a provider Get-Acl object can accidentally
  # request SACL privileges (SeSecurityPrivilege) on a normal Windows login.
  $acl=New-Object Security.AccessControl.DirectorySecurity;$acl.SetAccessRuleProtection($true,$false);$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$acl.AddAccessRule($rule);([IO.DirectoryInfo]::new($dir)).SetAccessControl($acl)
  & $script:Node scripts/br136-launcher-private.cjs;if($LASTEXITCODE -ne 0){throw 'Cấu hình quyền truy cập riêng tư không hợp lệ.'}
  if(-not(Test-Path -LiteralPath (Join-Path $identity.privateRoot 'fixture-demo-accounts.json'))){throw 'Thiếu danh sách tài khoản demo riêng tư; không tự tạo hoặc đổi tài khoản.'}
}
function Show-Access {
  $identity=Private-Identity;$file=Join-Path $identity.privateRoot 'public-demo\access.private.json';if(-not(Test-Path -LiteralPath $file)){throw 'Hãy chạy START_SMART_ENGLISH.bat trước để khởi tạo cổng truy cập.'}
  $credential=Get-Content -LiteralPath $file -Raw|ConvertFrom-Json
  $accountDocument=Get-Content -LiteralPath (Join-Path $identity.privateRoot 'fixture-demo-accounts.json') -Raw|ConvertFrom-Json
  $accounts=$accountDocument.accounts
  $fixture=Get-Content -LiteralPath (Join-Path $Root '.local-storage\br136-working-demo\learning-fixture.private.json') -Raw|ConvertFrom-Json
  Add-Type -AssemblyName System.Windows.Forms;Add-Type -AssemblyName System.Drawing
  $form=New-Object Windows.Forms.Form;$form.Text='Smart English - Quyền truy cập riêng tư';$form.Size=New-Object Drawing.Size(700,480);$form.StartPosition='CenterScreen';$form.TopMost=$true
  $label=New-Object Windows.Forms.Label;$label.Text="Cổng truy cập website: $Public`r`nChỉ chia sẻ riêng cho người PO cho phép. Đây không phải API key.";$label.Location=New-Object Drawing.Point(20,15);$label.Size=New-Object Drawing.Size(650,55);$form.Controls.Add($label)
  $gate=New-Object Windows.Forms.TextBox;$gate.Location=New-Object Drawing.Point(20,80);$gate.Width=640;$gate.ReadOnly=$true;$gate.UseSystemPasswordChar=$true;$gate.Text=$credential.password;$form.Controls.Add($gate)
  $copy=New-Object Windows.Forms.Button;$copy.Text='Chép URL + cổng truy cập (tên: demo)';$copy.Location=New-Object Drawing.Point(20,120);$copy.Size=New-Object Drawing.Size(640,35);$copy.Add_Click({[Windows.Forms.Clipboard]::SetText("$Public`r`nTên truy cập: demo`r`nMã truy cập: "+$credential.password)});$form.Controls.Add($copy)
  $hint=New-Object Windows.Forms.Label;$hint.Text='Bước tiếp theo: đăng nhập ứng dụng bằng đúng vai trò. Không chia sẻ quyền quản trị cho người chỉ cần xem lớp học.';$hint.Location=New-Object Drawing.Point(20,180);$hint.Size=New-Object Drawing.Size(640,45);$form.Controls.Add($hint)
  $selector=New-Object Windows.Forms.ComboBox;$selector.DropDownStyle='DropDownList';$selector.Location=New-Object Drawing.Point(20,230);$selector.Width=640;$form.Controls.Add($selector)
  $choices=@(@{label='Học viên lớp học';role='STUDENT';id=$fixture.studentId},@{label='Giảng viên';role='INSTRUCTOR';id=$fixture.teacherId},@{label='Tư vấn viên';role='COUNSELOR';id=$null},@{label='Quản lý Đào tạo';role='ACADEMIC_MANAGER';id=$fixture.profileReviewerId},@{label='Thu ngân';role='CASHIER';id=$null},@{label='Kiểm tra giảng dạy';role='TEACHING_INSPECTOR';id=$null},@{label='Quản trị hệ thống';role='SYSTEM_ADMIN';id=$fixture.scopeApproverId},@{label='Quản lý Học vụ Học viên';role='ACADEMIC_MANAGER';id=$fixture.liveDataScheduleReviewerId},@{label='Học viên lịch sử Placement';role='STUDENT';id='5c0adc3b-c075-4f03-8832-563140c983e9'})
  # The seven main actors keep their existing user IDs; emails/passwords are
  # loaded privately. Independent reviewers and Placement history stay separate.
  if($accountDocument.primaryActors){for($i=0;$i -lt 7;$i++){$primary=$accountDocument.primaryActors.PSObject.Properties[$choices[$i].role];if($primary){$choices[$i].id=$primary.Value}}}
  foreach($choice in $choices){[void]$selector.Items.Add($choice.label)}
  $email=New-Object Windows.Forms.TextBox;$email.Location=New-Object Drawing.Point(20,272);$email.Width=640;$email.ReadOnly=$true;$form.Controls.Add($email)
  $password=New-Object Windows.Forms.TextBox;$password.Location=New-Object Drawing.Point(20,310);$password.Width=640;$password.ReadOnly=$true;$password.UseSystemPasswordChar=$true;$form.Controls.Add($password)
  $selector.Add_SelectedIndexChanged({$choice=$choices[$selector.SelectedIndex];$a=@($accounts|Where-Object {$_.role -eq $choice.role -and (-not $choice.id -or $_.id -eq $choice.id)})[0];$email.Text=$a.email;$password.Text=$a.password})
  $copyAccount=New-Object Windows.Forms.Button;$copyAccount.Text='Chép tài khoản vai trò đang chọn';$copyAccount.Location=New-Object Drawing.Point(20,350);$copyAccount.Size=New-Object Drawing.Size(640,35);$copyAccount.Add_Click({[Windows.Forms.Clipboard]::SetText("Email: "+$email.Text+"`r`nMật khẩu: "+$password.Text)});$form.Controls.Add($copyAccount);$selector.SelectedIndex=0
  [void]$form.ShowDialog();$form.Dispose()
}

$lock=$null
try {
  $script:Node=(Get-Command node.exe -ErrorAction Stop).Source
  if($Action -eq 'Status'){Show-Status;exit 0}
  if($Action -eq 'Access'){Show-Access;exit 0}
  $deadline=[DateTime]::UtcNow.AddSeconds(300)
  do{try{$lock=[IO.File]::Open((Join-Path $StateDir 'operation.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{if([DateTime]::UtcNow -gt $deadline){throw 'Một thao tác Start/Stop khác đang chạy. Vui lòng chờ.'};Start-Sleep -Milliseconds 500}}while(-not $lock)
  $script:State=Load-State
  if($Action -eq 'Stop'){Stop-Managed;exit 0}
  if($script:State -and $script:State.status -eq 'RUNNING'){
    $running=@($script:State.processes|Where-Object {$_.name -in @('backend','gateway','sepay-proxy','ngrok') -and (Owned-Process $_)})
    $health=Read-Health ($Local+'/__health')
    if($running.Count -eq 4 -and $health.runId -eq $script:State.runId){Write-Host 'Hệ thống đã chạy; không tạo tiến trình mới.';Show-Status;Start-Process ($Local+'/__local/open');exit 0}
    Stop-Managed
  }
  $script:Stage='Kiểm tra công cụ và cấu hình'
  $npm=(Get-Command npm.cmd -ErrorAction Stop).Source;$ngrok=(Get-Command ngrok.exe -ErrorAction Stop).Source
  $pgBin=Join-Path $env:ProgramFiles 'PostgreSQL\14\bin';$pgCtl=Join-Path $pgBin 'pg_ctl.exe';$pgReady=Join-Path $pgBin 'pg_isready.exe';$control=Join-Path $pgBin 'pg_controldata.exe'
  foreach($file in @('apps\api\.env','node_modules\vite\bin\vite.js','node_modules\pg\package.json','.local-storage\br136-working-demo\learning-fixture.private.json')){if(-not(Test-Path -LiteralPath (Join-Path $Root $file))){throw "Thiếu tệp cần thiết: $file. Launcher không tự cài hoặc seed dữ liệu."}}
  if(-not(Test-Path -LiteralPath $pgCtl)-or -not(Test-Path -LiteralPath $control)){throw 'Thiếu PostgreSQL14 trong Program Files. Không dùng PostgreSQL khác để mở cluster này.'}
  $ngrokConfig=Join-Path $env:LOCALAPPDATA 'ngrok\ngrok.yml';if(-not(Test-Path -LiteralPath $ngrokConfig)){throw 'Thiếu cấu hình ngrok riêng tư đang hoạt động. Không cần gửi authtoken vào chat.'}
  $version=& $script:Node -p 'process.versions.node';if([version]$version -lt [version]'22.22.3' -or [version]$version -ge [version]'23.0.0'){throw 'Cần Node22.22.3 trở lên thuộc nhánh22.'}
  foreach($port in @(3000,3037,3040,4040)){if(Port-Open $port){throw "Cổng $port đang được dùng ngoài phiên launcher. Không dừng tiến trình chưa xác minh; đóng dịch vụ cũ trước."}}
  $script:State=[pscustomobject]@{status='STARTING';runId=[guid]::NewGuid().ToString();processes=@();lastError=$null;updatedAt=$null;publicUrl=$Public;localUrl=$Local;postgresReused=$false};Save-State
  Prepare-Private
  $script:Stage='Kiểm tra và khởi động PostgreSQL demo'
  $physical=& $control -D $Data 2>$null;if($LASTEXITCODE -ne 0 -or -not($physical -match '7702384118803149788')){throw 'Physical identity PostgreSQL không khớp. Không khởi động hoặc kết nối database khác.'}
  if(-not(Port-Open 55401)){
    # Detach pg_ctl from PowerShell native pipelines: the long-lived postgres
    # child must not hold the launcher's stdout/stderr pipe open after pg_ctl exits.
    $pgStart=Start-Process -FilePath $pgCtl -ArgumentList @('start','-D',('"'+$Data+'"'),'-o','"-p 55401 -h 127.0.0.1"','-l',('"'+(Join-Path $StateDir 'postgres.log')+'"'),'-w','-t','120') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $StateDir 'postgres-start.log') -RedirectStandardError (Join-Path $StateDir 'postgres-start.stderr.log') -PassThru
    $null=$pgStart.Handle
    if(-not $pgStart.WaitForExit(130000) -or -not(Port-Open 55401)){throw 'Không khởi động được PostgreSQL demo. Xem postgres-start.log.'}
    $pgId=[int](Get-Content -LiteralPath (Join-Path $Data 'postmaster.pid') -TotalCount 1);$script:State.processes=@(Process-Record 'postgres' $pgId);Save-State
  }else{$script:State.postgresReused=$true;Save-State}
  if(Test-Path -LiteralPath $pgReady){
    $pgWait=[DateTime]::UtcNow.AddSeconds(90)
    do{& $pgReady -h 127.0.0.1 -p 55401 -q 2>$null;if($LASTEXITCODE -eq 0){break};Start-Sleep -Milliseconds 500}while([DateTime]::UtcNow -lt $pgWait)
  }
  & $script:Node scripts/br136-launcher-preflight.cjs;if($LASTEXITCODE -ne 0){throw 'Database demo sai OID/marker/path. Dừng khởi động; không tự sửa dữ liệu.'}
  $script:Stage='Build frontend mới nhất';Write-Host 'Đang chuẩn bị giao diện mới nhất…'
  $viteBin=Join-Path $Root 'node_modules\vite\bin\vite.js'
  $webDir=Join-Path $Root 'apps\web'
  $build=Start-Process -FilePath $script:Node -ArgumentList @($viteBin,'build') -WorkingDirectory $webDir -WindowStyle Hidden -RedirectStandardOutput (Join-Path $StateDir 'frontend-build.stdout.log') -RedirectStandardError (Join-Path $StateDir 'frontend-build.stderr.log') -PassThru
  $null=$build.Handle
  if(-not $build.WaitForExit(240000)){Stop-Process -Id $build.Id;throw 'Build giao diện quá thời gian240giây.'};if($build.ExitCode -ne 0){throw 'Build giao diện không thành công. Xem frontend-build.stderr.log.'}
  $script:Stage='Khởi động API và proxy webhook'
  [void](Start-Owned 'backend' $script:Node @('--env-file=apps/api/.env','scripts/br136-demo-runtime.cjs','--managed-launcher',$script:State.runId))
  Wait-Health 'http://127.0.0.1:3000/api/demo/environment' 'backend'
  [void](Start-Owned 'sepay-proxy' $script:Node @('scripts/br136-sepay-proxy.cjs'))
  $end=[DateTime]::UtcNow.AddSeconds(20);while(-not(Port-Open 3037)){if([DateTime]::UtcNow -gt $end){throw 'Proxy webhook3037 chưa sẵn sàng.'};Start-Sleep -Milliseconds 250}
  [void](Start-Owned 'gateway' $script:Node @('scripts/br136-public-gateway.cjs',$script:State.runId))
  Wait-Health ($Local+'/__health') 'gateway'
  $script:Stage='Mở HTTPS ngrok trên domain cố định'
  [void](Start-Owned 'ngrok' $ngrok @('http','http://127.0.0.1:3040',('--url='+$Public),'--inspect=false','--log=stdout','--log-format=json','--log-level=warn',('--config="'+$ngrokConfig+'"')))
  Wait-Health ($Public+'/__health') 'gateway' 60
  $script:State.status='RUNNING';Save-State;Show-Status;Start-Process ($Local+'/__local/open')
  Write-Host 'Website đã sẵn sàng. Dùng ACCESS_SMART_ENGLISH.bat để xem quyền truy cập riêng tư; dùng STOP để đóng.'
} catch {
  $message='Không hoàn tất ở bước: '+$script:Stage+'. '+$_.Exception.Message
  Write-Host $message -ForegroundColor Red
  if($script:State -and $Action -eq 'Start'){$script:State.lastError=$message;try{Stop-Managed}catch{};$script:State.status='FAILED';Save-State}
  exit 1
} finally {if($lock){$lock.Dispose()}}
