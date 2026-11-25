$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$configPath = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ngrok\ngrok.yml'
if (-not (Test-Path -LiteralPath $configPath)) { throw 'NGROK_EXISTING_CONFIGURATION_REQUIRED' }
$form = New-Object Windows.Forms.Form
$form.Text = 'Smart English - private ngrok account setup'
$form.ClientSize = New-Object Drawing.Size(560, 190)
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$label = New-Object Windows.Forms.Label
$label.Text = "Paste the authtoken from the ngrok account that owns:`r`noink-crazed-frosting.ngrok-free.dev`r`nThis private field is never printed or included in evidence."
$label.SetBounds(16, 14, 528, 66)
$inputBox = New-Object Windows.Forms.TextBox
$inputBox.UseSystemPasswordChar = $true
$inputBox.SetBounds(16, 88, 528, 25)
$button = New-Object Windows.Forms.Button
$button.Text = 'Save privately'
$button.SetBounds(360, 134, 184, 32)
$form.Controls.AddRange(@($label, $inputBox, $button))
$form.AcceptButton = $button
$form.Add_Shown({
  $form.Activate()
  $inputBox.Focus()
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot '..\.local-storage\br136-working-demo\NGROK_PRIVATE_WINDOW.json'), '{"status":"PRIVATE_INPUT_FORM_SHOWN","secretPrinted":false}')
})
$button.Add_Click({
  try {
    if ($inputBox.Text -notmatch '^[A-Za-z0-9_-]{16,250}$') { throw 'INVALID_TOKEN_SHAPE' }
    $existing = [IO.File]::ReadAllText($configPath)
    $pattern = '(?m)^(\s*authtoken\s*:\s*)[^\r\n]*'
    if ([regex]::Matches($existing, $pattern).Count -ne 1) { throw 'EXACTLY_ONE_EXISTING_TOKEN_FIELD_REQUIRED' }
    $replacement = [regex]::Replace($existing, $pattern, [Text.RegularExpressions.MatchEvaluator]{ param($match) $match.Groups[1].Value + $inputBox.Text })
    [IO.File]::WriteAllText($configPath, $replacement, (New-Object Text.UTF8Encoding($false)))
    $inputBox.Clear()
    $existing = $null
    $replacement = $null
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot '..\.local-storage\br136-working-demo\NGROK_PRIVATE_SETUP.json'), '{"status":"LOCAL_AUTHTOKEN_UPDATED","secretPrinted":false,"backupCreated":false}')
    $form.DialogResult = [Windows.Forms.DialogResult]::OK
    $form.Close()
  } catch {
    [Windows.Forms.MessageBox]::Show('Configuration was not confirmed. Check the token and the existing ngrok YAML. No secret was printed.', 'Private setup blocked') | Out-Null
  }
})
try { [void]$form.ShowDialog() } finally { $inputBox.Clear(); $form.Dispose() }
