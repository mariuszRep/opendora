/**
 * Native screen-capture fallbacks.
 *
 * libnut's XGetImage-based capture fails under WSLg (and some other Xwayland
 * setups) with "Failed to capture screen". The system screenshot binaries
 * (scrot, maim, grim, ImageMagick's `import`) use different X11/Wayland code
 * paths that work where libnut does not.
 *
 * This module resolves and spawns one of those binaries on demand. It is
 * intentionally Linux-only; non-Linux platforms keep the existing libnut path.
 */

import { spawn } from "child_process"
import fs from "fs/promises"
import path from "path"
import os from "os"

export class NativeScreenUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NativeScreenUnavailableError"
  }
}

export interface Region {
  x: number
  y: number
  width: number
  height: number
}

export interface PixelColor {
  r: number
  g: number
  b: number
}

/**
 * True when libnut's capture path is known to be broken and we should prefer
 * a native binary. Currently: WSL (WSLg's Xwayland root window cannot be
 * grabbed via XGetImage).
 */
export function nativeCapturePreferred(): boolean {
  if (process.platform !== "linux") return false
  return !!(
    process.env.WSL_DISTRO_NAME ||
    process.env.WSL_INTEROP ||
    process.env.WSLENV !== undefined
  )
}

type Tool = { cmd: string; supportsRegion: boolean }

let _resolved: Tool | null | undefined

async function which(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("which", [cmd], { stdio: ["ignore", "pipe", "ignore"] })
    let out = ""
    child.stdout.on("data", (c) => (out += c))
    child.on("error", () => resolve(null))
    child.on("close", (code) => resolve(code === 0 ? out.trim() || null : null))
  })
}

async function resolveTool(): Promise<Tool | null> {
  if (_resolved !== undefined) return _resolved
  // Order of preference: scrot (smallest, known-good under WSLg), maim (region
  // via --geometry), grim (Wayland-only, fails on WSLg Weston today but kept
  // for future), ImageMagick import (fallback).
  const candidates: Tool[] = [
    { cmd: "scrot", supportsRegion: true },
    { cmd: "maim", supportsRegion: true },
    { cmd: "import", supportsRegion: true },
  ]
  for (const c of candidates) {
    if (await which(c.cmd)) {
      _resolved = c
      return _resolved
    }
  }
  _resolved = null
  return null
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] })
    let err = ""
    child.stderr.on("data", (c) => (err += c))
    child.on("error", (e) => reject(e))
    child.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited with code ${code}: ${err.trim()}`))
    })
  })
}

/** Capture the whole screen to the given PNG path. */
export async function captureFull(destPath: string): Promise<void> {
  const tool = await resolveTool()
  if (!tool) {
    throw new NativeScreenUnavailableError(
      "No screenshot binary found. Install one of: scrot, maim, imagemagick (provides `import`).",
    )
  }
  await fs.mkdir(path.dirname(destPath), { recursive: true })
  if (tool.cmd === "scrot") {
    await run("scrot", ["--overwrite", destPath])
  } else if (tool.cmd === "maim") {
    await run("maim", [destPath])
  } else {
    // import -window root
    await run("import", ["-window", "root", destPath])
  }
}

/**
 * Capture a single X11 window (by numeric window ID) to the given PNG path.
 * Works under WSLg where full-screen root capture returns a black image — each
 * client window has its own composited pixmap that `XGetImage(window_id)` can
 * read via ImageMagick `import -window <id>`.
 */
export async function captureWindow(windowId: number, destPath: string): Promise<void> {
  // Prefer `import` — it accepts a raw window ID directly. scrot/maim don't.
  const importPath = await which("import")
  if (!importPath) {
    throw new NativeScreenUnavailableError(
      "Per-window capture needs ImageMagick's `import`. Install: `sudo apt install imagemagick`.",
    )
  }
  await fs.mkdir(path.dirname(destPath), { recursive: true })
  await run("import", ["-window", String(windowId), destPath])
}

/** Capture a rectangular region to the given PNG path. */
export async function captureRegion(region: Region, destPath: string): Promise<void> {
  const tool = await resolveTool()
  if (!tool) {
    throw new NativeScreenUnavailableError(
      "No screenshot binary found. Install one of: scrot, maim, imagemagick.",
    )
  }
  await fs.mkdir(path.dirname(destPath), { recursive: true })
  const { x, y, width, height } = region
  if (tool.cmd === "scrot") {
    await run("scrot", ["--overwrite", "-a", `${x},${y},${width},${height}`, destPath])
  } else if (tool.cmd === "maim") {
    await run("maim", ["--geometry", `${width}x${height}+${x}+${y}`, destPath])
  } else {
    await run("import", ["-window", "root", "-crop", `${width}x${height}+${x}+${y}`, "+repage", destPath])
  }
}

/**
 * Read the RGB color at a single pixel by capturing a 1×1 region.
 * Cheap under scrot/maim (<20ms).
 */
export async function colorAt(x: number, y: number): Promise<PixelColor> {
  const tmp = path.join(os.tmpdir(), "opendora-desktop", `pixel-${process.pid}-${Date.now()}.png`)
  try {
    await captureRegion({ x, y, width: 1, height: 1 }, tmp)
    const buf = await fs.readFile(tmp)
    return decodePngPixel(buf)
  } finally {
    await fs.unlink(tmp).catch(() => {})
  }
}

/**
 * Minimal PNG decoder: extracts the first pixel's RGB from a 1×1 PNG.
 * Avoids pulling in a dependency for a tiny operation.
 */
function decodePngPixel(buf: Buffer): PixelColor {
  // PNG signature: 8 bytes. Then IHDR chunk at offset 8.
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error("not a PNG")
  }
  // IDAT chunk: find it.
  let off = 8
  let idat: Buffer | null = null
  let colorType = 0
  let bitDepth = 0
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.slice(off + 4, off + 8).toString("ascii")
    const data = buf.slice(off + 8, off + 8 + len)
    if (type === "IHDR") {
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === "IDAT") {
      idat = data
      break
    }
    off += 12 + len
  }
  if (!idat) throw new Error("PNG has no IDAT")
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`)
  // Decompress IDAT with zlib.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const zlib = require("zlib") as typeof import("zlib")
  const raw = zlib.inflateSync(idat)
  // For a 1×1 image: [filterByte, r, g, b, (a)?]. Filter byte 0 = None.
  if (raw.length < 4) throw new Error("PNG payload too small")
  const r = raw[1]
  const g = raw[2]
  const b = raw[3]
  // color types: 2=RGB, 6=RGBA, 0=gray, 4=gray+a, 3=palette (unsupported here)
  if (colorType === 0 || colorType === 4) return { r, g: r, b: r }
  return { r, g, b }
}
