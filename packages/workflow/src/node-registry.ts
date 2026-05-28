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
            { nodeType: NodeTypeId.Parameters, handleId: null, maxConnections: 1 },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
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
            { nodeType: NodeTypeId.Parameters, handleId: null, maxConnections: 1 },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
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
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
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
            { nodeType: NodeTypeId.Parameters, handleId: null, maxConnections: 1 },
            { nodeType: NodeTypeId.Decide, handleId: null, maxConnections: "unlimited" },
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
