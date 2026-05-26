import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import { WorkflowStorage } from "@opendora/workflow/storage"
import toolDef from "./workflow-update.json"

export const WorkflowUpdateTool = Tool.define("workflow_update", async () => {
  const parameters = z.object({
    id: z.string().describe("ID of the workflow to update (must already exist)"),
    workflow: z
      .record(z.string(), z.unknown())
      .describe(
        "Complete replacement workflow JSON — same shape as the UI creates and the HTTP API accepts. The workflow.id field must match the id parameter.",
      ),
  })

  return {
    description: toolDef.description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      await ctx.ask({
        permission: "workflow_update",
        patterns: [],
        always: ["*"],
        metadata: { workflowId: params.id },
      })

      const directory = host(ctx).worktree

      const existing = await WorkflowStorage.get(directory, params.id)
      if (!existing) {
        throw new Error(
          `Workflow "${params.id}" does not exist. Use workflow_create to create a new one.`,
        )
      }

      let workflow
      try {
        workflow = await WorkflowStorage.update(directory, params.id, params.workflow)
      } catch (err) {
        throw new Error(
          `Failed to update workflow: ${err instanceof Error ? err.message : String(err)}`,
        )
      }

      return {
        title: `Workflow Updated: ${workflow.name}`,
        output: [
          `Workflow "${workflow.name}" (id: ${workflow.id}) updated.`,
          `Nodes: ${workflow.nodes.length}, Edges: ${workflow.edges.length}`,
        ].join("\n"),
        metadata: { workflowId: workflow.id },
      }
    },
  }
})
