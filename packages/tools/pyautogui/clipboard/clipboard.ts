import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./clipboard.json"

export const PyAutoGUIClipboardTool = Tool.define("pyautogui_clipboard", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
    parameters: z.object({
      mode: z.enum(["get", "set"]),
      text: z.string().optional(),
    }),
    async execute(params, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      await ctx.ask({
        permission: "desktop",
        patterns: ["clipboard"],
        always: [],
        metadata: { kind: "clipboard", summary: `Clipboard ${params.mode}` },
      })

      const action = params.mode === "get" ? "clipboard_get" : "clipboard_set"
      const result = await runPyAutoGUI<{ text?: string }>({ action, text: params.text })

      return {
        title: params.mode === "get" ? `Clipboard: ${(result.text ?? "").slice(0, 60)}` : "Clipboard updated",
        metadata: { mode: params.mode, length: result.text?.length ?? params.text?.length ?? 0 },
        output: JSON.stringify(result),
      }
    },
  }
})
