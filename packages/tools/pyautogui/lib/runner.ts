import path from "path"
import { fileURLToPath } from "url"

const BRIDGE = path.join(path.dirname(fileURLToPath(import.meta.url)), "pyautogui_bridge.py")

export class PyAutoGUIError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PyAutoGUIError"
  }
}

export async function runPyAutoGUI<T = Record<string, unknown>>(command: object): Promise<T> {
  const proc = Bun.spawn(["python3", BRIDGE, JSON.stringify(command)], {
    env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ":0" },
    stdout: "pipe",
    stderr: "pipe",
  })

  await proc.exited

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()

  if (proc.exitCode !== 0) {
    let msg = stderr.trim()
    try {
      const parsed = JSON.parse(msg)
      msg = parsed.error ?? msg
    } catch {}
    throw new PyAutoGUIError(msg || "PyAutoGUI bridge exited with error")
  }

  // Find the last line that looks like JSON — guards against any warning lines
  // that may slip through to stdout (e.g. Xlib notices on some configs).
  const lines = stdout.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("{"))
  const jsonLine = lines[lines.length - 1] ?? stdout.trim()
  return JSON.parse(jsonLine) as T
}
