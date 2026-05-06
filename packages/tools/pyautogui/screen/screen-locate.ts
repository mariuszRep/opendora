import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./screen-locate.json"

export const PyAutoGUIScreenLocateTool = Tool.define("pyautogui_screen_locate", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
    parameters: z.object({
      image: z.string(),
      confidence: z.number().min(0).max(1).optional(),
    }),
    async execute(params, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      await ctx.ask({
        permission: "desktop",
        patterns: ["screen"],
        always: [],
        metadata: { kind: "screen", summary: `Locate image on screen` },
      })

      const result = await runPyAutoGUI<
        | { found: false; confidence: number }
        | { found: true; x: number; y: number; left: number; top: number; width: number; height: number; confidence: number }
      >({ action: "locate", ...params })

      if (!result.found) {
        return {
          title: "Image not found on screen",
          metadata: { found: false },
          output: JSON.stringify(result),
        }
      }

      return {
        title: `Found at (${result.x}, ${result.y}) — confidence ${result.confidence.toFixed(2)}`,
        metadata: result,
        output: JSON.stringify(result),
      }
    },
  }
})
