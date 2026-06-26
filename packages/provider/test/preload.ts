// IMPORTANT: Set env vars BEFORE any imports from src/ directory
import os from "os"
import path from "path"
import fs from "fs/promises"
import { afterAll } from "bun:test"

const dir = path.join(os.tmpdir(), "opencode-test-data-" + process.pid)
await fs.mkdir(dir, { recursive: true })
afterAll(async () => {
  const busy = (error: unknown) =>
    typeof error === "object" && error !== null && "code" in error && error.code === "EBUSY"
  const rm = async (left: number): Promise<void> => {
    Bun.gc(true)
    await Bun.sleep(100)
    return fs.rm(dir, { recursive: true, force: true }).catch((error) => {
      if (!busy(error)) throw error
      if (left <= 1) throw error
      return rm(left - 1)
    })
  }
  await rm(30)
})

process.env["XDG_DATA_HOME"] = path.join(dir, "share")
process.env["XDG_CACHE_HOME"] = path.join(dir, "cache")
process.env["XDG_CONFIG_HOME"] = path.join(dir, "config")
process.env["XDG_STATE_HOME"] = path.join(dir, "state")

const testHome = path.join(dir, "home")
await fs.mkdir(testHome, { recursive: true })
process.env["OPENCODE_TEST_HOME"] = testHome
process.env["OPENCODE_TEST_MANAGED_CONFIG_DIR"] = path.join(dir, "managed")

const cacheDir = path.join(dir, "cache", "opencode")
await fs.mkdir(cacheDir, { recursive: true })
await fs.writeFile(path.join(cacheDir, "version"), "14")

delete process.env["ANTHROPIC_API_KEY"]
delete process.env["OPENAI_API_KEY"]
delete process.env["GOOGLE_API_KEY"]
delete process.env["GOOGLE_GENERATIVE_AI_API_KEY"]
delete process.env["AZURE_OPENAI_API_KEY"]
delete process.env["AWS_ACCESS_KEY_ID"]
delete process.env["AWS_PROFILE"]
delete process.env["AWS_REGION"]
delete process.env["AWS_BEARER_TOKEN_BEDROCK"]
delete process.env["OPENROUTER_API_KEY"]
delete process.env["GROQ_API_KEY"]
delete process.env["MISTRAL_API_KEY"]
delete process.env["PERPLEXITY_API_KEY"]
delete process.env["TOGETHER_API_KEY"]
delete process.env["XAI_API_KEY"]
delete process.env["DEEPSEEK_API_KEY"]
delete process.env["FIREWORKS_API_KEY"]
delete process.env["CEREBRAS_API_KEY"]
delete process.env["SAMBANOVA_API_KEY"]

const { Log } = await import("@projectflows/util/log")
Log.init({ print: false, dev: true, level: "DEBUG" })

const { register: registerConfig } = await import("@projectflows/util/config")
const { Config } = await import("@projectflows/config/config")
registerConfig(() => Config.get())

const { register: registerPluginList } = await import("@projectflows/provider/plugin")
const { Instance } = await import("@projectflows/runtime/instance")
registerPluginList(async () => {
  const pluginDir = path.join(Instance.directory, ".opencode", "plugin")
  const plugins: any[] = []
  try {
    const entries = await fs.readdir(pluginDir)
    for (const entry of entries) {
      if (!entry.endsWith(".ts") && !entry.endsWith(".js")) continue
      const mod = await import(path.join(pluginDir, entry))
      if (typeof mod.default === "function") {
        const hooks = await mod.default()
        if (hooks) plugins.push(hooks)
      }
    }
  } catch {
    // plugin dir doesn't exist — ok
  }
  return plugins
})
