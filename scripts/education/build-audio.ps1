$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskSpecs = Get-Content -LiteralPath (Join-Path $taskRoot '.local-storage/education-preparation/audio-scripts.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$taskDestination = Join-Path $taskRoot 'apps/web/public/learning/toeic-foundation'
$taskVoice = New-Object -ComObject SAPI.SpVoice
$taskVoice.Voice = $taskVoice.GetVoices().Item(1)
$taskVoice.Rate = -1
$taskVoice.Volume = 100
$taskReceipts = @()
foreach ($taskSpec in $taskSpecs) {
  if ($taskSpec.fileName -notmatch '^unit-\d{2}\.wav$') { throw 'Invalid audio name' }
  $taskOutput = Join-Path $taskDestination $taskSpec.fileName
  if (-not (Test-Path -LiteralPath $taskOutput) -or (Get-Item -LiteralPath $taskOutput).Length -le 1000) {
    $taskStream = New-Object -ComObject SAPI.SpFileStream
    $taskStream.Format.Type = 22
    $taskStream.Open($taskOutput, 3, $false)
    try { $taskVoice.AudioOutputStream = $taskStream; [void]$taskVoice.Speak([string]$taskSpec.text, 16) }
    finally { $taskStream.Close() }
  }
  if ((Get-Item -LiteralPath $taskOutput).Length -le 10000) { throw "Audio contains no usable speech: $($taskSpec.fileName)" }
  $taskReceipts += [PSCustomObject]@{ file=$taskSpec.fileName; voice=$taskVoice.Voice.GetDescription(); provider='Windows SAPI, offline'; transcript=$taskSpec.text; sha256=(Get-FileHash -LiteralPath $taskOutput -Algorithm SHA256).Hash.ToLower(); bytes=(Get-Item -LiteralPath $taskOutput).Length }
  Write-Output "Audio ready: $($taskSpec.fileName)"
}
$taskReceipts | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $taskRoot '.local-storage/education-preparation/audio-receipts.json') -Encoding UTF8
