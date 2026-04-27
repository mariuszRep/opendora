import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import { nativeWindowsPreferred, getActive as nativeActive } from "../lib/window-native.ts"
import toolDef from ".//window-active.json"

export const DesktopWindowActiveTool = Tool.define("desktop_window_active", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
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

      let result: {
        id?: number
        title: string
        wmClass?: string
        pid?: number | null
        x: number
        y: number
        width: number
        height: number
      }

      if (nativeWindowsPreferred()) {
        const w = await nativeActive()
        if (!w) {
          return {
            title: "No active window",
            metadata: { title: "", x: 0, y: 0, width: 0, height: 0 },
            output: JSON.stringify({ title: "", x: 0, y: 0, width: 0, height: 0 }),
          }
        }
        result = {
          id: w.id,
          title: w.title,
          wmClass: w.wmClass,
          pid: w.pid,
          x: w.x,
          y: w.y,
          width: w.width,
          height: w.height,
        }
      } else {
        const { getActiveWindow } = await getNut()
        const win = await getActiveWindow()
        const title = await win.title
        const region: any = await win.region
        result = {
          title,
          x: region.left ?? region.x,
          y: region.top ?? region.y,
          width: region.width,
          height: region.height,
        }
      }

      return {
        title: `Active: "${result.title}"`,
        metadata: result,
        output: JSON.stringify(result),
      }
    },
  }
})
