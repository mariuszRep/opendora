import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import DESCRIPTION from "./window-list.txt"

export const DesktopWindowListTool = Tool.define("desktop_window_list", async (initCtx) => {
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
        metadata: { kind: "window", summary: "List all windows" },
      })

      const { getWindows } = await getNut()
      const wins = await getWindows()
      const windows = await Promise.all(
        wins.map(async (w: any) => {
          const title = await w.title
          const region = await w.region
          return {
            title,
            x: region.left ?? region.x,
            y: region.top ?? region.y,
            width: region.width,
            height: region.height,
          }
        }),
      )

      return {
        title: `${windows.length} window${windows.length !== 1 ? "s" : ""}`,
        metadata: { windows },
        output: JSON.stringify({ windows }),
      }
    },
  }
})
