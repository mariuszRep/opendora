import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"

export const DesktopWindowResizeTool = Tool.define("desktop_window_resize", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: "Resize a window (matched by title) to the specified width and height.",
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

      const { getWindows } = await getNut()
      const wins = await getWindows()
      const needle = params.title.toLowerCase()

      for (const w of wins as any[]) {
        const t: string = await w.title
        if (t.toLowerCase().includes(needle)) {
          await w.resize({ width: params.width, height: params.height })
          return {
            title: `Resized "${t}" to ${params.width}×${params.height}`,
            metadata: { title: t, width: params.width, height: params.height },
            output: JSON.stringify({ title: t, width: params.width, height: params.height }),
          }
        }
      }

      throw new Error(`No window found with title matching "${params.title}"`)
    },
  }
})
