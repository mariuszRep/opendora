import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import { WorkflowStorage } from "@projectflows/workflow/storage"
import toolDef from "./workflow-create.json"

export const WorkflowCreateTool = Tool.define("workflow_create", async () => {
  const parameters = z.object({
    workflow: z
      .record(z.string(), z.unknown())
      .describe(
        "Complete workflow JSON — same shape as the UI creates and the HTTP API accepts. Must include: id (string), name (string), nodes (array), edges (array). Optional: description, version.",
      ),
  })

  return {
    description: toolDef.description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      await ctx.ask({
        permission: "workflow_create",
        patterns: [],
        always: ["*"],
        metadata: { workflowId: params.workflow["id"] },
      })

      const directory = host(ctx).worktree
      let workflow
      try {
        workflow = await WorkflowStorage.create(directory, params.workflow)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes("already exists")) {
          throw new Error(
            `Workflow "${params.workflow["id"]}" already exists. Use workflow_update to modify it, or choose a different id.`,
          )
        }
        throw new Error(`Failed to create workflow: ${msg}`)
      }

      return {
        title: `Workflow Created: ${workflow.name}`,
        output: [
          `Workflow "${workflow.name}" created (id: ${workflow.id}).`,
          `Nodes: ${workflow.nodes.length}, Edges: ${workflow.edges.length}`,
          `Run it with: workflow_run { workflowId: "${workflow.id}", input: { ... } }`,
        ].join("\n"),
        metadata: { workflowId: workflow.id },
      }
    },
  }
})
