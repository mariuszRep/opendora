import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"

export const DesktopWindowFocusTool = Tool.define("desktop_window_focus", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: "Bring a window to the foreground by matching its title (case-insensitive substring).",
    parameters: z.object({
      title: z.string().min(1).describe("Window title or substring to match"),
    }),
    async execute(params, ctx) {
      assertNotSandbox(sandbox)
      assertDisplay()
      await ctx.ask({
        permission: "desktop",
        patterns: ["window"],
        always: [],
        metadata: { kind: "window", summary: `Focus window matching "${params.title}"` },
      })

      const { getWindows } = await getNut()
      const wins = await getWindows()
      const needle = params.title.toLowerCase()

      for (const w of wins as any[]) {
        const t: string = await w.title
        if (t.toLowerCase().includes(needle)) {
          await w.focus()
          return {
            title: `Focused "${t}"`,
            metadata: { title: t },
            output: JSON.stringify({ title: t }),
          }
        }
      }

      throw new Error(`No window found with title matching "${params.title}"`)
    },
  }
})
