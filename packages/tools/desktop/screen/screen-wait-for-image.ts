import z from "zod"
import * as path from "path"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import { resolveRegion } from "../lib/region.ts"
import { assertExternalDirectory } from "../../system/external-directory.ts"
import DESCRIPTION from "./screen-wait-for-image.txt"

const regionSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

export const DesktopScreenWaitForImageTool = Tool.define(
  "desktop_screen_wait_for_image",
  async (initCtx) => {
    const sandbox = initCtx?.agent?.config?.sandbox ?? false
    return {
      description: DESCRIPTION,
      parameters: z.object({
        templatePath: z
          .string()
          .describe("Absolute path to the PNG template image to wait for"),
        timeoutMs: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Max wait time in ms (default: 5000)"),
        intervalMs: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Poll interval in ms (default: 500)"),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe("Minimum match confidence 0-1 (default: 0.8)"),
        region: regionSchema.optional().describe("Restrict search to this screen region"),
      }),
      async execute(params, ctx) {
        assertNotSandbox(sandbox)
        assertDisplay()

        const templatePath = path.resolve(params.templatePath)
        await assertExternalDirectory(ctx, templatePath)

        await ctx.ask({
          permission: "desktop",
          patterns: ["screen"],
          always: [],
          metadata: {
            kind: "screen",
            summary: `Wait for image ${path.basename(templatePath)}`,
          },
        })

        const { screen, imageResource } = await getNut()
        if (params.confidence !== undefined) screen.config.confidence = params.confidence

        const needle = await imageResource(templatePath)
        const timeout = params.timeoutMs ?? 5000
        const interval = params.intervalMs ?? 500
        const searchRegion = params.region ? await resolveRegion(params.region) : undefined

        const result = await screen.waitFor(needle, timeout, interval, searchRegion ? { searchRegion } : undefined)

        const match = {
          x: (result as any).left ?? (result as any).x,
          y: (result as any).top ?? (result as any).y,
          width: (result as any).width,
          height: (result as any).height,
        }

        return {
          title: `Found ${path.basename(templatePath)} at (${match.x}, ${match.y})`,
          metadata: { match, template: templatePath },
          output: JSON.stringify({ match }),
        }
      },
    }
  },
)
