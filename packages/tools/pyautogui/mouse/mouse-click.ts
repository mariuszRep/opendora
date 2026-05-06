import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./mouse-click.json"

export const PyAutoGUIMouseClickTool = Tool.define("pyautogui_mouse_click", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
    parameters: z.object({
      x: z.number().int().optional(),
      y: z.number().int().optional(),
      button: z.enum(["left", "right", "middle"]).optional(),
      double: z.boolean().optional(),
    }),
    async execute(params, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      await ctx.ask({
        permission: "desktop",
        patterns: ["mouse"],
        always: [],
        metadata: {
          kind: "mouse",
          summary: `${params.double ? "Double-click" : "Click"} ${params.button ?? "left"} at (${params.x ?? "current"}, ${params.y ?? "current"})`,
        },
      })

      const result = await runPyAutoGUI<{ x: number; y: number }>({
        action: "click",
        ...params,
      })

      const label = `${params.double ? "Double-clicked" : "Clicked"} ${params.button ?? "left"} at (${result.x}, ${result.y})`
      return {
        title: label,
        metadata: { x: result.x, y: result.y, button: params.button ?? "left" },
        output: JSON.stringify(result),
      }
    },
  }
})
