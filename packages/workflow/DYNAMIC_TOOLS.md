# Dynamic Tool Integration for Workflow Nodes

> **Status**: Design document — implementation pending
> **Owner**: Agent-generated, human-approved architecture
> **Date**: 2026-05-13

---

## Problem Statement

Workflow nodes currently require manual metadata management to connect to tools:

1. **UI hardcodes tool schemas** in `BUILTIN_SCHEMAS` constant
2. **Workflow runner hardcodes** tool name → execution mapping
3. **No automatic discovery** of new tools (internal or MCP)
4. **Duplication** of tool metadata across packages

This violates the "lazy developer" principle: adding a tool should automatically make it available in workflows.

---

## Current Architecture

### Tool Definition (Correct ✅)

Each tool has a `.json` file with MCP-compatible schema:

```json
{
  "name": "tool_id",
  "description": "What this tool does",
  "inputSchema": {
    "type": "object",
    "properties": {
      "param": { "type": "string", "description": "..." }
    },
    "required": ["param"]
  }
}
```

**Location**: `packages/tools/<group>/<tool>.json`

### Tool Registry (Correct ✅)

Central registry exports all tools:

```typescript
// packages/tools/registry.ts
export namespace ToolRegistry {
  export function all(): Tool.Info[]
  export function ids(): string[]
}
```

### Server API (Correct ✅)

Endpoint `/agent/tools/schema` returns all tool schemas:

```typescript
// GET /agent/tools/schema
[
  {
    id: "bash",
    description: "Execute shell commands",
    source: "internal",
    inputSchema: { type: "object", properties: {...}, required: [...] }
  },
  {
    id: "mcp_server_tool",
    description: "...",
    source: "mcp",
    mcpServer: "filesystem",
    inputSchema: {...}
  }
]
```

### UI Fetching (Correct ✅)

UI already fetches tool schemas:

```typescript
// ui/web/hooks/use-tool-schemas.ts
export function useToolSchemas() {
  const [schemas, setSchemas] = useState<ToolSchema[]>([])
  
  useEffect(() => {
    opendora.agent.toolSchemas().then(setSchemas)
  }, [])
  
  return { schemas, loading }
}
```

### The Disconnect (Problem ❌)

1. **UI workflow editor** has hardcoded `BUILTIN_SCHEMAS` for `skill_load`, `agent`, `decide`, `output`
2. **Workflow runner** has hardcoded logic mapping `action_id` to tool execution
3. **No bridge** between tool registry and workflow package

---

## Target Architecture

### Principle: Single Source of Truth

```
Tool .json files
      ↓
Tool Registry (packages/tools)
      ↓
Server API (/agent/tools/schema)
      ↓
UI Workflow Editor (dynamic dropdown + forms)
      ↓
Workflow JSON (stores action_id + parameters)
      ↓
Workflow Runner (resolves action_id → tool executor)
```

### Package Boundaries (Per VISION.md)

- **`packages/tools`**: Owns tool definitions, registry, execution
- **`packages/workflow`**: Pure library, no tool knowledge, uses injection
- **`core`**: Wires tools → workflow at startup
- **`ui/web`**: Fetches schemas via API, renders forms

---

## Implementation Plan

### Phase 1: Remove UI Hardcoding

**File**: `ui/web/components/workflow/workflow-edit-drawer.tsx`

**Change**: Remove `BUILTIN_SCHEMAS` constant (lines 40-72)

**Before**:
```typescript
const BUILTIN_SCHEMAS: Record<string, BuiltinSchema> = {
  skill_load: { description: "...", properties: {...}, required: [...] },
  agent: { ... },
  decide: { ... },
  output: { ... }
}

// Later in code:
const builtin = BUILTIN_SCHEMAS[actionId]
const properties = selectedSchema?.inputSchema?.properties ?? builtin?.properties ?? {}
```

**After**:
```typescript
// Use fetched schemas for ALL tools
const selectedSchema = schemas.find((s) => s.id === actionId)
const properties = selectedSchema?.inputSchema?.properties ?? {}
const required = selectedSchema?.inputSchema?.required ?? []
```

**Why**: Tool schemas already come from the server. No need to duplicate.

---

### Phase 2: Add Tool Executor Injection to Workflow Package

**File**: `packages/workflow/src/runner.ts`

**Add** (after line 38):

```typescript
// ─── Tool execution — wired at startup by the host package ───────────────────
// Using injection avoids circular dependency (workflow ← core ← tools).

export type ToolExecutionContext = {
  sessionID: string
  messageID: string
  agent?: string
  model?: { providerID: string; modelID: string }
  abort?: AbortSignal
}

type ToolExecutor = (
  toolId: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
) => Promise<{ output: unknown; metadata?: Record<string, unknown> }>

let _toolExecutor: ToolExecutor | null = null

export function registerToolExecutor(executor: ToolExecutor) {
  _toolExecutor = executor
}
```

**Update** tool_call execution (lines 393-404):

```typescript
} else if (exec.kind === "tool_call") {
  const resolvedArgs = resolveRefs(exec.args, input, ctx)
  
  if (!_toolExecutor) {
    throw new Error("Tool executor not registered — workflow package not wired to tool registry")
  }
  
  try {
    const result = await _toolExecutor(exec.tool, resolvedArgs, {
      sessionID: sessionId,
      messageID: "workflow-runner", // Could generate proper ID
      // TODO: Get model/agent from session
    })
    
    if (exec.output) ctx[exec.output] = result.output
    
    await injectMessage(sessionId, [
      {
        type: "tool",
        tool: exec.tool,
        input: resolvedArgs,
        output: result.output,
      },
    ], directory)
  } catch (error) {
    await injectMessage(sessionId, [
      {
        type: "tool",
        tool: exec.tool,
        input: resolvedArgs,
        output: { error: String(error) },
      },
    ], directory)
    throw error
  }
  
  currentId = nextNode(adjacency, currentId)
}
```

---

### Phase 3: Wire Tool Executor in Core

**File**: `packages/opencode/src/server/server.ts` (or wherever workflow routes are mounted)

**Add** (during server startup, before mounting workflow routes):

```typescript
import { registerToolExecutor } from "@opendora/workflow/runner"
import { ToolRegistry } from "./tool/registry"
import { Session } from "@opendora/session/session"

// Wire tool registry to workflow package
registerToolExecutor(async (toolId, args, ctx) => {
  // Find the tool in the registry
  const toolInfo = ToolRegistry.all().find((t) => t.id === toolId)
  if (!toolInfo) {
    throw new Error(`Tool "${toolId}" not found in registry`)
  }
  
  // Initialize the tool with context
  const tool = await toolInfo.init({
    model: ctx.model,
    agent: ctx.agent ? { /* resolve agent info */ } : undefined,
  })
  
  // Execute the tool
  const result = await tool.execute(args, {
    sessionID: ctx.sessionID,
    messageID: ctx.messageID,
    agent: ctx.agent ?? "",
    abort: ctx.abort ?? new AbortController().signal,
    messages: [], // TODO: Load from session if needed
    metadata: () => {},
    ask: async () => {}, // TODO: Wire permission system
  })
  
  return {
    output: result.output,
    metadata: result.metadata,
  }
})
```

**Note**: This requires access to session context to properly initialize tools. The workflow runner will need to pass session info through the execution context.

---

### Phase 4: Enhanced Workflow Runner Context

**File**: `packages/workflow/src/runner.ts`

**Update** `runWorkflow` function signature (line 311):

```typescript
export async function runWorkflow({
  workflow,
  sessionId,
  input,
  directory,
  model, // NEW: Pass model from session
  agent, // NEW: Pass agent from session
}: {
  workflow: Workflow
  sessionId: string
  input: Record<string, unknown>
  directory: string
  model?: { providerID: string; modelID: string } // NEW
  agent?: string // NEW
}): Promise<void>
```

**Update** tool execution context (in tool_call block):

```typescript
const result = await _toolExecutor(exec.tool, resolvedArgs, {
  sessionID: sessionId,
  messageID: Identifier.ascending("message"),
  agent,
  model,
  abort: new AbortController().signal, // Could wire real abort signal
})
```

---

### Phase 5: Update Workflow Routes to Pass Context

**File**: `packages/workflow/src/routes.ts`

**Update** execute endpoint (line 145):

```typescript
const session = await Session.createNext({
  directory,
  title: `Workflow: ${workflow.name}`,
  sessionType: "worker",
  agentID: agentId,
  ownerKind: "service",
})

// NEW: Get agent and model info
const agentInfo = agentId ? await Agent.get(directory, agentId) : undefined
const model = agentInfo?.config.model

runWorkflow({
  workflow,
  sessionId: session.id,
  input,
  directory,
  model, // NEW
  agent: agentId, // NEW
}).catch((err) => {
  console.error(`[workflow execute] error in "${id}":`, err)
})
```

---

## Benefits

### 1. Zero Duplication
- Tool schemas defined once in `.json` files
- No manual UI updates needed
- No hardcoded mappings in workflow runner

### 2. Automatic Discovery
- New tool added → appears in workflow editor dropdown
- MCP tools work identically to internal tools
- No code changes required

### 3. Type Safety
- JSON Schema provides runtime validation
- Zod schemas in tools provide compile-time safety
- UI auto-generates forms from schema

### 4. Lazy Developer Friendly
- Add tool → it's available everywhere
- Update tool schema → UI updates automatically
- No maintenance burden

### 5. Package Boundaries Preserved
- Workflow package stays pure (no tool imports)
- Injection pattern maintains clean architecture
- Follows VISION.md principles

---

## Migration Checklist

- [ ] Remove `BUILTIN_SCHEMAS` from `ui/web/components/workflow/workflow-edit-drawer.tsx`
- [ ] Update UI to use fetched schemas for all tools
- [ ] Add tool executor injection to `packages/workflow/src/runner.ts`
- [ ] Wire tool executor in core startup
- [ ] Update workflow runner to pass session context
- [ ] Update workflow routes to pass model/agent info
- [ ] Test with internal tools (bash, read, write, etc.)
- [ ] Test with MCP tools
- [ ] Test with skill_load, agent, decide, output (special workflow nodes)
- [ ] Update workflow documentation

---

## Special Cases: Workflow-Specific Nodes

Some "tools" are workflow-specific and not in the tool registry:

- `skill_load` — loads skills into workflow context
- `agent` — sends prompt to agent
- `decide` — branching logic
- `output` — final output node

**Solution**: These remain as special node types in the workflow runner. They are NOT tools in the registry, but workflow control flow primitives.

The UI can still provide their schemas via a small local constant for these 4 special cases, OR we can register them as "virtual tools" in a workflow-specific registry.

**Recommendation**: Keep them as special cases in the runner. They're not general-purpose tools.

---

## Future Enhancements

1. **Tool Validation at Save Time**
   - Validate `action_id` exists in available tools
   - Validate parameters match schema
   - Provide helpful error messages

2. **Tool Search/Filter in UI**
   - Filter by source (internal vs MCP)
   - Search by description
   - Group by category

3. **Parameter Hints**
   - Show example values
   - Validate against schema in real-time
   - Support `$input.field` and `$ctx.key` autocomplete

4. **Tool Versioning**
   - Track tool schema changes
   - Warn when workflow uses outdated schema
   - Migration helpers

---

## Questions for Human Review

1. Should workflow-specific nodes (`skill_load`, `agent`, `decide`, `output`) be registered as virtual tools, or kept as special cases?
2. Should tool execution errors halt workflow, or continue with error output?
3. Should we validate tool availability at workflow save time, or runtime?
4. How should we handle tool permission requests in workflows (auto-approve, ask user, fail)?

---

## References

- Tool registry: `packages/tools/registry.ts`
- Tool JSON format: `packages/tools/VISION.md`
- Workflow runner: `packages/workflow/src/runner.ts`
- Server API: `packages/opencode/src/server/routes/agent.ts`
- UI schemas hook: `ui/web/hooks/use-tool-schemas.ts`
