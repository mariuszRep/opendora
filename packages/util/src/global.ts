import fs from "fs/promises"
import path from "path"
import os from "os"

// Determine the ProjectFlows root directory. This is a SINGLE, deterministic
// data/config root so sessions and storage are identical regardless of the
// current working directory or how the server was started:
//   1. PROJECTFLOWS_CONFIG_DIR env var (explicit override)
//   2. PROJECTFLOWS_TEST_HOME / OPENCODE_TEST_HOME (test isolation, either accepted)
//   3. ~/.projectflows (the user's home folder)
function findRoot(): string {
  if (process.env.PROJECTFLOWS_CONFIG_DIR) return process.env.PROJECTFLOWS_CONFIG_DIR
  const testHome = process.env.PROJECTFLOWS_TEST_HOME || process.env.OPENCODE_TEST_HOME
  if (testHome) return path.join(testHome, ".projectflows")

  // Always resolve to a single root in the user's home folder. We intentionally
  // do NOT walk up from process.cwd(), so the data/config directory never
  // changes based on where the process is launched.
  return path.join(os.homedir(), ".projectflows")
}

const root = findRoot()

export namespace Global {
  export const Path = {
    // Allow override via PROJECTFLOWS_TEST_HOME or OPENCODE_TEST_HOME for test isolation
    get home() {
      return process.env.PROJECTFLOWS_TEST_HOME || process.env.OPENCODE_TEST_HOME || os.homedir()
    },
    // Primary data/storage directory (DB, sessions, snapshots, auth)
    get data() {
      return path.join(findRoot(), "storage")
    },
    // Binaries (ripgrep, etc.)
    get bin() {
      return path.join(findRoot(), "bin")
    },
    // Logs
    get log() {
      return path.join(findRoot(), "log")
    },
    // Cache
    get cache() {
      return path.join(findRoot(), "cache")
    },
    // Config root — agents, skills, tools are subfolders here
    get config() {
      return findRoot()
    },
    // State
    get state() {
      return path.join(findRoot(), "state")
    },
    // App-managed assets (web UI, etc.) — XDG data dir; separate from user config
    get share() {
      const home = process.env.PROJECTFLOWS_TEST_HOME || process.env.OPENCODE_TEST_HOME || os.homedir()
      if (process.platform === "win32") {
        return path.join(process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local"), "projectflows")
      }
      if (process.platform === "darwin") {
        return path.join(home, "Library", "Application Support", "projectflows")
      }
      return path.join(home, ".local", "share", "projectflows")
    },
    // Provider config — auth tokens, MCP auth, fallback state
    get providers() {
      return path.join(findRoot(), "providers")
    },
  }
}

await Promise.all([
  fs.mkdir(Global.Path.data, { recursive: true }),
  fs.mkdir(Global.Path.config, { recursive: true }),
  fs.mkdir(Global.Path.cache, { recursive: true }),
  fs.mkdir(Global.Path.state, { recursive: true }),
  fs.mkdir(Global.Path.log, { recursive: true }),
  fs.mkdir(Global.Path.bin, { recursive: true }),
  fs.mkdir(Global.Path.providers, { recursive: true }),
])

const CACHE_VERSION = "21"

const version = await fs.readFile(path.join(Global.Path.cache, "version"), "utf-8").catch(() => "0")

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
  await fs.writeFile(path.join(Global.Path.cache, "version"), CACHE_VERSION)
}
