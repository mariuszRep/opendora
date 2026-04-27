import z from "zod"
import { Tool } from "../tool.ts"
import { host, worktree } from "../host.ts"
import EXIT_DESCRIPTION from "./plan-exit.txt"

export const PlanExitTool = Tool.define("plan_exit", {
  description: EXIT_DESCRIPTION,
  parameters: z.object({}),
  async execute(_params, ctx) {
    const session = host(ctx).session
    const questionFn = host(ctx).question
    const prompt = host(ctx).prompt

    if (!questionFn) {
      throw new Error("Question capability is not available in this context")
    }

    const answers = (await questionFn({
      sessionID: ctx.sessionID,
      questions: [
        {
          question: `Plan is complete. Would you like to switch to the build agent and start implementing?`,
          header: "Build Agent",
          custom: false,
          options: [
            { label: "Yes", description: "Switch to build agent and start implementing the plan" },
            { label: "No", description: "Stay with plan agent to continue refining the plan" },
          ],
        },
      ],
      tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
    })) as (string[] | undefined)[]

    const answer = answers[0]?.[0]
    if (answer === "No") {
      throw new Error("User chose to stay with plan agent")
    }

    return {
      title: "Switching to build agent",
      output: "User approved switching to build agent. Wait for further instructions.",
      metadata: {},
    }
  },
})
