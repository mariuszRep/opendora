import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import { nativeWindowsPreferred, findByTitle, moveWindow } from "../lib/window-native.ts"
import toolDef from ".//window-move.json"

export const DesktopWindowMoveTool = Tool.define("desktop_window_move", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  const parameters = z.object({
    title: z.string().min(1).describe("Window title or substring to match"),
    x: z.number().int().describe("New X position of the window's top-left corner"),
    y: z.number().int().describe("New Y position of the window's top-left corner"),
  })
  return {
    description: toolDef.description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
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

      let movedTitle: string

      if (nativeWindowsPreferred()) {
        const found = await findByTitle(params.title)
        if (!found) throw new Error(`No window found with title matching "${params.title}"`)
        await moveWindow(found.id, params.x, params.y)
        movedTitle = found.title
      } else {
        const { getWindows } = await getNut()
        const wins = await getWindows()
        const needle = params.title.toLowerCase()
        let hit: any = null
        for (const w of wins as any[]) {
          const t: string = await w.title
          if (t.toLowerCase().includes(needle)) {
            hit = w
            movedTitle = t
            break
          }
        }
        if (!hit) throw new Error(`No window found with title matching "${params.title}"`)
        await hit.move({ x: params.x, y: params.y })
        movedTitle = movedTitle!
      }

      const result = { title: movedTitle, x: params.x, y: params.y }
      return {
        title: `Moved "${movedTitle}" to (${params.x}, ${params.y})`,
        metadata: result,
        output: JSON.stringify(result),
      }
    },
  }
})
