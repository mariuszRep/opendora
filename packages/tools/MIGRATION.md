# MIGRATION.md

> **Owner: agent** — updated as migration work starts, completes, or gets blocked.
> Read `/VISION.md` (repo root) first to understand where the project is going.
> This file covers the tools package only. It reflects current transition state, not the ideal future.

---

## Active migration: Tool JSON (MCP-ready metadata)

### Why

Each tool group will eventually be served as an MCP server. MCP requires each tool to be described as a JSON object with `name`, `description`, and `inputSchema` (JSON Schema). The goal of this migration is to move all tool metadata out of inline TypeScript strings and `.txt` files into `tool.json` files that are:

- Readable by any language without running TypeScript
- Directly usable as MCP `tools/list` responses
- The single source of truth for tool descriptions and parameter schemas

The TypeScript `execute()` implementation and Zod schemas remain unchanged — Zod stays for runtime validation. The JSON is the portable metadata layer.

---

## Pattern established

Every migrated tool follows this shape:

### File layout (per tool)

```
<group>/
  <tool>.ts       ← execute() + Zod schema for runtime validation
  <tool>.json     ← MCP-ready metadata (name, description, inputSchema)
  index.ts        ← re-exports all tools in the group
```

### tool.json schema

```json
{
  "name": "tool-id",
  "description": "Full description the LLM sees. Can be long — this is what guides tool selection and usage.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "param_name": {
        "type": "string",
        "description": "What this parameter does"
      }
    },
    "required": ["param_name"]
  }
}
```

`inputSchema` follows JSON Schema draft-07. Keep `type`, `properties`, `required`, `enum` where applicable. No `$schema` field needed.

### How the .ts file imports from JSON

Replace any `.txt` import with a JSON import:

```typescript
// Before
import DESCRIPTION from "./delegate.txt"
// ...
description: DESCRIPTION,

// After
import toolDef from "./delegate.json"
// ...
description: toolDef.description,
```

Delete the `.txt` file once the JSON is in place and the `.ts` is updated.

### Generator script

For groups not yet migrated, a generator script automates the initial JSON creation:

```bash
bun ./scripts/generate-tool-json.ts ./<group>
```

The generator:
1. Imports each tool from the group's `index.ts`
2. Calls `tool.init()` to get the live Zod schema and current description
3. Converts Zod → JSON Schema via `zod-to-json-schema`
4. Reads the `.txt` file if present (takes precedence over init() description)
5. Writes `<tool>.json` next to the tool file
6. **Skips files that already have a `.json`** — safe to re-run

After generating: review descriptions, edit as needed, then update the `.ts` import.

---

## Tool group status

### Groups

| Group | Directory | Status | Notes |
|---|---|---|---|
| **Communication** | `./communication/` | ✅ Done | delegate, reply, question |
| **Sessions** | `./sessions/` | ✅ Done | session_get, session_search, session_tree |
| **Filesystem** | `./filesystem/` | ✅ Done | read, write, edit, multiedit, apply_patch, glob, grep, list |
| **Shell** | `./shell/` | ✅ Done | bash, batch |
| **Browse & Web** | `./browse-and-web/` | ✅ Done | webfetch, websearch, codesearch |
| **Skills** | `./skills/` | ✅ Done | skill_load, skill_list, skill_search, skill_install, skill_create, skill_remove |
| **Agents** | `./agents/` | ✅ Done | agent_create, agent_get, agent_list, agent_update, agent_delete |
| **Schedule** | `./schedule/` | ✅ Done | schedule_create, schedule_get, schedule_list, schedule_update, schedule_run, schedule_delete |
| **System** | `./system/` | ✅ Done | invalid, log_lesson, todowrite, todoread, lsp |
| **Desktop** | `./desktop/` | ✅ Done | 19 desktop_* tools |

### Removed from registry (files kept, not served to agents)

| Tool | File | Reason |
|---|---|---|
| `browser` | `./browser/simple-browser.ts` | Not ready for use yet |
| `task` | `./system/task.ts` | Still used internally by session core — exported from system but not in registry |
| `plan_exit` | `./system/plan.ts` | Removed from registry; exported from system for any future use |

---

## Group reorganisation (completed this session)

These changes were made to the tool group structure before the JSON migration began:

### New group: communication

Created `./communication/` containing:
- `delegate.ts` — moved from `sessions/`
- `reply.ts` — moved from `sessions/`
- `question.ts` — moved from `browse-and-web/`

Package export `"./communication"` was already declared in `./package.json`.

### Task management dissolved into system

All files from `./task-management/` moved to `./system/`:
- `task.ts`, `task.txt`
- `plan.ts`, `plan-exit.txt`, `plan-enter.txt`
- `todo.ts`, `todoread.txt`, `todowrite.txt`

`task-management/index.ts` is kept as a re-export shim pointing to `system/` so existing external imports (`@opendora/tools/task-management`) still resolve.

### Sessions group (remaining)

After removing delegate and reply, `sessions/` now contains only:
- `session_get`, `session_search`, `session_tree`

### Registry

All tool imports are centralised in `./system/registry.ts`.
The registry's `all()` function is the authoritative list of tools served to agents.

---

## Next steps (in order)

✅ All tool groups have `tool.json` files with correct MCP-ready `inputSchema`.

**Next phase: MCP server adapter**

Build the MCP server adapter for each group (or start with `communication` as the pilot):
- Reads all `*.json` files in the group directory → serves `tools/list`
- Routes `tools/call` by `name` to the corresponding TypeScript `execute()` function
- A thin `mcp-server.ts` per group — no knowledge of tool internals required

See VISION.md for the target shape.

---

## Key files to know

| File | Purpose |
|---|---|
| `scripts/generate-tool-json.ts` | Generator script for automating JSON creation per group |
| `system/registry.ts` | Central registry — authoritative list of tools served to agents |
| `package.json` | Exports map — each group must have an entry here |
| `tool.ts` | `Tool.define()` — core interface all tools implement |
| `host.ts` | Service injection — what `host(ctx)` provides to execute() |
