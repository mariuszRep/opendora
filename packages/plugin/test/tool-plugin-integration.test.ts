/**
 * Integration test: verifies that real tool plugins from projectflows-plugins
 * install, expose capabilities, contain bundled tool files, and remove cleanly.
 *
 * Requires the projectflows-plugins repo at ~/projects/projectflows-plugins
 * with `bun run build` already executed (tools/*.js present).
 */
import { test, expect } from "bun:test"
import os from "os"
import path from "path"
import fs from "fs/promises"
import { PluginInstaller } from "../src/installer"
import { CapabilityRegistry } from "../src/registry"
import { PluginStorage } from "../src/storage"

const PLUGINS_REPO = path.join(os.homedir(), "projects", "projectflows-plugins", "plugins")

async function withIsolatedHome(fn: () => Promise<void>) {
  const tmpHome = path.join(os.tmpdir(), "pf-tool-test-" + Math.random().toString(36).slice(2))
  await fs.mkdir(tmpHome, { recursive: true })
  const prev = process.env["PROJECTFLOWS_TEST_HOME"]
  process.env["PROJECTFLOWS_TEST_HOME"] = tmpHome
  try {
    await fn()
  } finally {
    process.env["PROJECTFLOWS_TEST_HOME"] = prev
    await fs.rm(tmpHome, { recursive: true, force: true })
  }
}

for (const pluginId of ["filesystem", "web-search"] as const) {
  const sourcePath = path.join(PLUGINS_REPO, pluginId)

  test(`${pluginId}: install → capabilities → tools/*.js → remove`, async () => {
    await withIsolatedHome(async () => {
      // 1. Install
      const item = await PluginInstaller.install({ sourcePath, scope: "global" })
      expect(item.pluginId).toBe(pluginId)
      expect(item.enabled).toBe(true)

      // 2. Capabilities appear with correct sourceGroup
      const caps = await CapabilityRegistry.listCapabilities("tool")
      const mine = caps.filter((c) => c.pluginId === pluginId)
      expect(mine.length).toBeGreaterThan(0)
      for (const cap of mine) {
        expect(cap.sourceGroup).toBe(`plugin:${pluginId}`)
        expect(cap.installedDir).toBe(PluginStorage.globalInstalledDir(pluginId))
      }

      // 3. tools/*.js files exist in installedDir
      const toolsDir = path.join(PluginStorage.globalInstalledDir(pluginId), "tools")
      const files = await fs.readdir(toolsDir)
      const jsFiles = files.filter((f) => f.endsWith(".js"))
      expect(jsFiles.length).toBeGreaterThan(0)

      // 4. Each .js tool file can be imported and has correct ToolDefinition shape
      for (const file of jsFiles) {
        const mod = await import(path.join(toolsDir, file))
        const def = mod.default ?? Object.values(mod)[0]
        expect(typeof def.description).toBe("string")
        expect(def.description.length).toBeGreaterThan(0)
        expect(typeof def.args).toBe("object")
        expect(typeof def.execute).toBe("function")
      }

      // 5. Disable → capabilities hidden
      await PluginInstaller.setEnabled(pluginId, false, { scope: "global" })
      const afterDisable = await CapabilityRegistry.listCapabilities("tool")
      expect(afterDisable.find((c) => c.pluginId === pluginId)).toBeUndefined()

      // 6. Re-enable → capabilities visible again
      await PluginInstaller.setEnabled(pluginId, true, { scope: "global" })
      const afterEnable = await CapabilityRegistry.listCapabilities("tool")
      expect(afterEnable.find((c) => c.pluginId === pluginId)).toBeDefined()

      // 7. Remove → files gone, capabilities cleared
      await PluginInstaller.remove(pluginId, { scope: "global" })
      const afterRemove = await CapabilityRegistry.listCapabilities("tool")
      expect(afterRemove.find((c) => c.pluginId === pluginId)).toBeUndefined()
      await expect(fs.access(PluginStorage.globalInstalledDir(pluginId))).rejects.toThrow()
    })
  })
}
