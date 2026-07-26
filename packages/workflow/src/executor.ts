export type WorkflowMeta = {
  workflowID: string
  workflowRunID: string
  nodeID?: string
  nodeType?: string
  nodeLabel?: string
  attempt?: number
}

export type WorkflowToolContext = {
  sessionID: string
  /** Effective workflow directory at this node; updated by Set Working Directory. */
  directory?: string
  agent?: string
  model?: { providerID: string; modelID: string }
  abort?: AbortSignal
  messageID?: string
  partID?: string
  /** Node-level instructions telling the agent what to derive and why. */
  instructions?: string
  /** Serialized prior node outputs available as workflow context. */
  workflowContext?: Record<string, unknown>
  /** Node-as-Tool lifecycle tag, threaded through when the executor drives a real agent turn. */
  workflowMeta?: WorkflowMeta
}

export type ToolExecutor = (
  toolId: string,
  fixedArgs: Record<string, unknown>,
  agentArgs: string[],
  ctx: WorkflowToolContext,
) => Promise<{
  output: string
  metadata?: Record<string, unknown>
  finalArgs: Record<string, unknown>
  /** Structured payload from the tool's execute(), when it provides one — see packages/tools/tool.ts Tool.Info. */
  outputObject?: unknown
}>

let _toolExecutor: ToolExecutor | null = null

export function registerToolExecutor(executor: ToolExecutor) {
  _toolExecutor = executor
}

export function getToolExecutor(): ToolExecutor {
  if (!_toolExecutor) throw new Error("No tool executor registered — call registerToolExecutor() at startup")
  return _toolExecutor
}

// ─── Node approval gateway ─────────────────────────────────────────────────────
// Injected the same way as ToolExecutor above, so packages/workflow stays free of a direct
// dependency on packages/permission/packages/runtime. Resolves = the user approved (or an
// existing rule already covers it); throws = denied. Nullable: when no gate is registered
// (e.g. in unit tests), approval is a no-op and the node runs normally.

export type ApprovalRequest = {
  sessionID: string
  workflowID: string
  workflowRunID: string
  nodeID: string
  nodeKey?: string
  nodeLabel: string
  nodeType: string
}

export type ApprovalGate = (req: ApprovalRequest) => Promise<void>

let _approvalGate: ApprovalGate | null = null

export function registerApprovalGate(gate: ApprovalGate) {
  _approvalGate = gate
}

export function getApprovalGate(): ApprovalGate | null {
  return _approvalGate
}
