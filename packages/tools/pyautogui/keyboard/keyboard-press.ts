import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./keyboard-press.json"

export const PyAutoGUIKeyboardPressTool = Tool.define("pyautogui_keyboard_press", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
    parameters: z.object({
      keys: z.union([z.string(), z.array(z.string())]),
      presses: z.number().int().positive().optional(),
      window_id: z.number().int().optional().describe("X11 window ID to target directly (bypasses compositor focus)"),
    }),
    async execute(params, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      const label = Array.isArray(params.keys) ? params.keys.join("+") : params.keys
      await ctx.ask({
        permission: "desktop",
        patterns: ["keyboard"],
        always: [],
        metadata: { kind: "keyboard", summary: `Press ${label}` },
      })

      await runPyAutoGUI({ action: "press", ...params })
      return {
        title: `Pressed ${label}`,
        metadata: { keys: params.keys, presses: params.presses ?? 1 },
        output: JSON.stringify({ keys: params.keys }),
      }
    },
  }
})
