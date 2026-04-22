import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import { colorAt as nativeColorAt, nativeCapturePreferred } from "../lib/screen-native.ts"
import DESCRIPTION from "./screen-read-pixel.txt"

export const DesktopScreenReadPixelTool = Tool.define("desktop_screen_read_pixel", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: DESCRIPTION,
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

      let r: number, g: number, b: number
      if (nativeCapturePreferred()) {
        const c = await nativeColorAt(params.x, params.y)
        r = c.r; g = c.g; b = c.b
      } else {
        const { screen } = await getNut()
        const color = await (screen as any).colorAt({ x: params.x, y: params.y })
        r = Math.round(color.R ?? color.red * 255)
        g = Math.round(color.G ?? color.green * 255)
        b = Math.round(color.B ?? color.blue * 255)
      }

      return {
        title: `Pixel (${params.x}, ${params.y}): rgb(${r}, ${g}, ${b})`,
        metadata: { x: params.x, y: params.y, r, g, b },
        output: JSON.stringify({ x: params.x, y: params.y, r, g, b }),
      }
    },
  }
})
