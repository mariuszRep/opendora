import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import { findNodeById, findNextStep } from "./schema.ts"
import { getRunStore } from "./run-store.ts"
import toolDef from "./workflow-complete-step.json"

export const WorkflowCompleteStepTool = Tool.define("workflow_complete_step", async () => {
  const parameters = z.object({
    runId: z.string(),
    stepId: z.string(),
    output: z.unknown(),
    note: z.string().optional(),
  })

  return {
    description: toolDef.description,
    parameters,
    async execute(params, ctx) {
      const entry = getRunStore().get(params.runId)
      if (!entry) throw new Error(`Run not found: ${params.runId}`)

      const { run, workflow } = entry
      const node = findNodeById(workflow.root, params.stepId)
      if (!node) throw new Error(`Step "${params.stepId}" not found`)

      // Store output in ctx under the step's output name
      if (node.kind === "task" && node.output) {
        run.ctx[node.output] = params.output
      } else if (node.kind === "decide") {
        run.ctx[`${params.stepId}_decision`] = params.output
      }

      run.completed.push(params.stepId)

      // Advance cursor to next step
      const next = findNextStep(workflow.root, params.stepId)
      run.cursor = next ?? params.stepId

      run.history.push({
        tool: "workflow_complete_step",
        args: params as Record<string, unknown>,
        result: { cursor: run.cursor, completed: [...run.completed] },
        at: Date.now(),
      })

      const hasMore = next !== undefined
      return {
        title: `Completed step: ${params.stepId}`,
        output: [
          `stepId: ${params.stepId}`,
          `cursor: ${run.cursor}`,
          `completed: [${run.completed.join(", ")}]`,
          hasMore ? `Next step: ${next}` : "No more steps — call workflow_finish to complete the run.",
          params.note ? `note: ${params.note}` : null,
        ].filter(Boolean).join("\n"),
        metadata: {
          runId: params.runId,
          stepId: params.stepId,
          cursor: run.cursor,
          hasMore,
        },
      }
    },
  }
})
