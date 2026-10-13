# Windows installer for the Open in Browser native host.
#
#   powershell -ExecutionPolicy Bypass -File .\install.ps1              # install
#   powershell -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall   # remove
#
# Per-user only (HKCU + %LOCALAPPDATA%), no admin rights needed.
[CmdletBinding()]
param(
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$ExtensionId = 'baohkehfoojhmdhbdacnnknpjbonbmco'
$HostName    = 'com.openinbrowser.host'

$SourceDir    = Join-Path $PSScriptRoot 'native-host'
$HostDir      = Join-Path $env:LOCALAPPDATA 'OpenInBrowser'
$HostScript   = Join-Path $HostDir 'open_in_browser.py'
$HostBat      = Join-Path $HostDir 'open_in_browser.bat'
$ManifestPath = Join-Path $HostDir "$HostName.json"

# Chromium browsers on Windows look up native hosts under
# HKCU\Software\<vendor>\NativeMessagingHosts\<name> (default value = manifest path).
# Chrome Beta/Dev/Canary share the Google\Chrome key. Arc for Windows is not
# listed: its registry location is unconfirmed (see README).
$RegistryRoots = @(
    'HKCU:\Software\Google\Chrome\NativeMessagingHosts',
    'HKCU:\Software\Chromium\NativeMessagingHosts',
    'HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts',
    'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts'
)

# BOM-less UTF-8 for the JSON manifest.
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# Remove the old install (names used before multi-browser support).
$LegacyHostName = 'com.openinbrave.host'
foreach ($root in $RegistryRoots) {
    $key = Join-Path $root $LegacyHostName
    if (Test-Path $key) { Remove-Item -Path $key -Recurse -Force }
}
$LegacyDir = Join-Path $env:LOCALAPPDATA 'OpenInBrave'
if (Test-Path $LegacyDir) { Remove-Item -Path $LegacyDir -Recurse -Force }

if ($Uninstall) {
    foreach ($root in $RegistryRoots) {
        $key = Join-Path $root $HostName
        if (Test-Path $key) {
            Remove-Item -Path $key -Recurse -Force
            Write-Host "Removed: $key"
        }
    }
    if (Test-Path $HostDir) {
        Remove-Item -Path $HostDir -Recurse -Force
        Write-Host "Removed: $HostDir"
    }
    Write-Host ''
    Write-Host 'Uninstalled. Remove the extension from chrome://extensions as well if you no longer need it.'
    return
}

function Resolve-Python {
    # Returns the absolute path of a working Python 3 interpreter, or $null.
    # Each candidate is actually executed: the Microsoft Store "python.exe" stub
    # in WindowsApps exists on PATH but does not run code.
    $candidates = @(
        @{ Exe = 'py.exe';      Args = @('-3') },
        @{ Exe = 'python.exe';  Args = @() },
        @{ Exe = 'python3.exe'; Args = @() }
    )
    foreach ($c in $candidates) {
        $cmd = Get-Command $c.Exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $cmd) { continue }
        try {
            $out = & $cmd.Source @($c.Args) -c 'import sys; print(sys.executable) if sys.version_info[0] == 3 else None' 2>$null
        } catch {
            continue
        }
        if ($LASTEXITCODE -eq 0 -and $out) {
            $exe = ($out | Select-Object -First 1).Trim()
            if ($exe -and (Test-Path -LiteralPath $exe -PathType Leaf)) { return $exe }
        }
    }
    return $null
}

$sourcePy  = Join-Path $SourceDir 'open_in_browser.py'
$sourceBat = Join-Path $SourceDir 'open_in_browser.bat'
foreach ($f in $sourcePy, $sourceBat) {
    if (-not (Test-Path -LiteralPath $f)) { throw "$f not found." }
}

$python = Resolve-Python
if (-not $python) {
    throw 'Python 3 not found. Install it from https://www.python.org/downloads/ (tick "Add python.exe to PATH") and re-run.'
}

New-Item -ItemType Directory -Path $HostDir -Force | Out-Null
Copy-Item -LiteralPath $sourcePy -Destination $HostScript -Force

# Pin the interpreter to an absolute path so the host does not depend on the
# PATH the browser was started with.
$bat = [System.IO.File]::ReadAllText($sourceBat)
$bat = $bat.Replace('"python"', '"' + $python + '"')
$bat = ($bat -replace "`r?`n", "`r`n")
# cmd.exe reads .bat files in the OEM code page (matters for non-ASCII paths).
try {
    $oem = [System.Text.Encoding]::GetEncoding([System.Globalization.CultureInfo]::CurrentCulture.TextInfo.OEMCodePage)
} catch {
    $oem = $Utf8NoBom
}
[System.IO.File]::WriteAllText($HostBat, $bat, $oem)

$manifest = [ordered]@{
    name            = $HostName
    description     = 'Opens links in Brave Browser'
    path            = $HostBat
    type            = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
}
[System.IO.File]::WriteAllText($ManifestPath, ($manifest | ConvertTo-Json -Depth 3), $Utf8NoBom)

foreach ($root in $RegistryRoots) {
    $key = Join-Path $root $HostName
    New-Item -Path $key -Force | Out-Null
    Set-Item -Path $key -Value $ManifestPath
    Write-Host "Registered: $key"
}

Write-Host ''
Write-Host "Host dir    : $HostDir"
Write-Host "Manifest    : $ManifestPath"
Write-Host "Interpreter : $python"
Write-Host ''
Write-Host 'Done. Final steps:'
Write-Host '  1. Reload the extension at chrome://extensions / edge://extensions / brave://extensions'
Write-Host "  2. Right-click a link -> 'Open link in <browser>' (works right away)"
Write-Host "  3. Optional: extension Options to add more browsers (2+ = submenu)"
Write-Host ''
Write-Host "Extension ID in use: $ExtensionId"
