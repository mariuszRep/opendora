import z from "zod"
import * as path from "path"
import * as fs from "fs/promises"
import * as os from "os"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import { resolveRegion } from "../lib/region.ts"
import { assertExternalDirectory } from "../../system/external-directory.ts"

const regionSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

export const DesktopScreenCaptureTool = Tool.define("desktop_screen_capture", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description:
      "Capture a screenshot of the full screen or a region. " +
      "Returns the saved file path and image dimensions.",
    parameters: z.object({
      region: regionSchema
        .optional()
        .describe("Capture only this region {x, y, width, height}; omit for full screen"),
      path: z.string().optional().describe("Output file path (PNG). Defaults to a temp file."),
    }),
    async execute(params, ctx) {
      assertNotSandbox(sandbox)
      assertDisplay()

      const destPath = params.path
        ? path.resolve(params.path)
        : path.join(os.tmpdir(), "opendora-desktop", `${ctx.callID ?? Date.now()}.png`)

      await assertExternalDirectory(ctx, params.path ? destPath : undefined, { write: true })

      await ctx.ask({
        permission: "desktop",
        patterns: ["screen"],
        always: [],
        metadata: { kind: "screen", summary: `Capture screen → ${path.basename(destPath)}` },
      })

      await fs.mkdir(path.dirname(destPath), { recursive: true })

      const { screen, ImageFormat } = await getNut()

      let width: number
      let height: number

      if (params.region) {
        const region = await resolveRegion(params.region)
        const image = await screen.grabRegion(region)
        await image.toFile(destPath)
        width = params.region.width
        height = params.region.height
      } else {
        const image = await screen.grab()
        await image.toFile(destPath)
        width = await screen.width()
        height = await screen.height()
      }

      return {
        title: `Captured screen (${width}×${height}) → ${path.basename(destPath)}`,
        metadata: { path: destPath, width, height },
        output: JSON.stringify({ path: destPath, width, height }),
        attachments: [{ kind: "image", path: destPath }],
      }
    },
  }
})
