import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import DESCRIPTION from "./mouse-move.txt"

export const DesktopMouseMoveTool = Tool.define("desktop_mouse_move", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: DESCRIPTION,
    parameters: z.object({
      x: z.number().int().describe("Target X coordinate in pixels"),
      y: z.number().int().describe("Target Y coordinate in pixels"),
      smooth: z.boolean().optional().describe("Use smooth animated movement (default: true)"),
      speed: z.number().int().positive().optional().describe("Mouse speed in pixels/sec (default: 1000)"),
    }),
    async execute(params, ctx) {
      assertNotSandbox(sandbox)
      assertDisplay()
      await ctx.ask({
        permission: "desktop",
        patterns: ["mouse"],
        always: [],
        metadata: { kind: "mouse", summary: `Move to (${params.x}, ${params.y})` },
      })

      const { mouse, straightTo } = await getNut()
      if (params.speed !== undefined) mouse.config.mouseSpeed = params.speed

      const dest = { x: params.x, y: params.y }
      if (params.smooth === false) {
        await mouse.setPosition(dest)
      } else {
        await mouse.move(straightTo(dest))
      }

      return {
        title: `Moved to (${params.x}, ${params.y})`,
        metadata: { x: params.x, y: params.y },
        output: JSON.stringify({ x: params.x, y: params.y }),
      }
    },
  }
})
