$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'SePay - Nhap API TOKEN'
$sepayWorkspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sepayPrivateDirectory = Join-Path $sepayWorkspace '.local-storage/v2-w07-sepay-fullstack-01'
$sepayPrivateFile = [System.IO.Path]::GetFullPath((Join-Path $sepayPrivateDirectory 'sepay-config.private.json'))
$sepayCallbackFile = Join-Path $sepayPrivateDirectory 'HTTPS_CALLBACK.json'
$sepaySavedWebhookSecret = Join-Path $sepayPrivateDirectory 'webhook-secret.private'
$sepayCachedTokenFile = Join-Path $sepayPrivateDirectory 'api-token.dpapi.private'
$sepayOperatorStatusFile = Join-Path $sepayPrivateDirectory 'OPERATOR_SETUP_STATUS.json'
if (-not (Test-Path -LiteralPath $sepayCallbackFile)) { throw 'Start the verified HTTPS callback before entering credentials.' }
if (Test-Path -LiteralPath $sepayPrivateFile) { throw 'Existing private config retained. Review/rotate it explicitly; this wizard will not overwrite it.' }
if ($sepayPrivateFile -notlike ($sepayWorkspace + '\.local-storage\*')) { throw 'Private path must stay in the workspace.' }
function Read-SePaySecret([string] $Prompt) {
  $sepaySecure = Read-Host -Prompt $Prompt -AsSecureString
  $sepayPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sepaySecure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($sepayPointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($sepayPointer) }
}
function Set-SePayStatus([string] $Phase, $HttpStatus=$null) {
  [System.IO.File]::WriteAllText($sepayOperatorStatusFile,(@{at=[DateTime]::UtcNow.ToString('o');phase=$Phase;httpStatus=$HttpStatus} | ConvertTo-Json),[System.Text.UTF8Encoding]::new($false))
}
function Save-SePayEncryptedToken([string] $Token) {
  $sepayEncrypted = ConvertFrom-SecureString (ConvertTo-SecureString $Token -AsPlainText -Force)
  if (-not (Test-Path -LiteralPath $sepayCachedTokenFile)) {
    $sepayCacheHandle=[System.IO.File]::Open($sepayCachedTokenFile,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
    $sepayCacheHandle.Close()
  }
  $sepayCacheAcl = New-Object Security.AccessControl.FileSecurity
  $sepayCacheAcl.SetAccessRuleProtection($true,$false)
  foreach ($sepayCachePrincipal in @([Security.Principal.WindowsIdentity]::GetCurrent().Name,'NT AUTHORITY\SYSTEM')) {
    $sepayCacheAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sepayCachePrincipal,'FullControl','Allow')))
  }
  Set-Acl -LiteralPath $sepayCachedTokenFile -AclObject $sepayCacheAcl
  [System.IO.File]::WriteAllText($sepayCachedTokenFile,$sepayEncrypted,[System.Text.UTF8Encoding]::new($false))
}
$sepayCallback = Get-Content -LiteralPath $sepayCallbackFile -Raw | ConvertFrom-Json
Write-Host 'SePay LIVE - operator-only configuration. Do not paste secrets into chat or reports.'
Write-Host ('HTTPS callback: ' + $sepayCallback.url)
Write-Host 'This wizard does not send money, create tuition obligations, grant study access or approve a bank test.'
$sepayApiToken = $null
if (Test-Path -LiteralPath $sepayCachedTokenFile) {
  try {
    $sepayCachedSecure = ConvertTo-SecureString ([System.IO.File]::ReadAllText($sepayCachedTokenFile))
    $sepayCachedPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sepayCachedSecure)
    try { $sepayApiToken=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($sepayCachedPointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($sepayCachedPointer) }
    Write-Host 'Reusing the encrypted API token saved for this Windows user.'
  } catch { Write-Host 'Encrypted token unavailable; enter API Token again.' }
}
while ($true) {
  if (-not $sepayApiToken) {
    Set-SePayStatus 'WAITING_API_TOKEN'
    Write-Host 'Get API Token: my.sepay.vn -> Cau hinh Cong ty -> API Access -> Them API (LIVE, not Test mode).'
    $sepayApiToken = (Read-SePaySecret 'API TOKEN (not webhook HMAC; hidden)').Trim()
  }
  $sepayIsSavedHmac = (Test-Path -LiteralPath $sepaySavedWebhookSecret) -and ($sepayApiToken -ceq [System.IO.File]::ReadAllText($sepaySavedWebhookSecret).Trim())
  if ($sepayApiToken.StartsWith('whsec_') -or $sepayIsSavedHmac) {
    Write-Host 'Day la khoa ky WEBHOOK/HMAC. API Token phai lay o API Access, khong phai Webhooks.' -ForegroundColor Yellow
    Set-SePayStatus 'WEBHOOK_KEY_ENTERED_AS_API_TOKEN'
    $sepayApiToken=$null
    continue
  }
  if ($sepayApiToken.Length -lt 16 -or $sepayApiToken -match '\s') {
    Write-Host 'Token format incomplete. Paste only the API token, without Bearer/header or spaces.' -ForegroundColor Yellow
    $sepayApiToken=$null
    continue
  }
  Save-SePayEncryptedToken $sepayApiToken
  Set-SePayStatus 'CHECKING_API'
  $sepayHttpStatus=$null
  try {
    $sepayBanks = Invoke-RestMethod -Uri 'https://userapi.sepay.vn/v2/bank-accounts' -Method Get -Headers @{ Authorization=('Bearer ' + $sepayApiToken); Accept='application/json' } -TimeoutSec 15
    $sepayHttpStatus=200
    if ($sepayBanks.status -eq 'success') {
      $sepayChoices = @($sepayBanks.data | Where-Object { $_.active -eq 1 })
      if ($sepayChoices.Count -gt 0) { break }
      Write-Host 'HTTP 200: token accepted, but this page has no active LIVE bank account. Check bank linking/activation on SePay.' -ForegroundColor Yellow
    } else {
      Write-Host 'HTTP 200 but the API response is not the expected success format; no configuration saved.' -ForegroundColor Yellow
    }
  } catch {
    if ($_.Exception.Response) { $sepayHttpStatus=[int]$_.Exception.Response.StatusCode }
    switch ($sepayHttpStatus) {
      401 { Write-Host 'HTTP 401: API token rejected. Check API Access in LIVE mode; a webhook/HMAC or Test-mode token cannot authenticate this endpoint.' -ForegroundColor Yellow }
      403 { Write-Host 'HTTP 403: access forbidden. Check API token permissions, active API access and configured IP restrictions.' -ForegroundColor Yellow }
      429 { Write-Host 'HTTP 429: rate limit. Wait briefly, then retry with the same token.' -ForegroundColor Yellow }
      default {
        if ($null -eq $sepayHttpStatus) { Write-Host 'Network/TLS/timeout error before HTTP response. The encrypted token is retained; retry without entering it again.' -ForegroundColor Yellow }
        else { Write-Host ('HTTP '+$sepayHttpStatus+': SePay did not accept the request; no financial changes made.') -ForegroundColor Yellow }
      }
    }
  }
  Set-SePayStatus 'API_NOT_READY' $sepayHttpStatus
  $sepayRetryChoice = Read-Host 'R = retry same token; N = enter a new API token; Q = stop (no configuration saved)'
  if ($sepayRetryChoice -ieq 'Q') { $sepayApiToken=$null; return }
  if ($sepayRetryChoice -ieq 'N') { $sepayApiToken=$null }
}
Set-SePayStatus 'ACCOUNT_SELECTION' 200
for ($sepayChoiceIndex=0; $sepayChoiceIndex -lt $sepayChoices.Count; $sepayChoiceIndex++) {
  $sepayChoice = $sepayChoices[$sepayChoiceIndex]
  $sepayMaskedAccount = '****' + $sepayChoice.account_number.Substring([Math]::Max(0,$sepayChoice.account_number.Length-4))
  Write-Host (($sepayChoiceIndex+1).ToString() + '. ' + $sepayChoice.bank_code + ' ' + $sepayMaskedAccount + ' ' + $sepayChoice.account_holder_name)
}
$sepaySelected = [int](Read-Host 'Choose the authorized center receiving account number from this list')
if ($sepaySelected -lt 1 -or $sepaySelected -gt $sepayChoices.Count) { throw 'Selection invalid. Nothing saved.' }
$sepayBank = $sepayChoices[$sepaySelected-1]
$sepayAccountId = $sepayBank.id
$sepayAccountNumber = $sepayBank.account_number
$sepayAccountHolder = $sepayBank.account_holder_name
$sepayBankCode = $sepayBank.bank_code
$sepayGateway = Read-Host 'Exact gateway name in your SePay bank webhook (check SePay dashboard, do not guess aliases)'
if (Test-Path -LiteralPath $sepaySavedWebhookSecret) {
  $sepayWebhookSecret = [System.IO.File]::ReadAllText($sepaySavedWebhookSecret).Trim()
  Write-Host 'Webhook HMAC secret already saved privately; using it without displaying it.'
} else {
  $sepayWebhookSecret = Read-SePaySecret 'HMAC secret configured in SePay webhook (hidden, at least 32 characters)'
}
if ($sepayWebhookSecret.Length -lt 32 -or $sepayApiToken.Length -lt 16) { throw 'Credential format incomplete. Nothing saved.' }
if ((Read-Host 'Have you verified this is the authorized center receiving account? Type YES') -cne 'YES') { throw 'Recipient not confirmed. Nothing saved.' }
$sepayConfiguration = [ordered]@{
  version=1; enabled=$true; bankAccountId=$sepayAccountId; accountNumber=$sepayAccountNumber
  accountHolder=$sepayAccountHolder; bankCode=$sepayBankCode; gateway=$sepayGateway; subAccount=''
  apiToken=$sepayApiToken; webhookSecret=$sepayWebhookSecret; callbackUrl=$sepayCallback.url
  operatorVerifiedRecipient=$true
}
$sepayAcl = New-Object Security.AccessControl.FileSecurity
$sepayAcl.SetAccessRuleProtection($true,$false)
$sepayUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
foreach ($sepayPrincipal in @($sepayUser,'NT AUTHORITY\SYSTEM')) {
  $sepayRule = New-Object Security.AccessControl.FileSystemAccessRule($sepayPrincipal,'FullControl','Allow')
  $sepayAcl.AddAccessRule($sepayRule)
}
# Create with no credential bytes, apply owner-only ACL, then write the actual private value.
$sepayConfigHandle = [System.IO.File]::Open($sepayPrivateFile,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
$sepayConfigHandle.Close()
Set-Acl -LiteralPath $sepayPrivateFile -AclObject $sepayAcl
[System.IO.File]::WriteAllText($sepayPrivateFile,($sepayConfiguration | ConvertTo-Json -Depth 5),[System.Text.UTF8Encoding]::new($false))
Set-SePayStatus 'CONFIG_SAVED' 200
$sepayApiToken=$null; $sepayWebhookSecret=$null; $sepayConfiguration=$null
Write-Host 'Saved to an ignored owner-only private file. The backend must still verify the receiving account through SePay API.'
Write-Host 'No payment has been made or marked successful. Reload /payments/sepay to inspect readiness.'
Read-Host 'Press Enter to close'
