import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./mouse-scroll-horizontal.json"

export const PyAutoGUIMouseScrollHorizontalTool = Tool.define("pyautogui_mouse_scroll_horizontal", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
    parameters: z.object({
      clicks: z.number().int(),
      x: z.number().int().optional(),
      y: z.number().int().optional(),
    }),
    async execute(params, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      const dir = params.clicks > 0 ? "right" : "left"
      await ctx.ask({
        permission: "desktop",
        patterns: ["mouse"],
        always: [],
        metadata: { kind: "mouse", summary: `Scroll ${Math.abs(params.clicks)} ${dir}` },
      })

      await runPyAutoGUI({ action: "hscroll", ...params })

      return {
        title: `Scrolled ${Math.abs(params.clicks)} click(s) ${dir}`,
        metadata: { clicks: params.clicks },
        output: JSON.stringify({ clicks: params.clicks }),
      }
    },
  }
})
