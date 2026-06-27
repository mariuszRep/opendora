import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import { nativeWindowsPreferred, findByTitle, focusWindow } from "../lib/window-native.ts"
import toolDef from ".//window-focus.json"

export const DesktopWindowFocusTool = Tool.define("desktop_window_focus", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  const parameters = z.object({
    title: z.string().min(1).describe("Window title or substring to match"),
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
        metadata: { kind: "window", summary: `Focus window matching "${params.title}"` },
      })

      let matchedTitle: string
      let matchedId: number | null = null

      if (nativeWindowsPreferred()) {
        const found = await findByTitle(params.title)
        if (!found) throw new Error(`No window found with title matching "${params.title}"`)
        await focusWindow(found.id)
        matchedTitle = found.title
        matchedId = found.id
      } else {
        const { getWindows } = await getNut()
        const wins = await getWindows()
        const needle = params.title.toLowerCase()
        let hit: any = null
        for (const w of wins as any[]) {
          const t: string = await w.title
          if (t.toLowerCase().includes(needle)) {
            hit = w
            matchedTitle = t
            break
          }
        }
        if (!hit) throw new Error(`No window found with title matching "${params.title}"`)
        await hit.focus()
        matchedTitle = matchedTitle!
      }

      const result = { title: matchedTitle, id: matchedId }
      return {
        title: `Focused "${matchedTitle}"`,
        metadata: result,
        output: JSON.stringify(result),
      }
    },
  }
})
