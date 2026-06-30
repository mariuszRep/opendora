# Projectflows


Local-first agentic application platform. Run and extend agents, skills, tools, workflows,
and schedules through consistent application surfaces.

## Quickstart

### Linux / macOS

```bash
curl -fsSL https://projectflows.dev/install.sh | bash
```

### Windows

```powershell
powershell -c "irm https://projectflows.dev/install.ps1 | iex"
```

These one-liners download the latest single-binary release, install it to `~/.projectflows/bin`
or `%LOCALAPPDATA%\projectflows\bin` (Windows), add the binary to your PATH, and start
the background service.

> **Status:** Install scripts are under development. See [INSTALL.md](/INSTALL.md) for
> current install options and [the delivery plan](/.projectflows/goals/cross-platform-delivery/GOAL.md) for the
> full rollout schedule.

### Basic usage

```bash
# Start the background service (daemon)
projectflows start

# Open the web UI in your default browser
projectflows web

# Run CLI commands
projectflows --help

# Stop the service
projectflows stop
```

All user data, configuration, and session state is stored in `~/.projectflows` (the data root
returned by `findRoot()`).

### What's included

- **Web UI** — browser-based agent interaction, workflow management, and system administration.
- **CLI** — terminal-based commands and integrated terminal UI mode.
- **Desktop app** — *(Phase 2)* native cross-platform desktop shell via Tauri.

## Documentation

- [Install & upgrade](/INSTALL.md)
- [Cross-platform delivery plan](/.projectflows/goals/cross-platform-delivery/GOAL.md)
- [Vision & architecture](/VISION.md)
- [Agent working instructions](/AGENTS.md)

## License

See [LICENSE](LICENSE) (if present) or contact the project maintainers.
