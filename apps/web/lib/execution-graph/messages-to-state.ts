import type { MessageWithParts, Edge, ToolPart, TextPart } from "@/lib/projectflows";
import { ExecutionState, Step, Run } from "@/lib/execution-graph/types";
import { RUN_COLORS, STEP_TYPE_COLORS } from "@/lib/execution-graph/engine";

/**
 * Converts OpenDora messages + graph edges into an ExecutionState for mini-graph rendering.
 *
 * Mapping rules:
 *  - Each message.Part becomes one Step node (reasoning + fallback-switch skipped)
 *  - ToolPart → "tool_call" step (input+output already combined in a single Part)
 *  - TextPart from user message → "user" step
 *  - TextPart from assistant message → "assistant" step
 *  - Each unique sessionID → one Run (lane)
 *  - Cross-session delegation is represented via parentRunId on the spawned Run
 */
export function messagesToExecutionState(
  messages: MessageWithParts[],
  _edges: Edge[],
  selectedSessionId: string
): ExecutionState {
  if (messages.length === 0) {
    return emptyState(selectedSessionId);
  }

  // ── 1. Collect session order and build Runs ──────────────────────────────

  // Walk messages in order to find session IDs and their delegation parentage.
  // A session "B" was spawned from session "A" when the first message in B has
  // parentSessionID === A's sessionID.
  const sessionOrder: string[] = [];
  const sessionParentMap: Record<string, string> = {}; // childSessionId → parentSessionId

  for (const { info } of messages) {
    const sid = info.sessionID;
    if (!sessionOrder.includes(sid)) {
      sessionOrder.push(sid);
    }
    const parentSid = info.parentSessionID;
    if (parentSid && !sessionParentMap[sid]) {
      sessionParentMap[sid] = parentSid;
    }
  }

  // Build runId ↔ sessionId maps
  const sessionToRunId: Record<string, string> = {};
  const runs: Record<string, Run> = {};

  for (let i = 0; i < sessionOrder.length; i++) {
    const sid = sessionOrder[i];
    const runId = `run-${sid}`;
    sessionToRunId[sid] = runId;

    const parentSid = sessionParentMap[sid];
    const parentRunId = parentSid ? sessionToRunId[parentSid] : undefined;

    runs[runId] = {
      id: runId,
      name: sid.slice(0, 8), // short label; panel doesn't show it
      color: RUN_COLORS[i % RUN_COLORS.length],
      head: "", // filled in as we build steps
      parentRunId,
    };
  }

  // ── 2. Build Steps from Parts ─────────────────────────────────────────────

  const steps: Record<string, Step> = {};
  const stepOrder: string[] = [];

  // Track the last step ID per session so we can chain parents within a lane.
  // Also track the parent session's last step when a new session is first seen.
  const lastStepInSession: Record<string, string> = {};

  for (const { info, parts } of messages) {
    const sid = info.sessionID;
    const runId = sessionToRunId[sid];
    const isUser = info.role === "user";
    const author = isUser
      ? undefined
      : (info as { agent?: string }).agent ?? (info as { from?: { id?: string } }).from?.id;

    const timestamp = new Date(info.time.created).toISOString();

    for (const part of parts) {
      // Skip informational parts that don't map to conversation nodes
      if (part.type === "reasoning" || part.type === "fallback-switch") continue;

      const stepId = part.id;

      // Determine parent: either previous step in this session, or the last step of
      // the parent session when this is the first step in a delegated session.
      let parentStepIds: string[] = [];
      const prevInSession = lastStepInSession[sid];

      if (prevInSession) {
        parentStepIds = [prevInSession];
      } else {
        // First step in this session — link to last step of parent session
        const parentSid = sessionParentMap[sid];
        if (parentSid) {
          const parentLast = lastStepInSession[parentSid];
          if (parentLast) parentStepIds = [parentLast];
        }
      }

      let stepType: Step["type"];
      let content: string;
      let nodeName: string | undefined;

      if (part.type === "tool") {
        const toolPart = part as ToolPart;
        stepType = "tool_call";
        nodeName = toolPart.tool;
        content = toolPart.tool;
      } else if (part.type === "text") {
        const textPart = part as TextPart;
        stepType = isUser ? "user" : "assistant";
        content = (textPart.text ?? "").slice(0, 80);
      } else {
        stepType = "generic";
        content = String(part.type);
      }

      const typeColor = STEP_TYPE_COLORS[stepType];

      const step: Step = {
        id: stepId,
        parents: parentStepIds,
        type: stepType,
        content,
        nodeName,
        author,
        timestamp,
        runId,
        labels: [],
        typeColor,
      };

      steps[stepId] = step;
      stepOrder.push(stepId);
      lastStepInSession[sid] = stepId;

      // Keep the run's head pointing at the latest step
      runs[runId] = { ...runs[runId], head: stepId };
    }
  }

  // Remove runs that ended up with no steps (head still empty)
  for (const runId of Object.keys(runs)) {
    if (!runs[runId].head) delete runs[runId];
  }

  // ── 3. Set cursor to the selected session's run ───────────────────────────

  const cursor = sessionToRunId[selectedSessionId] ?? Object.keys(runs)[0] ?? "run-main";

  return { steps, runs, cursor, stepOrder };
}

function emptyState(selectedSessionId: string): ExecutionState {
  const runId = `run-${selectedSessionId}`;
  const rootId = `root-${selectedSessionId}`;
  const root: Step = {
    id: rootId,
    parents: [],
    type: "generic",
    content: "Start",
    timestamp: new Date().toISOString(),
    runId,
    labels: [],
  };
  return {
    steps: { [rootId]: root },
    runs: { [runId]: { id: runId, name: "main", color: RUN_COLORS[0], head: rootId } },
    cursor: runId,
    stepOrder: [rootId],
  };
}
