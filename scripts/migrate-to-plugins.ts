/**
 * ONE-TIME migration script.
 *
 * Before this migration: agents/skills were bundled in core, nothing in ~/.projectflows/plugins/.
 * After this migration: agents/skills/tools come from plugins installed in the new layout.
 *
 * Run once, then delete this file.
 *
 *   PROJECTFLOWS_PLUGINS_CATALOG=/home/mariusz/projects/projectflows-plugins \
 *     bun run scripts/migrate-to-plugins.ts
 */

import path from "path"
import fs from "fs/promises"
import os from "os"

// Resolve catalog from env or default
const catalogPath =
  process.env["PROJECTFLOWS_PLUGINS_CATALOG"] ?? path.join(os.homedir(), "projects", "projectflows-plugins")

// Import after setting env so Global.Path.config resolves correctly
const { PluginInstaller } = await import("../packages/plugin/src/installer.ts")
const { PluginStorage } = await import("../packages/plugin/src/storage.ts")

// Clean up old plugins/installed/ layout if it exists (pre-migration artefact)
const oldInstalledDir = path.join(PluginStorage.globalRoot(), "plugins", "installed")
const oldExists = await fs.stat(oldInstalledDir).then(() => true).catch(() => false)
if (oldExists) {
  console.log("Removing old plugins/installed/ layout …")
  await fs.rm(oldInstalledDir, { recursive: true, force: true })
}

// Read all packs and collect unique plugin IDs
const packsDir = path.join(catalogPath, "packs")
let packFiles: string[]
try {
  packFiles = (await fs.readdir(packsDir)).filter((f) => f.endsWith(".json"))
} catch {
  console.error(`No packs/ dir found at ${packsDir}. Is PROJECTFLOWS_PLUGINS_CATALOG set correctly?`)
  process.exit(1)
}

const pluginIds = new Set<string>()
for (const file of packFiles) {
  const pack = JSON.parse(await fs.readFile(path.join(packsDir, file), "utf-8"))
  for (const id of pack.plugins ?? []) pluginIds.add(id)
}

if (pluginIds.size === 0) {
  console.error("No plugins found in packs. Check your catalog.")
  process.exit(1)
}

console.log(`Installing ${pluginIds.size} plugin(s): ${[...pluginIds].join(", ")}`)

for (const pluginId of pluginIds) {
  const existing = await PluginInstaller.info(pluginId)
  if (existing) {
    console.log(`  skip (already installed): ${pluginId}`)
    continue
  }
  const sourcePath = path.join(catalogPath, "plugins", pluginId)
  try {
    await PluginInstaller.install({ sourcePath, scope: "global" })
    console.log(`  installed: ${pluginId}`)
  } catch (err) {
    console.error(`  FAILED: ${pluginId} — ${err instanceof Error ? err.message : err}`)
  }
}

console.log("\nDone. Verify:")
console.log(`  ls ${PluginStorage.globalRoot()}/agents/`)
console.log(`  ls ${PluginStorage.globalRoot()}/plugins/`)
console.log("\nDelete this script when confirmed working.")
