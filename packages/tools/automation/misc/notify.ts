import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./notify.json"

export const PyAutoGUINotifyTool = Tool.define("pyautogui_notify", {
  description: toolDef.description,
  parameters: z.object({
    title: z.string(),
    message: z.string().optional(),
    urgency: z.enum(["low", "normal", "critical"]).optional(),
    timeout_ms: z.number().int().positive().optional(),
  }),
  async execute(params) {
    await runPyAutoGUI({ action: "notify", ...params })
    return {
      title: `Notification sent: "${params.title}"`,
      metadata: { title: params.title },
      output: JSON.stringify({ sent: true, title: params.title }),
    }
  },
})
