# OpenDora Web UI Home Network Access Setup

This setup allows you to access the OpenDora web UI from any device on your home network (phone, tablet, etc.) using your Surface laptop's IP address.

## Problem Solved

WSL2 uses dynamic IP addresses that change on every restart. This solution automatically updates Windows port forwarding rules whenever the WSL IP changes, ensuring the OpenDora web UI remains accessible.

## What's Been Configured (WSL Side)

✅ OpenDora web UI is configured to bind to `0.0.0.0` (all network interfaces) on port 3000
✅ CORS is configured to allow private IP ranges (10.x, 172.16-31.x, 192.168.x)

## Windows Setup Instructions

### Step 1: Initial Port Forwarding Setup

Open PowerShell as Administrator in Windows and run:

```powershell
cd C:\Users\YourUsername\projects\opendora\scripts
.\setup-wsl-networking.ps1
```

This will:
- Get the current WSL2 IP address
- Set up port forwarding from Windows port 3000 to WSL2 port 3000
- Configure Windows Firewall to allow the connection
- Show you the URL to access the OpenDora web UI from other devices

### Step 2: Enable Automatic Updates (Recommended)

To automatically update port forwarding when WSL IP changes:

```powershell
.\setup-wsl-autoupdate.ps1
```

This creates a Windows Task Scheduler task that:
- Runs at system startup
- Runs every 5 minutes
- Automatically updates port forwarding if WSL IP changes

### Alternative: Manual Updates

If you prefer not to use automatic updates, you can manually update port forwarding after WSL restarts:

```powershell
.\update-wsl-portforwarding.ps1
```

## Accessing OpenDora Web UI from Other Devices

After setup, access the OpenDora web UI from any device on your home network:

```
http://<<YOUR_SURFACE_LAN_IP>>:3000
```

Find your Surface's LAN IP in Windows:
```powershell
ipconfig
```
Look for "IPv4 Address" under your active network adapter (usually Wi-Fi or Ethernet).

## Testing the Setup

1. Start OpenDora web UI in WSL:
   ```bash
   cd /home/mariu/projects/opendora
   bun run dev:ui
   ```

2. From your Surface, test locally: `http://localhost:3000`

3. From another device on your network: `http://<<SURFACE_IP>>:3000`

## Troubleshooting

### Port forwarding not working
- Make sure WSL is running: `wsl`
- Manually run the update script: `.\update-wsl-portforwarding.ps1`
- Check current rules: `netsh interface portproxy show v4tov4`

### Firewall blocking connection
- Check Windows Firewall rules: `Get-NetFirewallRule -DisplayName "OpenDora WSL"`
- Ensure the rule exists and is enabled

### WSL IP keeps changing
- The automatic update task handles this - it checks every 5 minutes
- You can also run the manual update script after WSL restarts

## Alternative: WSL2 Mirrored Networking (Windows 11 22H2+)

If you're on Windows 11 22H2 or later, you can use mirrored networking instead of port forwarding:

1. Create `%USERPROFILE%\.wslconfig`:
   ```ini
   [wsl2]
   networkingMode=mirrored
   firewall=true
   autoProxy=true
   ```

2. Restart WSL: `wsl --shutdown`

With mirrored networking, WSL2 shares the same IP as Windows, so no port forwarding is needed. OpenDora binding to `0.0.0.0` will be directly accessible via your Surface's LAN IP.

## Removing the Setup

To remove automatic updates:
```powershell
Unregister-ScheduledTask -TaskName "Update WSL Port Forwarding" -Confirm:$false
```

To remove port forwarding rules:
```powershell
netsh interface portproxy delete v4tov4 listenport=3000 listenaddress=0.0.0.0
```

To remove firewall rule:
```powershell
Remove-NetFirewallRule -DisplayName "OpenDora WSL"
```
