/**
 * Patches the `bindings` package's getFileName() to use Error.stack string
 * parsing instead of Error.captureStackTrace, which Bun does not support on
 * plain objects (throws "First argument must be an Error object").
 *
 * Must run before @nut-tree-fork/nut-js is imported.
 */
import { createRequire } from "module"
import { fileURLToPath } from "url"

const req = createRequire(import.meta.url)

// Find all bindings.js files in the bun package cache and patch each one.
// We patch the exported function directly so the CJS module cache keeps
// the patched version — no file edits needed.
const glob = new (globalThis as any).Bun.Glob("**/bindings/bindings.js")
const cacheDir = new URL("../../../node_modules/.bun", import.meta.url).pathname

for (const rel of glob.scanSync({ cwd: cacheDir })) {
  const absPath = `${cacheDir}/${rel}`
  try {
    const b = req(absPath) as { getFileName?: (calling_file?: string) => string | undefined }
    if (b && typeof b.getFileName === "function") {
      const preloadFile = fileURLToPath(import.meta.url)
      b.getFileName = function getFileName(calling_file?: string) {
        const stack = new Error().stack ?? ""
        const lines = stack.split("\n")
        for (const line of lines) {
          const match = line.match(/\((.+?):\d+:\d+\)/) ?? line.match(/at (.+?):\d+:\d+$/)
          if (!match) continue
          let f = match[1]
          if (f.startsWith("file://")) f = fileURLToPath(f)
          if (f === absPath) continue    // skip bindings.js
          if (f === preloadFile) continue // skip this preload
          if (calling_file && f !== calling_file) continue
          return f
        }
        return undefined
      }
    }
  } catch {
    // ignore — bindings may not be loadable from this path
  }
}
