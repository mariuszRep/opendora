import { Session } from "@opendora/session/session"
import { SessionPrompt } from "@opendora/session/prompt"
import { Identifier } from "@opendora/util/id"
import { Workflow, WorkflowEdge, resolveRef, resolveRefs, resolveTemplate } from "./schema.ts"
import { NodeTypeId } from "./node-types.ts"

export type WorkflowToolContext = {
  sessionID: string
  agent?: string
  model?: { providerID: string; modelID: string }
  abort?: AbortSignal
}

type ToolExecutor = (
  toolId: string,
  fixedArgs: Record<string, unknown>,
  agentArgs: string[],
  ctx: WorkflowToolContext,
) => Promise<{ output: string }>

let _toolExecutor: ToolExecutor | null = null

export function registerToolExecutor(executor: ToolExecutor) {
  _toolExecutor = executor
}

type InjectedPart =
  | { type: "text"; text: string }
  | { type: "tool"; tool: string; input: Record<string, unknown>; output: unknown }

async function injectMessage(sessionId: string, parts: InjectedPart[], directory: string): Promise<void> {
  const now = Date.now()
  const msgId = Identifier.ascending("message")

  await Session.updateMessage({
    id: msgId,
    sessionID: sessionId,
    role: "assistant",
    from: { kind: "service", id: "workflow" },
    time: { created: now, completed: now },
    modelID: "workflow-runner",
    providerID: "workflow",
    mode: "workflow",
    agent: "workflow",
    path: { cwd: directory, root: directory },
    cost: 0,
    tokens: { total: 0, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
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

async function agentPrompt(sessionId: string, text: string): Promise<string> {
  const result = await SessionPrompt.prompt({ sessionID: sessionId, parts: [{ type: "text", text }] })
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
}): Promise<void> {
  const adjacency = buildAdjacency(workflow.edges)
  const allTargetIds = new Set(workflow.edges.map((e) => e.target))
  const rootNodes = workflow.nodes.filter((n) => !allTargetIds.has(n.id))
  if (rootNodes.length === 0) throw new Error("Workflow has no root node")

  const ctx: Record<string, unknown> = {}
  const visited = new Set<string>()
  const queue = rootNodes.map((n) => n.id)

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)

    const node = workflow.nodes.find((n) => n.id === currentId)
    if (!node) continue

    const d = node.data as Record<string, unknown>
    const nd = (d.node ?? {}) as Record<string, unknown>
    const params = (nd.parameters ?? {}) as Record<string, unknown>
    const instructions = d.instructions as string | undefined
    const storeAs = params.output ? String(params.output) : undefined
    const agentArgs = Array.isArray(d.agentArgs) ? (d.agentArgs as string[]) : []

    let result: string | undefined

    if (d.nodeType === NodeTypeId.Parameters) {
      type WfParam = { name: string; type?: string; description?: string; required?: boolean; enum?: string[] }
      const defs = Array.isArray(d.workflowParameters) ? (d.workflowParameters as WfParam[]) : []

      const received: Record<string, unknown> = {}
      for (const p of defs) {
        received[p.name] = Object.prototype.hasOwnProperty.call(input, p.name) ? input[p.name] : null
      }

      // Validate required fields and enum constraints
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

      // Build rich output: values + metadata so the agent has full context
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
      }], directory)
      result = JSON.stringify(received)

    } else if (d.nodeType === NodeTypeId.Prompt) {
      result = await agentPrompt(sessionId, resolveTemplate(instructions ?? "", input, ctx))

    } else if (d.nodeType === NodeTypeId.Tool) {
      const actionId = nd.action_id as string | undefined
      if (!actionId) continue
      if (!_toolExecutor) throw new Error("No tool executor registered — call registerToolExecutor() at startup")

      const args: Record<string, string> = {}
      for (const [k, v] of Object.entries(params)) {
        if (k !== "output") args[k] = String(v)
      }
      const resolvedArgs = resolveRefs(args, input, ctx)

      const session = await Session.get(sessionId)
      const { output } = await _toolExecutor(actionId, resolvedArgs, agentArgs, {
        sessionID: sessionId,
        agent: session.agentID,
        abort: new AbortController().signal,
      })
      result = output

      await injectMessage(sessionId, [{ type: "tool", tool: actionId, input: resolvedArgs, output }], directory)

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
        const inputContext = Object.keys(input).length > 0
          ? `\nInput parameters: ${JSON.stringify(input)}`
          : ""
        const ctxContext = Object.keys(ctx).length > 0
          ? `\nWorkflow context: ${JSON.stringify(ctx)}`
          : ""
        const raw = await agentPrompt(
          sessionId,
          `You are routing a workflow. Choose the correct branch based on the available data.${inputContext}${ctxContext}\n\nReply with exactly one of these labels (nothing else): ${labelList}`,
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
      }], directory)

      // Auto-store result in ctx so it's accessible as $ctx.<key>.
      // Key is derived from the node label; explicit params.output overrides if set.
      const autoKey = (nd.label as string | undefined)
        ?.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "decide"
      ctx[storeAs ?? autoKey] = result
    }

    if (d.nodeType !== NodeTypeId.Decide && storeAs !== undefined && result !== undefined) ctx[storeAs] = result

    const edges = adjacency.get(currentId) ?? []

    if (d.nodeType === NodeTypeId.Decide) {
      // Edges labeled "result" (or with no label) always fire regardless of the decision.
      // Edges with any other label fire only when that label matches the decision result.
      // "else" fires as a fallback when no case label matched.
      const resultEdges = edges.filter((e) => !e.label || e.label === "result")
      const caseEdges = edges.filter((e) => e.label && e.label !== "result" && e.label !== "else")
      const elseEdges = edges.filter((e) => e.label === "else")

      const matchedCase = caseEdges.find((e) => e.label?.toLowerCase() === result?.toLowerCase())

      const nextIds: string[] = []
      for (const e of resultEdges) nextIds.push(e.target)

      if (matchedCase) {
        nextIds.push(matchedCase.target)
      } else if (elseEdges.length > 0) {
        for (const e of elseEdges) nextIds.push(e.target)
      }
      // If no case edge matches and there's no "else", this branch just ends —
      // same as any other terminal node. No error.

      for (const id of nextIds) queue.push(id)
    } else {
      const next = edges[0]?.target
      if (next) queue.push(next)
    }
  }
}
