import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import toolDef from ".//keyboard-type.json"

export const DesktopKeyboardTypeTool = Tool.define("desktop_keyboard_type", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
    parameters: z.object({
      text: z.string().min(1).describe("Text to type"),
      delay: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe("Delay in milliseconds between keystrokes (default: 50)"),
    }),
    async execute(params, ctx) {
      assertNotSandbox(sandbox)
      assertDisplay()
      await ctx.ask({
        permission: "desktop",
        patterns: ["keyboard"],
        always: [],
        metadata: {
          kind: "keyboard",
          summary: `Type ${params.text.length} characters`,
        },
      })

      const { keyboard } = await getNut()
      if (params.delay !== undefined) keyboard.config.autoDelayMs = params.delay

      await keyboard.type(params.text)

      return {
        title: `Typed ${params.text.length} characters`,
        metadata: { length: params.text.length },
        output: JSON.stringify({ length: params.text.length }),
      }
    },
  }
})
