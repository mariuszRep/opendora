import { Session } from "@opendora/session/session"
import { SessionPrompt } from "@opendora/session/prompt"
import { Identifier } from "@opendora/util/id"
import { Workflow, WorkflowEdge, resolveRef, resolveRefs, resolveTemplate } from "./schema.ts"

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
    const storeAs = params.output != null ? String(params.output) : undefined
    const agentArgs = Array.isArray(d.agentArgs) ? (d.agentArgs as string[]) : []

    let result: string | undefined

    if (d.nodeType === "parameters") {
      const defs = Array.isArray(d.workflowParameters)
        ? (d.workflowParameters as Array<{ name: string; description?: string }>)
        : []
      const received: Record<string, unknown> = {}
      for (const p of defs) {
        received[p.name] = Object.prototype.hasOwnProperty.call(input, p.name) ? input[p.name] : null
      }
      await injectMessage(sessionId, [{
        type: "tool",
        tool: "workflow_parameters",
        input: received,
        output: JSON.stringify(received, null, 2),
      }], directory)
      result = JSON.stringify(received)

    } else if (d.nodeType === "prompt") {
      result = await agentPrompt(sessionId, resolveTemplate(instructions ?? "", input, ctx))

    } else if (d.nodeType === "tool") {
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

    } else if (d.nodeType === "decide") {
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
    }

    if (storeAs !== undefined && result !== undefined) ctx[storeAs] = result

    const edges = adjacency.get(currentId) ?? []
    let next: string | undefined

    if (d.nodeType === "decide") {
      const chosen = result?.toLowerCase()
      next = edges.find((e) => e.label?.toLowerCase() === chosen)?.target
      if (!next) throw new Error(`Decide node "${currentId}": no outgoing edge for label "${result}"`)
    } else {
      next = edges[0]?.target
    }

    if (next) queue.push(next)
  }
}
