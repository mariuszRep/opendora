import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import DESCRIPTION from "./window-active.txt"

export const DesktopWindowActiveTool = Tool.define("desktop_window_active", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: DESCRIPTION,
    parameters: z.object({}),
    async execute(_params, ctx) {
      assertNotSandbox(sandbox)
      assertDisplay()
      await ctx.ask({
        permission: "desktop",
        patterns: ["window"],
        always: [],
        metadata: { kind: "window", summary: "Get active window" },
      })

      const { getActiveWindow } = await getNut()
      const win = await getActiveWindow()
      const title = await win.title
      const region = await win.region

      const result = {
        title,
        x: region.left ?? region.x,
        y: region.top ?? region.y,
        width: region.width,
        height: region.height,
      }

      return {
        title: `Active: "${title}"`,
        metadata: result,
        output: JSON.stringify(result),
      }
    },
  }
})
