import z from "zod"
import { Tool } from "../tool.ts"
import { NodeRegistry, NodeTypeId } from "@projectflows/workflow/node-registry"
import toolDef from "./workflow-node-catalog.json"

const TOOL_NODE_NOTE =
  "action_id may be any tool returned by tool_list/tool_get — call those to discover available actions and their schemas."

export const WorkflowNodeCatalogTool = Tool.define("workflow_node_catalog", async () => {
  const parameters = z.object({
    type: z
      .enum(Object.values(NodeTypeId) as [string, ...string[]])
      .optional()
      .describe("Limit the catalog to a single node type ID (e.g. \"tool\", \"for_each\"). Omit to list all node types."),
  })

  return {
    description: toolDef.description,
    parameters,
    async execute(params: z.infer<typeof parameters>) {
      const defs = params.type
        ? [NodeRegistry.getOrThrow(params.type as NodeTypeId)]
        : NodeRegistry.getAll()

      const sections = defs.map((def) => {
        const constraints = def.uiHints?.constraints
        const lines = [
          `type: ${def.type}`,
          `name: ${def.name}`,
          `category: ${def.category}`,
          `description: ${def.description}`,
          `tags: ${def.tags?.join(", ") || "none"}`,
          `required fields: ${constraints?.requiredFields?.join(", ") || "none"}`,
          `allowed inbound edges: ${constraints?.allowedInboundEdges ?? "unlimited"}`,
          `allowed outbound edges: ${constraints?.allowedOutboundEdges ?? "unlimited"}`,
          `default config:`,
          JSON.stringify(def.defaultConfig ?? {}, null, 2),
        ]
        if (def.type === NodeTypeId.Tool) lines.push(`note: ${TOOL_NODE_NOTE}`)
        return lines.join("\n")
      })

      return {
        title: params.type ? `Node type: ${params.type}` : `Workflow node types (${defs.length})`,
        metadata: { count: defs.length, types: defs.map((d) => d.type) },
        output: sections.join("\n\n"),
      }
    },
  }
})
