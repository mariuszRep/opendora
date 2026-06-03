// Stub for openclaw/plugin-sdk/temp-path
import { tmpdir } from "os"
import { join } from "path"
import { mkdirSync } from "fs"

export function getTempPath(subdir?: string): string {
  const base = join(tmpdir(), "projectflows-browser")
  const path = subdir ? join(base, subdir) : base
  mkdirSync(path, { recursive: true })
  return path
}
