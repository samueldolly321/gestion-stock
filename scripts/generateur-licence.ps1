# Vokatra-ko — Générateur de licences (fenêtre Windows).
# Interface au-dessus de licence.mjs (même dossier) : c'est lui qui signe avec la clé privée
# (%USERPROFILE%\.vokatra-ko-licences\cle-privee.pem). Lancé par generer-licence.cmd
# (projet) ou release\Generer une licence.cmd. Ce fichier doit rester en UTF-8 AVEC BOM
# (sinon Windows PowerShell 5.1 affiche mal les accents).

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$engine = Join-Path $here 'licence.mjs'
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  [System.Windows.Forms.MessageBox]::Show("Node.js est introuvable sur ce PC.`n`nInstallez-le depuis https://nodejs.org puis relancez le générateur.", 'Vokatra-ko — Licences', 'OK', 'Error') | Out-Null
  exit 1
}
$node = $nodeCmd.Source

# --- Appel du moteur (licence.mjs json) : arguments en variable d'environnement, réponse JSON ---
function Invoke-Licence([hashtable]$params) {
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $node
  $psi.Arguments = '"' + $engine + '" json'
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
  $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
  $psi.EnvironmentVariables['VK_ARGS'] = ($params | ConvertTo-Json -Compress)
  $p = [System.Diagnostics.Process]::Start($psi)
  $out = $p.StandardOutput.ReadToEnd()
  $err = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  if (-not $out) { return [pscustomobject]@{ ok = $false; error = "Le moteur de licence n'a pas répondu.`n$err" } }
  try { return $out | ConvertFrom-Json } catch { return [pscustomobject]@{ ok = $false; error = "Réponse illisible du moteur.`n$out" } }
}

function Get-HexCount([string]$s) { return ($s.ToUpper() -replace '[^0-9A-F]', '').Length }

# --- Apparence ---
$accent = [System.Drawing.Color]::FromArgb(6, 182, 212)
$accentDark = [System.Drawing.Color]::FromArgb(8, 145, 178)
$ink = [System.Drawing.Color]::FromArgb(15, 23, 42)
$muted = [System.Drawing.Color]::FromArgb(100, 116, 139)
$okColor = [System.Drawing.Color]::FromArgb(5, 150, 105)
$errColor = [System.Drawing.Color]::FromArgb(220, 38, 38)
$font = New-Object System.Drawing.Font('Segoe UI', 10)
$fontBold = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
$fontSmall = New-Object System.Drawing.Font('Segoe UI', 8.5)
$fontMono = New-Object System.Drawing.Font('Consolas', 10)

function New-Label([string]$text, [int]$x, [int]$y, [int]$w = 560, $f = $font, $color = $ink) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $text; $l.Location = New-Object System.Drawing.Point($x, $y); $l.Size = New-Object System.Drawing.Size($w, 22)
  $l.Font = $f; $l.ForeColor = $color
  return $l
}
function New-Button([string]$text, [int]$x, [int]$y, [int]$w = 170, [bool]$primary = $false) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text = $text; $b.Location = New-Object System.Drawing.Point($x, $y); $b.Size = New-Object System.Drawing.Size($w, 34)
  $b.Font = $(if ($primary) { $fontBold } else { $font })
  $b.FlatStyle = 'Flat'; $b.Cursor = [System.Windows.Forms.Cursors]::Hand
  if ($primary) { $b.BackColor = $accent; $b.ForeColor = [System.Drawing.Color]::White; $b.FlatAppearance.BorderSize = 0 }
  else { $b.BackColor = [System.Drawing.Color]::FromArgb(241, 245, 249); $b.ForeColor = $ink; $b.FlatAppearance.BorderColor = [System.Drawing.Color]::FromArgb(203, 213, 225) }
  return $b
}
function New-TextBox([int]$x, [int]$y, [int]$w = 560, [int]$h = 28, [bool]$multi = $false) {
  $t = New-Object System.Windows.Forms.TextBox
  $t.Location = New-Object System.Drawing.Point($x, $y); $t.Size = New-Object System.Drawing.Size($w, $h)
  $t.Font = $font
  if ($multi) { $t.Multiline = $true; $t.ScrollBars = 'Vertical'; $t.Font = $fontMono }
  return $t
}

# --- Fenêtre ---
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Vokatra-ko — Générateur de licences'
$form.Size = New-Object System.Drawing.Size(660, 600)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false
$form.BackColor = [System.Drawing.Color]::White
$form.Font = $font

$header = New-Object System.Windows.Forms.Panel
$header.Dock = 'Top'; $header.Height = 64; $header.BackColor = $accentDark
$title = New-Label 'Générateur de licences Vokatra-ko' 18 10 600 (New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)) ([System.Drawing.Color]::White)
$title.Height = 28
$subtitle = New-Label 'Licences à vie, liées à un ordinateur — outil réservé au vendeur' 20 38 600 $fontSmall ([System.Drawing.Color]::FromArgb(207, 250, 254))
$header.Controls.AddRange(@($title, $subtitle))

$tabs = New-Object System.Windows.Forms.TabControl
$tabs.Location = New-Object System.Drawing.Point(12, 76); $tabs.Size = New-Object System.Drawing.Size(620, 470)
$tabs.Font = $font
$tabNew = New-Object System.Windows.Forms.TabPage; $tabNew.Text = '  Nouvelle licence  '; $tabNew.BackColor = [System.Drawing.Color]::White
$tabCheck = New-Object System.Windows.Forms.TabPage; $tabCheck.Text = '  Vérifier une clé  '; $tabCheck.BackColor = [System.Drawing.Color]::White
$tabList = New-Object System.Windows.Forms.TabPage; $tabList.Text = '  Licences vendues  '; $tabList.BackColor = [System.Drawing.Color]::White
$tabs.TabPages.AddRange(@($tabNew, $tabCheck, $tabList))
$form.Controls.AddRange(@($header, $tabs))

# =========================== Onglet 1 : Nouvelle licence ===========================
$banner = New-Label '' 14 10 580 $fontBold $errColor
$banner.Height = 40; $banner.Visible = $false

$lblCode = New-Label 'Code machine du client' 14 14 300 $fontBold
$txtCode = New-TextBox 14 40 300
$txtCode.CharacterCasing = 'Upper'; $txtCode.MaxLength = 24; $txtCode.Font = New-Object System.Drawing.Font('Consolas', 12)
$lblCodeState = New-Label '0 / 16 caractères' 326 44 270 $fontSmall $muted
$lblCodeHint = New-Label 'Affiché sur l''écran d''activation du client (ex. 1A2B-3C4D-5E6F-7A8B).' 14 72 580 $fontSmall $muted

$lblClient = New-Label 'Nom du client (magasin)' 14 104 300 $fontBold
$txtClient = New-TextBox 14 130 400
$txtClient.MaxLength = 80

$btnGen = New-Button 'Générer la clé' 14 172 180 $true
$btnGen.Enabled = $false

$grpResult = New-Object System.Windows.Forms.GroupBox
$grpResult.Text = 'Clé à envoyer au client'; $grpResult.Font = $fontBold
$grpResult.Location = New-Object System.Drawing.Point(14, 222); $grpResult.Size = New-Object System.Drawing.Size(580, 200)
$grpResult.Visible = $false
$lblResult = New-Label '' 12 26 556 $font $okColor
$lblResult.Height = 40
$txtKey = New-TextBox 12 68 556 70 $true
$txtKey.ReadOnly = $true; $txtKey.BackColor = [System.Drawing.Color]::FromArgb(248, 250, 252)
$btnCopy = New-Button 'Copier la clé' 12 150 160 $true
$btnAgain = New-Button 'Nouvelle licence' 184 150 160
$lblCopied = New-Label '' 356 157 210 $fontSmall $okColor
$grpResult.Controls.AddRange(@($lblResult, $txtKey, $btnCopy, $btnAgain, $lblCopied))

$tabNew.Controls.AddRange(@($lblCode, $txtCode, $lblCodeState, $lblCodeHint, $lblClient, $txtClient, $btnGen, $grpResult, $banner))

$script:privateKeyOk = $true
function Update-GenState {
  $n = Get-HexCount $txtCode.Text
  if ($n -eq 16) { $lblCodeState.Text = 'Code complet'; $lblCodeState.ForeColor = $okColor }
  elseif ($n -gt 16) { $lblCodeState.Text = "Trop long : $n / 16 caractères"; $lblCodeState.ForeColor = $errColor }
  else { $lblCodeState.Text = "$n / 16 caractères"; $lblCodeState.ForeColor = $muted }
  $btnGen.Enabled = $script:privateKeyOk -and ($n -eq 16) -and ($txtClient.Text.Trim().Length -gt 0)
}
$txtCode.Add_TextChanged({ Update-GenState })
$txtClient.Add_TextChanged({ Update-GenState })

$btnGen.Add_Click({
  $hex = $txtCode.Text.ToUpper() -replace '[^0-9A-F]', ''
  $code = ($hex -split '(.{4})' | Where-Object { $_ }) -join '-'
  $client = $txtClient.Text.Trim()

  # Ce PC a-t-il déjà une licence ? (le client a peut-être réinstallé Windows ou perdu sa clé)
  $prev = Invoke-Licence @{ action = 'liste' }
  $already = @()
  if ($prev.ok) { $already = @($prev.rows | Where-Object { ($_.machine -replace '[^0-9A-F]', '') -eq $hex }) }
  if ($already.Count -gt 0) {
    $first = $already[0]
    $msg = "Cet ordinateur ($code) a déjà une licence :`n`n   $($first.client) — $($first.date)`n`nLa clé existante reste valable : vous pouvez la renvoyer (onglet « Licences vendues »).`n`nCréer quand même une nouvelle clé ?"
    if ([System.Windows.Forms.MessageBox]::Show($msg, 'Licence existante', 'YesNo', 'Warning') -ne 'Yes') { return }
  } else {
    $msg = "Créer une licence À VIE pour :`n`n   Client : $client`n   Ordinateur : $code`n`nLa clé ne fonctionnera que sur cet ordinateur."
    if ([System.Windows.Forms.MessageBox]::Show($msg, 'Confirmer', 'YesNo', 'Question') -ne 'Yes') { return }
  }

  $form.Cursor = 'WaitCursor'
  $r = Invoke-Licence @{ action = 'generer'; machine = $code; client = $client }
  $form.Cursor = 'Default'
  if (-not $r.ok) {
    [System.Windows.Forms.MessageBox]::Show($r.error, 'Licence non créée', 'OK', 'Error') | Out-Null
    return
  }
  $lblResult.Text = "Licence à vie créée pour $($r.client) — ordinateur $($r.machine)`nEnvoyez la clé ci-dessous au client, en entier."
  $txtKey.Text = $r.key
  $lblCopied.Text = ''
  $grpResult.Visible = $true
  $txtCode.ReadOnly = $true; $txtClient.ReadOnly = $true; $btnGen.Enabled = $false
  Update-List
})

$btnCopy.Add_Click({
  if ($txtKey.Text) { [System.Windows.Forms.Clipboard]::SetText($txtKey.Text); $lblCopied.Text = 'Clé copiée dans le presse-papiers' }
})
$btnAgain.Add_Click({
  $txtCode.ReadOnly = $false; $txtClient.ReadOnly = $false
  $txtCode.Text = ''; $txtClient.Text = ''; $txtKey.Text = ''
  $grpResult.Visible = $false
  Update-GenState
  $txtCode.Focus()
})

# =========================== Onglet 2 : Vérifier une clé ===========================
$lblVKey = New-Label 'Clé de licence (commence par VK1.)' 14 14 400 $fontBold
$txtVKey = New-TextBox 14 40 580 80 $true
$lblVCode = New-Label 'Code machine (facultatif : pour savoir si la clé est faite pour ce PC)' 14 132 580 $fontBold
$txtVCode = New-TextBox 14 158 300
$txtVCode.CharacterCasing = 'Upper'; $txtVCode.Font = New-Object System.Drawing.Font('Consolas', 12)
$btnVerify = New-Button 'Vérifier' 14 200 150 $true
$lblVerdict = New-Label '' 14 250 580 (New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)) $ink
$lblVerdict.Height = 28
$lblVDetails = New-Label '' 14 282 580 $font $ink
$lblVDetails.Height = 110
$tabCheck.Controls.AddRange(@($lblVKey, $txtVKey, $lblVCode, $txtVCode, $btnVerify, $lblVerdict, $lblVDetails))

$btnVerify.Add_Click({
  $lblVerdict.Text = ''; $lblVDetails.Text = ''
  if (-not $txtVKey.Text.Trim()) { $lblVerdict.Text = 'Collez d''abord une clé.'; $lblVerdict.ForeColor = $muted; return }
  $params = @{ action = 'verifier'; key = $txtVKey.Text }
  if ($txtVCode.Text.Trim()) { $params.machine = $txtVCode.Text.Trim() }
  $r = Invoke-Licence $params
  if (-not $r.ok) { $lblVerdict.Text = 'Clé illisible'; $lblVerdict.ForeColor = $errColor; $lblVDetails.Text = $r.error; return }
  if ($r.valid) { $lblVerdict.Text = 'Clé authentique (signature valide)'; $lblVerdict.ForeColor = $okColor }
  else { $lblVerdict.Text = 'Clé FAUSSE ou modifiée (signature invalide)'; $lblVerdict.ForeColor = $errColor }
  $d = "Client : $($r.client)`nCréée le : $($r.date)`nOrdinateur : $($r.machine)"
  if ($null -ne $r.sameMachine) {
    $d += $(if ($r.sameMachine) { "`n`nFaite pour l'ordinateur indiqué : oui" } else { "`n`nFaite pour l'ordinateur indiqué : NON (autre ordinateur)" })
  }
  $lblVDetails.Text = $d
})

# =========================== Onglet 3 : Licences vendues ===========================
$lblSearch = New-Label 'Rechercher (client ou code machine) :' 14 16 260 $font $ink
$txtSearch = New-TextBox 276 13 318
$grid = New-Object System.Windows.Forms.DataGridView
$grid.Location = New-Object System.Drawing.Point(14, 50); $grid.Size = New-Object System.Drawing.Size(580, 300)
$grid.ReadOnly = $true; $grid.AllowUserToAddRows = $false; $grid.AllowUserToDeleteRows = $false
$grid.SelectionMode = 'FullRowSelect'; $grid.MultiSelect = $false; $grid.RowHeadersVisible = $false
$grid.AutoSizeColumnsMode = 'Fill'; $grid.BackgroundColor = [System.Drawing.Color]::White; $grid.BorderStyle = 'FixedSingle'
$grid.Font = $font
$grid.ColumnHeadersDefaultCellStyle.Font = $fontBold
$grid.EnableHeadersVisualStyles = $true
[void]$grid.Columns.Add('date', 'Date'); [void]$grid.Columns.Add('client', 'Client'); [void]$grid.Columns.Add('machine', 'Code machine'); [void]$grid.Columns.Add('key', 'Clé')
$grid.Columns['date'].FillWeight = 22; $grid.Columns['client'].FillWeight = 40; $grid.Columns['machine'].FillWeight = 38; $grid.Columns['key'].Visible = $false
$grid.Columns['machine'].DefaultCellStyle.Font = $fontMono
$lblCount = New-Label '' 14 356 580 $fontSmall $muted
$btnCopyRow = New-Button 'Copier la clé sélectionnée' 14 382 220 $true
$btnFolder = New-Button 'Ouvrir le dossier' 246 382 160
$btnRefresh = New-Button 'Actualiser' 418 382 120
$lblRowCopied = New-Label '' 14 420 580 $fontSmall $okColor
$tabList.Controls.AddRange(@($lblSearch, $txtSearch, $grid, $lblCount, $btnCopyRow, $btnFolder, $btnRefresh, $lblRowCopied))

$script:allRows = @()
$script:registryPath = ''
function Show-Rows {
  $q = $txtSearch.Text.Trim().ToUpper()
  $qHex = $q -replace '[^0-9A-F]', ''
  $grid.Rows.Clear()
  $shown = 0
  foreach ($row in $script:allRows) {
    $match = (-not $q) -or $row.client.ToUpper().Contains($q) -or ($qHex.Length -ge 2 -and ($row.machine -replace '[^0-9A-F]', '').Contains($qHex))
    if ($match) { [void]$grid.Rows.Add($row.date, $row.client, $row.machine, $row.key); $shown++ }
  }
  $total = $script:allRows.Count
  $lblCount.Text = $(if ($q) { "$shown licence(s) trouvée(s) sur $total" } else { "$total licence(s) vendue(s) — registre : $script:registryPath" })
}
function Update-List {
  $r = Invoke-Licence @{ action = 'liste' }
  if ($r.ok) { $script:allRows = @($r.rows); $script:registryPath = $r.registry } else { $script:allRows = @() }
  Show-Rows
}
$txtSearch.Add_TextChanged({ Show-Rows })
$btnRefresh.Add_Click({ Update-List; $lblRowCopied.Text = '' })
$btnCopyRow.Add_Click({
  if ($grid.SelectedRows.Count -eq 0) { $lblRowCopied.ForeColor = $muted; $lblRowCopied.Text = 'Sélectionnez d''abord une ligne.'; return }
  $row = $grid.SelectedRows[0]
  [System.Windows.Forms.Clipboard]::SetText([string]$row.Cells['key'].Value)
  $lblRowCopied.ForeColor = $okColor
  $lblRowCopied.Text = "Clé de « $($row.Cells['client'].Value) » copiée dans le presse-papiers"
})
$btnFolder.Add_Click({
  $dir = if ($script:registryPath) { Split-Path -Parent $script:registryPath } else { Join-Path $env:USERPROFILE '.vokatra-ko-licences' }
  if (Test-Path $dir) { Start-Process explorer.exe $dir } else { [System.Windows.Forms.MessageBox]::Show("Dossier introuvable : $dir", 'Licences', 'OK', 'Warning') | Out-Null }
})

# =========================== Démarrage ===========================
$form.Add_Shown({
  $etat = Invoke-Licence @{ action = 'etat' }
  if (-not $etat.ok -or -not $etat.privateKey) {
    $script:privateKeyOk = $false
    $where = $(if ($etat.vault) { $etat.vault } else { '%USERPROFILE%\.vokatra-ko-licences' })
    $banner.Text = "Clé privée introuvable ($where\cle-privee.pem) : impossible de créer des licences sur ce PC. La vérification reste possible."
    $banner.Location = New-Object System.Drawing.Point(14, 380); $banner.Visible = $true
  }
  Update-GenState
  Update-List
  $txtCode.Focus()
})

[void]$form.ShowDialog()
