# Update WSL2 Port Forwarding for OpenDora
# This script updates the port forwarding rule whenever WSL IP changes
# Run this manually or set up as a scheduled task

$Port = 3000  # OpenDora Web UI port
$FirewallRuleName = "OpenDora WSL"

# Check if running as Administrator
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Please run this script as Administrator"
    exit 1
}

# Get WSL2 IP
$WSLIP = wsl hostname -I
$WSLIP = $WSLIP.Trim()

if ([string]::IsNullOrEmpty($WSLIP)) {
    Write-Host "WSL not running or no IP assigned. Exiting." -ForegroundColor Yellow
    exit 0
}

# Check if current rule matches
$CurrentRule = netsh interface portproxy show v4tov4 | Select-String "0.0.0.0 $Port"
if ($CurrentRule) {
    $CurrentIP = ($CurrentRule -split '\s+')[-1]
    if ($CurrentIP -eq $WSLIP) {
        Write-Host "Port forwarding already configured for current WSL IP: $WSLIP" -ForegroundColor Green
        exit 0
    }
}

# Update port forwarding rule
Write-Host "Updating port forwarding rule to WSL IP: $WSLIP" -ForegroundColor Yellow
netsh interface portproxy delete v4tov4 listenport=$Port listenaddress=0.0.0.0 2>$null
netsh interface portproxy add v4tov4 listenport=$Port listenaddress=0.0.0.0 connectport=$Port connectaddress=$WSLIP

if ($LASTEXITCODE -eq 0) {
    Write-Host "Port forwarding updated successfully!" -ForegroundColor Green
} else {
    Write-Error "Failed to update port forwarding"
    exit 1
}
