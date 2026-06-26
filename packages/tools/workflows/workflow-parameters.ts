import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import { WorkflowStorage } from "@projectflows/workflow/storage"
import toolDef from "./workflow-parameters.json"

export const WorkflowParametersTool = Tool.define("workflow_parameters", {
  description: toolDef.description,
  parameters: z.object({
    workflowId: z.string().describe("ID of the workflow to inspect"),
  }),
  async execute(params, ctx) {
    const directory = host(ctx).worktree
    const workflow = await WorkflowStorage.get(directory, params.workflowId)
    if (!workflow) {
      const available = (await WorkflowStorage.availableIds(directory)).join(", ") || "none"
      throw new Error(`Workflow "${params.workflowId}" not found. Available: ${available}`)
    }

    const paramNode = workflow.nodes.find((n) => (n.data as any)?.nodeType === "parameters")
    const wfParams: Array<{
      name: string; type?: string; required?: boolean; description?: string; enum?: string[]
    }> = (paramNode?.data as any)?.workflowParameters ?? []

    if (wfParams.length === 0) {
      return {
        title: `Parameters: ${workflow.name}`,
        output: `Workflow "${workflow.name}" has no declared parameters. Call workflow_run with input: {}`,
        metadata: { workflowId: params.workflowId, parameters: [] },
      }
    }

    const lines = wfParams.map((p) => {
      const typeStr = p.type ? ` [${p.type}]` : ""
      const reqStr = p.required ? "required" : "optional"
      const enumStr = p.enum?.length ? ` — one of: ${p.enum.join(", ")}` : ""
      const descStr = p.description ? `: ${p.description}` : ""
      return `- ${p.name}${typeStr} (${reqStr})${enumStr}${descStr}`
    })

    return {
      title: `Parameters: ${workflow.name}`,
      output: [
        `Workflow "${workflow.name}" (${params.workflowId}) parameters:`,
        ``,
        ...lines,
        ``,
        `Call workflow_run with workflowId="${params.workflowId}" and an input object containing these keys.`,
      ].join("\n"),
      metadata: { workflowId: params.workflowId, parameters: wfParams },
    }
  },
})
