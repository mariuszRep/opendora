# SCOPE.md

## What this package is

`packages/opencode` is the main OpenDora runtime package. It contains:

- the `opendora` CLI entrypoint
- local development startup logic
- API server routes
- terminal UI code
- provider integrations
- tool implementations
- project, session, storage, and scheduler runtime logic

## What this package owns

- end-user runtime behavior exposed through the CLI and server
- internal orchestration across agents, tools, providers, sessions, and projects
- package-local database schema and migrations
- integration glue for workspace-level features such as import/export, auth, MCP, and TUI flows

## What this package does not own

- the standalone file-based agent package internals in `packages/agent`
- the standalone SDK package implementation in `packages/sdk/js`
- the Next.js web app implementation in `packages/ai-sdk`
- the standalone `@pingpong/core` library internals

## Boundaries

- If a change only affects agent template authoring or file storage format for agents, prefer `packages/agent`.
- If a change only affects generated API clients or SDK ergonomics, prefer `packages/sdk/js`.
- If a change only affects the browser UI, prefer `packages/ai-sdk`.
- If a change changes session core semantics shared outside this package, coordinate with `packages/pingpong-core`.
