import type { MessageWithParts, TextPart, Session } from "@/lib/projectflows"
import { ExecutionState, Step, Run } from "@/lib/execution-graph/types"
import { getAgentColor } from "@/lib/agent-colors"
import { createInitialState } from "@/lib/execution-graph/engine"

/**
 * Converts OpenDora messages into an ExecutionState for the conversation graph.
 *
 * One Step per message (not per part) — aligns graph nodes 1:1 with MessageRow renders.
 * Run colors come from the agent assigned to each session.
 */
export function messagesToExecutionState(
  messages: MessageWithParts[],
  selectedSessionId: string,
  sessionsById: Map<string, Session>,
  agentsById: Map<string, { color?: string }>,
  userColor?: string,
): ExecutionState {
  const visibleMessages = messages.filter(
    (m) => !(m.info as { hidden?: boolean }).hidden
  )

  if (visibleMessages.length === 0) return createInitialState()

  // ── 1. Collect sessions in order and resolve parent relationships ────────────

  const sessionOrder: string[] = []
  const sessionParentMap: Record<string, string> = {}

  for (const { info } of visibleMessages) {
    const sid = info.sessionID
    if (!sessionOrder.includes(sid)) sessionOrder.push(sid)
    const parentSid = info.parentSessionID
    if (parentSid && !sessionParentMap[sid]) sessionParentMap[sid] = parentSid
  }

  // ── 2. Build Runs — one per session, colored by agent ───────────────────────

  const sessionToRunId: Record<string, string> = {}
  const runs: Record<string, Run> = {}

  for (let i = 0; i < sessionOrder.length; i++) {
    const sid = sessionOrder[i]
    const runId = `run-${sid}`
    sessionToRunId[sid] = runId

    const session = sessionsById.get(sid)
    const agent = session?.agentID ? agentsById.get(session.agentID) : undefined
    const runColor = getAgentColor(agent?.color).hex

    const parentSid = sessionParentMap[sid]
    const parentRunId = parentSid ? sessionToRunId[parentSid] : undefined

    runs[runId] = {
      id: runId,
      name: sid.slice(0, 8),
      color: runColor,
      head: "",
      parentRunId,
    }
  }

  // ── 3. Build Steps — one per visible message ─────────────────────────────────

  const steps: Record<string, Step> = {}
  const stepOrder: string[] = []
  const lastStepInSession: Record<string, string> = {}

  for (const { info, parts } of visibleMessages) {
    const sid = info.sessionID
    const runId = sessionToRunId[sid]
    const isUser = info.role === "user"
    const stepId = info.id

    // Parent link: previous message in this session, or last message of parent session
    let parentStepIds: string[] = []
    const prev = lastStepInSession[sid]
    if (prev) {
      parentStepIds = [prev]
    } else {
      const parentSid = sessionParentMap[sid]
      if (parentSid) {
        const parentLast = lastStepInSession[parentSid]
        if (parentLast) parentStepIds = [parentLast]
      }
    }

    // Extract a short content preview
    const firstText = parts.find((p): p is TextPart => p.type === "text" && !(p as TextPart & { hidden?: boolean }).hidden)
    const content = isUser
      ? ((firstText as TextPart | undefined)?.text ?? "").slice(0, 80)
      : ((firstText as TextPart | undefined)?.text ?? "…").slice(0, 80)

    const run = runs[runId]
    const nodeColor = isUser
      ? getAgentColor(userColor).hex
      : run?.color ?? getAgentColor(undefined).hex

    const step: Step = {
      id: stepId,
      parents: parentStepIds,
      type: isUser ? "user" : "assistant",
      content,
      author: isUser ? undefined : (info as { agent?: string }).agent,
      timestamp: new Date(info.time.created).toISOString(),
      runId,
      labels: [],
      typeColor: nodeColor,
    }

    steps[stepId] = step
    stepOrder.push(stepId)
    lastStepInSession[sid] = stepId
    runs[runId] = { ...runs[runId], head: stepId }
  }

  // Remove empty runs
  for (const runId of Object.keys(runs)) {
    if (!runs[runId].head) delete runs[runId]
  }

  const cursor = sessionToRunId[selectedSessionId] ?? Object.keys(runs)[0] ?? "run-main"

  return { steps, runs, cursor, stepOrder }
}
