import { AsyncLocalStorage } from "async_hooks"
import { Session } from "@opendora/session/session"
import { SessionPrompt } from "@opendora/session/prompt"
import { SessionStatus } from "@opendora/session/status"
import { Identifier } from "@opendora/util/id"
import { Workflow, WorkflowEdge, WorkflowNode } from "./schema.ts"
import { resolveRef, resolveRefs, resolveTemplate, resolveDeep, resolveSchemaDescriptions } from "./refs.ts"
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
  attempt?: number
}

// ─── Node-as-Tool lifecycle helpers ───────────────────────────────────────────
// Every workflow node emits a standard tool call in the session:
//   running  →  completed | error
// These helpers encapsulate that lifecycle so it is identical across all node types.

type NodeToolPartHandle = {
  readonly msgId: string
  readonly partId: string
  finish(output: unknown, metadata?: Record<string, unknown>): Promise<void>
  fail(error: string): Promise<void>
}

async function startNodeToolPart(
  sessionId: string,
  toolName: string,
  input: Record<string, unknown>,
  directory: string,
  meta: WorkflowMeta,
): Promise<NodeToolPartHandle> {
  const startTime = Date.now()
  const msgId = Identifier.ascending("message")
  const partId = Identifier.ascending("part")

  const baseMessage = {
    sessionID: sessionId,
    role: "assistant" as const,
    from: { kind: "workflow" as const, id: "workflow" },
    modelID: "workflow-runner",
    providerID: "workflow",
    mode: "workflow",
    agent: "workflow",
    path: { cwd: directory, root: directory },
    cost: 0,
    tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    workflowMeta: meta,
  }

  await Session.updateMessage({ id: msgId, ...baseMessage, time: { created: startTime } })

  await Session.updatePart({
    id: partId,
    sessionID: sessionId,
    messageID: msgId,
    type: "tool",
    callID: partId,
    tool: toolName,
    state: {
      status: "running",
      input,
      time: { start: startTime },
      ...(meta.attempt !== undefined && meta.attempt > 1 ? { metadata: { attempt: meta.attempt } } : {}),
    },
  } as any)

  return {
    msgId,
    partId,
    async finish(output: unknown, metadata?: Record<string, unknown>) {
      const endTime = Date.now()
      await Session.updatePart({
        id: partId,
        sessionID: sessionId,
        messageID: msgId,
        type: "tool",
        callID: partId,
        tool: toolName,
        state: {
          status: "completed",
          input,
          output: typeof output === "string" ? output : JSON.stringify(output, null, 2),
          title: toolName,
          metadata: (metadata ?? {}) as any,
          time: { start: startTime, end: endTime },
        },
      } as any)
      await Session.updateMessage({ id: msgId, ...baseMessage, time: { created: startTime, completed: endTime } })
    },
    async fail(error: string) {
      const endTime = Date.now()
      await Session.updatePart({
        id: partId,
        sessionID: sessionId,
        messageID: msgId,
        type: "tool",
        callID: partId,
        tool: toolName,
        state: {
          status: "error",
          input,
          error,
          time: { start: startTime, end: endTime },
        },
      } as any).catch(() => {})
      await Session.updateMessage({
        id: msgId, ...baseMessage, time: { created: startTime, completed: endTime },
      }).catch(() => {})
    },
  }
}


type NodeModel = { providerID: string; modelID: string }

// Renders a JSON schema as an annotated template the model can use as a writing guide.
// Field descriptions appear as // comments; types and enums are shown as placeholder values.
function schemaToTemplate(schema: Record<string, unknown>, depth = 0): string {
  const pad = "  ".repeat(depth)
  const inner = "  ".repeat(depth + 1)
  const type = (schema as any).type as string | undefined
  const desc = (schema as any).description as string | undefined
  const comment = desc ? `  // ${desc}` : ""

  if (type === "object") {
    const props = (schema as any).properties as Record<string, Record<string, unknown>> ?? {}
    const required = new Set<string>((schema as any).required ?? [])
    const entries = Object.entries(props)
    if (entries.length === 0) return `{}`
    const lines = entries.map(([key, val]) => {
      const opt = required.has(key) ? "" : "?"
      return `${inner}"${key}${opt}": ${schemaToTemplate(val, depth + 1)}`
    })
    return `{${comment}\n${lines.join(",\n")}\n${pad}}`
  }

  if (type === "array") {
    const items = (schema as any).items as Record<string, unknown> | undefined
    const itemStr = items ? schemaToTemplate(items, depth + 1) : "..."
    return `[${comment}\n${inner}${itemStr}\n${pad}]`
  }

  if ((schema as any).enum) {
    const vals = ((schema as any).enum as unknown[]).map((v) => JSON.stringify(v)).join(" | ")
    return `${vals}${comment}`
  }

  const placeholder = type === "string" ? `"string"` : type === "number" || type === "integer" ? `0` : type === "boolean" ? `true` : `null`
  return `${placeholder}${comment}`
}

function hasProperties(schema: Record<string, unknown>): boolean {
  return Object.keys((schema as any).properties ?? {}).length > 0
}

function extractJsonFromText(text: string): unknown | null {
  try { return JSON.parse(text.trim()) } catch {}
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch?.[1]) { try { return JSON.parse(fenceMatch[1].trim()) } catch {} }
  let start = text.indexOf("{")
  while (start >= 0) {
    let depth = 0
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++
      else if (text[i] === "}") {
        depth--
        if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)) } catch {} ; break }
      }
    }
    start = text.indexOf("{", start + 1)
  }
  return null
}

// Run the structured node prompt and extract JSON from the model's text response.
// toolChoice:"none" forces pure text output — no tool calls, no DSML, just text.
// JSON is parsed deterministically by the node function, not by model behavior.
async function agentStructuredJson(
  sessionId: string,
  instructions: string,
  schema: Record<string, unknown>,
  model?: NodeModel,
): Promise<unknown> {
  const schemaGuide = hasProperties(schema)
    ? [
        "",
        "Respond with ONLY a valid JSON object matching this structure:",
        "```json",
        schemaToTemplate(schema),
        "```",
        "Output only the JSON — no prose, no explanation, no extra keys.",
      ].join("\n")
    : "\n\nRespond with ONLY a valid JSON object capturing the key structured information. Output only the JSON."

  const result = await SessionPrompt.prompt({
    sessionID: sessionId,
    parts: [{ type: "text", text: instructions + schemaGuide }],
    format: { type: "text", toolChoice: "none" },
    ...(model ? { model } : {}),
  })

  const text = ((result as any).parts ?? [])
    .filter((p: any) => p.type === "text" && !p.synthetic)
    .map((p: any) => p.text ?? "")
    .join("")
    .trim()

  if (text) {
    const extracted = extractJsonFromText(text)
    if (extracted !== null) return extracted
  }

  throw new Error(`Structured node: model did not produce extractable JSON`)
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

    // Set when a node creates its "running" tool part, so the catch block can
    // finalize it to "error" instead of leaving it stuck at "running".
    let nodeToolHandle: NodeToolPartHandle | undefined

    try {

    const currentDir = await Session.effectiveDefaultPath(sessionId)
    let result: string | undefined

    const nodeMeta: WorkflowMeta = {
      ...workflowMeta,
      nodeID: currentId,
      nodeType: String(d.nodeType ?? "unknown"),
      nodeLabel,
    }

    if (d.nodeType === NodeTypeId.Parameters) {
      type WfParam = { name: string; type?: string; description?: string; required?: boolean; enum?: string[] }
      const defs = Array.isArray(d.workflowParameters)
        ? (d.workflowParameters as WfParam[]).map((p) => ({
            ...p,
            description: p.description ? resolveTemplate(p.description, input, ctx) : undefined,
          }))
        : []

      const received: Record<string, unknown> = {}
      for (const p of defs) {
        received[p.name] = Object.prototype.hasOwnProperty.call(input, p.name) ? input[p.name] : null
      }

      nodeToolHandle = await startNodeToolPart(sessionId, "workflow_parameters", received, currentDir, nodeMeta)

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

      await nodeToolHandle.finish(lines.join("\n"))
      result = JSON.stringify(received)

    } else if (d.nodeType === NodeTypeId.Prompt) {
      const resolvedText = resolveTemplate(instructions ?? "", input, ctx)
      nodeToolHandle = await startNodeToolPart(
        sessionId, "workflow_prompt",
        { instructions: resolvedText, node: nodeLabel },
        currentDir, nodeMeta,
      )
      result = await agentPrompt(sessionId, resolvedText, nodeModel)
      await nodeToolHandle.finish(result)

    } else if (d.nodeType === NodeTypeId.Structured) {
      const rawSchema = (d.outputSchema as Record<string, unknown>) ?? { type: "object", properties: {} }
      const schema = resolveSchemaDescriptions(rawSchema, input, ctx)
      const resolvedPrompt = resolveTemplate(instructions ?? "", input, ctx)
      const safeKey = (nodeKey ?? currentId).replace(/[^a-zA-Z0-9_]/g, "_").replace(/^([^a-zA-Z_])/, "_$1")

      nodeToolHandle = await startNodeToolPart(
        sessionId, "workflow_structured",
        { node: nodeLabel, instructions: resolvedPrompt },
        currentDir, nodeMeta,
      )
      const structured = await agentStructuredJson(sessionId, resolvedPrompt, schema, nodeModel)
      const renderLayout = (d.renderLayout ?? undefined) as Record<string, unknown> | undefined
      const displayProps = (d.schemaProps ?? undefined) as unknown[] | undefined
      await nodeToolHandle.finish(structured, {
        outputObject: structured,
        ...(displayProps ? { displayProps } : {}),
        ...(renderLayout ? { renderLayout } : {}),
      })
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

      nodeToolHandle = await startNodeToolPart(sessionId, actionId, resolvedArgs, currentDir, nodeMeta)

      const retryConfig = nd.retry as { maxAttempts?: number; delaySeconds?: number } | undefined
      const maxAttempts = Math.max(1, retryConfig?.maxAttempts ?? 1)
      const delayMs = Math.max(0, (retryConfig?.delaySeconds ?? 0) * 1000)

      let lastError: unknown
      let toolOutput: string | undefined
      let toolMeta: Record<string, unknown> | undefined

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Show retry attempt counter on the tool card when retrying
        if (attempt > 1) {
          await Session.updatePart({
            id: nodeToolHandle.partId,
            sessionID: sessionId,
            messageID: nodeToolHandle.msgId,
            type: "tool",
            callID: nodeToolHandle.partId,
            tool: actionId,
            state: {
              status: "running",
              input: resolvedArgs,
              time: { start: Date.now() },
              metadata: { attempt },
            },
          } as any)
        }
        try {
          const session = await Session.get(sessionId)
          const { output, metadata: toolResultMetadata } = await _toolExecutor(actionId, resolvedArgs, agentArgs, {
            sessionID: sessionId,
            agent: session.agentID,
            abort: new AbortController().signal,
            messageID: nodeToolHandle.msgId,
            partID: nodeToolHandle.partId,
          })
          toolOutput = output
          toolMeta = toolResultMetadata as Record<string, unknown> | undefined
          lastError = undefined
          break
        } catch (err) {
          lastError = err
          if (attempt < maxAttempts) {
            await new Promise<void>((r) => setTimeout(r, delayMs))
          }
        }
      }

      if (lastError !== undefined) throw lastError
      result = toolOutput!

      await nodeToolHandle.finish(toolOutput!, toolMeta)

    } else if (d.nodeType === NodeTypeId.Decide) {
      const mode = (params.mode as string) ?? "agent"
      const cases = Array.isArray(params.cases)
        ? (params.cases as Array<{ label: string; when?: { op: string; value?: unknown } }>)
        : []
      const defaultLabel = params.default as string | undefined

      const toolInput: Record<string, unknown> = {
        mode,
        cases: cases.map((c) => c.label),
        ...(defaultLabel ? { default: defaultLabel } : {}),
        ...(mode === "deterministic" ? { expression: params.input } : {}),
      }
      nodeToolHandle = await startNodeToolPart(sessionId, "workflow_decide", toolInput, currentDir, nodeMeta)

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

      await nodeToolHandle.finish(result)

      const autoKey = (nd.label as string | undefined)
        ?.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "decide"
      ctx[storeAs ?? autoKey] = result
      // Also write under nodeKey for the new $nodeKey reference format
      if (nodeKey !== undefined) ctx[nodeKey] = result

    } else if (d.nodeType === NodeTypeId.SetWorkdir) {
      const pathExpr = (params.path as string | undefined) ?? ""
      if (!pathExpr) throw new Error(`SetWorkdir node "${currentId}": "path" parameter is required`)

      nodeToolHandle = await startNodeToolPart(
        sessionId, "workflow_set_workdir",
        { path: pathExpr },
        currentDir, nodeMeta,
      )

      const resolved = String(resolveRef(pathExpr, input, ctx) ?? pathExpr)
      const newDir = resolved.split("\n").map((l) => l.trim()).filter(Boolean).at(-1) ?? resolved
      await Session.setCwd({ sessionID: sessionId, cwd: newDir })
      result = newDir

      await nodeToolHandle.finish(newDir)

    } else if (d.nodeType === NodeTypeId.ForEach) {
      const itemsMode = (params.itemsMode as string | undefined) ?? "reference"
      const itemsExpr = (params.items as string | undefined) ?? ""
      const inlineItemsList = Array.isArray(params.itemsList) ? (params.itemsList as string[]) : null
      const itemVar = (params.item_variable as string | undefined) ?? "item"
      const collectKey = (params.collect as string | undefined) || undefined
      const subWf = d.subWorkflow as { nodes: WorkflowNode[]; edges: WorkflowEdge[] } | undefined

      let items: unknown[]
      if (itemsMode === "inline" && inlineItemsList !== null) {
        // Inline mode: each item string is resolved independently — supports $ref expressions per item
        items = inlineItemsList.map((item) => resolveRef(item, input, ctx))
      } else {
        // Reference mode: resolve expression to an array, then resolve any template expressions within string elements
        const rawItems = itemsExpr ? resolveRef(itemsExpr, input, ctx) : []
        const rawArray: unknown[] = Array.isArray(rawItems)
          ? rawItems
          : typeof rawItems === "string"
            ? (() => { try { const p = JSON.parse(rawItems); return Array.isArray(p) ? p : [rawItems] } catch { return rawItems ? [rawItems] : [] } })()
            : rawItems != null ? [rawItems] : []
        items = rawArray.map((item) => typeof item === "string" ? resolveTemplate(item, input, ctx) : item)
      }

      nodeToolHandle = await startNodeToolPart(
        sessionId, "workflow_foreach",
        { items: itemsMode === "inline" ? inlineItemsList : itemsExpr, item_variable: itemVar, count: items.length },
        currentDir, nodeMeta,
      )

      const iterResults: unknown[] = []
      const MAX_RETRIES = 3
      const RETRY_BASE_DELAY_MS = 2000

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        let iterCtx: Record<string, unknown> = { ...ctx, [itemVar]: item }

        if (subWf && subWf.nodes.length > 0) {
          let attempt = 0
          while (true) {
            attempt++
            // Fresh context snapshot on each attempt so failed iteration state is discarded
            iterCtx = { ...ctx, [itemVar]: item }
            const iterSteps: GraphStep[] = []
            try {
              await runSubGraph({
                nodes: subWf.nodes,
                edges: subWf.edges,
                sessionId,
                input,
                ctx: iterCtx,
                steps: iterSteps,
                directory: currentDir,
                workflowMeta: { ...workflowMeta, ...(attempt > 1 ? { attempt } : {}) },
              })
              steps.push(...iterSteps.map((s) => ({ ...s, label: `[${i}] ${s.label}` })))
              break
            } catch (err) {
              steps.push(...iterSteps.map((s) => ({ ...s, label: `[${i}] ${s.label}` })))
              if (attempt >= MAX_RETRIES) throw err
              const delay = RETRY_BASE_DELAY_MS * attempt
              const errMsg = err instanceof Error ? err.message : String(err)
              SessionStatus.set(sessionId, {
                type: "retry",
                attempt,
                message: `[${i}] ${errMsg.slice(0, 120)}`,
                next: Date.now() + delay,
              })
              await new Promise((r) => setTimeout(r, delay))
            }
          }
        }

        // Collect: use explicit collect key, or fall back to the item itself
        if (collectKey && iterCtx[collectKey] !== undefined) {
          iterResults.push(iterCtx[collectKey])
        } else {
          iterResults.push(item)
        }
      }

      result = JSON.stringify(iterResults)
      await nodeToolHandle.finish(iterResults, { count: items.length })

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

      nodeToolHandle = await startNodeToolPart(
        sessionId, "workflow_configure_session",
        params as Record<string, unknown>,
        currentDir, nodeMeta,
      )

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
        const resolved = resolveTemplate(cfg.title, input, ctx)
        await Session.setTitle({ sessionID: sessionId, title: resolved })
        applied.title = resolved
      }
      if (cfg.agentID) {
        await Session.setAgentID({ sessionID: sessionId, agentID: cfg.agentID })
        applied.agentID = cfg.agentID
      }
      if (cfg.systemPrompt) {
        const resolved = resolveTemplate(cfg.systemPrompt, input, ctx)
        await Session.setSystemPrompt({ sessionID: sessionId, systemPrompt: resolved })
        applied.systemPrompt = resolved
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

      await nodeToolHandle.finish(`Session configured: ${summary}`, applied)
      result = JSON.stringify(applied)

    } else if (d.nodeType === NodeTypeId.Variable) {
      type VariableEntry = {
        name: string
        type: "string" | "number" | "boolean" | "array"
        value: string
        items: string[]
        updateMode: "replace" | "append"
      }
      const entries = Array.isArray(params.variables) ? (params.variables as VariableEntry[]) : []

      nodeToolHandle = await startNodeToolPart(
        sessionId, "workflow_variable",
        { variables: entries, node: nodeLabel },
        currentDir, nodeMeta,
      )

      // Retrieve any previously stored object for append semantics
      const existingObj = (nodeKey != null ? ctx[nodeKey] : (storeAs != null ? ctx[storeAs] : undefined)) as Record<string, unknown> | undefined
      const outputValues: Record<string, unknown> = existingObj && typeof existingObj === "object" && !Array.isArray(existingObj)
        ? { ...existingObj }
        : {}

      for (const entry of entries) {
        if (!entry.name) continue
        const entryUpdateMode = entry.updateMode ?? "replace"

        let resolved: unknown
        if (entry.type === "array") {
          const resolvedItems = (entry.items ?? []).map((item) => resolveRef(item, input, ctx))
          if (entryUpdateMode === "append" && Array.isArray(outputValues[entry.name])) {
            resolved = [...(outputValues[entry.name] as unknown[]), ...resolvedItems]
          } else {
            resolved = resolvedItems
          }
        } else {
          const raw = resolveRef(entry.value ?? "", input, ctx)
          if (entry.type === "number") resolved = Number(raw)
          else if (entry.type === "boolean") resolved = Boolean(raw) && raw !== "false" && raw !== "0"
          else resolved = raw == null ? "" : String(raw)
        }

        outputValues[entry.name] = resolved
      }

      await nodeToolHandle.finish(outputValues)
      result = JSON.stringify(outputValues)

      // Store the object directly — skip the string overwrite in the general ctx write below
      if (storeAs !== undefined) ctx[storeAs] = outputValues
      if (nodeKey !== undefined) ctx[nodeKey] = outputValues

    } else if (d.nodeType === NodeTypeId.Output) {
      const rawFields = (params.fields ?? {}) as Record<string, unknown>
      const fields: Record<string, string> = {}
      for (const [k, v] of Object.entries(rawFields)) fields[k] = String(v)

      nodeToolHandle = await startNodeToolPart(
        sessionId, "workflow_output",
        fields as Record<string, unknown>,
        currentDir, nodeMeta,
      )

      const resolved = resolveRefs(fields, input, ctx)
      ctx["__workflow_output__"] = resolved
      result = JSON.stringify(resolved, null, 2)

      await nodeToolHandle.finish(resolved)
    }

    // Structured/Output/Decide/Variable nodes already wrote their parsed objects into ctx above; skip the string overwrite
    if (d.nodeType !== NodeTypeId.Decide && d.nodeType !== NodeTypeId.Structured && d.nodeType !== NodeTypeId.Output && d.nodeType !== NodeTypeId.Variable && storeAs !== undefined && result !== undefined) ctx[storeAs] = result

    // Write under the stable node key so downstream nodes can use $nodeKey references.
    // Structured/Output/Variable already wrote parsed objects above; all other types write the string result.
    if (d.nodeType !== NodeTypeId.Structured && d.nodeType !== NodeTypeId.Output && d.nodeType !== NodeTypeId.Variable && nodeKey !== undefined && result !== undefined) {
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
      if (nodeToolHandle) {
        await nodeToolHandle.fail(err instanceof Error ? err.message : String(err)).catch(() => {})
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
    const workflowOutput = ctx["__workflow_output__"] as Record<string, unknown> | undefined
    const passed = steps.filter((s) => s.passed).length
    const failed = steps.filter((s) => !s.passed).length
    await Session.setWorkflowRun({ sessionID: sessionId, workflowRun: null })
    if (workflowOutput !== undefined) {
      const status = {
        workflow: workflow.name,
        completed: !error,
        ...(error ? { error } : {}),
        passed,
        failed,
        steps: steps.map((s) => ({ label: s.label, passed: s.passed })),
      }
      return JSON.stringify({ status, result: workflowOutput }, null, 2)
    }
    const lines = [
      error
        ? `Workflow "${workflow.name}" stopped — ${error}`
        : `Workflow "${workflow.name}" completed`,
      `${passed} passed, ${failed} failed`,
      "",
      ...steps.map((s) => `${s.passed ? "✓" : "✗"} ${s.label}`),
    ]
    return lines.join("\n")
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
