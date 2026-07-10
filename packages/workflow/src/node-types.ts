// ─── Canonical Node Type Definitions ─────────────────────────────────────────
// Central source of truth for workflow node types.
// All UI surfaces (canvas, side panel, node form) and backend consumers
// must derive from these definitions.

// ─── Node Type Identifiers ───────────────────────────────────────────────────

export const NodeTypeId = {
  Tool: "tool",
  Prompt: "prompt",
  Structured: "structured",
  Parameters: "parameters",
  Decide: "decide",
  SetWorkdir: "set_workdir",
  ForEach: "for_each",
  RunWorkflow: "run_workflow",
  ConfigureSession: "configure_session",
  Output: "output",
  Variable: "variable",
} as const

export type NodeTypeId = (typeof NodeTypeId)[keyof typeof NodeTypeId]

// ─── Categories for UI organization ──────────────────────────────────────────

export const NodeCategory = {
  Core: "core",
  Flow: "flow",
  Data: "data",
  Integration: "integration",
} as const

export type NodeCategory = (typeof NodeCategory)[keyof typeof NodeCategory]

// ─── Handle Definitions (used by react-flow canvas) ──────────────────────────

export type HandlePosition = "top" | "bottom" | "left" | "right"
export type HandleType = "source" | "target"
export type EdgeLimit = number | "unlimited"

export interface HandleConnectionRule {
  nodeType: NodeTypeId
  handleId: string | null
  maxConnections: EdgeLimit
}

export interface NodeHandleDefinition {
  id: string | null
  position: HandlePosition
  type: HandleType
  connections?: {
    canConnectTo?: HandleConnectionRule[]
    canReceiveFrom?: HandleConnectionRule[]
  }
}

export interface NodeConstraints {
  allowedInboundEdges: EdgeLimit
  allowedOutboundEdges: EdgeLimit
  hiddenFields: string[]
  requiredFields: string[]
  exposedFields: string[]
}

// ─── Core Node Definition ────────────────────────────────────────────────────

/**
 * Canonical definition for a workflow node type.
 * The `uiHints` field carries UI-specific rendering hints so surfaces
 * can render bespoke UIs while sharing the same definition source.
 */
export interface NodeDefinition<
  TDefaultConfig extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Stable node type identifier — never changes once assigned */
  type: NodeTypeId

  /** Human-readable display name */
  name: string

  /** Short description shown in palette, tooltips, and documentation */
  description: string

  /** Icon identifier (lucide icon name) for UI rendering */
  icon: string

  /** Functional category for grouping in palettes and menus */
  category: NodeCategory

  // ── Optional Extensible Fields ──────────────────────────────────────────

  /** JSON Schema for input parameters */
  configSchema?: Record<string, unknown>

  /** Default configuration values for new nodes of this type */
  defaultConfig?: TDefaultConfig

  /** Runtime validation function */
  validation?: (config: TDefaultConfig) => { valid: boolean; errors?: string[] }

  /** Capability flags (e.g. "streaming", "approval", "deterministic") */
  capabilities?: string[]

  /** Search/tag keywords */
  tags?: string[]

  /** Semantic version of this definition (for migration tracking) */
  version?: string

  /** UI rendering hints — allows bespoke rendering while sharing definitions */
  uiHints?: {
    defaultWidth?: number
    defaultHeight?: number
    color?: string
    handles?: NodeHandleDefinition[]
    constraints?: NodeConstraints
  }
}

// ─── Helper type for UI node data payloads ───────────────────────────────────

/**
 * The runtime shape carried inside workflow node `data` fields.
 * UI and runner both reference this shape.
 */
/** Model reference used on workflow nodes to override the active model. */
export interface WorkflowNodeModel {
  providerID: string
  modelID: string
}

/**
 * Session parameters that a ConfigureSession node can patch.
 * All fields are optional — only the ones present are applied.
 */
export interface SessionConfigParams {
  /** Override the active model for this session from this point forward. Omit to keep the current model. */
  model?: WorkflowNodeModel
  /** Change the working directory (same as SetWorkdir). */
  cwd?: string
  /** Update the session title. */
  title?: string
  /** Assign a different agent to this session. */
  agentID?: string
  /** Set or replace the session-level system prompt boundary. */
  systemPrompt?: string
  /** Set the write-boundary path enforced by the session. */
  path?: string
  /** Set the read-boundary path for the session. */
  readPath?: string
}

export interface WorkflowNodePayload {
  nodeType?: NodeTypeId
  node: {
    label: string
    /** Stable machine-readable key auto-generated from the label at creation time.
     *  Used as the ctx key for this node's output: reference via $key or $key.field. */
    key?: string
    name?: string
    description?: string
    execution_mode?: "automatic" | "manual"
    execution_mode_override?: "automatic" | "manual"
    status?: "draft" | "published" | "archived"
    action_id?: string
    parameters?: Record<string, unknown>
  }
  data: {
    inputs: unknown[]
    outputs: unknown[]
  }
  /** Optional model override for Prompt/Structured nodes (ephemeral — affects this node only). */
  model?: WorkflowNodeModel
  instructions?: string
  agentArgs?: string[]
  /** For Prompt nodes: force the model to call a tool ("required") or disable tool calls ("none"). Defaults to "auto". */
  promptToolChoice?: "auto" | "required" | "none"
  workflowParameters?: unknown[]
  conditions?: unknown[]
  annotations?: Record<string, unknown>
  output_field_selection?: unknown[]
  input_mapping?: unknown[]
  [key: string]: unknown
}
