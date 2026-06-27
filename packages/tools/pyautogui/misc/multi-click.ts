import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./multi-click.json"

const pointSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  button: z.enum(["left", "right", "middle"]).optional(),
})

export const PyAutoGUIMultiClickTool = Tool.define("pyautogui_multi_click", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  const parameters = z.object({
    points: z.array(pointSchema).min(1),
    hold_ctrl: z.boolean().optional(),
    delay_ms: z.number().int().nonnegative().optional(),
  })
  return {
    description: toolDef.description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      await ctx.ask({
        permission: "desktop",
        patterns: ["mouse"],
        always: [],
        metadata: {
          kind: "mouse",
          summary: `Multi-click ${params.points.length} points${params.hold_ctrl ? " (Ctrl)" : ""}`,
        },
      })

      const result = await runPyAutoGUI<{ clicks: Array<{ x: number; y: number }> }>({
        action: "multi_click",
        ...params,
      })

      return {
        title: `Clicked ${result.clicks.length} points`,
        metadata: { clicks: result.clicks },
        output: JSON.stringify(result),
      }
    },
  }
})
