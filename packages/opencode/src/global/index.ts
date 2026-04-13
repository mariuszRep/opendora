import fs from "fs/promises"
import path from "path"
import os from "os"
import { Filesystem } from "../util/filesystem"

// Determine the OpenDora root directory:
//   1. OPENCODE_CONFIG_DIR env var (set by dev script to $PWD/.opendora)
//   2. Walk up from cwd to find the nearest .opendora directory (dev monorepo)
//   3. ~/.opendora (installed via npm/pnpm/bun)
const home = process.env.OPENCODE_TEST_HOME || os.homedir()

async function findRoot(): Promise<string> {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR

  // Walk up from cwd looking for a .opendora directory
  let dir = process.cwd()
  while (true) {
    const candidate = path.join(dir, ".opendora")
    if (await fs.access(candidate).then(() => true).catch(() => false)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  return path.join(home, ".opendora")
}

const root = await findRoot()

export namespace Global {
  export const Path = {
    // Allow override via OPENCODE_TEST_HOME for test isolation
    get home() {
      return process.env.OPENCODE_TEST_HOME || os.homedir()
    },
    // Primary data/storage directory (DB, sessions, snapshots, auth)
    data: path.join(root, "storage"),
    // Binaries (ripgrep, etc.)
    bin: path.join(root, "bin"),
    // Logs
    log: path.join(root, "log"),
    // Cache
    cache: path.join(root, "cache"),
    // Config root — agents, skills, tools are subfolders here
    config: root,
    // State
    state: path.join(root, "state"),
    // Provider config — auth tokens, MCP auth, fallback state
    providers: path.join(root, "providers"),
  }
}

// Initialize ripgrep with binary path BEFORE async operations
// This ensures it's available when File.init() is called during bootstrap
import { Ripgrep } from "@opendora/tools/filesystem/lib/ripgrep"
Ripgrep.setBinaryPath(Global.Path.bin)

await Promise.all([
  fs.mkdir(Global.Path.data, { recursive: true }),
  fs.mkdir(Global.Path.config, { recursive: true }),
  fs.mkdir(Global.Path.state, { recursive: true }),
  fs.mkdir(Global.Path.log, { recursive: true }),
  fs.mkdir(Global.Path.bin, { recursive: true }),
  fs.mkdir(Global.Path.providers, { recursive: true }),
])


const CACHE_VERSION = "21"

const version = await Filesystem.readText(path.join(Global.Path.cache, "version")).catch(() => "0")

if (version !== CACHE_VERSION) {
  try {
    const contents = await fs.readdir(Global.Path.cache)
    await Promise.all(
      contents.map((item) =>
        fs.rm(path.join(Global.Path.cache, item), {
          recursive: true,
          force: true,
        }),
      ),
    )
  } catch (e) {}
  await Filesystem.write(path.join(Global.Path.cache, "version"), CACHE_VERSION)
}
