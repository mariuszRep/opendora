import z from "zod"
import * as fs from "fs/promises"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./screen-screenshot-window.json"

export const PyAutoGUIScreenScreenshotWindowTool = Tool.define("pyautogui_screen_screenshot_window", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
    parameters: z.object({
      window_id: z.number().int().positive(),
      path: z.string().optional(),
    }),
    async execute(params, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      await ctx.ask({
        permission: "desktop",
        patterns: ["screen"],
        always: [],
        metadata: { kind: "screen", summary: `Capture window ${params.window_id}` },
      })

      const result = await runPyAutoGUI<{ path: string; width: number; height: number }>({
        action: "screenshot_window",
        window_id: params.window_id,
        ...(params.path ? { path: params.path } : {}),
      })

      const pngBytes = await fs.readFile(result.path)
      const dataUrl = `data:image/png;base64,${pngBytes.toString("base64")}`

      return {
        title: `Window ${params.window_id} screenshot (${result.width}×${result.height})`,
        metadata: result,
        output: JSON.stringify(result),
        attachments: [{ type: "file", mime: "image/png", filename: `window-${params.window_id}.png`, url: dataUrl }],
      }
    },
  }
})
