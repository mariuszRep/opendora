import z from "zod"
import { Tool } from "../../tool.ts"
import { runPyAutoGUI } from "../lib/runner.ts"
import toolDef from "./app.json"

export const PyAutoGUIAppTool = Tool.define("pyautogui_app", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
    parameters: z.object({
      mode: z.enum(["list", "launch", "focus", "move", "resize"]),
      name: z.string().optional(),
      window_id: z.number().int().positive().optional(),
      x: z.number().int().optional(),
      y: z.number().int().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      wait: z.number().optional(),
    }),
    async execute(params, ctx) {
      if (sandbox) throw new Error("pyautogui tools are disabled in sandbox mode")

      await ctx.ask({
        permission: "desktop",
        patterns: ["app"],
        always: [],
        metadata: { kind: "app", summary: `App ${params.mode}${params.name ? ` "${params.name}"` : ""}` },
      })

      const actionMap: Record<string, string> = {
        list: "app_list", launch: "app_launch", focus: "app_focus",
        move: "app_move", resize: "app_resize",
      }

      const result = await runPyAutoGUI<Record<string, unknown>>({
        action: actionMap[params.mode],
        ...params,
      })

      const title = params.mode === "list"
        ? `${(result.windows as unknown[]).length} window(s) open`
        : `App ${params.mode} OK`

      return {
        title,
        metadata: result,
        output: JSON.stringify(result),
      }
    },
  }
})
