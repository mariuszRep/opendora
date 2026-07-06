import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./mouse-move-relative.json"

export const PyAutoGUIMouseMoveRelativeTool = Tool.define("pyautogui_mouse_move_relative", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  const parameters = z.object({
    dx: z.number().int(),
    dy: z.number().int(),
    duration: z.number().optional(),
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
        metadata: { kind: "mouse", summary: `Move mouse by (${params.dx}, ${params.dy})` },
      })

      const result = await runPyAutoGUI<{ x: number; y: number }>({
        action: "move_rel",
        ...params,
      })

      return {
        title: `Moved mouse to (${result.x}, ${result.y})`,
        metadata: result,
        output: JSON.stringify(result),
      }
    },
  }
})
