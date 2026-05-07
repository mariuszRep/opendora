import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./keyboard-down.json"

export const PyAutoGUIKeyboardDownTool = Tool.define("pyautogui_keyboard_down", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
    parameters: z.object({
      key: z.string(),
      window_id: z.number().int().optional().describe("X11 window ID to target directly (bypasses compositor focus)"),
    }),
    async execute(params, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      await ctx.ask({
        permission: "desktop",
        patterns: ["keyboard"],
        always: [],
        metadata: { kind: "keyboard", summary: `Hold down key: ${params.key}` },
      })

      await runPyAutoGUI({ action: "key_down", key: params.key, window_id: params.window_id })

      return {
        title: `Holding down: ${params.key}`,
        metadata: { key: params.key },
        output: JSON.stringify({ key: params.key }),
      }
    },
  }
})
