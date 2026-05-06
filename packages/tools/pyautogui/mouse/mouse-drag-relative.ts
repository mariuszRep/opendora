import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./mouse-drag-relative.json"

export const PyAutoGUIMouseDragRelativeTool = Tool.define("pyautogui_mouse_drag_relative", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
    parameters: z.object({
      dx: z.number().int(),
      dy: z.number().int(),
      button: z.enum(["left", "right", "middle"]).optional(),
      duration: z.number().optional(),
    }),
    async execute(params, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      await ctx.ask({
        permission: "desktop",
        patterns: ["mouse"],
        always: [],
        metadata: { kind: "mouse", summary: `Drag mouse by (${params.dx}, ${params.dy})` },
      })

      const result = await runPyAutoGUI<{ x: number; y: number }>({
        action: "drag_rel",
        ...params,
      })

      return {
        title: `Dragged to (${result.x}, ${result.y})`,
        metadata: result,
        output: JSON.stringify(result),
      }
    },
  }
})
