import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./keyboard-type.json"

export const PyAutoGUIKeyboardTypeTool = Tool.define("pyautogui_keyboard_type", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
    parameters: z.object({
      text: z.string(),
      window_id: z.number().int().optional().describe("X11 window ID to target directly (bypasses compositor focus)"),
    }),
    async execute(params, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      await ctx.ask({
        permission: "desktop",
        patterns: ["keyboard"],
        always: [],
        metadata: { kind: "keyboard", summary: `Type "${params.text.slice(0, 40)}${params.text.length > 40 ? "…" : ""}"` },
      })

      await runPyAutoGUI({ action: "type", text: params.text, window_id: params.window_id })
      return {
        title: `Typed ${params.text.length} characters`,
        metadata: { length: params.text.length },
        output: JSON.stringify({ typed: params.text }),
      }
    },
  }
})
