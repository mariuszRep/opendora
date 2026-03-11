# STATE.md

## Current package shape

The package currently contains:

- CLI commands under `src/cli/cmd`
- a Hono-based server under `src/server`
- session, storage, project, tool, provider, skill, MCP, and scheduler modules under `src/`
- database migrations in `migration/`
- tests under `test/`

## Current behavior visible from code

- The package exports the `opendora` binary from `bin/opencode`.
- `src/index.ts` wires command registration for CLI flows including run, serve, auth, agent, import/export, MCP, session, GitHub, and debug commands.
- Local startup performs a one-time JSON-to-SQLite migration when the expected database marker file does not exist.
- `src/server/routes/` contains route modules for project, session, provider, file, permission, MCP, PTY, TUI, and related endpoints.
- The package depends on `@opendora/agent`, `@opendora/sdk`, `@opendora/util`, and `@pingpong/core`.
- Built-in delegation tools include `delegate`, `ping`, `ping_main`, `ping_session`, and `spawn_session`.
- `ping_main` targets an agent's durable `role` session, `ping_session` targets a known session id, and `spawn_session` creates a delegated `worker` or root session before posting the prompt.

## Existing package documentation

- `README.md` describes the package at a high level.
- `BUN_SHELL_MIGRATION_PLAN.md` captures a concrete migration plan for shell execution behavior.

## Needs verification or unknown

- The exact coverage and stability of every CLI command needs verification.
- Whether all server routes are considered stable public API is unknown.
- Whether the committed `README.md` reflects the current command surface exactly needs verification.
