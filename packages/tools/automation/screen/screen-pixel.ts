import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./screen-pixel.json"

export const PyAutoGUIScreenPixelTool = Tool.define("pyautogui_screen_pixel", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  const parameters = z.object({
    x: z.number().int(),
    y: z.number().int(),
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
        metadata: { kind: "screen", summary: `Read pixel color at (${params.x}, ${params.y})` },
      })

      const result = await runPyAutoGUI<{ r: number; g: number; b: number; hex: string }>({
        action: "pixel",
        ...params,
      })

      return {
        title: `Pixel at (${params.x}, ${params.y}): ${result.hex}`,
        metadata: result,
        output: JSON.stringify(result),
      }
    },
  }
})
