import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import { WorkflowStorage } from "@opendora/workflow/storage"
import toolDef from "./workflow-list.json"

export const WorkflowListTool = Tool.define("workflow_list", async () => {
  const parameters = z.object({})

  return {
    description: toolDef.description,
    parameters,
    async execute(_params: z.infer<typeof parameters>, ctx) {
      const directory = host(ctx).worktree
      const workflows = await WorkflowStorage.list(directory)

      if (workflows.length === 0) {
        return {
          title: "Workflows",
          output: "No workflows found. Create one with workflow_create.",
          metadata: { count: 0 },
        }
      }

      const lines = workflows.map((wf) => {
        const desc = wf.description ? ` — ${wf.description}` : ""
        return `• ${wf.id} (${wf.name})${desc} [${wf.nodes.length} nodes, ${wf.edges.length} edges]`
      })

      return {
        title: `Workflows (${workflows.length})`,
        output: lines.join("\n"),
        metadata: { count: workflows.length, workflows },
      }
    },
  }
})
