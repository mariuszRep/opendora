import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./mouse-drag.json"

export const PyAutoGUIMouseDragTool = Tool.define("pyautogui_mouse_drag", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
    parameters: z.object({
      x: z.number().int(),
      y: z.number().int(),
      from_x: z.number().int().optional(),
      from_y: z.number().int().optional(),
      button: z.enum(["left", "right", "middle"]).optional(),
      duration: z.number().optional(),
    }),
    async execute(params, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      await ctx.ask({
        permission: "desktop",
        patterns: ["mouse"],
        always: [],
        metadata: {
          kind: "mouse",
          summary: `Drag to (${params.x}, ${params.y})${params.from_x != null ? ` from (${params.from_x}, ${params.from_y})` : ""}`,
        },
      })

      const result = await runPyAutoGUI<{ x: number; y: number }>({
        action: "drag",
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
