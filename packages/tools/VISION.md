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

## Tool output standardization

### Current contract

Every tool's `execute()` returns `{ title, metadata, output: string, attachments? }` (see `packages/tools/tool.ts`). The `output` field is typed as `string`. Tools that produce structured data must manually `JSON.stringify` their results into this field. The `metadata` field can carry structured data but is inconsistently used and not part of the tool's declared schema.

### Why this is a problem

1. **Loss of structure** — When a tool produces JSON, the string round-trip discards type information. Downstream consumers (workflow runner, UI renderer) must re-parse to get structured access.
2. **No output schema** — MCP tool definitions declare `inputSchema` but not output shape. There is no contract describing what a tool produces, only what it accepts.
3. **Inconsistent rendering** — Since the UI receives only a string, generic tool output is displayed as a JSON code block with no structure-aware rendering.
4. **Workflow tool nodes** — When a tool node pass-through executes, its `output: string` reaches the workflow runner, which must guess whether to parse it as JSON or keep it as text. The runner currently stores the raw string in `ctx` and stringifies it again for the session tool part.

### Target

Over time, tool outputs should expose a canonical result object alongside the string representation, while preserving MCP compatibility. The target shape is:

```
execute() returns {
  title: string,
  metadata: Record<string, unknown>,
  output: string,              // human-readable string (MCP-compatible, preserved)
  outputObject?: unknown,      // structured result as a parsed JSON object/array/value
  render?: {
    defaultView?: "json" | "auto",
    summary?: string,
  }
}
```

### Constraints

- The `output: string` field must never be removed — it is the MCP-compatible human-readable form.
- `outputObject` is additive and optional. Tools that produce structured data can populate it alongside `output`.
- The `render` object in the target shape above does **not** include layout-preference hints (`as`, `fields`, `arrayAs`, `objectAs`, etc.). Those are deferred to a later phase. The current priority is format selection (JSON/YAML/XML/Markdown/HTML) via a shared translator utility, not card/table visual customization.
- Per-tool `outputSchema` should be declared in each tool's `.json` definition (or `.ts` schema) so the runtime and UI know what shape to expect without ad-hoc parsing.
- Migration must be incremental — not all tools need to change at once. Tools that emit pure text (e.g. `bash`, `webfetch`) may never need `outputObject`.
- The `packages/workflow/VISION.md § Structured output and format-switchable views` defines the canonical output envelope (with format projections for JSON/YAML/XML/Markdown/HTML) that workflow nodes use; this section defines the tool-level contract that feeds into it.

### Relationship to workflow package

Workflow structured/variable/output nodes already produce parsed objects internally (stored in workflow `ctx` before stringification). The tool `execute()` contract is the main barrier to propagating those objects through the session tool part to the UI. Closing this gap requires coordinated changes in both `packages/tools` (output contract) and `packages/workflow` (runner serialization).

---

## What is removed

| Removed | Replaced by |
|---|---|
| `.txt` description files | `tool.json` description field |
| Inline description strings in `.ts` | `import toolDef from "./tool.json"` |
| `task-management/` as a group | tools dissolved into `system/` |
| `browser` tool (Playwright) | deferred — not ready |
| `task` and `plan_exit` from registry | internal-only; not served to agents |
