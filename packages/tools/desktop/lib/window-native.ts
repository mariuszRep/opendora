/**
 * Native window-management fallback.
 *
 * libnut's `getWindows()` uses `XQueryTree(root)` which only returns Xwayland's
 * outer wrappers under WSLg — the real client windows (with WM_NAME, WM_CLASS,
 * correct geometry) are nested inside them and never surfaced. libnut also
 * cannot capture a specific window's pixmap.
 *
 * We use xdotool + xprop + xwininfo to enumerate and query real client windows
 * on any X11 display (including WSLg). On non-Linux platforms nothing in here
 * runs; tools keep using nut-js directly.
 */

import { spawn } from "child_process"

export class NativeWindowUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NativeWindowUnavailableError"
  }
}

export interface WindowInfo {
  id: number
  title: string
  wmClass: string
  pid: number | null
  x: number
  y: number
  width: number
  height: number
}

/**
 * True when we should prefer the shell backend over nut-js for window ops.
 * Currently: all Linux (xdotool is the standard tool; nut-js on WSLg misses
 * real client windows, and on Xorg xdotool and libnut are functionally
 * equivalent).
 */
export function nativeWindowsPreferred(): boolean {
  return process.platform === "linux"
}

let _available: boolean | null = null

async function haveBin(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("which", [cmd], { stdio: ["ignore", "ignore", "ignore"] })
    child.on("error", () => resolve(false))
    child.on("close", (code) => resolve(code === 0))
  })
}

export async function isAvailable(): Promise<boolean> {
  if (_available !== null) return _available
  const [x, p, w] = await Promise.all([haveBin("xdotool"), haveBin("xprop"), haveBin("xwininfo")])
  _available = x && p && w
  return _available
}

function run(cmd: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: [input ? "pipe" : "ignore", "pipe", "pipe"] })
    let out = ""
    let err = ""
    child.stdout?.on("data", (c) => (out += c))
    child.stderr?.on("data", (c) => (err += c))
    child.on("error", (e) => reject(e))
    child.on("close", (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(`${cmd} exited with code ${code}: ${err.trim() || out.trim()}`))
    })
    if (input) {
      child.stdin?.end(input)
    }
  })
}

function parseXprop(line: string): string {
  // Examples:
  //   WM_NAME(STRING) = "xeyes"
  //   WM_NAME(UTF8_STRING) = "xeyes"
  //   _NET_WM_PID(CARDINAL) = 12345
  //   WM_CLASS(STRING) = "xeyes", "XEyes"
  const m = line.match(/=\s*(.*)$/)
  if (!m || !m[1]) return ""
  return m[1].trim()
}

function stripQuotes(s: string): string {
  const m = s.match(/^"(.*)"$/)
  return m && m[1] !== undefined ? m[1] : s
}

async function queryProps(id: number): Promise<{ title: string; wmClass: string; pid: number | null }> {
  let title = ""
  let wmClass = ""
  let pid: number | null = null
  try {
    const out = await run("xprop", ["-id", String(id), "WM_NAME", "_NET_WM_NAME", "WM_CLASS", "_NET_WM_PID"])
    for (const line of out.split("\n")) {
      if (line.startsWith("_NET_WM_NAME")) {
        const v = parseXprop(line)
        if (v && v !== "not found.") title = stripQuotes(v.replace(/^utf8_string\s*/i, "")) || title
      } else if (line.startsWith("WM_NAME") && !title) {
        const v = parseXprop(line)
        if (v && v !== "not found.") title = stripQuotes(v)
      } else if (line.startsWith("WM_CLASS")) {
        const v = parseXprop(line)
        if (v && v !== "not found.") {
          const parts = v.split(",").map((p) => stripQuotes(p.trim())).filter(Boolean)
          wmClass = parts.join("|")
        }
      } else if (line.startsWith("_NET_WM_PID")) {
        const v = parseXprop(line)
        const n = Number(v)
        if (Number.isFinite(n) && n > 0) pid = n
      }
    }
  } catch {
    /* ignore; leave defaults */
  }
  return { title, wmClass, pid }
}

async function queryGeometry(id: number): Promise<{ x: number; y: number; width: number; height: number } | null> {
  try {
    const out = await run("xwininfo", ["-id", String(id)])
    let x = 0, y = 0, w = 0, h = 0
    for (const line of out.split("\n")) {
      const m = line.match(/Absolute upper-left X:\s+(-?\d+)/)
      if (m) x = Number(m[1])
      const my = line.match(/Absolute upper-left Y:\s+(-?\d+)/)
      if (my) y = Number(my[1])
      const mw = line.match(/^\s*Width:\s+(\d+)/)
      if (mw) w = Number(mw[1])
      const mh = line.match(/^\s*Height:\s+(\d+)/)
      if (mh) h = Number(mh[1])
    }
    return { x, y, width: w, height: h }
  } catch {
    return null
  }
}

/**
 * Enumerate all named top-level client windows. Only windows with a non-empty
 * `WM_NAME` / `_NET_WM_NAME` are returned, which filters out Xwayland's own
 * scaffolding and input proxies that have no user-visible identity.
 */
export async function listWindows(): Promise<WindowInfo[]> {
  if (!(await isAvailable())) {
    throw new NativeWindowUnavailableError(
      "xdotool / xprop / xwininfo not installed. `sudo apt install xdotool x11-utils`.",
    )
  }
  // `xdotool search --name .` finds every window with any WM_NAME (regex `.`
  // matches 1+ chars). This returns real client windows on WSLg where
  // `_NET_CLIENT_LIST` is unavailable.
  let ids: number[] = []
  try {
    const out = await run("xdotool", ["search", "--name", "."])
    ids = out.split("\n").map((l) => Number(l.trim())).filter((n) => Number.isFinite(n) && n > 0)
  } catch {
    ids = []
  }

  const results: WindowInfo[] = []
  for (const id of ids) {
    const [props, geom] = await Promise.all([queryProps(id), queryGeometry(id)])
    if (!props.title) continue
    results.push({
      id,
      title: props.title,
      wmClass: props.wmClass,
      pid: props.pid,
      x: geom?.x ?? 0,
      y: geom?.y ?? 0,
      width: geom?.width ?? 0,
      height: geom?.height ?? 0,
    })
  }
  return results
}

/** Get the currently focused window, or null if nothing is focused. */
export async function getActive(): Promise<WindowInfo | null> {
  if (!(await isAvailable())) {
    throw new NativeWindowUnavailableError(
      "xdotool / xprop / xwininfo not installed. `sudo apt install xdotool x11-utils`.",
    )
  }
  let id = 0
  try {
    const out = await run("xdotool", ["getactivewindow"])
    id = Number(out.trim())
  } catch {
    return null
  }
  if (!Number.isFinite(id) || id <= 0) return null
  const [props, geom] = await Promise.all([queryProps(id), queryGeometry(id)])
  return {
    id,
    title: props.title,
    wmClass: props.wmClass,
    pid: props.pid,
    x: geom?.x ?? 0,
    y: geom?.y ?? 0,
    width: geom?.width ?? 0,
    height: geom?.height ?? 0,
  }
}

/** Find one window whose title contains `needle` (case-insensitive). */
export async function findByTitle(needle: string): Promise<WindowInfo | null> {
  const all = await listWindows()
  const n = needle.toLowerCase()
  return all.find((w) => w.title.toLowerCase().includes(n)) ?? null
}

export async function focusWindow(id: number): Promise<void> {
  await run("xdotool", ["windowactivate", "--sync", String(id)])
}

export async function moveWindow(id: number, x: number, y: number): Promise<void> {
  await run("xdotool", ["windowmove", "--sync", String(id), String(x), String(y)])
}

export async function resizeWindow(id: number, width: number, height: number): Promise<void> {
  await run("xdotool", ["windowsize", "--sync", String(id), String(width), String(height)])
}
