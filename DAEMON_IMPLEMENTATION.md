# OpenDora Daemon Implementation

## Overview

OpenDora now supports persistent background operation with automatic restart on system reboot, similar to how OpenClaw operates.

## New Commands

```bash
opendora start    # Start the server (auto-installs service on first run)
opendora stop     # Stop the server
opendora restart  # Restart the server
opendora status   # Check server status
```

## How It Works

### First Run
```bash
$ opendora start
First time setup - installing service...
✓ Service installed
✓ OpenDora is running on http://localhost:4096

Use 'opendora status' to check the server status
Use 'opendora stop' to stop the server
```

### Subsequent Runs
```bash
$ opendora start
✓ OpenDora is running on http://localhost:4096
```

## Platform Support

### Linux (systemd)
- Service file: `~/.config/systemd/user/opendora-server.service`
- Managed via: `systemctl --user`
- Auto-starts on login
- Logs: `~/.opendora/logs/`

### macOS (LaunchAgent)
- Plist file: `~/Library/LaunchAgents/ai.opendora.server.plist`
- Managed via: `launchctl`
- Auto-starts on login
- Logs: `~/.opendora/logs/`

### Windows
- Not yet implemented (placeholder exists)

## Implementation Details

### Files Created

```
packages/opencode/src/daemon/
├── constants.ts           # Service names and labels
├── service-types.ts       # TypeScript interfaces
├── service-runtime.ts     # Runtime status types
├── service.ts             # Platform-agnostic service interface
├── systemd.ts             # Linux systemd implementation
├── systemd-unit.ts        # systemd unit file generation
├── launchd.ts             # macOS LaunchAgent implementation
├── launchd-plist.ts       # plist file generation
├── exec-file.ts           # Command execution helper
├── output.ts              # Output formatting utilities
├── paths.ts               # Path resolution
└── arg-split.ts           # Argument parsing

packages/opencode/src/cli/cmd/
├── start.ts               # opendora start command
├── stop.ts                # opendora stop command
├── restart.ts             # opendora restart command
└── status.ts              # opendora status command
```

### Service Configuration

The service runs:
```bash
bun run --cwd packages/opencode src/index.ts serve --port 4096
```

With environment:
- `OPENCODE_CONFIG_DIR`: Project's `.opendora` directory
- `OPENDORA_SERVICE_VERSION`: Current version

## Usage Examples

### Start the server
```bash
opendora start
```

### Check if running
```bash
opendora status
# Output:
# Service: systemd (or LaunchAgent on macOS)
# Status: enabled
# Runtime: running
# PID: 12345
# URL: http://localhost:4096
```

### Stop the server
```bash
opendora stop
```

### Restart the server
```bash
opendora restart
```

## Differences from Manual Start

### Before (Manual)
```bash
# Terminal 1
bun run serve
# Server stops when terminal closes
```

### After (Daemon)
```bash
opendora start
# Server runs in background
# Survives terminal closure
# Auto-restarts on reboot
```

## TUI Compatibility

The TUI (`bun run dev`) still works as before - it runs in the foreground and requires an interactive terminal. The daemon system is only for the API server (`serve` command).

## Logs

Service logs are written to:
- stdout: `~/.opendora/logs/opendora.log`
- stderr: `~/.opendora/logs/opendora.err.log`

View logs:
```bash
# Linux
journalctl --user -u opendora-server -f

# macOS
tail -f ~/.opendora/logs/opendora.log

# Or check status
opendora status
```

## Uninstalling

To remove the service:
```bash
opendora stop
# Then manually remove service files if needed
```

## Technical Notes

- Service auto-installs on first `opendora start`
- Uses platform-native service managers (systemd/launchd)
- Restarts automatically if crashes (5 second delay)
- Graceful shutdown with 30 second timeout
- PID tracking for status monitoring
