import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import { WorkflowStorage } from "@projectflows/workflow/storage"
import toolDef from "./workflow-get.json"

export const WorkflowGetTool = Tool.define("workflow_get", async () => {
  const parameters = z.object({
    id: z.string().describe("Workflow ID to retrieve"),
  })

  return {
    description: toolDef.description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const directory = host(ctx).worktree
      const workflow = await WorkflowStorage.get(directory, params.id)

      if (!workflow) {
        const available = (await WorkflowStorage.availableIds(directory)).join(", ") || "none"
        throw new Error(`Workflow "${params.id}" not found. Available: ${available}`)
      }

      return {
        title: `Workflow: ${workflow.name}`,
        output: JSON.stringify(workflow, null, 2),
        metadata: { workflowId: workflow.id },
      }
    },
  }
})
