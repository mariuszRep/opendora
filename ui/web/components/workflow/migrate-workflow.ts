import type { Workflow } from '@/lib/opendora'
import type { WorkflowNodeData, NodeType, ParameterSchema } from '@/components/react-flow/unified-node'

const LEGACY_TYPES = new Set(['input', 'skill_load', 'tool_call', 'agent', 'decide', 'output', 'stage', 'action'])

export function needsMigration(workflow: Workflow): boolean {
  return workflow.nodes.some((n) => LEGACY_TYPES.has(n.type))
}

function labelFromId(id: string): string {
  return id
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function migrateNode(node: Workflow['nodes'][number]): Workflow['nodes'][number] {
  const d = node.data as Record<string, unknown>

  let nodeType: NodeType
  let label: string
  let description: string | undefined
  let action_id: string | undefined
  let parameters: Record<string, unknown> | undefined
  let inputs: ParameterSchema[] = []
  let instructions: string | undefined

  switch (node.type) {
    case 'input': {
      nodeType = 'start'
      label = 'Start'
      description = 'Workflow entry point'
      const fields = (d.fields as Array<{ name: string; type: string; required?: boolean; description?: string }> | undefined) ?? []
      inputs = fields.map((f) => ({
        name: f.name,
        type: (f.type ?? 'string') as ParameterSchema['type'],
        required: f.required ?? true,
        description: f.description,
      }))
      break
    }

    case 'agent': {
      nodeType = 'tool'
      label = labelFromId(node.id)
      action_id = 'agent'
      description = typeof d.prompt === 'string' ? d.prompt.slice(0, 120) : undefined
      instructions = typeof d.prompt === 'string' ? d.prompt : undefined
      break
    }

    case 'decide': {
      nodeType = 'tool'
      label = labelFromId(node.id)
      action_id = 'decide'
      const branches = (d.branches as string[] | undefined) ?? []
      description = typeof d.prompt === 'string'
        ? `${d.prompt.slice(0, 80)}${branches.length ? ` [${branches.join(', ')}]` : ''}`
        : undefined
      instructions = typeof d.prompt === 'string' ? d.prompt : undefined
      break
    }

    case 'skill_load': {
      nodeType = 'tool'
      const skill = String(d.skill ?? node.id)
      label = labelFromId(skill)
      action_id = skill
      description = d.storeAs ? `Load skill "${skill}" → $ctx.${d.storeAs}` : `Load skill "${skill}"`
      break
    }

    case 'tool_call': {
      nodeType = 'tool'
      const tool = String(d.tool ?? node.id)
      label = labelFromId(tool)
      action_id = tool
      description = d.output ? `→ $ctx.${d.output}` : undefined
      parameters = (d.args as Record<string, unknown> | undefined) ?? {}
      break
    }

    case 'output': {
      nodeType = 'tool'
      label = 'Output'
      action_id = 'output'
      description = typeof d.message === 'string' ? d.message : undefined
      break
    }

    // Already new format but with old nodeType values
    case 'workflow': {
      const existingNodeType = d.nodeType as string | undefined
      if (existingNodeType === 'stage' || existingNodeType === 'action') {
        const newData: WorkflowNodeData = {
          ...(d as WorkflowNodeData),
          nodeType: existingNodeType === 'stage' ? 'tool' : 'tool',
        }
        return { ...node, data: newData as Record<string, unknown> }
      }
      return node
    }

    default:
      return node
  }

  const newData: WorkflowNodeData = {
    nodeType,
    node: {
      label,
      description,
      action_id,
      parameters,
    },
    data: { inputs, outputs: [] },
    ...(instructions ? { instructions } : {}),
  }

  return {
    id: node.id,
    type: 'workflow',
    position: node.position,
    data: newData as Record<string, unknown>,
  }
}

export function migrateWorkflow(workflow: Workflow): Workflow {
  if (!needsMigration(workflow)) return workflow
  return {
    ...workflow,
    nodes: workflow.nodes.map(migrateNode) as Workflow['nodes'],
  }
}
