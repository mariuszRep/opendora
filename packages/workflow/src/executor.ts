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
) => Promise<{ output: string; metadata?: Record<string, unknown>; finalArgs: Record<string, unknown> }>

let _toolExecutor: ToolExecutor | null = null

export function registerToolExecutor(executor: ToolExecutor) {
  _toolExecutor = executor
}

export function getToolExecutor(): ToolExecutor {
  if (!_toolExecutor) throw new Error("No tool executor registered — call registerToolExecutor() at startup")
  return _toolExecutor
}
