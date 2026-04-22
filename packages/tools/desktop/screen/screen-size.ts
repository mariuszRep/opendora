import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import DESCRIPTION from "./screen-size.txt"

export const DesktopScreenSizeTool = Tool.define("desktop_screen_size", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: DESCRIPTION,
    parameters: z.object({}),
    async execute(_params, ctx) {
      assertNotSandbox(sandbox)
      assertDisplay()
      await ctx.ask({
        permission: "desktop",
        patterns: ["screen"],
        always: [],
        metadata: { kind: "screen", summary: "Read screen dimensions" },
      })

      const { screen } = await getNut()
      const width = await screen.width()
      const height = await screen.height()

      return {
        title: `Screen ${width}×${height}`,
        metadata: { width, height },
        output: JSON.stringify({ width, height }),
      }
    },
  }
})
