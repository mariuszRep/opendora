# Setup Windows Task Scheduler to automatically update WSL port forwarding
# Run this script in PowerShell as Administrator on Windows

$TaskName = "Update WSL Port Forwarding"
$ScriptPath = Join-Path $PSScriptRoot "update-wsl-portforwarding.ps1"

# Check if running as Administrator
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Please run this script as Administrator"
    exit 1
}

Write-Host "Setting up automatic WSL port forwarding updates..." -ForegroundColor Green

# Remove existing task if it exists
$ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($ExistingTask) {
    Write-Host "Removing existing scheduled task..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# Create task action
$Action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""

# Create trigger - run at startup and every 5 minutes
$Trigger1 = New-ScheduledTaskTrigger -AtStartup
$Trigger2 = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)

# Create principal - run as SYSTEM with highest privileges
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

# Create settings
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

# Register the task
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($Trigger1, $Trigger2) -Principal $Principal -Settings $Settings -Description "Automatically update WSL port forwarding for OpenDora"

Write-Host "Scheduled task created successfully!" -ForegroundColor Green
Write-Host "The task will run:" -ForegroundColor Cyan
Write-Host "  - At system startup" -ForegroundColor White
Write-Host "  - Every 5 minutes thereafter" -ForegroundColor White
Write-Host "`nTo manually update port forwarding, run: $ScriptPath" -ForegroundColor Yellow
Write-Host "To remove the task, run: Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false" -ForegroundColor Yellow
