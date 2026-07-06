import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./mouse-position.json"

export const PyAutoGUIMousePositionTool = Tool.define("pyautogui_mouse_position", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  const parameters = z.object({})
  return {
    description: toolDef.description,
    parameters,
    async execute(_params: z.infer<typeof parameters>, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      await ctx.ask({
        permission: "desktop",
        patterns: ["mouse"],
        always: [],
        metadata: { kind: "mouse", summary: "Read mouse position" },
      })

      const result = await runPyAutoGUI<{ x: number; y: number }>({ action: "position" })
      return {
        title: `Mouse at (${result.x}, ${result.y})`,
        metadata: result,
        output: JSON.stringify(result),
      }
    },
  }
})
