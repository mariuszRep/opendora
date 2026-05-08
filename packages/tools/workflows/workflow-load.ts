import z from "zod"
import path from "path"
import fs from "fs"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import { Workflow } from "./schema.ts"
import toolDef from "./workflow-load.json"

const WORKFLOW_TOOLS = [
  "workflow_create",
  "workflow_run_step",
  "workflow_complete_step",
  "workflow_goto",
  "workflow_finish",
]

export const WorkflowLoadTool = Tool.define("workflow_load", async () => {
  const parameters = z.object({
    name: z.string().describe("The workflow identifier to load"),
  })

  return {
    description: toolDef.description,
    parameters,
    async execute(params, ctx) {
      const h = host(ctx)
      const directory = h.directory

      const workflowsDir = path.join(directory, ".opendora", "workflows")
      const workflowPath = path.join(workflowsDir, `${params.name}.json`)

      let raw: unknown
      try {
        raw = JSON.parse(fs.readFileSync(workflowPath, "utf-8"))
      } catch {
        let available = "none"
        try {
          available = fs.readdirSync(workflowsDir)
            .filter((f) => f.endsWith(".json"))
            .map((f) => f.replace(".json", ""))
            .join(", ")
        } catch {}
        throw new Error(
          `Workflow "${params.name}" not found. Available: ${available || "none"}`,
        )
      }

      const workflow = Workflow.parse(raw)

      await ctx.ask({
        permission: "workflow",
        patterns: [params.name],
        always: [params.name],
        metadata: {},
      })

      // Register workflow tools for this session (same mechanism as skills)
      h.skillTools?.add(ctx.sessionID, WORKFLOW_TOOLS)

      const toolsNotice = [
        "",
        "<workflow_tools_registered>",
        `Workflow tools now registered for this session: ${WORKFLOW_TOOLS.join(", ")}`,
        "IMPORTANT: These tools are active starting from your NEXT tool call.",
        "Do NOT attempt to call them in this response.",
        "",
        "To execute this workflow:",
        "1. Call workflow_create with the workflow id and input",
        "2. Call workflow_run_step to execute the step at the cursor",
        "3. Call workflow_complete_step to commit output and advance",
        "4. Use workflow_goto to jump to a different step if needed",
        "5. Call workflow_finish when done",
        "</workflow_tools_registered>",
      ].join("\n")

      return {
        title: `Loaded workflow: ${workflow.name}`,
        output: [
          `<workflow_content id="${workflow.id}" name="${workflow.name}">`,
          `# Workflow: ${workflow.name}`,
          workflow.description ? `\n${workflow.description}\n` : "",
          `Version: ${workflow.version}`,
          workflow.input ? `\nInput schema: ${JSON.stringify(workflow.input, null, 2)}` : "",
          "",
          "## Workflow Tree",
          "```json",
          JSON.stringify(workflow.root, null, 2),
          "```",
          "</workflow_content>",
          toolsNotice,
        ].join("\n"),
        metadata: {
          workflowId: workflow.id,
          name: workflow.name,
        },
      }
    },
  }
})
