import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./screen-size.json"

export const PyAutoGUIScreenSizeTool = Tool.define("pyautogui_screen_size", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  const parameters = z.object({})
  return {
    description: toolDef.description,
    parameters,
    async execute(_params: z.infer<typeof parameters>, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      await ctx.ask({
        permission: "desktop",
        patterns: ["screen"],
        always: [],
        metadata: { kind: "screen", summary: "Read screen size" },
      })

      const result = await runPyAutoGUI<{ width: number; height: number }>({ action: "size" })
      return {
        title: `Screen: ${result.width}×${result.height}`,
        metadata: result,
        output: JSON.stringify(result),
      }
    },
  }
})
