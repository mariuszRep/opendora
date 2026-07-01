# Install — Projectflows


## Supported platforms

| Platform | Status | Notes |
|---|---|---|
| Linux (x86_64, aarch64) | ✅ Phase 1 target | glibc >= 2.28 |
| macOS (x86_64, aarch64) | ✅ Phase 1 target | macOS 12+ |
| Windows (x86_64) | ✅ Phase 1 target | Windows 10+; service pending |

## One-liner install

### Linux / macOS

```
curl -fsSL https://projectflows.ai/install.sh | bash
```

The script:
1. Detects OS and architecture.
2. Downloads the latest release tarball from the projectflows.ai release endpoint.
3. Extracts the binary to `~/.projectflows/bin/`.
4. Adds `~/.projectflows/bin` to your `$PATH` via shell config marker (`.bashrc`, `.zshrc`, or
   `.profile`).
5. Optionally starts the background service.

### Windows

```powershell
powershell -c "irm https://projectflows.ai/install.ps1 | iex"
```

The script:
1. Detects architecture (x86_64).
2. Downloads the latest release ZIP from the projectflows.ai release endpoint.
3. Extracts the binary to `%LOCALAPPDATA%\projectflows\bin\`.
4. Adds that directory to the user `PATH` via environment variable registry.
5. Optionally starts the background service.

> **Note:** Windows service support is under investigation. See
> [open questions](#open-questions) below.

### Install directories

| Platform | Binary location | Data root |
|---|---|---|
| Linux | `~/.projectflows/bin/` | `~/.projectflows/` |
| macOS | `~/.projectflows/bin/` | `~/.projectflows/` |
| Windows | `%LOCALAPPDATA%\projectflows\bin\` | `~/.projectflows/` |

The data root (`~/.projectflows/`) is determined by `findRoot()` and is shared across all
platforms. It contains configuration, session state, logs, and plugin data.

### PATH marker compatibility

- **Linux/macOS:** The install script appends a PATH marker to `~/.bashrc`, `~/.zshrc`, or
  `~/.profile`:
  ```bash
  export PATH="$HOME/.projectflows/bin:$PATH"
  ```
- **Windows:** The PowerShell script adds `%LOCALAPPDATA%\projectflows\bin` to the user PATH via
  `[Environment]::SetEnvironmentVariable`.

## Manual install

1. Go to the [releases page](https://github.com/mariuszRep/opendora/releases).
2. Download the archive for your platform.
3. Extract the binary to a directory on your PATH.
4. Run `projectflows start` to initialize the data root and start the service.

## Upgrade

### Automatic (via install script)

Re-run the one-liner from the [One-liner install](#one-liner-install) section. The script
detects an existing install and replaces the binary in place.

### Manual

1. Download the new release archive.
2. Replace the existing binary at `~/.projectflows/bin/projectflows`.
3. Restart the service:
   ```bash
   projectflows restart
   ```

## Uninstall

### Linux / macOS

```bash
# Stop the service
projectflows stop

# Remove the binary
rm -f ~/.projectflows/bin/projectflows

# Optionally remove the install directory (only if no other files remain)
rmdir ~/.projectflows/bin 2>/dev/null; rmdir ~/.projectflows 2>/dev/null; true

# Remove the shell PATH marker from ~/.bashrc, ~/.zshrc, or ~/.profile
```

### Windows

```powershell
# Stop the service (if running)
projectflows stop

# Remove the binary
Remove-Item "$env:LOCALAPPDATA\projectflows\bin\projectflows.exe" -Force

# Remove the PATH entry (manual via System Properties > Environment Variables)
```

> **Warning:** Uninstall does not remove `~/.projectflows/` (the data root). Delete that
> directory separately if you want to remove all user data, sessions, and configuration.

## Health check

Once the service is running, verify it responds:

```bash
curl http://localhost:4096/health
```

Expected response: `200 OK` with a JSON body containing service status.

The health endpoint is served on the primary port (4096) and is available before and after
any embedded UI routes.

## Service / Background behavior

### Linux (systemd)

The install script registers a user-level systemd unit when available:
- Unit name: `projectflows.service`
- Location: `~/.config/systemd/user/projectflows.service`
- Starts on user login (if enabled).

### macOS (launchd)

The install script registers a user-level launchd plist when available:
- Plist name: `dev.projectflows.service`
- Location: `~/Library/LaunchAgents/dev.projectflows.service.plist`
- Starts on user login (if enabled).

### Windows

> **Status: Open question / pending decision.**
>
| Aspect | Status |
|---|---|
| Windows Service API | Not yet implemented |
| Approach | Windows service stub exists; full implementation deferred |
| Alternatives | Task Scheduler, user-startup shortcut, or nssm wrapper |
| Decision | See `.projectflows/goals/cross-platform-delivery/GOAL.md` open questions section |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `command not found: projectflows` | Binary not on PATH | Re-run install script or manually add `~/.projectflows/bin` to PATH |
| `Connection refused` on :4096 | Service not running | Run `projectflows start` |
| Port 4096/4097 in use | Another instance or service | Stop the other process or change ports via config |
| `~/.projectflows` not created | First-run initialization failed | Run `projectflows start` or `projectflows web` to trigger init |
| Windows binary not recognized | Antivirus / SmartScreen | Allow the app; signed binaries coming in Phase 2 |
| macOS "cannot be opened" | Not notarized | Right-click → Open; notarization planned for Phase 2 |

## Open questions

- **Windows service:** Should the Windows background process run as a Windows Service, a
  Task Scheduler task, a user-startup shortcut, or an nssm-managed service? Decision pending
  until Windows service requirements are validated.
- **Install endpoint hosting:** Install scripts are served from `projectflows.ai`; binaries are hosted on GitHub Releases (`github.com/mariuszRep/opendora/releases`).
- **Code signing:** Windows Authenticode signing and macOS notarization require certificates
  and are planned for Phase 2 native desktop distribution.
- **Bun binary embedding:** The single-binary distribution approach (embed vs. bundle archive)
  has performance and size implications still under evaluation.

## See also

- [README.md](/README.md) — quickstart and basic usage
- [Cross-platform delivery plan](/.projectflows/goals/cross-platform-delivery/GOAL.md) — full Phase 1/Phase 2 roadmap
- [VISION.md](/VISION.md) — product architecture and intent
