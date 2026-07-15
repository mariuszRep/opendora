# CONVENTIONS.md — Projectflows

> Owner: human. Development conventions for the Projectflows ecosystem.
> Agents read this for coding standards, artifact locations, and publishing rules.
>
> Last updated: 2026-07-15

## Three-Directory Architecture

Every capability in Projectflows flows through three directories:

```text
opendora/                    ← DEVELOP here (source code, tests, runtime behavior)
projectflows-website/registry/ ← PUBLISH here (distribution to users)
~/.projectflows/             ← INSTALL here (runtime, user-facing)
```

**If you develop it in `opendora` and want other users to have it, it MUST end up in `projectflows-website/registry/`.**

This is the single most important rule in the Projectflows ecosystem. Code that stays only in `opendora` is internal; code that reaches the registry is public.

## Artifact Locations

### Tools

| What | Where | Notes |
|------|-------|-------|
| Source code | `opendora/packages/tools/` or `projectflows-website/registry/tools/<group>/src/` | Core tools in opendora, publishable tools in registry |
| Compiled bundles | `projectflows-website/registry/tools/<group>/tools/*.js` | Built from src, distributed to users |
| Installed | `~/.projectflows/tools/<group>/tools/*.js` | Runtime location |
| Group manifest | `projectflows-website/registry/tools/<group>/group.json` | Defines tool group metadata |

**Workflow for publishing a new tool group:**
1. Write tool source in `projectflows-website/registry/tools/<group>/src/`
2. Add `group.json` manifest
3. Compile: `bun run build` in the registry directory
4. Users install via catalog/settings

### Agents

| What | Where | Notes |
|------|-------|-------|
| Definition | `projectflows-website/registry/agents/<name>/agent.json` | Agent config + persona |
| Persona | `projectflows-website/registry/agents/<name>/PERSONA.md` | Agent personality/instructions |
| Installed | `~/.projectflows/agents/<name>/agent.json` | Runtime location |

### Skills

| What | Where | Notes |
|------|-------|-------|
| Definition | `projectflows-website/registry/skills/<name>/SKILL.md` | Skill instructions |
| Installed | `~/.projectflows/skills/<name>/SKILL.md` | Runtime location |

### Workflows

| What | Where | Notes |
|------|-------|-------|
| Definition | `projectflows-website/registry/workflows/<id>/` | Workflow nodes + edges |
| Installed | `~/.projectflows/workflows/` | Runtime location |

### Plugins

| What | Where | Notes |
|------|-------|-------|
| Manifest | `projectflows-website/registry/plugins/<id>/manifest.json` | Capability manifest |
| Installed | `~/.projectflows/plugins/installed/<id>/` | Runtime location |

## Code Conventions

### Package Structure

Each domain package follows:
```text
packages/<name>/
  src/
    <name>.ts          ← main namespace/exports
    <name>.sql.ts      ← database schema (if applicable)
  test/
    <name>.test.ts     ← tests
  VISION.md            ← package boundary and intent
  package.json         ← package metadata
  tsconfig.json        ← TypeScript config
```

### VISION.md in Packages

Every package VISION.md should reference:
1. **Package boundary** — what this package owns
2. **Registry location** — where publishable artifacts go in `projectflows-website/registry/`
3. **Runtime location** — where installed artifacts live in `~/.projectflows/`
4. **Relationship to opendora** — how this package relates to the source repo

### TypeScript

- Use `bun` as the runtime and package manager
- TypeScript strict mode is enabled
- Use `zod` for runtime validation
- Prefer `async/await` over raw promises
- Use namespace exports (`export namespace X { ... }`) for domain boundaries

### Testing

- Tests use `bun:test` (describe, expect, test)
- Test files live in `test/` directories
- Use `tmpdir()` fixture for file system tests
- Mock external services at the boundary, not internal functions

### Tool Development

- Tools use `Tool.define(id, init)` from `@projectflows/tools`
- Tool `execute()` returns `{ title, metadata, output: string }`
- Tools access services via `host(ctx)` which casts `ctx.extra` to `HostServices`
- The `HostServices` interface in `host.ts` defines available services

## Publishing Workflow

### For Tools

1. **Develop** in `opendora/packages/tools/` (core tools) or `projectflows-website/registry/tools/<group>/src/` (publishable tools)
2. **Test** with `bun test` in the package directory
3. **Publish** by committing to `projectflows-website/registry/`
4. **Build** with `bun run build` in the registry directory
5. **Users install** via catalog/settings UI

### For Agents, Skills, Workflows

1. **Develop** the definition files (agent.json, SKILL.md, workflow nodes)
2. **Publish** to `projectflows-website/registry/`
3. **Users install** via catalog/settings UI

### For Plugins

1. **Develop** the plugin manifest and capability contributions
2. **Publish** to `projectflows-website/registry/plugins/`
3. **Users install** via catalog/settings UI

## Common Pitfalls

### 1. Developing but not publishing
If you create a tool in `opendora/packages/tools/` but don't publish it to `projectflows-website/registry/`, other users cannot access it. Core tools are bundled; publishable tools must be in the registry.

### 2. Wrong path for tool source
Tool source goes in `registry/tools/<group>/src/`, not `registry/tools/<group>/tools/`. The `tools/` directory contains compiled bundles.

### 3. Missing group.json
Every tool group needs a `group.json` manifest. Without it, the tool registry cannot discover the group.

### 4. Forgetting to rebuild
After changing tool source, run `bun run build` to recompile bundles. Users won't see changes until the bundles are rebuilt.

### 5. Runtime vs. development paths
- `opendora/packages/` — development only, not runtime
- `projectflows-website/registry/` — distribution, not runtime
- `~/.projectflows/` — runtime only, never edit directly

## File Naming

- Tool files: `<tool-name>.ts` (kebab-case)
- Agent files: `<agent-name>/agent.json` (kebab-case)
- Skill files: `<skill-name>/SKILL.md` (kebab-case)
- Workflow files: `<workflow-id>/` (kebab-case)
- Test files: `<name>.test.ts` (kebab-case)

## Import Conventions

- Use `@projectflows/<package>` for cross-package imports
- Never import from `node_modules` directly
- Never import from `~/.projectflows/` at runtime (use service APIs)
- Core packages import from each other; apps import from SDK only
