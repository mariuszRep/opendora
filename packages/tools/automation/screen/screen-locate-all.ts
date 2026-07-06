import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./screen-locate-all.json"

interface Match {
  x: number
  y: number
  left: number
  top: number
  width: number
  height: number
  confidence: number
}

export const PyAutoGUIScreenLocateAllTool = Tool.define("pyautogui_screen_locate_all", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  const parameters = z.object({
    image: z.string(),
    confidence: z.number().min(0).max(1).optional(),
  })
  return {
    description: toolDef.description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      await ctx.ask({
        permission: "desktop",
        patterns: ["screen"],
        always: [],
        metadata: { kind: "screen", summary: `Locate all occurrences of image on screen` },
      })

      const result = await runPyAutoGUI<{ matches: Match[]; count: number }>({
        action: "locate_all",
        ...params,
      })

      if (result.count === 0) {
        return {
          title: "No matches found",
          metadata: { count: 0, matches: [] },
          output: JSON.stringify(result),
        }
      }

      return {
        title: `Found ${result.count} match(es)`,
        metadata: result,
        output: JSON.stringify(result),
      }
    },
  }
})
