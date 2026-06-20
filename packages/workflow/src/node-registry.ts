// ─── Node Registry ────────────────────────────────────────────────────────────
// Singleton registry for canonical workflow node definitions.
// Consumers register node types at startup; built-in types are pre-registered.

import {
  NodeTypeId,
  NodeCategory,
  type NodeDefinition,
  type NodeHandleDefinition,
  type NodeConstraints,
  type HandleConnectionRule,
  type EdgeLimit,
  type HandlePosition,
  type HandleType,
} from "./node-types"

// ─── Built-in handle configurations ──────────────────────────────────────────

const BUILTIN_HANDLES: Record<NodeTypeId, { handles: NodeHandleDefinition[]; constraints: NodeConstraints }> = {
  [NodeTypeId.Tool]: {
    handles: [
      {
        id: null,
        position: "top",
        type: "target",
        connections: {
          canReceiveFrom: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Structured, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Parameters, handleId: null, maxConnections: 1 },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ConfigureSession, handleId: null, maxConnections: "unlimited" },
          ],
        },
      },
      {
        id: null,
        position: "bottom",
        type: "source",
        connections: {
          canConnectTo: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Structured, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ConfigureSession, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Output, handleId: null, maxConnections: 1 },
          ],
        },
      },
    ],
    constraints: {
      allowedInboundEdges: "unlimited",
      allowedOutboundEdges: "unlimited",
      hiddenFields: [],
      requiredFields: ["label"],
      exposedFields: ["action_id", "parameters"],
    },
  },

  [NodeTypeId.Prompt]: {
    handles: [
      {
        id: null,
        position: "top",
        type: "target",
        connections: {
          canReceiveFrom: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Structured, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Parameters, handleId: null, maxConnections: 1 },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ConfigureSession, handleId: null, maxConnections: "unlimited" },
          ],
        },
      },
      {
        id: null,
        position: "bottom",
        type: "source",
        connections: {
          canConnectTo: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Structured, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ConfigureSession, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Output, handleId: null, maxConnections: 1 },
          ],
        },
      },
    ],
    constraints: {
      allowedInboundEdges: "unlimited",
      allowedOutboundEdges: "unlimited",
      hiddenFields: [],
      requiredFields: ["label"],
      exposedFields: ["instructions", "parameters"],
    },
  },

  [NodeTypeId.Structured]: {
    handles: [
      {
        id: null,
        position: "top",
        type: "target",
        connections: {
          canReceiveFrom: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Structured, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Parameters, handleId: null, maxConnections: 1 },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ConfigureSession, handleId: null, maxConnections: "unlimited" },
          ],
        },
      },
      {
        id: null,
        position: "bottom",
        type: "source",
        connections: {
          canConnectTo: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Structured, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ConfigureSession, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Output, handleId: null, maxConnections: 1 },
          ],
        },
      },
    ],
    constraints: {
      allowedInboundEdges: "unlimited",
      allowedOutboundEdges: "unlimited",
      hiddenFields: [],
      requiredFields: ["label"],
      exposedFields: ["instructions", "outputSchema"],
    },
  },

  [NodeTypeId.Parameters]: {
    handles: [
      {
        id: null,
        position: "bottom",
        type: "source",
        connections: {
          canConnectTo: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Structured, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.SetWorkdir, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ConfigureSession, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Output, handleId: null, maxConnections: 1 },
          ],
        },
      },
    ],
    constraints: {
      allowedInboundEdges: 0,
      allowedOutboundEdges: "unlimited",
      hiddenFields: [],
      requiredFields: ["label"],
      exposedFields: ["workflowParameters"],
    },
  },

  [NodeTypeId.Decide]: {
    handles: [
      {
        id: null,
        position: "top",
        type: "target",
        connections: {
          canReceiveFrom: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Structured, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Parameters, handleId: null, maxConnections: 1 },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ConfigureSession, handleId: null, maxConnections: "unlimited" },
          ],
        },
      },
      {
        id: null,
        position: "bottom",
        type: "source",
        connections: {
          canConnectTo: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Structured, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ConfigureSession, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Output, handleId: null, maxConnections: 1 },
          ],
        },
      },
    ],
    constraints: {
      allowedInboundEdges: "unlimited",
      allowedOutboundEdges: "unlimited",
      hiddenFields: [],
      requiredFields: ["label"],
      exposedFields: ["parameters"],
    },
  },

  [NodeTypeId.SetWorkdir]: {
    handles: [
      {
        id: null,
        position: "top",
        type: "target",
        connections: {
          canReceiveFrom: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Parameters, handleId: null, maxConnections: 1 },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.SetWorkdir, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ConfigureSession, handleId: null, maxConnections: "unlimited" },
          ],
        },
      },
      {
        id: null,
        position: "bottom",
        type: "source",
        connections: {
          canConnectTo: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.SetWorkdir, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ConfigureSession, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Output, handleId: null, maxConnections: 1 },
          ],
        },
      },
    ],
    constraints: {
      allowedInboundEdges: "unlimited",
      allowedOutboundEdges: "unlimited",
      hiddenFields: [],
      requiredFields: ["label"],
      exposedFields: ["path"],
    },
  },

  [NodeTypeId.ForEach]: {
    handles: [
      {
        id: null,
        position: "top",
        type: "target",
        connections: {
          canReceiveFrom: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Structured, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Parameters, handleId: null, maxConnections: 1 },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.SetWorkdir, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ConfigureSession, handleId: null, maxConnections: "unlimited" },
          ],
        },
      },
      {
        id: null,
        position: "bottom",
        type: "source",
        connections: {
          canConnectTo: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Structured, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.SetWorkdir, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Output, handleId: null, maxConnections: 1 },
          ],
        },
      },
    ],
    constraints: {
      allowedInboundEdges: "unlimited",
      allowedOutboundEdges: "unlimited",
      hiddenFields: [],
      requiredFields: ["label"],
      exposedFields: ["parameters", "subWorkflow"],
    },
  },

  [NodeTypeId.RunWorkflow]: {
    handles: [
      {
        id: null,
        position: "top",
        type: "target",
        connections: {
          canReceiveFrom: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Structured, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Parameters, handleId: null, maxConnections: 1 },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.SetWorkdir, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ConfigureSession, handleId: null, maxConnections: "unlimited" },
          ],
        },
      },
      {
        id: null,
        position: "bottom",
        type: "source",
        connections: {
          canConnectTo: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Structured, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.SetWorkdir, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ConfigureSession, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Output, handleId: null, maxConnections: 1 },
          ],
        },
      },
    ],
    constraints: {
      allowedInboundEdges: "unlimited",
      allowedOutboundEdges: "unlimited",
      hiddenFields: [],
      requiredFields: ["label"],
      exposedFields: ["parameters"],
    },
  },

  [NodeTypeId.ConfigureSession]: {
    handles: [
      {
        id: null,
        position: "top",
        type: "target",
        connections: {
          canReceiveFrom: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Structured, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Parameters, handleId: null, maxConnections: 1 },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.SetWorkdir, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ConfigureSession, handleId: null, maxConnections: "unlimited" },
          ],
        },
      },
      {
        id: null,
        position: "bottom",
        type: "source",
        connections: {
          canConnectTo: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Structured, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.SetWorkdir, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ConfigureSession, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Output, handleId: null, maxConnections: 1 },
          ],
        },
      },
    ],
    constraints: {
      allowedInboundEdges: "unlimited",
      allowedOutboundEdges: "unlimited",
      hiddenFields: [],
      requiredFields: ["label"],
      exposedFields: ["parameters"],
    },
  },

  [NodeTypeId.Output]: {
    handles: [
      {
        id: null,
        position: "top",
        type: "target",
        connections: {
          canReceiveFrom: [
            { nodeType: NodeTypeId.Tool, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Prompt, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Structured, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.Parameters, handleId: null, maxConnections: 1 },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.SetWorkdir, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ForEach, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.RunWorkflow, handleId: null, maxConnections: "unlimited" },
            { nodeType: NodeTypeId.ConfigureSession, handleId: null, maxConnections: "unlimited" },
          ],
        },
      },
      // No source handle — Output is a terminal node.
    ],
    constraints: {
      allowedInboundEdges: "unlimited",
      allowedOutboundEdges: 0,
      hiddenFields: [],
      requiredFields: ["label"],
      exposedFields: ["fields"],
    },
  },
}

// ─── Built-in node definitions ────────────────────────────────────────────────

const BUILTIN_DEFINITIONS: NodeDefinition[] = [
  {
    type: NodeTypeId.Tool,
    name: "Tool",
    description: "Run any tool",
    icon: "Wrench",
    category: NodeCategory.Core,
    defaultConfig: {
      node: { label: "Tool", description: "" },
      data: { inputs: [], outputs: [] },
    },
    version: "1.0.0",
    tags: ["tool", "action", "execute"],
    uiHints: {
      handles: BUILTIN_HANDLES[NodeTypeId.Tool].handles,
      constraints: BUILTIN_HANDLES[NodeTypeId.Tool].constraints,
    },
  },
  {
    type: NodeTypeId.Prompt,
    name: "Prompt",
    description: "Send a message to the agent and capture the response",
    icon: "MessageSquare",
    category: NodeCategory.Core,
    defaultConfig: {
      node: { label: "Prompt", description: "" },
      data: { inputs: [], outputs: [] },
    },
    version: "1.0.0",
    tags: ["prompt", "agent", "llm"],
    uiHints: {
      handles: BUILTIN_HANDLES[NodeTypeId.Prompt].handles,
      constraints: BUILTIN_HANDLES[NodeTypeId.Prompt].constraints,
    },
  },
  {
    type: NodeTypeId.Parameters,
    name: "Parameters",
    description: "Define workflow input parameters visible to triggers and the LLM",
    icon: "SlidersHorizontal",
    category: NodeCategory.Data,
    defaultConfig: {
      node: { label: "Parameters", description: "" },
      data: { inputs: [], outputs: [] },
      workflowParameters: [],
    },
    version: "1.0.0",
    tags: ["parameters", "input", "config"],
    uiHints: {
      handles: BUILTIN_HANDLES[NodeTypeId.Parameters].handles,
      constraints: BUILTIN_HANDLES[NodeTypeId.Parameters].constraints,
    },
  },
  {
    type: NodeTypeId.Structured,
    name: "Structured",
    description: "Prompt the agent to return a validated JSON object matching a defined schema",
    icon: "Braces",
    category: NodeCategory.Core,
    defaultConfig: {
      node: { label: "Structured", description: "" },
      data: { inputs: [], outputs: [] },
      outputSchema: { type: "object", properties: {} },
    },
    version: "1.0.0",
    tags: ["structured", "json", "schema", "output"],
    uiHints: {
      handles: BUILTIN_HANDLES[NodeTypeId.Structured].handles,
      constraints: BUILTIN_HANDLES[NodeTypeId.Structured].constraints,
    },
  },
  {
    type: NodeTypeId.Decide,
    name: "Decide",
    description: "Route execution to different branches based on agent decision or a condition",
    icon: "GitBranch",
    category: NodeCategory.Flow,
    defaultConfig: {
      node: { label: "Decide", description: "", parameters: { mode: "agent", cases: [], output: "" } },
      data: { inputs: [], outputs: [] },
    },
    version: "1.0.0",
    tags: ["decide", "branch", "condition", "flow"],
    uiHints: {
      handles: BUILTIN_HANDLES[NodeTypeId.Decide].handles,
      constraints: BUILTIN_HANDLES[NodeTypeId.Decide].constraints,
    },
  },
  {
    type: NodeTypeId.SetWorkdir,
    name: "Set Working Directory",
    description: "Update the active working directory for all subsequent nodes in this workflow",
    icon: "FolderOpen",
    category: NodeCategory.Data,
    defaultConfig: {
      node: { label: "Set Working Directory", description: "", parameters: { path: "" } },
      data: { inputs: [], outputs: [] },
    },
    version: "1.0.0",
    tags: ["workdir", "directory", "path", "context"],
    uiHints: {
      handles: BUILTIN_HANDLES[NodeTypeId.SetWorkdir].handles,
      constraints: BUILTIN_HANDLES[NodeTypeId.SetWorkdir].constraints,
    },
  },
  {
    type: NodeTypeId.ForEach,
    name: "For Each",
    description: "Iterate over an array and run an embedded sub-pipeline for each item",
    icon: "Repeat",
    category: NodeCategory.Flow,
    defaultConfig: {
      node: {
        label: "For Each",
        description: "",
        parameters: { items: "", item_variable: "item", collect: "", output: "results" },
      },
      data: { inputs: [], outputs: [] },
      subWorkflow: { nodes: [], edges: [] },
    },
    version: "1.0.0",
    tags: ["foreach", "loop", "iterate", "array", "collection", "map"],
    uiHints: {
      handles: BUILTIN_HANDLES[NodeTypeId.ForEach].handles,
      constraints: BUILTIN_HANDLES[NodeTypeId.ForEach].constraints,
    },
  },
  {
    type: NodeTypeId.RunWorkflow,
    name: "Run Workflow",
    description: "Execute another workflow by ID, passing context, and wait for its result",
    icon: "Play",
    category: NodeCategory.Integration,
    defaultConfig: {
      node: {
        label: "Run Workflow",
        description: "",
        action_id: "workflow_run",
        parameters: { workflowId: "", input: "", wait: "true", output: "workflow_result" },
      },
      data: { inputs: [], outputs: [] },
    },
    version: "1.0.0",
    tags: ["workflow", "run", "execute", "delegate", "sub-workflow", "call"],
    uiHints: {
      handles: BUILTIN_HANDLES[NodeTypeId.RunWorkflow].handles,
      constraints: BUILTIN_HANDLES[NodeTypeId.RunWorkflow].constraints,
    },
  },
  {
    type: NodeTypeId.ConfigureSession,
    name: "Configure Session",
    description: "Patch session parameters (model, agent, working directory, paths, title, system prompt) from this point forward in the workflow",
    icon: "Settings2",
    category: NodeCategory.Data,
    defaultConfig: {
      node: { label: "Configure Session", description: "", parameters: {} },
      data: { inputs: [], outputs: [] },
    },
    version: "1.0.0",
    tags: ["session", "configure", "model", "agent", "workdir", "path", "context"],
    uiHints: {
      handles: BUILTIN_HANDLES[NodeTypeId.ConfigureSession].handles,
      constraints: BUILTIN_HANDLES[NodeTypeId.ConfigureSession].constraints,
    },
  },
  {
    type: NodeTypeId.Output,
    name: "Output",
    description: "Declare the return value of this workflow. Fields are resolved from context and returned as { status, result } when workflow_run is called with wait: true.",
    icon: "CornerDownRight",
    category: NodeCategory.Data,
    defaultConfig: {
      node: { label: "Output", description: "", parameters: { fields: {} } },
      data: { inputs: [], outputs: [] },
    },
    version: "1.0.0",
    tags: ["output", "return", "result", "summary", "terminal"],
    uiHints: {
      handles: BUILTIN_HANDLES[NodeTypeId.Output].handles,
      constraints: BUILTIN_HANDLES[NodeTypeId.Output].constraints,
    },
  },
]

// ─── Registry ─────────────────────────────────────────────────────────────────

class NodeRegistryImpl {
  private definitions = new Map<NodeTypeId, NodeDefinition>()

  constructor() {
    // Pre-register built-in types
    for (const def of BUILTIN_DEFINITIONS) {
      this.definitions.set(def.type, def)
    }
  }

  /** Register a new node type definition. Overwrites if type already exists. */
  register<T extends Record<string, unknown> = Record<string, unknown>>(
    def: NodeDefinition<T>,
  ): this {
    this.definitions.set(def.type, def as NodeDefinition)
    return this
  }

  /** Get a definition by node type ID. Returns undefined for unknown types. */
  get(type: NodeTypeId): NodeDefinition | undefined {
    return this.definitions.get(type)
  }

  /** Get a definition by node type ID. Throws for unknown types. */
  getOrThrow(type: NodeTypeId): NodeDefinition {
    const def = this.definitions.get(type)
    if (!def) throw new Error(`Unknown node type: "${type}"`)
    return def
  }

  /** Get all registered definitions */
  getAll(): NodeDefinition[] {
    return Array.from(this.definitions.values())
  }

  /** Get default config for a node type, or partial fallback */
  getDefaultConfig(type: NodeTypeId): Record<string, unknown> {
    return this.definitions.get(type)?.defaultConfig ?? {}
  }

  /** Get UI hints for a node type (handles + constraints) */
  getUiHints(type: NodeTypeId): { handles: NodeHandleDefinition[]; constraints: NodeConstraints } | undefined {
    const def = this.definitions.get(type)
    if (!def?.uiHints) return undefined
    return {
      handles: def.uiHints.handles ?? [],
      constraints: def.uiHints.constraints ?? {
        allowedInboundEdges: "unlimited",
        allowedOutboundEdges: "unlimited",
        hiddenFields: [],
        requiredFields: [],
        exposedFields: [],
      },
    }
  }

  /** Get handle definitions for a node type */
  getHandles(type: NodeTypeId): NodeHandleDefinition[] {
    return this.getUiHints(type)?.handles ?? []
  }

  /** Get constraints for a node type */
  getConstraints(type: NodeTypeId): NodeConstraints {
    return this.getUiHints(type)?.constraints ?? {
      allowedInboundEdges: "unlimited",
      allowedOutboundEdges: "unlimited",
      hiddenFields: [],
      requiredFields: [],
      exposedFields: [],
    }
  }

  /** Check if a node type ID is known */
  has(type: string): type is NodeTypeId {
    return this.definitions.has(type as NodeTypeId)
  }

  /** List all registered type IDs */
  get types(): NodeTypeId[] {
    return Array.from(this.definitions.keys())
  }

  /** Clear all definitions (useful for testing) */
  clear(): void {
    this.definitions.clear()
  }

  /** Reload built-in definitions (useful after clear) */
  loadBuiltins(): void {
    for (const def of BUILTIN_DEFINITIONS) {
      this.definitions.set(def.type, def)
    }
  }
}

/** Singleton registry instance */
export const NodeRegistry = new NodeRegistryImpl()

// Re-export types and values for convenient single-import usage
export type {
  NodeDefinition,
  NodeHandleDefinition,
  NodeConstraints,
  HandleConnectionRule,
  EdgeLimit,
  HandlePosition,
  HandleType,
}
export { NodeTypeId, NodeCategory } from "./node-types"
