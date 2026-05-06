import z from "zod"
import * as fs from "fs/promises"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./snapshot-window.json"

export const PyAutoGUISnapshotWindowTool = Tool.define("pyautogui_snapshot_window", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
    parameters: z.object({
      window_id: z.number().int().positive(),
    }),
    async execute(params, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      await ctx.ask({
        permission: "desktop",
        patterns: ["screen"],
        always: [],
        metadata: { kind: "screen", summary: `Snapshot window ${params.window_id}` },
      })

      const result = await runPyAutoGUI<{
        path: string
        window_id: number
        elements: Array<{ label: number; wid: number; abs_x: number; abs_y: number; x: number; y: number; width: number; height: number }>
      }>({ action: "snapshot_window", window_id: params.window_id })

      const pngBytes = await fs.readFile(result.path)
      const dataUrl = `data:image/png;base64,${pngBytes.toString("base64")}`

      const summary = result.elements
        .map((e) => `[${e.label}] at screen (${e.abs_x},${e.abs_y}) ${e.width}×${e.height}`)
        .join("\n")

      return {
        title: `Window ${params.window_id}: ${result.elements.length} element(s)`,
        metadata: { elements: result.elements },
        output: summary + "\n\n" + JSON.stringify(result.elements),
        attachments: [{ type: "file", mime: "image/png", filename: `window-${params.window_id}-snapshot.png`, url: dataUrl }],
      }
    },
  }
})
