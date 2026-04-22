import z from "zod"
import * as path from "path"
import * as fs from "fs/promises"
import * as os from "os"
import { Tool } from "../../tool.ts"
import { getNut } from "../lib/nut.ts"
import { assertNotSandbox, assertDisplay } from "../lib/guards.ts"
import { resolveRegion } from "../lib/region.ts"
import {
  captureFull as nativeCaptureFull,
  captureRegion as nativeCaptureRegion,
  nativeCapturePreferred,
} from "../lib/screen-native.ts"
import { assertExternalDirectory } from "../../system/external-directory.ts"
import DESCRIPTION from "./screen-capture.txt"

const regionSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

export const DesktopScreenCaptureTool = Tool.define("desktop_screen_capture", async (initCtx) => {
  const sandbox = initCtx?.agent?.config?.sandbox ?? false
  return {
    description: DESCRIPTION,
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

      let width: number
      let height: number

      // libnut's XGetImage path fails under WSLg ("Failed to capture screen").
      // Prefer a native binary (scrot/maim/import) there. Fall back to nut-js
      // on other Linux/macOS/Windows environments.
      const useNative = nativeCapturePreferred()

      if (params.region) {
        if (useNative) {
          await nativeCaptureRegion(params.region, destPath)
        } else {
          const region = await resolveRegion(params.region)
          const { screen } = await getNut()
          const image = await screen.grabRegion(region)
          await (image as any).toFile(destPath)
        }
        width = params.region.width
        height = params.region.height
      } else {
        if (useNative) {
          await nativeCaptureFull(destPath)
          const { screen } = await getNut()
          width = await screen.width().catch(() => 0)
          height = await screen.height().catch(() => 0)
        } else {
          const { screen } = await getNut()
          const image = await screen.grab()
          await (image as any).toFile(destPath)
          width = await screen.width()
          height = await screen.height()
        }
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
