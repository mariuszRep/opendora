// ─── Node Type Registry (UI Layer) ───────────────────────────────────────────
// Bridges canonical definitions from @opendora/workflow to UI-specific rendering.
// Icon mapping: lucide icon name strings → React components.

import {
  NodeTypeId,
  NodeRegistry,
  type NodeDefinition,
  type NodeHandleDefinition,
  type NodeConstraints,
} from "@opendora/workflow/node-registry"
import type { WorkflowNodePayload } from "@opendora/workflow/node-types"
import {
  Braces,
  FolderOpen,
  GitBranch,
  Layers,
  MessageSquare,
  Play,
  Repeat,
  Settings2,
  SlidersHorizontal,
  Wrench,
  type LucideIcon,
} from "lucide-react"
import type { NodeType, WorkflowNodeData } from "./unified-node"

// ─── Icon Name → Lucide Component Mapping ────────────────────────────────────
// Canonical definitions reference icons by string name; this mapping resolves
// them to actual React components for rendering.
const ICON_MAP: Record<string, LucideIcon> = {
  Braces,
  FolderOpen,
  GitBranch,
  Layers,
  MessageSquare,
  Play,
  Repeat,
  Settings2,
  SlidersHorizontal,
  Wrench,
}

function resolveIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] ?? Wrench
}

// ─── UI-Specific Metadata Enrichment ─────────────────────────────────────────
// Extends canonical definitions with UI-specific info (React icon component,
// defaultNodeData shape expected by existing code).

export interface NodeTypeMetadata {
  type: NodeType
  label: string
  description: string
  icon: LucideIcon
  /** @deprecated Will be migrated to canonical defaultConfig */
  defaultNodeData: {
    node: { label: string; description: string; parameters?: Record<string, unknown> }
    data: { inputs: unknown[]; outputs: unknown[] }
    workflowParameters?: unknown[]
  }
}

function buildDefaultNodeData(def: NodeDefinition): NodeTypeMetadata["defaultNodeData"] {
  const config = def.defaultConfig as Partial<WorkflowNodePayload> | undefined
  return {
    node: {
      label: config?.node?.label ?? def.name,
      description: config?.node?.description ?? "",
      parameters: config?.node?.parameters,
    },
    data: {
      inputs: config?.data?.inputs ?? [],
      outputs: config?.data?.outputs ?? [],
    },
    workflowParameters: config?.workflowParameters,
  }
}

// ─── Registry ────────────────────────────────────────────────────────────────

function buildRegistry(): Record<NodeType, NodeTypeMetadata> {
  const definitions = NodeRegistry.getAll()
  const registry = {} as Record<NodeType, NodeTypeMetadata>

  for (const def of definitions) {
    registry[def.type as NodeType] = {
      type: def.type as NodeType,
      label: def.name,
      description: def.description,
      icon: resolveIcon(def.icon),
      defaultNodeData: buildDefaultNodeData(def),
    }
  }

  return registry
}

/** UI-optimized node type registry. Derived from canonical definitions. */
export const NODE_TYPE_REGISTRY: Record<NodeType, NodeTypeMetadata> = buildRegistry()

export function getNodeTypeMetadata(type: NodeType): NodeTypeMetadata {
  return NODE_TYPE_REGISTRY[type] ?? NODE_TYPE_REGISTRY[NodeTypeId.Tool as NodeType]
}

export function getAllNodeTypes(): NodeTypeMetadata[] {
  return Object.values(NODE_TYPE_REGISTRY)
}

export function getDefaultNodeData(type: NodeType) {
  return NODE_TYPE_REGISTRY[type]?.defaultNodeData ?? NODE_TYPE_REGISTRY[NodeTypeId.Tool as NodeType].defaultNodeData
}

// Re-export canonical types and helpers for convenient access from UI code
export { NodeRegistry, NodeTypeId } from "@opendora/workflow/node-registry"
export type { NodeDefinition, NodeHandleDefinition, NodeConstraints } from "@opendora/workflow/node-registry"
