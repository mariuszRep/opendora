import z from "zod"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import toolDef from ".//mouse-scroll.json"

export const DesktopMouseScrollTool = Tool.define("desktop_mouse_scroll", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  const parameters = z.object({
    direction: z
      .enum(["up", "down", "left", "right"])
      .describe("Scroll direction"),
    amount: z
      .number()
      .int()
      .positive()
      .describe("Number of scroll steps"),
  })
  return {
    description: toolDef.description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      assertNotSandbox(sandbox)
      assertDisplay()
      await ctx.ask({
        permission: "desktop",
        patterns: ["mouse"],
        always: [],
        metadata: {
          kind: "mouse",
          summary: `Scroll ${params.direction} × ${params.amount}`,
        },
      })

      const { mouse } = await getNut()

      switch (params.direction) {
        case "up":    await mouse.scrollUp(params.amount);    break
        case "down":  await mouse.scrollDown(params.amount);  break
        case "left":  await mouse.scrollLeft(params.amount);  break
        case "right": await mouse.scrollRight(params.amount); break
      }

      return {
        title: `Scrolled ${params.direction} × ${params.amount}`,
        metadata: { direction: params.direction, amount: params.amount },
        output: JSON.stringify({ direction: params.direction, amount: params.amount }),
      }
    },
  }
})
