/**
 * Integration test: verifies that tool plugins install, expose capabilities,
 * contain bundled tool files, and remove cleanly.
 *
 * Uses self-contained fixtures in test/fixtures/ — no external repo required.
 */
import { test, expect } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { PluginInstaller } from "../src/installer"
import { CapabilityRegistry } from "../src/registry"
import { PluginStorage } from "../src/storage"

const FIXTURES = path.join(import.meta.dir, "fixtures")

async function withIsolatedHome(fn: () => Promise<void>) {
  const tmpHome = path.join(import.meta.dir, ".tmp-home-" + Math.random().toString(36).slice(2))
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

for (const [pluginId, fixtureName] of [["filesystem", "filesystem-plugin"], ["web-search", "web-plugin"]] as const) {
  const sourcePath = path.join(FIXTURES, fixtureName)

  test(`${pluginId}: install → capabilities → tools/*.js → remove`, async () => {
    await withIsolatedHome(async () => {
      // 1. Install
      const item = await PluginInstaller.install({ sourcePath, scope: "global" })
      expect(item.pluginId).toBe(pluginId)
      expect(item.enabled).toBe(true)

      // 2. Capabilities appear with correct sourceGroup and installedDir = global root
      const caps = await CapabilityRegistry.listCapabilities("tool")
      const mine = caps.filter((c) => c.pluginId === pluginId)
      expect(mine.length).toBeGreaterThan(0)
      for (const cap of mine) {
        expect(cap.sourceGroup).toBe(`plugin:${pluginId}`)
        // installedDir is the capability root (~/.projectflows/), not the plugin bundle dir
        expect(cap.installedDir).toBe(PluginStorage.globalRoot())
      }

      // 3. tool-groups/<group>/tools/*.js files exist in the global tool-groups dir
      const toolGroupsDir = path.join(PluginStorage.globalRoot(), "tool-groups")
      const groupDirs = await fs.readdir(toolGroupsDir, { withFileTypes: true })
      const allToolFiles: string[] = []
      for (const gd of groupDirs) {
        if (!gd.isDirectory()) continue
        const groupToolsDir = path.join(toolGroupsDir, gd.name, "tools")
        const files = await fs.readdir(groupToolsDir).catch(() => [] as string[])
        for (const f of files) {
          if (f.endsWith(".js")) allToolFiles.push(path.join(groupToolsDir, f))
        }
      }
      expect(allToolFiles.length).toBeGreaterThan(0)

      // 4. Each .js tool file can be imported and has correct ToolDefinition shape
      for (const filePath of allToolFiles) {
        const mod = await import(filePath)
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

      // 7. Remove → plugin bundle dir gone, capabilities cleared
      await PluginInstaller.remove(pluginId, { scope: "global" })
      const afterRemove = await CapabilityRegistry.listCapabilities("tool")
      expect(afterRemove.find((c) => c.pluginId === pluginId)).toBeUndefined()
      await expect(fs.access(PluginStorage.globalPluginDir(pluginId))).rejects.toThrow()
    })
  })
}
