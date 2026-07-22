import { statSync } from "fs"
import { Filesystem } from "./primitives.ts"

export namespace FileTime {
  // Per-session read times plus per-file write locks.
  // All tools that overwrite existing files should run their
  // assert/read/write/update sequence inside withLock(filepath, ...)
  // so concurrent writes to the same file are serialized.
  //
  // Anchored on globalThis to stay consistent with the projectflows-website
  // tool-sdk copy of this module, where each filesystem tool is bundled
  // independently and a plain module-scope variable would fragment per bundle.
  interface State {
    read: {
      [sessionID: string]: {
        [path: string]: Date | undefined
      }
    }
    locks: Map<string, Promise<void>>
  }

  const GLOBAL_KEY = "__projectflowsFileTime__"

  function state(): State {
    const g = globalThis as unknown as Record<string, State>
    if (!g[GLOBAL_KEY]) {
      g[GLOBAL_KEY] = { read: {}, locks: new Map() }
    }
    return g[GLOBAL_KEY]
  }

  export function recordRead(sessionID: string, file: string) {
    const s = state()
    s.read[sessionID] = s.read[sessionID] || {}
    s.read[sessionID][file] = new Date()
  }

  export function get(sessionID: string, file: string) {
    return state().read[sessionID]?.[file]
  }

  export async function withLock<T>(filepath: string, fn: () => Promise<T>): Promise<T> {
    const { locks } = state()
    const currentLock = locks.get(filepath) ?? Promise.resolve()
    let release: () => void = () => {}
    const nextLock = new Promise<void>((resolve) => {
      release = resolve
    })
    const chained = currentLock.then(() => nextLock)
    locks.set(filepath, chained)
    await currentLock
    try {
      return await fn()
    } finally {
      release()
      if (locks.get(filepath) === chained) {
        locks.delete(filepath)
      }
    }
  }

  export async function assert(sessionID: string, filepath: string, disableCheck?: boolean) {
    if (disableCheck) {
      return
    }

    const time = get(sessionID, filepath)
    if (!time) throw new Error(`You must read file ${filepath} before overwriting it. Use the Read tool first`)
    const mtime = Filesystem.stat(filepath)?.mtime
    // Allow a 50ms tolerance for Windows NTFS timestamp fuzziness / async flushing
    if (mtime && mtime.getTime() > time.getTime() + 50) {
      throw new Error(
        `File ${filepath} has been modified since it was last read.\nLast modification: ${mtime.toISOString()}\nLast read: ${time.toISOString()}\n\nPlease read the file again before modifying it.`,
      )
    }
  }
}
