import z from "zod"
import { Tool } from "../tool.ts"
import { findNodeById } from "./schema.ts"
import { getRunStore } from "./run-store.ts"
import toolDef from "./workflow-goto.json"

export const WorkflowGotoTool = Tool.define("workflow_goto", async () => {
  const parameters = z.object({
    runId: z.string(),
    stepId: z.string(),
    reason: z.string(),
  })

  return {
    description: toolDef.description,
    parameters,
    async execute(params, ctx) {
      const entry = getRunStore().get(params.runId)
      if (!entry) throw new Error(`Run not found: ${params.runId}`)

      const { run, workflow } = entry
      const target = findNodeById(workflow.root, params.stepId)
      if (!target) throw new Error(`Target step "${params.stepId}" not found in workflow tree`)

      const prevCursor = run.cursor
      run.cursor = params.stepId

      run.history.push({
        tool: "workflow_goto",
        args: params as Record<string, unknown>,
        result: { from: prevCursor, to: params.stepId },
        at: Date.now(),
      })

      return {
        title: `Goto: ${prevCursor} → ${params.stepId}`,
        output: [
          `from: ${prevCursor}`,
          `to: ${params.stepId}`,
          `reason: ${params.reason}`,
          "",
          "Cursor moved. Call workflow_run_step to execute the target step.",
        ].join("\n"),
        metadata: {
          runId: params.runId,
          from: prevCursor,
          to: params.stepId,
        },
      }
    },
  }
})
