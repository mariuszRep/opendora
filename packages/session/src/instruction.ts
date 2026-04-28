import path from "path"
import os from "os"
import fs from "fs/promises"
import { getConfig } from "./config.ts"
import type { MessageV2 } from "./message-v2.ts"

const log = { warn: (...a: any[]) => console.warn("[instruction]", ...a) }

const FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "CONTEXT.md", // deprecated
]

function globalFiles() {
  const files: string[] = []
  const configDir = process.env.OPENCODE_CONFIG_DIR
  if (configDir) {
    files.push(path.join(configDir, "AGENTS.md"))
  }
  const globalConfigPath = getConfig().globalConfigPath ?? ""
  if (globalConfigPath) {
    files.push(path.join(globalConfigPath, "AGENTS.md"))
  }
  if (!(process.env.OPENCODE_DISABLE_CLAUDE_CODE_PROMPT === "1")) {
    files.push(path.join(os.homedir(), ".claude", "CLAUDE.md"))
  }
  return files
}

async function fileExists(filepath: string): Promise<boolean> {
  try {
    await fs.access(filepath)
    return true
  } catch {
    return false
  }
}

async function readText(filepath: string): Promise<string> {
  return fs.readFile(filepath, "utf-8")
}

/**
 * Walk from `dir` up to `root`, collecting files matching `filename`.
 */
async function findUp(filename: string, dir: string, root: string): Promise<string[]> {
  const results: string[] = []
  let current = path.resolve(dir)
  const resolved = path.resolve(root)
  while (current.startsWith(resolved)) {
    const candidate = path.join(current, filename)
    if (await fileExists(candidate)) {
      results.push(candidate)
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return results
}

/**
 * Walk from `dir` up to `root`, returning files matching any filename in `filenames`.
 * Returns the first level that has a match, not all levels.
 */
async function findUpFirst(filenames: string[], dir: string, root: string): Promise<string[]> {
  let current = path.resolve(dir)
  const resolved = path.resolve(root)
  while (current.startsWith(resolved)) {
    for (const filename of filenames) {
      const candidate = path.join(current, filename)
      if (await fileExists(candidate)) {
        return [candidate]
      }
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return []
}

/**
 * Glob-up: find files matching `pattern` starting from `dir` up to `root`.
 */
async function globUp(pattern: string, dir: string, root: string): Promise<string[]> {
  return findUp(pattern, dir, root)
}

async function resolveRelative(instruction: string): Promise<string[]> {
  const cfg = getConfig()
  const directory = process.cwd()
  const worktree = cfg.instance?.worktree ?? process.cwd()
  if (!(process.env.OPENCODE_DISABLE_PROJECT_CONFIG === "1")) {
    return globUp(instruction, directory, worktree).catch(() => [])
  }
  const configDir = process.env.OPENCODE_CONFIG_DIR
  if (!configDir) {
    log.warn(
      `Skipping relative instruction "${instruction}" - no OPENCODE_CONFIG_DIR set while project config is disabled`,
    )
    return []
  }
  return globUp(instruction, configDir, configDir).catch(() => [])
}

export namespace InstructionPrompt {
  // Module-level state — equivalent to Instance.state() but simplified
  const _claims = new Map<string, Set<string>>()

  function isClaimed(messageID: string, filepath: string) {
    const claimed = _claims.get(messageID)
    if (!claimed) return false
    return claimed.has(filepath)
  }

  function claim(messageID: string, filepath: string) {
    let claimed = _claims.get(messageID)
    if (!claimed) {
      claimed = new Set()
      _claims.set(messageID, claimed)
    }
    claimed.add(filepath)
  }

  export function clear(messageID: string) {
    _claims.delete(messageID)
  }

  export async function systemPaths() {
    const cfg = getConfig()
    const config = await cfg.config?.get() ?? {}
    const directory = process.cwd()
    const worktree = cfg.instance?.worktree ?? process.cwd()
    const paths = new Set<string>()

    if (!(process.env.OPENCODE_DISABLE_PROJECT_CONFIG === "1")) {
      for (const file of FILES) {
        const matches = await findUp(file, directory, worktree)
        if (matches.length > 0) {
          matches.forEach((p) => {
            paths.add(path.resolve(p))
          })
          break
        }
      }
    }

    for (const file of globalFiles()) {
      if (await fileExists(file)) {
        paths.add(path.resolve(file))
        break
      }
    }

    if (config.instructions) {
      for (let instruction of config.instructions) {
        if (instruction.startsWith("https://") || instruction.startsWith("http://")) continue
        if (instruction.startsWith("~/")) {
          instruction = path.join(os.homedir(), instruction.slice(2))
        }
        let matches: string[]
        if (path.isAbsolute(instruction)) {
          // Scan the specific file
          if (await fileExists(instruction)) {
            matches = [instruction]
          } else {
            // Try glob-like scan in parent dir
            const dir = path.dirname(instruction)
            const base = path.basename(instruction)
            const entries = await fs.readdir(dir).catch(() => [] as string[])
            matches = entries
              .filter((e) => e === base)
              .map((e) => path.join(dir, e))
          }
        } else {
          matches = await resolveRelative(instruction)
        }
        matches.forEach((p) => {
          paths.add(path.resolve(p))
        })
      }
    }

    return paths
  }

  /**
   * Load instruction files for the system prompt.
   *
   * If sessionCwd is provided, only that exact directory is searched.
   * If no file is found there, or if sessionCwd is omitted, returns [].
   */
  export async function system(sessionCwd?: string): Promise<string[]> {
    if (!sessionCwd) return []

    for (const file of FILES) {
      const filepath = path.resolve(path.join(sessionCwd, file))
      if (await fileExists(filepath)) {
        const content = await readText(filepath).catch(() => "")
        if (content) return [`Instructions from: ${filepath}\n${content}`]
      }
    }

    return []
  }

  export function loaded(messages: MessageV2.WithParts[]) {
    const paths = new Set<string>()
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === "tool" && part.tool === "read" && part.state.status === "completed") {
          if (part.state.time.compacted) continue
          const loaded = part.state.metadata?.loaded
          if (!loaded || !Array.isArray(loaded)) continue
          for (const p of loaded) {
            if (typeof p === "string") paths.add(p)
          }
        }
      }
    }
    return paths
  }

  export async function find(dir: string) {
    for (const file of FILES) {
      const filepath = path.resolve(path.join(dir, file))
      if (await fileExists(filepath)) return filepath
    }
  }

  export async function resolve(messages: MessageV2.WithParts[], filepath: string, messageID: string) {
    const cfg = getConfig()
    const system = await systemPaths()
    const already = loaded(messages)
    const results: { filepath: string; content: string }[] = []

    const target = path.resolve(filepath)
    let current = path.dirname(target)
    const root = path.resolve(process.cwd())

    while (current.startsWith(root) && current !== root) {
      const found = await find(current)

      if (found && found !== target && !system.has(found) && !already.has(found) && !isClaimed(messageID, found)) {
        claim(messageID, found)
        const content = await readText(found).catch(() => undefined)
        if (content) {
          results.push({ filepath: found, content: "Instructions from: " + found + "\n" + content })
        }
      }
      current = path.dirname(current)
    }

    return results
  }
}
