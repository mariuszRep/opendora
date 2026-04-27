import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import { resolveButton } from "../lib/button.ts"
import toolDef from ".//mouse-click.json"

export const DesktopMouseClickTool = Tool.define("desktop_mouse_click", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: toolDef.description,
    parameters: z.object({
      button: z
        .enum(["left", "right", "middle"])
        .optional()
        .describe("Mouse button to click (default: left)"),
      double: z.boolean().optional().describe("Double-click instead of single-click"),
      x: z.number().int().optional().describe("X coordinate to move to before clicking"),
      y: z.number().int().optional().describe("Y coordinate to move to before clicking"),
    }),
    async execute(params, ctx) {
      assertNotSandbox(sandbox)
      assertDisplay()

      const btn = params.button ?? "left"
      const pos = params.x !== undefined && params.y !== undefined
        ? `(${params.x}, ${params.y})`
        : "current position"

      await ctx.ask({
        permission: "desktop",
        patterns: ["mouse"],
        always: [],
        metadata: {
          kind: "mouse",
          summary: `${params.double ? "Double-click" : "Click"} ${btn} at ${pos}`,
        },
      })

      const { mouse, straightTo } = await getNut()
      const button = await resolveButton(params.button)

      if (params.x !== undefined && params.y !== undefined) {
        await mouse.move(straightTo({ x: params.x, y: params.y }))
      }

      if (params.double) {
        await mouse.doubleClick(button)
      } else {
        await mouse.click(button)
      }

      const finalPos = await mouse.getPosition()

      return {
        title: `${params.double ? "Double-clicked" : "Clicked"} ${btn} at (${finalPos.x}, ${finalPos.y})`,
        metadata: { button: btn, double: params.double ?? false, x: finalPos.x, y: finalPos.y },
        output: JSON.stringify({ button: btn, double: params.double ?? false, x: finalPos.x, y: finalPos.y }),
      }
    },
  }
})
