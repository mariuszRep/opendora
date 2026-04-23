/**
 * Native clipboard fallback.
 *
 * @nut-tree-fork/nut-js delegates to a clipboardy-backed provider. Under Bun
 * with `--conditions=browser`, `require("clipboardy")` resolves the v4 ESM
 * browser build with no `.default` property, so the provider crashes with
 * `TypeError: undefined is not an object (evaluating 'clipboardy_1.default.read')`
 * before it ever touches the OS clipboard.
 *
 * This helper bypasses nut-js/clipboardy and shells out to standard Linux
 * clipboard utilities instead (wl-copy/wl-paste on Wayland; xclip on X11).
 * It's intentionally Linux-only — macOS/Windows keep the existing nut-js path.
 */

import { spawn } from "child_process"

export class NativeClipboardUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NativeClipboardUnavailableError"
  }
}

/**
 * True when the nut-js / clipboardy path is known to be broken under our
 * runtime (Bun + `--conditions=browser`) and we should prefer native binaries.
 * Scoped to Linux; other platforms keep their working nut-js behavior.
 */
export function nativeClipboardPreferred(): boolean {
  // Currently disabled: nut-js's clipboardy-backed provider works on Linux
  // once we stop passing Bun `--conditions=browser` to server code (fixed
  // in root package.json scripts + start.ts spawn args). Kept as a fallback
  // path for environments where the nut-js clipboard path regresses.
  return false
}

type Backend =
  | { kind: "wayland" }   // wl-copy / wl-paste
  | { kind: "x11" }       // xclip -selection clipboard

let _resolved: Backend | null | undefined

async function which(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("which", [cmd], { stdio: ["ignore", "ignore", "ignore"] })
    child.on("error", () => resolve(false))
    child.on("close", (code) => resolve(code === 0))
  })
}

async function resolveBackend(): Promise<Backend | null> {
  if (_resolved !== undefined) return _resolved
  // Prefer Wayland if WAYLAND_DISPLAY is set AND wl-copy exists (WSLg ships
  // Weston and WAYLAND_DISPLAY=wayland-0).
  if (process.env.WAYLAND_DISPLAY && (await which("wl-copy")) && (await which("wl-paste"))) {
    _resolved = { kind: "wayland" }
    return _resolved
  }
  if (await which("xclip")) {
    _resolved = { kind: "x11" }
    return _resolved
  }
  // Last try: wl-clipboard without WAYLAND_DISPLAY hint.
  if ((await which("wl-copy")) && (await which("wl-paste"))) {
    _resolved = { kind: "wayland" }
    return _resolved
  }
  _resolved = null
  return null
}

function runCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] })
    let out = ""
    let err = ""
    child.stdout.on("data", (c) => (out += c))
    child.stderr.on("data", (c) => (err += c))
    child.on("error", (e) => reject(e))
    child.on("close", (code) => {
      // wl-paste returns 1 on empty clipboard with "Nothing is copied" — treat
      // as empty string rather than error so callers can read a cleared clipboard.
      if (code === 0) return resolve(out)
      if (/nothing is copied/i.test(err)) return resolve("")
      reject(new Error(`${cmd} exited with code ${code}: ${err.trim()}`))
    })
  })
}

function runWrite(cmd: string, args: string[], input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "pipe"] })
    let err = ""
    child.stderr.on("data", (c) => (err += c))
    child.on("error", (e) => reject(e))
    child.on("close", (code) => {
      if (code === 0) return resolve()
      reject(new Error(`${cmd} exited with code ${code}: ${err.trim()}`))
    })
    child.stdin.end(input, "utf8")
  })
}

export async function readText(): Promise<string> {
  const b = await resolveBackend()
  if (!b) {
    throw new NativeClipboardUnavailableError(
      "No clipboard binary found. Install one of: wl-clipboard (wl-copy/wl-paste), xclip.",
    )
  }
  if (b.kind === "wayland") {
    // --no-newline prevents wl-paste from appending a trailing newline.
    return await runCapture("wl-paste", ["--no-newline"])
  }
  return await runCapture("xclip", ["-selection", "clipboard", "-o"])
}

export async function writeText(text: string): Promise<void> {
  const b = await resolveBackend()
  if (!b) {
    throw new NativeClipboardUnavailableError(
      "No clipboard binary found. Install one of: wl-clipboard (wl-copy/wl-paste), xclip.",
    )
  }
  if (b.kind === "wayland") {
    // -n = don't add a trailing newline; keeps content byte-exact.
    await runWrite("wl-copy", ["-n"], text)
    return
  }
  await runWrite("xclip", ["-selection", "clipboard"], text)
}
