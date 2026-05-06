import z from "zod"
import * as path from "path"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import { resolveRegion } from "../lib/region.ts"
import { assertExternalDirectory } from "../../system/external-directory.ts"
import { captureComposite, findAllInImage } from "../lib/screen-native.ts"
import toolDef from ".//screen-wait-for-image.json"

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
      description: toolDef.description,
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

        const timeout = params.timeoutMs ?? 5000
        const interval = params.intervalMs ?? 500
        const confidence = params.confidence ?? 0.8
        const deadline = Date.now() + timeout

        let match: { x: number; y: number; width: number; height: number } | null = null

        if (process.platform === "linux") {
          // nut-js uses XShm internally which fails under XWayland/WSLg. Poll
          // with composite capture + Python/OpenCV instead on any Linux X11.
          const osModule = await import("os")
          const fsModule = await import("fs/promises")
          while (Date.now() < deadline) {
            const haystackPath = path.join(osModule.tmpdir(), "opendora-desktop", `wait-haystack-${Date.now()}.png`)
            try {
              await captureComposite(haystackPath)
              let hits = await findAllInImage(haystackPath, templatePath, confidence)
              if (params.region) {
                const { x: rx, y: ry, width: rw, height: rh } = params.region
                hits = hits.filter((m) => m.x >= rx && m.x <= rx + rw && m.y >= ry && m.y <= ry + rh)
              }
              if (hits.length > 0) {
                const h = hits[0]
                match = { x: h.x, y: h.y, width: h.width, height: h.height }
                break
              }
            } catch { /* ignore single-poll errors */ } finally {
              await fsModule.unlink(haystackPath).catch(() => {})
            }
            await new Promise((r) => setTimeout(r, interval))
          }
        } else {
          const { screen, imageResource } = await getNut()
          if (params.confidence !== undefined) screen.config.confidence = params.confidence
          screen.config.resourceDirectory = path.dirname(templatePath)
          const needle = await imageResource(path.basename(templatePath))
          const searchRegion = params.region ? await resolveRegion(params.region) : undefined
          const result = await screen.waitFor(needle, timeout, interval, searchRegion ? { searchRegion } : undefined)
          match = {
            x: (result as any).left ?? (result as any).x,
            y: (result as any).top ?? (result as any).y,
            width: (result as any).width,
            height: (result as any).height,
          }
        }

        if (!match) {
          throw new Error(`Timed out waiting for ${path.basename(templatePath)} (${timeout}ms)`)
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
