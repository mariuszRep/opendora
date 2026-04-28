# VISION.md

> **Owner: human** — this file is updated only when the human decides the vision has changed.
> Agents read this as the north star. Never edit it during migration work.

---

## Target architecture

```
opendora/
├── core/                        ← the assembled product
│   └── src/
│       ├── index.ts             ← opendora binary entry, yargs router
│       ├── cli/                 ← scriptable commands (serve, run, session, agent, ...)
│       ├── tui/                 ← Solid.js interactive TUI (default mode)
│       ├── server/              ← Hono HTTP/SSE/WS API (what web connects to)
│       └── storage/             ← DB connection, migrations (imports all package schemas)
│
├── ui/
│   └── web/                     ← browser UI only, connects to core API over HTTP/SSE
│
└── packages/                    ← pure self-contained libraries, no app logic
    ├── permission/              ← shared policy primitive: Rule, Ruleset, evaluate(), errors (no internal deps)
    ├── provider/                ← LLM provider abstraction, all @ai-sdk/* integrations
    ├── session/                 ← session types, defines ISessionStore interface, stores Ruleset in config
    ├── tools/                   ← tool implementations, MCP, LSP — calls evaluate() before execution
    └── agent/                   ← agent loop, streaming, orchestration — calls disabled(), catches permission errors
```

---

## What core/ is

`core/` is the heart of the application. It is a single binary (`opendora`) that operates in multiple modes:

| Mode | Command | What runs |
|---|---|---|
| Interactive | `opendora` | TUI + embedded server |
| Headless | `opendora serve` | Server only, no TUI |
| Remote | `opendora attach <url>` | TUI connects to remote core instance |
| Scriptable | `opendora run / session / agent ...` | CLI commands, no TUI |

`core/` owns:
- The binary entry point and CLI router
- The TUI (Solid.js, default mode)
- The HTTP/SSE/WS server (what web connects to)
- The DB connection and migrations (wires all package schemas together)
- Wiring of all packages at startup (picks storage adapter, injects into packages)

`core/` does NOT own business logic — that lives in packages.

---

## What packages/ are

Pure libraries. No binary. No app logic. Self-contained.

Each package:
- Owns its own types, interfaces, logic, and helpers
- Defines its own storage interface (e.g. `ISessionStore`) — never imports from `@opendora/storage` directly
- Has no knowledge of HTTP, CLI, or TUI
- Can be tested independently with any storage adapter including in-memory

---

## Storage adapter pattern

Packages are storage-agnostic. They define what they need, not how it is stored.

```
packages/session     ← defines ISessionStore (interface only, no adapter knowledge)
packages/agent       ← defines IAgentStore (interface only)
packages/tools       ← defines IToolStore (interface only)

core/src/storage/
  adapters/
    jsonl.ts         ← implements all interfaces for JSONL
    sqlite.ts        ← implements all interfaces for SQLite
    postgres.ts      ← implements all interfaces for Postgres
  index.ts           ← reads config, picks adapter, injects into packages at startup
```

Adapters live in `core/` because only `core/` ever uses them. Packages never import adapters.
Swapping JSONL for Postgres is a one-line config change in `core/`. No package changes.

---

## Package principles

- **Self-contained** — every package owns its types, logic, and helpers. No reaching outside for a utility.
- **No cross-pollination** — packages do not import from apps, core, or each other beyond the rules below.
- **Single direction** — dependencies flow strictly downward. No cycles.
- **Own your types** — types live in the package that defines and controls them.

---

## Dependency rules

```
packages/permission  ← no internal deps
packages/provider    ← no internal deps
packages/session     ← permission
packages/tools       ← permission
packages/agent       ← session, provider, tools, permission

core/                ← agent + all packages (wires everything, owns HTTP + TUI + CLI + DB + adapters)
ui/web               ← core HTTP/SSE via typed client exported from core/server/client
```

---

## System prompt

Single general-purpose prompt regardless of model. No per-model variants (anthropic.txt, gemini.txt, etc.).

Assembly is a single function in one place — not split across `prompt.ts`, `llm.ts`, and the REST endpoint. The REST endpoint calls the same function the loop calls; no duplication.

Model-specific branches (`isCodex`, provider checks) are removed once all supported models accept the same prompt format.

---

## What is removed

| Removed | Reason |
|---|---|
| `packages/opencode` | God-package — decomposed into core/ + packages/ |
| `packages/util` | Dissolved — each package inlines its own helpers |
| `packages/core` | Dissolved — types distributed to owning packages |
| `packages/sdk` | Merged into `core/server/client` as typed client export |
| `packages/storage` | Not needed — adapters only used by core, live in `core/src/storage/adapters/` |
| `apps/cli/` | Merged into `core/` — CLI and TUI are modes of the same binary |
| `apps/tui/` | Merged into `core/` — TUI lives inside the core binary |
| `apps/` | Renamed to `ui/` — only browser UI lives here |
| `server/` (top-level) | Merged into `core/src/server/` — server is a mode of core |
