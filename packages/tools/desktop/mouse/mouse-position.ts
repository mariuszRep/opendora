import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import DESCRIPTION from "./mouse-position.txt"

export const DesktopMousePositionTool = Tool.define("desktop_mouse_position", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: DESCRIPTION,
    parameters: z.object({}),
    async execute(_params, ctx) {
      assertNotSandbox(sandbox)
      assertDisplay()
      await ctx.ask({
        permission: "desktop",
        patterns: ["mouse"],
        always: [],
        metadata: { kind: "mouse", summary: "Read cursor position" },
      })

      const { mouse } = await getNut()
      const pos = await mouse.getPosition()

      return {
        title: `Cursor at (${pos.x}, ${pos.y})`,
        metadata: { x: pos.x, y: pos.y },
        output: JSON.stringify({ x: pos.x, y: pos.y }),
      }
    },
  }
})
