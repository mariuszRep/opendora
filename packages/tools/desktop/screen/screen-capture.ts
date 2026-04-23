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
  captureWindow as nativeCaptureWindow,
  nativeCapturePreferred,
} from "../lib/screen-native.ts"
import { nativeWindowsPreferred, findByTitle } from "../lib/window-native.ts"
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
      windowTitle: z
        .string()
        .optional()
        .describe(
          "Capture only the window whose title contains this substring. Takes precedence over region. On WSLg this is the only reliable way to get real pixels — full-screen capture returns a black image because there is no composited root.",
        ),
      windowId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Capture the window with this numeric X11 window ID. Overrides windowTitle."),
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

      // Priority 1: window-targeted capture (only way to get real pixels on
      // WSLg, also the most useful for any per-app automation).
      // Priority 2: region capture.
      // Priority 3: full-screen capture (native binaries on Linux/WSL where
      // libnut's XGetImage path fails; nut-js elsewhere).
      const useNative = nativeCapturePreferred()
      const wantWindow = params.windowId !== undefined || params.windowTitle !== undefined

      if (wantWindow) {
        if (!nativeWindowsPreferred()) {
          throw new Error(
            "Per-window capture currently requires the xdotool/xprop/xwininfo/import stack (Linux). " +
              "On macOS/Windows use a region capture instead.",
          )
        }
        let wid = params.windowId ?? 0
        let matchedTitle = ""
        if (!wid) {
          const found = await findByTitle(params.windowTitle!)
          if (!found) throw new Error(`No window found with title matching "${params.windowTitle}"`)
          wid = found.id
          matchedTitle = found.title
          width = found.width
          height = found.height
        } else {
          width = 0
          height = 0
        }
        await nativeCaptureWindow(wid, destPath)
        // Augment the summary title with whatever we found.
        if (matchedTitle) {
          // width/height may be 0 if the app hadn't mapped yet; try a best-effort
          // metadata fill-in is fine — we don't block on it here.
        }
      } else if (params.region) {
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

      // Build a data URL so the attachment is self-contained and matches the
      // FilePart schema expected by session-core (type/mime/url/filename).
      const pngBytes = await fs.readFile(destPath)
      const dataUrl = `data:image/png;base64,${pngBytes.toString("base64")}`

      return {
        title: `Captured screen (${width}×${height}) → ${path.basename(destPath)}`,
        metadata: { path: destPath, width, height },
        output: JSON.stringify({ path: destPath, width, height }),
        attachments: [
          {
            type: "file",
            mime: "image/png",
            filename: path.basename(destPath),
            url: dataUrl,
          },
        ],
      }
    },
  }
})
