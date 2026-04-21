import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"

export const DesktopScreenReadPixelTool = Tool.define("desktop_screen_read_pixel", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: "Read the RGB color of a single pixel at the given screen coordinates.",
    parameters: z.object({
      x: z.number().int().describe("X coordinate in pixels"),
      y: z.number().int().describe("Y coordinate in pixels"),
    }),
    async execute(params, ctx) {
      assertNotSandbox(sandbox)
      assertDisplay()
      await ctx.ask({
        permission: "desktop",
        patterns: ["screen"],
        always: [],
        metadata: { kind: "screen", summary: `Read pixel at (${params.x}, ${params.y})` },
      })

      const { screen } = await getNut()
      const color = await screen.colorAt({ x: params.x, y: params.y })
      const r = Math.round(color.red * 255)
      const g = Math.round(color.green * 255)
      const b = Math.round(color.blue * 255)

      return {
        title: `Pixel (${params.x}, ${params.y}): rgb(${r}, ${g}, ${b})`,
        metadata: { x: params.x, y: params.y, r, g, b },
        output: JSON.stringify({ x: params.x, y: params.y, r, g, b }),
      }
    },
  }
})
