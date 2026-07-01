# Projectflows installer for Windows (PowerShell)
# Usage: irm https://raw.githubusercontent.com/mariuszRep/opendora/main/scripts/install.ps1 | iex
param(
    [string]$Version = $env:PROJECTFLOWS_VERSION ?? "latest",
    [string]$InstallDir = $env:PROJECTFLOWS_INSTALL_DIR ?? "$env:LOCALAPPDATA\projectflows\bin",
    [string]$DataDir = $env:PROJECTFLOWS_DATA_DIR ?? "$env:LOCALAPPDATA\projectflows"
)

$ErrorActionPreference = "Stop"

$BinName = "projectflows-windows-x64.exe"
if ($Version -eq "latest") {
    $BaseUrl = "https://github.com/mariuszRep/opendora/releases/latest/download"
} else {
    $BaseUrl = "https://github.com/mariuszRep/opendora/releases/download/$Version"
}

Write-Host "Installing Projectflows $Version for windows/x64..."

# Create directories
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path "$DataDir\web" | Out-Null

$TmpDir = [System.IO.Path]::GetTempPath() + [System.Guid]::NewGuid().ToString()
New-Item -ItemType Directory -Path $TmpDir | Out-Null

try {
    # Download binary
    Write-Host "  Downloading binary..."
    Invoke-WebRequest -Uri "$BaseUrl/$BinName" -OutFile "$TmpDir\projectflows.exe" -UseBasicParsing

    # Download and extract web assets
    Write-Host "  Downloading web assets..."
    Invoke-WebRequest -Uri "$BaseUrl/web.tar.gz" -OutFile "$TmpDir\web.tar.gz" -UseBasicParsing
    tar -xzf "$TmpDir\web.tar.gz" -C "$DataDir\web" --strip-components=1

    # Install binary
    Copy-Item "$TmpDir\projectflows.exe" "$InstallDir\projectflows.exe" -Force

} finally {
    Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Projectflows installed successfully!"
Write-Host ""
Write-Host "  Binary: $InstallDir\projectflows.exe"
Write-Host "  Web UI: $DataDir\web\"
Write-Host ""

# Add to PATH for this session and persistently
$CurrentPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
if ($CurrentPath -notlike "*$InstallDir*") {
    [System.Environment]::SetEnvironmentVariable("PATH", "$CurrentPath;$InstallDir", "User")
    $env:PATH += ";$InstallDir"
    Write-Host "Added $InstallDir to PATH (restart terminal to take effect)"
}

Write-Host "To start:"
Write-Host "  `$env:PROJECTFLOWS_WEB_DIR=`"$DataDir\web`"; projectflows serve"
