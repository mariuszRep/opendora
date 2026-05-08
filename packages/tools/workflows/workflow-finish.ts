import z from "zod"
import { Tool } from "../tool.ts"
import { getRunStore } from "./run-store.ts"
import toolDef from "./workflow-finish.json"

export const WorkflowFinishTool = Tool.define("workflow_finish", async () => {
  const parameters = z.object({
    runId: z.string(),
    status: z.enum(["success", "failed", "aborted"]),
    summary: z.string(),
    result: z.unknown().optional(),
  })

  return {
    description: toolDef.description,
    parameters,
    async execute(params, ctx) {
      const entry = getRunStore().get(params.runId)
      if (!entry) throw new Error(`Run not found: ${params.runId}`)

      const { run } = entry
      run.history.push({
        tool: "workflow_finish",
        args: params as Record<string, unknown>,
        result: { status: params.status },
        at: Date.now(),
      })

      // Clean up run state
      getRunStore().delete(params.runId)

      return {
        title: `Workflow ${params.status}: ${params.runId}`,
        output: [
          `status: ${params.status}`,
          `summary: ${params.summary}`,
          params.result ? `result: ${JSON.stringify(params.result)}` : null,
          `steps completed: ${run.completed.length}`,
        ].filter(Boolean).join("\n"),
        metadata: {
          runId: params.runId,
          status: params.status,
          completedSteps: run.completed.length,
        },
      }
    },
  }
})
