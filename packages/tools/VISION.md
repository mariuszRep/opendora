# VISION.md — packages/tools

> **Owner: human** — updated only when the vision for this package changes.
> Agents read this as the north star for tools. Never edit during migration work.
> See `MIGRATION.md` (same directory) for current progress toward this vision.

---

## Goal

Every tool in this package is described by a `tool.json` file that is fully compatible with the MCP (Model Context Protocol) wire format. Each tool group is independently servable as an MCP server with no additional transformation.

---

## Package Boundary

`packages/tools` owns tool definitions, schemas, registries, execution adapters, and tool-facing permission surfaces. It is used by `runtime` to execute tool calls and may use `storage` when tool definitions or tool state must be persisted. It does not own the public API server, agent run loop, workflow semantics, permission lifecycle/evaluation, or physical storage backend choice.

Tools may be made available through agent attachments, skill attachments, runtime/session context, or workflow step requirements. Tool availability is not authorization: runtime/server must ask `permission` before protected tool execution.

## Access Surface Boundary

Tools are the LLM-facing access surface for managed package operations. When a tool manages agents, skills, schedules, workflows, sessions, tools, or similar domains, it must call the same canonical package operation used by server/SDK access instead of owning separate domain behavior.

```
LLM tool -> host/runtime/server -> canonical package operation
SDK/API  -> server            -> same canonical package operation
```

## Target shape — per tool

```
<group>/
  <tool>.ts       ← execute() implementation + Zod schema (runtime validation only)
  <tool>.json     ← MCP-ready metadata: name, description, inputSchema
  index.ts        ← re-exports all tools in the group
```

The `.json` file is the single source of truth for tool identity and description. The `.ts` file owns execution and type safety. Neither duplicates the other.

---

## tool.json format

Strictly follows the MCP tool definition:

```json
{
  "name": "tool-id",
  "description": "What this tool does and when to use it. Can be detailed — this is what the LLM reads.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "param": {
        "type": "string",
        "description": "What this parameter controls"
      }
    },
    "required": ["param"]
  }
}
```

No custom fields. No markdown files. No `.txt` files. JSON only.

---

## Target shape — per group

Each group directory becomes a self-contained MCP server unit:

```
<group>/
  index.ts           ← tool exports
  <tool>.ts          ← one per tool
  <tool>.json        ← one per tool (MCP-ready)
  mcp-server.ts      ← thin adapter: reads *.json → tools/list, routes tools/call → execute()
```

The MCP server for a group:
- Reads all `*.json` files in the directory to serve `tools/list`
- Routes `tools/call` to the corresponding TypeScript `execute()` function
- Requires no knowledge of tool internals — just name matching

---

## Tool groups

| Group | Directory | Tools |
|---|---|---|
| Communication | `./communication/` | delegate, reply, question |
| Sessions | `./sessions/` | session_get, session_search, session_tree |
| Filesystem | `./filesystem/` | read, write, edit, multiedit, apply_patch, glob, grep, list |
| Shell | `./shell/` | bash, batch |
| Browse & Web | `./browse-and-web/` | webfetch, websearch, codesearch |
| Skills | `./skills/` | skill_load, skill_list, skill_search, skill_install, skill_create, skill_remove |
| Agents | `./agents/` | agent_create, agent_get, agent_list, agent_update, agent_delete |
| Schedule | `./schedule/` | schedule_create, schedule_get, schedule_list, schedule_update, schedule_run, schedule_delete |
| System | `./system/` | invalid, log_lesson, todowrite, todoread, lsp |
| Desktop | `./desktop/` | 13 desktop_* tools |

---

## What is removed

| Removed | Replaced by |
|---|---|
| `.txt` description files | `tool.json` description field |
| Inline description strings in `.ts` | `import toolDef from "./tool.json"` |
| `task-management/` as a group | tools dissolved into `system/` |
| `browser` tool (Playwright) | deferred — not ready |
| `task` and `plan_exit` from registry | internal-only; not served to agents |
