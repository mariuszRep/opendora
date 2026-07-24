import { Tool } from "../tool.ts"
import DESCRIPTION from "./task.txt"
import z from "zod"
import { host } from "../host.ts"
import { wildcardMatch } from "@projectflows/permission"

const parameters = z.object({
  description: z.string().describe("A short (3-5 words) description of the task"),
  prompt: z.string().describe("The task for the agent to perform"),
  subagent_type: z.string().describe("The type of worker agent to use for this task"),
  task_id: z
    .string()
    .describe(
      "This should only be set if you mean to resume a previous task (you can pass a prior task_id and the task will continue the same worker session as before instead of creating a fresh one)",
    )
    .optional(),
  command: z.string().describe("The command that triggered this task").optional(),
})

export const TaskTool = Tool.define("task", async (initCtx) => {
  const description = DESCRIPTION.replace("{agents}", "(agents are resolved at runtime via host context)")

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const h = host(ctx)

      if (!ctx.extra?.bypassAgentCheck) {
        // Agent-scoped delegate-target rules (resource "agent") take precedence over the
        // interactive ask: a matching "deny" rule hard-blocks even under interactive approval,
        // and a matching "allow" rule pre-authorizes without prompting — same semantics as the
        // delegate tool's allowlist check.
        const rules = initCtx?.agent?.delegateRules
        const matched = rules?.findLast((r) => wildcardMatch(params.subagent_type, r.pattern))
        if (matched?.action === "deny") {
          throw new Error(
            `Agent "${params.subagent_type}" is denied for this agent's task delegation (matched rule pattern "${matched.pattern}").`,
          )
        }
        if (matched?.action !== "allow") {
          await ctx.ask({
            permission: "task",
            patterns: [params.subagent_type],
            always: ["*"],
            metadata: {
              description: params.description,
              subagent_type: params.subagent_type,
            },
          })
        }
      }

      if (!h.prompt) {
        throw new Error("Task tool requires prompt capability in host context")
      }

      ctx.metadata({
        title: params.description,
        metadata: {
          subagent_type: params.subagent_type,
        },
      })

      // Cancel handler for abort signal
      let sessionId: string | undefined
      const cancel = () => {
        if (sessionId && h.promptCancel) {
          h.promptCancel(sessionId)
        }
      }
      ctx.abort.addEventListener("abort", cancel)

      try {
        const promptParts = h.resolvePromptParts
          ? await h.resolvePromptParts(params.prompt)
          : params.prompt

        const result = (await h.prompt({
          messageID: undefined,
          sessionID: params.task_id,
          parentSessionID: ctx.sessionID,
          parentMessageID: ctx.messageID,
          agent: params.subagent_type,
          description: params.description,
          parts: promptParts,
          createNewSession: !params.task_id,
          sessionTitle: params.description + ` (@${params.subagent_type} worker)`,
        })) as any

        sessionId = result?.sessionId ?? result?.info?.id ?? params.task_id

        ctx.metadata({
          title: params.description,
          metadata: {
            sessionId,
            subagent_type: params.subagent_type,
          },
        })

        const parts = result?.parts ?? []
        const text = [...parts].reverse().find((x: any) => x.type === "text")?.text ?? ""

        const output = [
          `task_id: ${sessionId ?? "unknown"} (for resuming to continue this task if needed)`,
          "",
          "<task_result>",
          text,
          "</task_result>",
        ].join("\n")

        return {
          title: params.description,
          metadata: {
            sessionId,
            subagent_type: params.subagent_type,
          },
          output,
        }
      } finally {
        ctx.abort.removeEventListener("abort", cancel)
      }
    },
  }
})
