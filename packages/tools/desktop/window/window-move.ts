import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import DESCRIPTION from "./window-move.txt"

export const DesktopWindowMoveTool = Tool.define("desktop_window_move", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: DESCRIPTION,
    parameters: z.object({
      title: z.string().min(1).describe("Window title or substring to match"),
      x: z.number().int().describe("New X position of the window's top-left corner"),
      y: z.number().int().describe("New Y position of the window's top-left corner"),
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
          summary: `Move "${params.title}" to (${params.x}, ${params.y})`,
        },
      })

      const { getWindows } = await getNut()
      const wins = await getWindows()
      const needle = params.title.toLowerCase()

      for (const w of wins as any[]) {
        const t: string = await w.title
        if (t.toLowerCase().includes(needle)) {
          await w.move({ x: params.x, y: params.y })
          return {
            title: `Moved "${t}" to (${params.x}, ${params.y})`,
            metadata: { title: t, x: params.x, y: params.y },
            output: JSON.stringify({ title: t, x: params.x, y: params.y }),
          }
        }
      }

      throw new Error(`No window found with title matching "${params.title}"`)
    },
  }
})
