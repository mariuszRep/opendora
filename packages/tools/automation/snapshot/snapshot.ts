import z from "zod"
import * as fs from "fs/promises"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./snapshot.json"

export const PyAutoGUISnapshotTool = Tool.define("pyautogui_snapshot", async (initCtx) => {
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
        metadata: { kind: "screen", summary: "Snapshot desktop state" },
      })

      const result = await runPyAutoGUI<{
        path: string
        elements: Array<{ label: number; wid: number; title: string; x: number; y: number; width: number; height: number }>
      }>({ action: "snapshot" })

      const pngBytes = await fs.readFile(result.path)
      const dataUrl = `data:image/png;base64,${pngBytes.toString("base64")}`

      const summary = result.elements
        .map((e) => `[${e.label}] ${e.title} (${e.x},${e.y} ${e.width}×${e.height})`)
        .join("\n")

      return {
        title: `Snapshot: ${result.elements.length} window(s)`,
        metadata: { elements: result.elements },
        output: summary + "\n\n" + JSON.stringify(result.elements),
        attachments: [{ type: "file", mime: "image/png", filename: "snapshot.png", url: dataUrl }],
      }
    },
  }
})
