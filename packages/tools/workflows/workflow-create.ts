import z from "zod"
import path from "path"
import fs from "fs"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import { Workflow, RunState, findFirstStep } from "./schema.ts"
import { getRunStore } from "./run-store.ts"
import toolDef from "./workflow-create.json"

export const WorkflowCreateTool = Tool.define("workflow_create", async () => {
  const parameters = z.object({
    workflowId: z.string().describe("Identifier of the workflow definition to load."),
    input: z.record(z.unknown()).describe("Initial input passed to the workflow. Must satisfy the workflow's declared input schema. Becomes available as $input.* throughout the run."),
    title: z.string().optional().describe("Optional human-readable title for this run; surfaced in UI and logs."),
  })

  return {
    description: toolDef.description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const h = host(ctx)
      const directory = h.directory

      // Load workflow definition from .opendora/workflows/<id>.json
      const workflowsDir = path.join(directory, ".opendora", "workflows")
      const workflowPath = path.join(workflowsDir, `${params.workflowId}.json`)

      let raw: unknown
      try {
        raw = JSON.parse(fs.readFileSync(workflowPath, "utf-8"))
      } catch {
        // Try listing available workflows
        let available = "none"
        try {
          const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith(".json"))
          available = files.map((f) => f.replace(".json", "")).join(", ")
        } catch {}
        throw new Error(
          `Workflow "${params.workflowId}" not found at ${workflowPath}. Available workflows: ${available}`,
        )
      }

      const workflow = Workflow.parse(raw)

      // Validate input against workflow's input schema if declared
      if (workflow.input?.required) {
        for (const key of workflow.input.required) {
          if (!(key in params.input)) {
            throw new Error(`Missing required input field: "${key}"`)
          }
        }
      }

      // Find first step
      const firstStep = findFirstStep(workflow.root)
      if (!firstStep) {
        throw new Error(`Workflow "${params.workflowId}" has no executable steps`)
      }

      // Create run state
      const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const run: RunState = {
        runId,
        workflowId: params.workflowId,
        input: params.input,
        cursor: firstStep,
        ctx: {},
        completed: [],
        history: [],
      }

      const store = getRunStore()
      store.set(runId, { run, workflow })

      // Record in history
      run.history.push({
        tool: "workflow_create",
        args: params as Record<string, unknown>,
        result: { runId, cursor: firstStep },
        at: Date.now(),
      })

      return {
        title: params.title ?? `Workflow: ${workflow.name}`,
        output: [
          `runId: ${runId}`,
          `workflow: ${workflow.name}`,
          `version: ${workflow.version}`,
          `cursor: ${firstStep}`,
          `input: ${JSON.stringify(params.input)}`,
          "",
          "The run is ready. Call workflow_run_step to execute the step at the cursor.",
        ].join("\n"),
        metadata: {
          runId,
          workflowId: params.workflowId,
          cursor: firstStep,
        },
      }
    },
  }
})
