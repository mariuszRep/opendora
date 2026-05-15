# Setup WSL2 Port Forwarding for OpenDora
# Run this script in PowerShell as Administrator on Windows

# Configuration
$Port = 3000  # OpenDora Web UI port
$WSLDistro = "Ubuntu"  # Change if using a different distro name

# Check if running as Administrator
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Please run this script as Administrator"
    exit 1
}

Write-Host "Setting up WSL2 port forwarding for OpenDora..." -ForegroundColor Green

# Get WSL2 IP
Write-Host "Getting WSL2 IP address..." -ForegroundColor Yellow
$WSLIP = wsl hostname -I
$WSLIP = $WSLIP.Trim()
Write-Host "WSL2 IP: $WSLIP" -ForegroundColor Cyan

if ([string]::IsNullOrEmpty($WSLIP)) {
    Write-Error "Could not get WSL2 IP address. Make sure WSL is running."
    exit 1
}

# Remove existing port forwarding rule if exists
Write-Host "Removing existing port forwarding rules..." -ForegroundColor Yellow
netsh interface portproxy delete v4tov4 listenport=$Port listenaddress=0.0.0.0 2>$null

# Add new port forwarding rule
Write-Host "Adding port forwarding rule..." -ForegroundColor Yellow
netsh interface portproxy add v4tov4 listenport=$Port listenaddress=0.0.0.0 connectport=$Port connectaddress=$WSLIP

if ($LASTEXITCODE -eq 0) {
    Write-Host "Port forwarding rule added successfully!" -ForegroundColor Green
} else {
    Write-Error "Failed to add port forwarding rule"
    exit 1
}

# Add Windows Firewall rule
Write-Host "Configuring Windows Firewall..." -ForegroundColor Yellow
$FirewallRuleName = "OpenDora WSL"
$ExistingRule = Get-NetFirewallRule -DisplayName $FirewallRuleName -ErrorAction SilentlyContinue

if ($ExistingRule) {
    Write-Host "Firewall rule already exists, updating..." -ForegroundColor Cyan
    Remove-NetFirewallRule -DisplayName $FirewallRuleName
}

New-NetFirewallRule -DisplayName $FirewallRuleName `
    -Direction Inbound `
    -LocalPort $Port `
    -Protocol TCP `
    -Action Allow `
    -Profile Any `
    -Description "Allow OpenDora from WSL2"

Write-Host "Firewall rule added successfully!" -ForegroundColor Green

# Show current port forwarding rules
Write-Host "`nCurrent port forwarding rules:" -ForegroundColor Yellow
netsh interface portproxy show v4tov4

# Get Windows LAN IP
$WindowsIP = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.InterfaceAlias -notlike "*vEthernet*" } | Select-Object -First 1 -ExpandProperty IPAddress
Write-Host "`nSetup complete!" -ForegroundColor Green
Write-Host "Access OpenDora from other devices on your network at:" -ForegroundColor Cyan
Write-Host "http://${WindowsIP}:${Port}" -ForegroundColor White
