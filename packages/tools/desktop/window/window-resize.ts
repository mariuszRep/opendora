import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import { nativeWindowsPreferred, findByTitle, resizeWindow } from "../lib/window-native.ts"
import DESCRIPTION from "./window-resize.txt"

export const DesktopWindowResizeTool = Tool.define("desktop_window_resize", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: DESCRIPTION,
    parameters: z.object({
      title: z.string().min(1).describe("Window title or substring to match"),
      width: z.number().int().positive().describe("New window width in pixels"),
      height: z.number().int().positive().describe("New window height in pixels"),
    }),
    async execute(params, ctx) {
      assertNotSandbox(sandbox)
      assertDisplay()
      await ctx.ask({
        permission: "desktop",
        patterns: ["window"],
        always: [],
        metadata: {
          kind: "window",
          summary: `Resize "${params.title}" to ${params.width}×${params.height}`,
        },
      })

      let resizedTitle: string

      if (nativeWindowsPreferred()) {
        const found = await findByTitle(params.title)
        if (!found) throw new Error(`No window found with title matching "${params.title}"`)
        await resizeWindow(found.id, params.width, params.height)
        resizedTitle = found.title
      } else {
        const { getWindows } = await getNut()
        const wins = await getWindows()
        const needle = params.title.toLowerCase()
        let hit: any = null
        for (const w of wins as any[]) {
          const t: string = await w.title
          if (t.toLowerCase().includes(needle)) {
            hit = w
            resizedTitle = t
            break
          }
        }
        if (!hit) throw new Error(`No window found with title matching "${params.title}"`)
        await hit.resize({ width: params.width, height: params.height })
        resizedTitle = resizedTitle!
      }

      const result = { title: resizedTitle, width: params.width, height: params.height }
      return {
        title: `Resized "${resizedTitle}" to ${params.width}×${params.height}`,
        metadata: result,
        output: JSON.stringify(result),
      }
    },
  }
})
