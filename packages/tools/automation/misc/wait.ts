import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./wait.json"

export const PyAutoGUIWaitTool = Tool.define("pyautogui_wait", {
  description: toolDef.description,
  parameters: z.object({
    duration: z.number().positive(),
  }),
  async execute(params) {
    const result = await runPyAutoGUI<{ slept: number }>({ action: "wait", duration: params.duration })
    return {
      title: `Waited ${result.slept}s`,
      metadata: { slept: result.slept },
      output: JSON.stringify(result),
    }
  },
})
