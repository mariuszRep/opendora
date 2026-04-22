import z from "zod"
import * as path from "path"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import { resolveRegion } from "../lib/region.ts"
import { assertExternalDirectory } from "../../system/external-directory.ts"
import DESCRIPTION from "./screen-find-image.txt"

const regionSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

export const DesktopScreenFindImageTool = Tool.define("desktop_screen_find_image", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: DESCRIPTION,
    parameters: z.object({
      templatePath: z
        .string()
        .describe("Absolute path to the PNG template image to search for"),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum match confidence 0-1 (default: 0.8)"),
      region: regionSchema
        .optional()
        .describe("Restrict search to this screen region"),
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
          summary: `Find image ${path.basename(templatePath)} on screen`,
        },
      })

      const { screen, imageResource } = await getNut()
      if (params.confidence !== undefined) {
        screen.config.confidence = params.confidence
      }

      const needle = await imageResource(templatePath)
      let matches: Array<{ x: number; y: number; width: number; height: number; score?: number }>

      try {
        if (params.region) {
          const region = await resolveRegion(params.region)
          const found = await screen.findAll(needle, { searchRegion: region })
          matches = found.map((r: any) => ({
            x: r.left ?? r.x,
            y: r.top ?? r.y,
            width: r.width,
            height: r.height,
            score: r.score,
          }))
        } else {
          const found = await screen.findAll(needle)
          matches = found.map((r: any) => ({
            x: r.left ?? r.x,
            y: r.top ?? r.y,
            width: r.width,
            height: r.height,
            score: r.score,
          }))
        }
      } catch {
        matches = []
      }

      return {
        title: `Found ${matches.length} match${matches.length !== 1 ? "es" : ""} for ${path.basename(templatePath)}`,
        metadata: { matches, template: templatePath },
        output: JSON.stringify({ matches }),
      }
    },
  }
})
