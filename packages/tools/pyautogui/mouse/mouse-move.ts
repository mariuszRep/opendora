import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./mouse-move.json"

export const PyAutoGUIMouseMoveTool = Tool.define("pyautogui_mouse_move", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
    parameters: z.object({
      x: z.number().int(),
      y: z.number().int(),
      duration: z.number().optional(),
    }),
    async execute(params, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      await ctx.ask({
        permission: "desktop",
        patterns: ["mouse"],
        always: [],
        metadata: { kind: "mouse", summary: `Move mouse to (${params.x}, ${params.y})` },
      })

      const result = await runPyAutoGUI<{ x: number; y: number }>({ action: "move", ...params })
      return {
        title: `Moved mouse to (${result.x}, ${result.y})`,
        metadata: result,
        output: JSON.stringify(result),
      }
    },
  }
})
