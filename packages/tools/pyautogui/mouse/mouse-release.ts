import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./mouse-release.json"

export const PyAutoGUIMouseReleaseTool = Tool.define("pyautogui_mouse_release", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  const parameters = z.object({
    x: z.number().int().optional(),
    y: z.number().int().optional(),
    button: z.enum(["left", "right", "middle"]).optional(),
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
          summary: `Release ${params.button ?? "left"} button at (${params.x ?? "current"}, ${params.y ?? "current"})`,
        },
      })

      const result = await runPyAutoGUI<{ x: number; y: number }>({
        action: "mouse_up",
        ...params,
      })

      return {
        title: `Released ${params.button ?? "left"} at (${result.x}, ${result.y})`,
        metadata: result,
        output: JSON.stringify(result),
      }
    },
  }
})
