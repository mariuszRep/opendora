import z from "zod"
import { Tool } from "../tool.ts"
import { host } from "../host.ts"
import DESCRIPTION from "./question.txt"

const QuestionInfo = z.object({
  question: z.string(),
  header: z.string().optional(),
  options: z
    .array(
      z.object({
        label: z.string(),
        description: z.string().optional(),
      }),
    )
    .optional(),
})

export const QuestionTool = Tool.define("question", {
  description: DESCRIPTION,
  parameters: z.object({
    questions: z.array(QuestionInfo).describe("Questions to ask"),
  }),
  async execute(params, ctx) {
    const ask = host(ctx).question
    if (!ask) {
      throw new Error("Question tool is not available in this context")
    }

    const answers = await ask({
      sessionID: ctx.sessionID,
      questions: params.questions,
      tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
    })

    return {
      title: `${params.questions.length} question${params.questions.length > 1 ? "s" : ""} answered`,
      output: answers.map((a, i) => `Q${i + 1}: ${a.join(", ")}`).join("\n"),
      metadata: { answers },
    }
  },
})
