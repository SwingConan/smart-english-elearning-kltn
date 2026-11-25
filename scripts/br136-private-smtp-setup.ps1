param([string]$SmtpLogin,[string]$From,[string]$Recipient,[switch]$ApprovedOneEmail)
$ErrorActionPreference='Stop'
$Host.UI.RawUI.WindowTitle='Smart English - private Brevo SMTP key'
# Run by PO in a private local terminal. Never pass a key in command arguments.
$taskRoot=Split-Path -Parent $PSScriptRoot
Push-Location $taskRoot
try {
  $taskIdentity = node -e "const x=require('./scripts/lib/gemini-live-runtime.cjs').windowsPrivateIdentity();process.stdout.write(JSON.stringify(x));" | ConvertFrom-Json
  if(-not $taskIdentity.privateRoot -or -not $taskIdentity.machineBinding){throw 'Private local identity required'}
  $taskDirectory=Join-Path $taskIdentity.privateRoot 'controlled-smtp'
  $taskConfigPath=Join-Path $taskDirectory 'smtp.private.json'
  if(Test-Path -LiteralPath $taskConfigPath){throw 'Configuration already exists; no implicit overwrite, retry or rearm allowed'}
  $taskLogin=if($SmtpLogin){$SmtpLogin.Trim()}else{(Read-Host 'Brevo SMTP login (from SMTP settings)').Trim()}
  $taskFrom=if($From){$From.Trim().ToLowerInvariant()}else{(Read-Host 'Verified From email (plain address)').Trim().ToLowerInvariant()}
  $taskRecipient=if($Recipient){$Recipient.Trim().ToLowerInvariant()}else{(Read-Host 'PO-controlled recipient email (one password reset)').Trim().ToLowerInvariant()}
  if($taskLogin -match '[\r\n]' -or $taskFrom -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$' -or $taskRecipient -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$'){throw 'Valid SMTP login and email addresses required'}
  $taskConsent=if($ApprovedOneEmail){'SEND_ONCE'}else{Read-Host 'Allow exactly ONE password-reset email on pinned demo1313121, no automatic retry? Type SEND_ONCE'}
  if($taskConsent -cne 'SEND_ONCE'){throw 'Not approved; no configuration saved'}
  $taskSecret=Read-Host 'Brevo SMTP KEY (masked; not API key)' -AsSecureString
  $taskPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecret)
  try{
    $taskPassword=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPointer)
    if([string]::IsNullOrWhiteSpace($taskPassword)){throw 'SMTP key required'}
    New-Item -ItemType Directory -Path $taskDirectory -Force | Out-Null
    $taskAcl=Get-Acl -LiteralPath $taskDirectory
    $taskAcl.SetAccessRuleProtection($true,$false)
    $taskSid=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $taskRule=New-Object Security.AccessControl.FileSystemAccessRule($taskSid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $taskAcl.SetAccessRule($taskRule);Set-Acl -LiteralPath $taskDirectory -AclObject $taskAcl
    $taskNow=[DateTime]::UtcNow
    $taskConfig=@{approvalId='BR136_SMTP_CORE_20261112_01';machineBinding=$taskIdentity.machineBinding;databaseOid='1313121';enabled=$true;maximumMessages=1;approvedAt=$taskNow.ToString('o');expiresAt=$taskNow.AddHours(24).ToString('o');recipient=$taskRecipient;config=@{EMAIL_PROVIDER='smtp';EMAIL_FROM=$taskFrom;SMTP_HOST='smtp-relay.brevo.com';SMTP_PORT='587';SMTP_SECURE='false';SMTP_USER=$taskLogin;SMTP_PASSWORD=$taskPassword}}
    $taskBytes=[Text.UTF8Encoding]::new($false).GetBytes(($taskConfig | ConvertTo-Json -Depth 5))
    $taskStream=[IO.File]::Open($taskConfigPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$taskStream.Write($taskBytes,0,$taskBytes.Length);$taskStream.Flush($true)}finally{$taskStream.Dispose()}
    [Array]::Clear($taskBytes,0,$taskBytes.Length)
  }finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPointer);$taskPassword=$null;$taskConfig=$null}
  Write-Host 'PRIVATE_SMTP_CONFIGURED; one-email policy saved. No email sent. Notify Codex that setup is complete.'
}finally{Pop-Location}
