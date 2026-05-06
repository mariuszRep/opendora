import z from "zod"
import * as fs from "fs/promises"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./screen-screenshot.json"

export const PyAutoGUIScreenScreenshotTool = Tool.define("pyautogui_screen_screenshot", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
    parameters: z.object({
      path: z.string().optional(),
    }),
    async execute(params, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      await ctx.ask({
        permission: "desktop",
        patterns: ["screen"],
        always: [],
        metadata: { kind: "screen", summary: "Take full-screen screenshot" },
      })

      const result = await runPyAutoGUI<{ path: string; width: number; height: number }>({
        action: "screenshot",
        ...params,
      })

      const pngBytes = await fs.readFile(result.path)
      const dataUrl = `data:image/png;base64,${pngBytes.toString("base64")}`

      return {
        title: `Screenshot (${result.width}×${result.height}) → ${result.path}`,
        metadata: result,
        output: JSON.stringify(result),
        attachments: [{ type: "file", mime: "image/png", filename: "screenshot.png", url: dataUrl }],
      }
    },
  }
})
