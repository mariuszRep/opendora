import { AsyncLocalStorage } from "async_hooks"
import { Session } from "@opendora/session/session"
import { SessionPrompt } from "@opendora/session/prompt"
import { Identifier } from "@opendora/util/id"
import { Workflow, WorkflowEdge, WorkflowNode, resolveRef, resolveRefs, resolveTemplate } from "./schema.ts"
import { NodeTypeId } from "./node-types.ts"

// Tracks the chain of workflow IDs currently executing on this async call stack.
// Propagates automatically through the tool executor → workflow_run → runWorkflow path,
// so cycles are caught regardless of call depth.
const _callStack = new AsyncLocalStorage<Set<string>>()

export type WorkflowToolContext = {
  sessionID: string
  agent?: string
  model?: { providerID: string; modelID: string }
  abort?: AbortSignal
  /** Pre-created message ID for the tool call — allows the executor to wire metadata updates */
  messageID?: string
  /** Pre-created part ID for the tool call — allows the executor to update state in real-time */
  partID?: string
}

type ToolExecutor = (
  toolId: string,
  fixedArgs: Record<string, unknown>,
  agentArgs: string[],
  ctx: WorkflowToolContext,
) => Promise<{ output: string; metadata?: Record<string, unknown> }>

let _toolExecutor: ToolExecutor | null = null

export function registerToolExecutor(executor: ToolExecutor) {
  _toolExecutor = executor
}


type WorkflowMeta = {
  workflowID: string
  workflowRunID: string
  nodeID?: string
  nodeType?: string
  nodeLabel?: string
}

type InjectedPart =
  | { type: "text"; text: string }
  | { type: "tool"; tool: string; input: Record<string, unknown>; output: unknown }

async function injectMessage(
  sessionId: string,
  parts: InjectedPart[],
  directory: string,
  meta?: WorkflowMeta,
): Promise<void> {
  const now = Date.now()
  const msgId = Identifier.ascending("message")

  await Session.updateMessage({
    id: msgId,
    sessionID: sessionId,
    role: "assistant",
    from: { kind: "workflow", id: "workflow" },
    time: { created: now, completed: now },
    modelID: "workflow-runner",
    providerID: "workflow",
    mode: "workflow",
    agent: "workflow",
    path: { cwd: directory, root: directory },
    cost: 0,
    tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    ...(meta ? { workflowMeta: meta } : {}),
  })

  for (const p of parts) {
    const partId = Identifier.ascending("part")
    if (p.type === "text") {
      await Session.updatePart({ id: partId, sessionID: sessionId, messageID: msgId, type: "text", text: p.text })
    } else {
      await Session.updatePart({
        id: partId,
        sessionID: sessionId,
        messageID: msgId,
        type: "tool",
        callID: Identifier.ascending("part"),
        tool: p.tool,
        state: {
          status: "completed",
          input: p.input,
          output: typeof p.output === "string" ? p.output : JSON.stringify(p.output, null, 2),
          title: p.tool,
          metadata: {},
          time: { start: now, end: now },
        },
      })
    }
  }
}

type NodeModel = { providerID: string; modelID: string }

function buildJsonInstruction(schema: Record<string, unknown>): string {
  const props = (schema as any).properties ?? {}
  const required: string[] = (schema as any).required ?? []
  const lines = Object.entries(props).map(([key, val]: [string, any]) => {
    const desc = val.description ? ` // ${val.description}` : ""
    const enumStr = val.enum ? ` (one of: ${val.enum.join(", ")})` : ""
    return `  "${key}": ...${enumStr}${desc}`
  })
  return [
    `Respond with ONLY a valid JSON object — no prose, no markdown, no code fences.`,
    `Use EXACTLY these field names (required: ${required.join(", ")}):`,
    `{`,
    ...lines,
    `}`,
  ].join("\n")
}

function extractJsonFromText(text: string): unknown | null {
  // Try the whole string first
  try { return JSON.parse(text.trim()) } catch {}
  // Walk backward from the last } to find the largest valid object
  let end = text.lastIndexOf("}")
  while (end >= 0) {
    const start = text.lastIndexOf("{", end)
    if (start < 0) break
    try { return JSON.parse(text.slice(start, end + 1)) } catch {}
    end = text.lastIndexOf("}", end - 1)
  }
  return null
}

async function agentStructuredPrompt(
  sessionId: string,
  text: string,
  schema: Record<string, unknown>,
  model?: NodeModel,
): Promise<unknown> {
  // For reasoning models (e.g. gpt-5.x) toolChoice:"required" causes them to reason about
  // calling the tool but produce no actual response — the reasoning phase has no tool access.
  // Use a plain text prompt with toolChoice:"none" instead: the model always produces real
  // text output, and we extract the JSON from that text.
  const jsonInstruction = buildJsonInstruction(schema)
  const fullPrompt = `${text}\n\n${jsonInstruction}`

  const result = await SessionPrompt.prompt({
    sessionID: sessionId,
    parts: [{ type: "text", text: fullPrompt }],
    format: { type: "text", toolChoice: "none" },
    hidden: true,
    ...(model ? { model } : {}),
  })

  // For non-reasoning models that support StructuredOutput tool call
  const structured = (result as any).info?.structured ?? null
  if (structured !== null) return structured

  // Primary path for reasoning models: extract JSON from the text response
  const textContent = ((result as any).parts ?? [])
    .filter((p: any) => p.type === "text" && !p.synthetic)
    .map((p: any) => p.text ?? "")
    .join("")
    .trim()
  if (textContent) {
    const extracted = extractJsonFromText(textContent)
    if (extracted !== null) return extracted
  }

  throw new Error(`Workflow structured node produced no output — stopping workflow`)
}

async function agentPrompt(
  sessionId: string,
  text: string,
  model?: NodeModel,
  toolChoice?: "auto" | "required" | "none",
): Promise<string> {
  const result = await SessionPrompt.prompt({
    sessionID: sessionId,
    parts: [{ type: "text", text }],
    ...(model ? { model } : {}),
    ...(toolChoice ? { format: { type: "text", toolChoice } } : {}),
  })
  const parts = (result as any).parts ?? []
  return parts
    .filter((p: any) => p.type === "text" && !p.synthetic)
    .map((p: any) => p.text ?? "")
    .join("")
    .trim()
}


function evaluateWhen(op: string, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case "equals":      return actual === expected
    case "not_equals":  return actual !== expected
    case "in":          return Array.isArray(expected) && expected.includes(actual)
    case "not_in":      return Array.isArray(expected) && !expected.includes(actual)
    case "contains":    return typeof actual === "string" && typeof expected === "string" && actual.includes(expected)
    case "not_contains":return typeof actual === "string" && typeof expected === "string" && !actual.includes(expected)
    case "matches":     return typeof actual === "string" && typeof expected === "string" && new RegExp(expected).test(actual)
    case "not_matches": return typeof actual === "string" && typeof expected === "string" && !new RegExp(expected).test(actual)
    case "gt":          return typeof actual === "number" && typeof expected === "number" && actual > expected
    case "gte":         return typeof actual === "number" && typeof expected === "number" && actual >= expected
    case "lt":          return typeof actual === "number" && typeof expected === "number" && actual < expected
    case "lte":         return typeof actual === "number" && typeof expected === "number" && actual <= expected
    case "exists":      return actual != null
    case "not_exists":  return actual == null
    case "is_empty":    return (typeof actual === "string" || Array.isArray(actual)) ? actual.length === 0 : false
    case "is_not_empty":return (typeof actual === "string" || Array.isArray(actual)) ? actual.length > 0 : false
    default:            return false
  }
}

function buildAdjacency(edges: WorkflowEdge[]): Map<string, WorkflowEdge[]> {
  const map = new Map<string, WorkflowEdge[]>()
  for (const edge of edges) {
    if (!map.has(edge.source)) map.set(edge.source, [])
    map.get(edge.source)!.push(edge)
  }
  return map
}

type GraphStep = { label: string; passed: boolean }

// ─── Core graph executor ──────────────────────────────────────────────────────
// Runs a flat node/edge graph within an existing session. Mutates ctx and steps
// in place so the caller retains accumulated results even when an error is thrown.
async function runSubGraph({
  nodes,
  edges,
  sessionId,
  input,
  ctx,
  steps,
  directory,
  workflowMeta,
}: {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  sessionId: string
  input: Record<string, unknown>
  ctx: Record<string, unknown>
  steps: GraphStep[]
  directory: string
  workflowMeta: WorkflowMeta
}): Promise<void> {
  const adjacency = buildAdjacency(edges)
  const allTargetIds = new Set(edges.map((e) => e.target))
  const rootNodes = nodes.filter((n) => !allTargetIds.has(n.id))

  const visited = new Set<string>()
  const queue = rootNodes.map((n) => n.id)

  // Model set by a ConfigureSession node, carried forward to subsequent nodes
  // that don't specify their own override. Must be passed explicitly on every
  // prompt call below — otherwise createUserMessage's `agent.model` fallback
  // (which outranks message history) would silently override it.
  let carriedModel: NodeModel | undefined

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)

    const node = nodes.find((n) => n.id === currentId)
    if (!node) continue

    const d = node.data as Record<string, unknown>
    const nd = (d.node ?? {}) as Record<string, unknown>
    const params = (nd.parameters ?? {}) as Record<string, unknown>
    const instructions = d.instructions as string | undefined
    const storeAs = params.output ? String(params.output) : undefined
    const nodeKey = nd.key ? String(nd.key) : undefined
    const agentArgs = Array.isArray(d.agentArgs) ? (d.agentArgs as string[]) : []
    const nodeModel = (d.model as NodeModel | undefined) ?? carriedModel
    const nodeLabel = (nd.label as string | undefined) ?? d.nodeType as string ?? currentId

    // Set when a Tool/RunWorkflow node creates its "running" tool part below, so the
    // catch block can finalize it to "error" instead of leaving it stuck at "running".
    let pendingToolPart: { id: string; messageID: string; tool: string; input: unknown } | undefined

    try {

    const currentDir = await Session.effectiveDefaultPath(sessionId)
    let result: string | undefined

    if (d.nodeType === NodeTypeId.Parameters) {
      type WfParam = { name: string; type?: string; description?: string; required?: boolean; enum?: string[] }
      const defs = Array.isArray(d.workflowParameters) ? (d.workflowParameters as WfParam[]) : []

      const received: Record<string, unknown> = {}
      for (const p of defs) {
        received[p.name] = Object.prototype.hasOwnProperty.call(input, p.name) ? input[p.name] : null
      }

      for (const p of defs) {
        const val = received[p.name]
        if (p.required !== false && (val === null || val === undefined || val === "")) {
          throw new Error(
            `Workflow parameter "${p.name}" is required but was not provided.` +
            (p.description ? ` (${p.description})` : "")
          )
        }
        if (p.enum && p.enum.length > 0 && val !== null && val !== undefined && val !== "") {
          const strVal = String(val)
          if (!p.enum.includes(strVal)) {
            throw new Error(
              `Workflow parameter "${p.name}" value "${strVal}" is not allowed. ` +
              `Allowed values: ${p.enum.join(", ")}`
            )
          }
        }
      }

      const lines: string[] = ["Workflow inputs:"]
      for (const p of defs) {
        const val = received[p.name]
        const displayVal = val === null || val === undefined ? "(not provided)" : JSON.stringify(val)
        lines.push(`  ${p.name}: ${displayVal}`)
        const meta: string[] = []
        if (p.type) meta.push(p.type)
        if (p.required !== false) meta.push("required")
        if (p.enum && p.enum.length > 0) meta.push(`allowed: ${p.enum.join(" | ")}`)
        const parts: string[] = []
        if (meta.length > 0) parts.push(`[${meta.join(", ")}]`)
        if (p.description) parts.push(p.description)
        if (parts.length > 0) lines.push(`    ${parts.join(" ")}`)
      }

      await injectMessage(sessionId, [{
        type: "tool",
        tool: "workflow_parameters",
        input: received,
        output: lines.join("\n"),
      }], currentDir, { ...workflowMeta, nodeID: currentId, nodeType: String(d.nodeType ?? "parameters"), nodeLabel })
      result = JSON.stringify(received)

    } else if (d.nodeType === NodeTypeId.Prompt) {
      result = await agentPrompt(sessionId, resolveTemplate(instructions ?? "", input, ctx), nodeModel)

    } else if (d.nodeType === NodeTypeId.Structured) {
      const schema = (d.outputSchema as Record<string, unknown>) ?? { type: "object", properties: {} }
      const resolvedPrompt = resolveTemplate(instructions ?? "", input, ctx)
      const structured = await agentStructuredPrompt(sessionId, resolvedPrompt, schema, nodeModel)
      await injectMessage(sessionId, [{
        type: "tool",
        tool: "workflow_structured",
        input: { node: nodeLabel },
        output: structured,
      }], currentDir, { ...workflowMeta, nodeID: currentId, nodeType: String(d.nodeType ?? "structured"), nodeLabel })
      // Store the parsed object — both under the legacy storeAs key and the stable nodeKey.
      // This must happen here because result is a JSON string; writing result later would
      // overwrite with a string, breaking $nodeKey.field path navigation.
      if (storeAs !== undefined) ctx[storeAs] = structured
      if (nodeKey !== undefined) ctx[nodeKey] = structured
      result = JSON.stringify(structured)

    } else if (d.nodeType === NodeTypeId.Tool || d.nodeType === NodeTypeId.RunWorkflow) {
      // RunWorkflow is a Tool node with action_id pre-set to "workflow_run"
      const actionId = (nd.action_id as string | undefined) ||
        (d.nodeType === NodeTypeId.RunWorkflow ? "workflow_run" : undefined)
      if (!actionId) { steps.push({ label: nodeLabel, passed: true }); continue }
      if (!_toolExecutor) throw new Error("No tool executor registered — call registerToolExecutor() at startup")

      const args: Record<string, string> = {}
      for (const [k, v] of Object.entries(params)) {
        if (k !== "output") args[k] = String(v)
      }
      const resolvedArgs = resolveRefs(args, input, ctx)

      // For RunWorkflow: params beyond the known workflow_run keys are individual
      // workflow input values. Assemble them into resolvedArgs.input and remove
      // the individual keys so the tool executor receives a clean call.
      if (d.nodeType === NodeTypeId.RunWorkflow) {
        const TOOL_KEYS = new Set(["workflowId", "wait", "agentId", "workdir"])
        const wfInput: Record<string, unknown> = {}
        for (const k of Object.keys(resolvedArgs)) {
          if (!TOOL_KEYS.has(k)) { wfInput[k] = resolvedArgs[k]; delete resolvedArgs[k] }
        }
        if (Object.keys(wfInput).length > 0) resolvedArgs.input = wfInput
        resolvedArgs.wait = true
      }

      if (!resolvedArgs.workdir) resolvedArgs.workdir = currentDir

      // Create message + tool part in "running" state BEFORE executing so the UI
      // shows the tool card immediately (not only after the tool completes).
      const toolMsgId = Identifier.ascending("message")
      const toolPartId = Identifier.ascending("part")
      const toolStartTime = Date.now()

      await Session.updateMessage({
        id: toolMsgId,
        sessionID: sessionId,
        role: "assistant",
        from: { kind: "workflow", id: "workflow" },
        time: { created: toolStartTime },
        modelID: "workflow-runner",
        providerID: "workflow",
        mode: "workflow",
        agent: "workflow",
        path: { cwd: currentDir, root: currentDir },
        cost: 0,
        tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        workflowMeta: { ...workflowMeta, nodeID: currentId, nodeType: String(d.nodeType ?? "tool"), nodeLabel },
      })

      await Session.updatePart({
        id: toolPartId,
        sessionID: sessionId,
        messageID: toolMsgId,
        type: "tool",
        callID: toolPartId,
        tool: actionId,
        state: {
          status: "running",
          input: resolvedArgs,
          time: { start: toolStartTime },
        },
      } as any)
      pendingToolPart = { id: toolPartId, messageID: toolMsgId, tool: actionId, input: resolvedArgs }

      const session = await Session.get(sessionId)
      const { output, metadata: toolResultMetadata } = await _toolExecutor(actionId, resolvedArgs, agentArgs, {
        sessionID: sessionId,
        agent: session.agentID,
        abort: new AbortController().signal,
        messageID: toolMsgId,
        partID: toolPartId,
      })
      result = output

      // Update the part to "completed" with the tool output.
      await Session.updatePart({
        id: toolPartId,
        sessionID: sessionId,
        messageID: toolMsgId,
        type: "tool",
        callID: toolPartId,
        tool: actionId,
        state: {
          status: "completed",
          input: resolvedArgs,
          output: typeof output === "string" ? output : JSON.stringify(output, null, 2),
          title: actionId,
          metadata: (toolResultMetadata ?? {}) as any,
          time: { start: toolStartTime, end: Date.now() },
        },
      } as any)

      // Mark the message as completed.
      await Session.updateMessage({
        id: toolMsgId,
        sessionID: sessionId,
        role: "assistant",
        from: { kind: "workflow", id: "workflow" },
        time: { created: toolStartTime, completed: Date.now() },
        modelID: "workflow-runner",
        providerID: "workflow",
        mode: "workflow",
        agent: "workflow",
        path: { cwd: currentDir, root: currentDir },
        cost: 0,
        tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        workflowMeta: { ...workflowMeta, nodeID: currentId, nodeType: String(d.nodeType ?? "tool"), nodeLabel },
      })

    } else if (d.nodeType === NodeTypeId.Decide) {
      const mode = (params.mode as string) ?? "agent"
      const cases = Array.isArray(params.cases)
        ? (params.cases as Array<{ label: string; when?: { op: string; value?: unknown } }>)
        : []
      const defaultLabel = params.default as string | undefined

      if (mode === "deterministic") {
        const inputExpr = params.input as string | undefined
        if (!inputExpr) throw new Error(`Decide node "${currentId}": deterministic mode requires an input expression`)
        const inputVal = resolveRef(inputExpr, input, ctx)
        const matched = cases.find((c) => c.when && evaluateWhen(c.when.op, inputVal, c.when.value))
        result = matched?.label ?? defaultLabel
        if (!result) {
          throw new Error(
            `Decide node "${currentId}": no case matched for input "${String(inputVal)}" (expression: ${inputExpr}). ` +
            `Cases: ${cases.map((c) => `${c.label}(${c.when?.op} ${JSON.stringify(c.when?.value)})`).join(", ")}`
          )
        }
      } else {
        const labelList = cases.map((c) => c.label).join(", ")
        const inputContext = Object.keys(input).length > 0 ? `\nInput parameters: ${JSON.stringify(input)}` : ""
        const ctxContext = Object.keys(ctx).length > 0 ? `\nWorkflow context: ${JSON.stringify(ctx)}` : ""
        const raw = await agentPrompt(
          sessionId,
          `You are routing a workflow. Choose the correct branch based on the available data.${inputContext}${ctxContext}\n\nReply with exactly one of these labels (nothing else): ${labelList}`,
          nodeModel,
          "none",
        )
        const normalizedRaw = raw.trim().toLowerCase()
        const matched = cases.find((c) => c.label.toLowerCase() === normalizedRaw)
        result = matched?.label ?? defaultLabel
      }

      if (!result) {
        throw new Error(`Decide node "${currentId}": agent returned "${String(result)}" which matched no case label and no default is defined`)
      }

      await injectMessage(sessionId, [{
        type: "tool",
        tool: "workflow_decide",
        input: {
          mode,
          cases: cases.map((c) => c.label),
          ...(mode === "deterministic" ? { expression: params.input } : {}),
        },
        output: result,
      }], currentDir)

      const autoKey = (nd.label as string | undefined)
        ?.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "decide"
      ctx[storeAs ?? autoKey] = result
      // Also write under nodeKey for the new $nodeKey reference format
      if (nodeKey !== undefined) ctx[nodeKey] = result

    } else if (d.nodeType === NodeTypeId.SetWorkdir) {
      const pathExpr = (params.path as string | undefined) ?? ""
      if (!pathExpr) throw new Error(`SetWorkdir node "${currentId}": "path" parameter is required`)
      const resolved = String(resolveRef(pathExpr, input, ctx) ?? pathExpr)
      const newDir = resolved.split("\n").map((l) => l.trim()).filter(Boolean).at(-1) ?? resolved
      await Session.setCwd({ sessionID: sessionId, cwd: newDir })
      result = newDir
      await injectMessage(sessionId, [{
        type: "tool",
        tool: "set_workdir",
        input: { path: pathExpr },
        output: newDir,
      }], newDir)

    } else if (d.nodeType === NodeTypeId.ForEach) {
      const itemsExpr = (params.items as string | undefined) ?? ""
      const itemVar = (params.item_variable as string | undefined) ?? "item"
      const collectKey = (params.collect as string | undefined) || undefined
      const subWf = d.subWorkflow as { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | undefined

      // Resolve the items array — support JSON string arrays from upstream nodes
      const rawItems = itemsExpr ? resolveRef(itemsExpr, input, ctx) : []
      const items: unknown[] = Array.isArray(rawItems)
        ? rawItems
        : typeof rawItems === "string"
          ? (() => { try { const p = JSON.parse(rawItems); return Array.isArray(p) ? p : [rawItems] } catch { return rawItems ? [rawItems] : [] } })()
          : rawItems != null ? [rawItems] : []

      await injectMessage(sessionId, [{
        type: "tool",
        tool: "workflow_foreach",
        input: { items: itemsExpr, item_variable: itemVar, count: items.length },
        output: `Iterating over ${items.length} item(s)`,
      }], currentDir)

      const iterResults: unknown[] = []

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        // Each iteration gets a snapshot of the outer ctx + the current item
        const iterCtx: Record<string, unknown> = { ...ctx, [itemVar]: item }

        if (subWf && subWf.nodes.length > 0) {
          const iterSteps: GraphStep[] = []
          await runSubGraph({
            nodes: subWf.nodes,
            edges: subWf.edges,
            sessionId,
            input,
            ctx: iterCtx,
            steps: iterSteps,
            directory: currentDir,
            workflowMeta,
          })
          steps.push(...iterSteps.map((s) => ({ ...s, label: `[${i}] ${s.label}` })))
        }

        // Collect: use explicit collect key, or fall back to the item itself
        if (collectKey && iterCtx[collectKey] !== undefined) {
          iterResults.push(iterCtx[collectKey])
        } else {
          iterResults.push(item)
        }
      }

      result = JSON.stringify(iterResults)

    } else if (d.nodeType === NodeTypeId.ConfigureSession) {
      const cfg = params as {
        model?: NodeModel | null
        cwd?: string
        title?: string
        agentID?: string
        systemPrompt?: string
        path?: string
        readPath?: string
      }

      const applied: Record<string, unknown> = {}

      if (cfg.model?.providerID && cfg.model?.modelID) {
        carriedModel = cfg.model
        // Stamp the model into message history (visible/auditable) — the actual
        // carry-forward to subsequent nodes is via `carriedModel` above, passed
        // explicitly on every later prompt call. noReply skips the assistant turn.
        await SessionPrompt.prompt({
          sessionID: sessionId,
          parts: [{ type: "text", text: `[session configured: model=${cfg.model.providerID}/${cfg.model.modelID}]` }],
          model: cfg.model,
          noReply: true,
          hidden: true,
        })
        applied.model = `${cfg.model.providerID}/${cfg.model.modelID}`
      } else if (cfg.model === null) {
        // Explicit reset to "Agent default" — `null` is a deliberate sentinel
        // distinct from "field untouched" (undefined), which JSON.stringify would
        // otherwise drop on save, making the reset unrecoverable after reload.
        carriedModel = undefined
        applied.model = "agent default"
      }
      if (cfg.cwd) {
        const resolved = String(resolveRef(cfg.cwd, input, ctx) ?? cfg.cwd)
        await Session.setCwd({ sessionID: sessionId, cwd: resolved })
        applied.cwd = resolved
      }
      if (cfg.title) {
        await Session.setTitle({ sessionID: sessionId, title: cfg.title })
        applied.title = cfg.title
      }
      if (cfg.agentID) {
        await Session.setAgentID({ sessionID: sessionId, agentID: cfg.agentID })
        applied.agentID = cfg.agentID
      }
      if (cfg.systemPrompt) {
        await Session.setSystemPrompt({ sessionID: sessionId, systemPrompt: cfg.systemPrompt })
        applied.systemPrompt = cfg.systemPrompt
      }
      if (cfg.path) {
        const resolved = String(resolveRef(cfg.path, input, ctx) ?? cfg.path)
        await Session.setPath({ sessionID: sessionId, path: resolved })
        applied.path = resolved
      }
      if (cfg.readPath) {
        const resolved = String(resolveRef(cfg.readPath, input, ctx) ?? cfg.readPath)
        await Session.setReadPath({ sessionID: sessionId, readPath: resolved })
        applied.readPath = resolved
      }

      const changedKeys = Object.keys(applied)
      const summary = changedKeys.length > 0
        ? changedKeys.map((k) => `${k}=${JSON.stringify(applied[k])}`).join(", ")
        : "no changes"

      await injectMessage(sessionId, [{
        type: "tool",
        tool: "workflow_configure_session",
        input: applied,
        output: `Session configured: ${summary}`,
      }], currentDir, { ...workflowMeta, nodeID: currentId, nodeType: String(d.nodeType ?? "configure_session"), nodeLabel })

      result = JSON.stringify(applied)

    }

    // Structured nodes already wrote the parsed object into ctx above; skip the string overwrite
    if (d.nodeType !== NodeTypeId.Decide && d.nodeType !== NodeTypeId.Structured && storeAs !== undefined && result !== undefined) ctx[storeAs] = result

    // Write under the stable node key so downstream nodes can use $nodeKey references.
    // Structured already wrote the parsed object above; all other types write the string result.
    if (d.nodeType !== NodeTypeId.Structured && nodeKey !== undefined && result !== undefined) {
      ctx[nodeKey] = result
    }

    const nodeEdges = adjacency.get(currentId) ?? []

    if (d.nodeType === NodeTypeId.Decide) {
      const resultEdges = nodeEdges.filter((e) => !e.label || e.label === "result")
      const caseEdges = nodeEdges.filter((e) => e.label && e.label !== "result" && e.label !== "else")
      const elseEdges = nodeEdges.filter((e) => e.label === "else")
      const matchedCase = caseEdges.find((e) => e.label?.toLowerCase() === result?.toLowerCase())
      const nextIds: string[] = []
      for (const e of resultEdges) nextIds.push(e.target)
      if (matchedCase) {
        nextIds.push(matchedCase.target)
      } else if (elseEdges.length > 0) {
        for (const e of elseEdges) nextIds.push(e.target)
      }
      for (const id of nextIds) queue.push(id)
    } else {
      const next = nodeEdges[0]?.target
      if (next) queue.push(next)
    }

    steps.push({ label: nodeLabel, passed: true })
    } catch (err) {
      steps.push({ label: nodeLabel, passed: false })
      if (pendingToolPart) {
        await Session.updatePart({
          id: pendingToolPart.id,
          sessionID: sessionId,
          messageID: pendingToolPart.messageID,
          type: "tool",
          callID: pendingToolPart.id,
          tool: pendingToolPart.tool,
          state: {
            status: "error",
            input: pendingToolPart.input,
            error: err instanceof Error ? err.message : String(err),
            time: { start: Date.now(), end: Date.now() },
          },
        } as any).catch(() => {})
      }
      throw err
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runWorkflow({
  workflow,
  sessionId,
  input,
  directory,
}: {
  workflow: Workflow
  sessionId: string
  input: Record<string, unknown>
  directory: string
}): Promise<string> {
  if (workflow.nodes.length === 0) throw new Error("Workflow has no nodes")

  // Detect cycles before executing anything.
  const parentStack = _callStack.getStore()
  if (parentStack?.has(workflow.id)) {
    const chain = [...parentStack, workflow.id].join(" → ")
    throw new Error(`Infinite loop detected: workflow "${workflow.id}" is already executing. Call stack: ${chain}`)
  }
  const activeStack = new Set(parentStack ?? [])
  activeStack.add(workflow.id)

  return _callStack.run(activeStack, () => _runWorkflow({ workflow, sessionId, input, directory }))
}

async function _runWorkflow({
  workflow,
  sessionId,
  input,
  directory,
}: {
  workflow: Workflow
  sessionId: string
  input: Record<string, unknown>
  directory: string
}): Promise<string> {
  const ctx: Record<string, unknown> = {}
  const steps: GraphStep[] = []
  const workflowRunID = Identifier.ascending("workflow_run")
  const baseWorkflowMeta: WorkflowMeta = { workflowID: workflow.id, workflowRunID }

  await Session.setWorkflowRun({
    sessionID: sessionId,
    workflowRun: { workflowID: workflow.id, workflowRunID, startedAt: Date.now() },
  })

  const finalize = async (error?: string) => {
    const passed = steps.filter((s) => s.passed).length
    const failed = steps.filter((s) => !s.passed).length
    const lines = [
      error
        ? `Workflow "${workflow.name}" stopped — ${error}`
        : `Workflow "${workflow.name}" completed`,
      `${passed} passed, ${failed} failed`,
      "",
      ...steps.map((s) => `${s.passed ? "✓" : "✗"} ${s.label}`),
    ]
    const summary = lines.join("\n")
    const cwd = await Session.effectiveDefaultPath(sessionId)
    await injectMessage(sessionId, [{ type: "text", text: summary }], cwd, baseWorkflowMeta)
    await Session.setWorkflowRun({ sessionID: sessionId, workflowRun: null })
    return summary
  }

  try {
    await runSubGraph({
      nodes: workflow.nodes as WorkflowNode[],
      edges: workflow.edges as WorkflowEdge[],
      sessionId,
      input,
      ctx,
      steps,
      directory,
      workflowMeta: baseWorkflowMeta,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return finalize(msg)
  }

  return finalize()
}

