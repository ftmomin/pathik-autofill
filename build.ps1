#Requires -Version 5.1
<#
.SYNOPSIS
  Packs Form FillBridge as a .crx and compiles the Inno Setup installer.

.DESCRIPTION
  Run this once to generate FormFillBridge.pem (keep it — it locks the extension ID).
  Subsequent runs reuse the same key so the extension ID never changes.

.REQUIREMENTS
  - Google Chrome installed
  - Inno Setup 6  (https://jrsoftware.org/isinfo.php)
#>
$ErrorActionPreference = "Stop"

$ExtDir  = $PSScriptRoot
$PemFile = Join-Path $ExtDir "FormFillBridge.pem"
$CrxDest = Join-Path $ExtDir "FormFillBridge.crx"

# ── Locate Chrome ─────────────────────────────────────────────────────────────
$chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw "Google Chrome not found. Install Chrome and re-run." }

# ── Locate Inno Setup compiler ────────────────────────────────────────────────
$iscc = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw "Inno Setup 6 not found. Download from https://jrsoftware.org/isinfo.php" }

# ── Stage extension files (exclude dev-only files) ────────────────────────────
$stage = Join-Path $env:TEMP "FormFillBridge-stage"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item $stage -ItemType Directory | Out-Null

$extFiles = @("manifest.json","background.js","content.js","injected.js",
              "styles.css","options.html","options.js","options.css")
$extFiles | ForEach-Object { Copy-Item (Join-Path $ExtDir $_) $stage }
Copy-Item (Join-Path $ExtDir "icons") (Join-Path $stage "icons") -Recurse

# ── Pack with Chrome ──────────────────────────────────────────────────────────
Write-Host "Packing extension..."
$packArgs = @("--pack-extension=`"$stage`"")
if (Test-Path $PemFile) {
    $packArgs += "--pack-extension-key=`"$PemFile`""
}
Start-Process $chrome -ArgumentList $packArgs -Wait

# Chrome places output next to the staged folder
$generatedCrx = "$stage.crx"
$generatedPem = "$stage.pem"

if (-not (Test-Path $generatedCrx)) {
    throw "CRX not generated. Chrome may have shown a window — close it and re-run."
}

# Save the key on first run so the extension ID stays stable
if ((Test-Path $generatedPem) -and -not (Test-Path $PemFile)) {
    Move-Item $generatedPem $PemFile
    Write-Host "Key file saved: FormFillBridge.pem  <-- keep this file, do NOT delete it"
} elseif (Test-Path $generatedPem) {
    Remove-Item $generatedPem
}

Move-Item -Force $generatedCrx $CrxDest
Remove-Item $stage -Recurse -Force

# ── Compute extension ID from the PEM public key ──────────────────────────────
$pemLines    = Get-Content $PemFile | Where-Object { $_ -notmatch '^-+' }
$pubKeyBytes = [Convert]::FromBase64String(($pemLines -join ""))

$sha256 = [Security.Cryptography.SHA256]::Create()
$hash   = $sha256.ComputeHash($pubKeyBytes)
$sha256.Dispose()

$extId = -join ($hash[0..15] | ForEach-Object {
    [char]([int][char]'a' + ($_ -shr 4))
    [char]([int][char]'a' + ($_ -band 0x0F))
})
Write-Host "Extension ID: $extId"

# ── Compile the installer ─────────────────────────────────────────────────────
Write-Host "Compiling installer..."
$issFile = Join-Path $ExtDir "installer.iss"
& $iscc $issFile "/DExtensionId=$extId"
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compilation failed." }

$outExe = Join-Path $ExtDir "Output\FormFillBridge-Setup.exe"
Write-Host ""
Write-Host "Done! Installer: $outExe"
