import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import { WorkflowStorage } from "@opendora/workflow/storage"
import toolDef from "./workflow-delete.json"

export const WorkflowDeleteTool = Tool.define("workflow_delete", async () => {
  const parameters = z.object({
    id: z.string().describe("ID of the workflow to delete"),
  })

  return {
    description: toolDef.description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      await ctx.ask({
        permission: "workflow_delete",
        patterns: [],
        always: ["*"],
        metadata: { workflowId: params.id },
      })

      const directory = host(ctx).directory
      try {
        await WorkflowStorage.remove(directory, params.id)
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : String(err))
      }

      return {
        title: `Workflow Deleted: ${params.id}`,
        output: `Workflow "${params.id}" has been permanently deleted.`,
        metadata: { workflowId: params.id },
      }
    },
  }
})
