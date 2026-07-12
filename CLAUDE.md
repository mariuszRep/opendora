# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `bun serve` — start the server on port 4097
- `bun dev:ui` — start the web UI dev server (Next.js + server together)
- `cd apps/web && bun dev` — web dev server only (needs a running server at :4097)

### Typecheck / Build
- `bun typecheck` — typecheck all packages via Turborepo
- `cd apps/web && bun run typecheck` — web app only (fast, used after UI changes)
- `cd apps/web && bun run build` — production build

### Tests
- `cd packages/<pkg> && bun test` — run a package's tests
- `cd packages/<pkg> && bun test <file.test.ts>` — single test file
- Root `bun test` is intentionally disabled

## Architecture

### Monorepo
Bun workspace monorepo with Turborepo. Two apps (`apps/web`, `apps/cli`) and ~15 packages in `packages/`. The web app is Next.js App Router with Tailwind + shadcn/ui. The CLI is a Bun binary.

### Server → Web data flow
`packages/server` exposes HTTP + SSE. The web app talks to it **only** through `apps/web/lib/projectflows.ts`, which exports:
- An `opendora` SDK client (typed fetch wrappers for every API route)
- All shared TypeScript types (`Agent`, `Skill`, `Workflow`, `ToolSchema`, `RemoteEntity`, `RemotePlugin`, etc.)

**Never import from `packages/*` directly in the web app.**

Real-time state (sessions, agents, providers) flows through SSE via `opendora.events.subscribe()`, which drives `apps/web/hooks/use-projectflows.ts`. That hook is exposed as `useOpendoraContext()` from `apps/web/app/dashboard/projectflows-context.tsx` — the primary live-state source for the dashboard.

### Settings entity pages
All entity settings pages (agents, skills, tools, workflows, plugins) follow the **entity catalog pattern**:
- `useEntityCatalog(entityType, localFetcher, toBase)` — merges local items with `opendora.entity.listAvailable({ type })`, returns `MergedEntityItem[]`
- `MergedEntityItem.state` is `'installed' | 'available' | 'local-only'`
- `EntityCatalogSection` renders the filter tabs, search, and grid
- `EntityCatalogPage` wraps `SettingsPageLayout` + `EntityCatalogSection`

Agents and Tools use context/cached data sources rather than a fetcher, so they call `mergeWithRemote` directly in the page.

### Plugin system
Plugins live in `~/.projectflows/plugins/` tracked by a lock file in `packages/plugin`. They provide capabilities: agents, skills, tools, MCP servers. Two registry APIs:
- `opendora.entity.listAvailable({ type })` — individual entities (skills, workflows, agents, tools)
- `opendora.plugin.listAvailable()` — whole plugin packages (used by the Plugins page)

### Goal tracking
`<repo>/.projectflows/goals/` has status subdirs: `ready/`, `in_progress/`, `done/`, `blocked/`. Each contains a `GOAL.md` with YAML frontmatter. Move a goal folder when its status changes; update `status`, `last_result`, `attempt`, and `next_action` in the frontmatter.

**`goals/` is the only thing that belongs in the project's `.projectflows/`.** Agents, skills, workflows, tools, and plugins go exclusively in `~/.projectflows/` — never inside the project repo.
