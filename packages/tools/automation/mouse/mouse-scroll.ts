import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./mouse-scroll.json"

export const PyAutoGUIMouseScrollTool = Tool.define("pyautogui_mouse_scroll", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  const parameters = z.object({
    clicks: z.number().int(),
    x: z.number().int().optional(),
    y: z.number().int().optional(),
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
        metadata: { kind: "mouse", summary: `Scroll ${params.clicks > 0 ? "up" : "down"} ${Math.abs(params.clicks)} clicks` },
      })

      await runPyAutoGUI({ action: "scroll", ...params })
      return {
        title: `Scrolled ${params.clicks > 0 ? "up" : "down"} ${Math.abs(params.clicks)}`,
        metadata: { clicks: params.clicks },
        output: JSON.stringify({ clicks: params.clicks }),
      }
    },
  }
})
