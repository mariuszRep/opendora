import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import { resolveButton } from "../lib/button.ts"
import DESCRIPTION from "./mouse-drag.txt"

const pointSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
})

export const DesktopMouseDragTool = Tool.define("desktop_mouse_drag", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: DESCRIPTION,
    parameters: z.object({
      from: pointSchema.describe("Start position {x, y}"),
      to: pointSchema.describe("End position {x, y}"),
      button: z
        .enum(["left", "right", "middle"])
        .optional()
        .describe("Mouse button to hold during drag (default: left)"),
      speed: z.number().int().positive().optional().describe("Mouse speed in pixels/sec"),
    }),
    async execute(params, ctx) {
      assertNotSandbox(sandbox)
      assertDisplay()
      await ctx.ask({
        permission: "desktop",
        patterns: ["mouse"],
        always: [],
        metadata: {
          kind: "mouse",
          summary: `Drag from (${params.from.x}, ${params.from.y}) to (${params.to.x}, ${params.to.y})`,
        },
      })

      const { mouse, straightTo } = await getNut()
      const button = await resolveButton(params.button)
      if (params.speed !== undefined) mouse.config.mouseSpeed = params.speed

      await mouse.move(straightTo(params.from))
      await mouse.pressButton(button)
      await mouse.move(straightTo(params.to))
      await mouse.releaseButton(button)

      return {
        title: `Dragged (${params.from.x}, ${params.from.y}) → (${params.to.x}, ${params.to.y})`,
        metadata: { from: params.from, to: params.to, button: params.button ?? "left" },
        output: JSON.stringify({ from: params.from, to: params.to }),
      }
    },
  }
})
