#!/usr/bin/env bun
/**
 * Package core capabilities from the projectflows-website registry into core.tar.gz.
 *
 * The tarball extracts directly into ~/.projectflows/ with the correct directory structure:
 *   agents/<name>/          — agent.json + PERSONA.md etc.
 *   skills/<name>/          — SKILL.md + skill.json etc.
 *   workflows/<name>.json   — workflow definition
 *   tools/<group>/          — group.json + tools/*.js + tools/*.wasm
 *   plugins.lock.json       — lockfile registering all installed core plugins
 *
 * Usage:
 *   bun scripts/package-core.ts                        # writes dist/core.tar.gz
 *   bun scripts/package-core.ts --out /tmp/core.tar.gz
 *   bun scripts/package-core.ts --registry ../projectflows-website/registry
 */

import { join, dirname, basename } from "node:path"
import { mkdirSync, existsSync, cpSync, rmSync, readFileSync } from "node:fs"
import { readdir, copyFile, mkdir, cp, access } from "node:fs/promises"
import os from "node:os"

const ROOT = dirname(import.meta.dir)
const DIST = join(ROOT, "dist")

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

// Registry root — sibling projectflows-website by default, overridable via env or flag
const REGISTRY =
  arg("--registry") ??
  process.env["PROJECTFLOWS_REGISTRY_PATH"] ??
  join(ROOT, "..", "projectflows-website", "registry")

const OUT = arg("--out") ?? join(DIST, "core.tar.gz")

if (!existsSync(REGISTRY)) {
  console.error(`Registry not found at ${REGISTRY}`)
  console.error("Set PROJECTFLOWS_REGISTRY_PATH or pass --registry <path>")
  process.exit(1)
}

function readJson<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf-8")) as T
}

interface CoreManifest {
  version: number
  plugins: string[]
}

interface PluginManifest {
  pluginId: string
  version: string
  capabilities: Array<{
    type: "agent" | "skill" | "workflow" | "tool" | "tool-group"
    name: string
    toolGroup?: string
  }>
}

interface LockfileCapability {
  type: string
  name: string
  sourceGroup: string
  group?: string
}

interface LockfileEntry {
  version: string
  source: string
  scope: "global"
  installedAt: string
  capabilities: LockfileCapability[]
  enabled: true
}

interface LockfileData {
  version: 1
  plugins: Record<string, LockfileEntry>
}

async function exists(p: string): Promise<boolean> {
  return access(p).then(() => true).catch(() => false)
}

async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const s = join(src, entry.name)
    const d = join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(s, d)
    } else {
      await copyFile(s, d)
    }
  }
}

async function main() {
  const coreManifestPath = join(REGISTRY, "core.json")
  if (!existsSync(coreManifestPath)) {
    console.error(`core.json not found at ${coreManifestPath}`)
    process.exit(1)
  }

  const core = readJson<CoreManifest>(coreManifestPath)
  console.log(`Packaging ${core.plugins.length} core plugin(s): ${core.plugins.join(", ")}`)

  // Staging directory: build the ~/.projectflows/ layout here
  const staging = join(DIST, ".core-staging")
  if (existsSync(staging)) rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })

  const lockfile: LockfileData = { version: 1, plugins: {} }
  const now = new Date().toISOString()

  for (const pluginId of core.plugins) {
    const manifestPath = join(REGISTRY, "plugins", pluginId, "manifest.json")
    if (!existsSync(manifestPath)) {
      console.error(`  [skip] Plugin manifest not found: ${manifestPath}`)
      continue
    }

    const manifest = readJson<PluginManifest>(manifestPath)
    console.log(`  [${pluginId}] v${manifest.version} — ${manifest.capabilities.length} capability(ies)`)

    const lockCaps: LockfileCapability[] = []

    for (const cap of manifest.capabilities) {
      if (cap.type === "agent") {
        const src = join(REGISTRY, "agents", cap.name)
        const dest = join(staging, "agents", cap.name)
        if (await exists(src)) {
          await copyDir(src, dest)
          lockCaps.push({ type: "agent", name: cap.name, sourceGroup: `plugin:${pluginId}` })
          console.log(`    agent/${cap.name}`)
        } else {
          console.warn(`    [warn] agent/${cap.name} not found in registry, skipping`)
        }
      } else if (cap.type === "skill") {
        const src = join(REGISTRY, "skills", cap.name)
        const dest = join(staging, "skills", cap.name)
        if (await exists(src)) {
          await copyDir(src, dest)
          lockCaps.push({ type: "skill", name: cap.name, sourceGroup: `plugin:${pluginId}` })
          console.log(`    skill/${cap.name}`)
        } else {
          console.warn(`    [warn] skill/${cap.name} not found in registry, skipping`)
        }
      } else if (cap.type === "workflow") {
        // Workflows live in registry/workflows/<name>/<name>.json
        const workflowDir = join(REGISTRY, "workflows", cap.name)
        const workflowFile = join(workflowDir, `${cap.name}.json`)
        const destDir = join(staging, "workflows")
        const destFile = join(destDir, `${cap.name}.json`)
        if (await exists(workflowFile)) {
          await mkdir(destDir, { recursive: true })
          await copyFile(workflowFile, destFile)
          lockCaps.push({ type: "workflow", name: cap.name, sourceGroup: `plugin:${pluginId}` })
          console.log(`    workflow/${cap.name}`)
        } else {
          console.warn(`    [warn] workflow/${cap.name} not found in registry, skipping`)
        }
      } else if (cap.type === "tool-group") {
        // Tool groups: registry/tools/<group>/ → staging/tools/<group>/
        // Copy group.json and tools/ subdirectory (compiled JS + assets)
        const src = join(REGISTRY, "tools", cap.name)
        const dest = join(staging, "tools", cap.name)
        if (await exists(src)) {
          await mkdir(dest, { recursive: true })
          // Copy group.json
          const groupJson = join(src, "group.json")
          if (await exists(groupJson)) await copyFile(groupJson, join(dest, "group.json"))
          // Copy tools/ directory (compiled JS + WASM, not src/)
          const toolsSrc = join(src, "tools")
          if (await exists(toolsSrc)) {
            await copyDir(toolsSrc, join(dest, "tools"))
          }
          lockCaps.push({ type: "tool-group", name: cap.name, sourceGroup: `plugin:${pluginId}` })
          console.log(`    tool-group/${cap.name}`)
        } else {
          console.warn(`    [warn] tool-group/${cap.name} not found in registry, skipping`)
        }
      } else if (cap.type === "tool") {
        // Individual tool — typically bundled within a tool-group; handled above
        const group = cap.toolGroup ?? cap.name
        lockCaps.push({ type: "tool", name: cap.name, sourceGroup: `plugin:${pluginId}`, group })
      }
    }

    lockfile.plugins[pluginId] = {
      version: manifest.version,
      source: `core:${pluginId}`,
      scope: "global",
      installedAt: now,
      capabilities: lockCaps,
      enabled: true,
    }
  }

  // Write plugins.lock.json into staging
  const lockfilePath = join(staging, "plugins.lock.json")
  await Bun.write(lockfilePath, JSON.stringify(lockfile, null, 2))
  console.log(`  plugins.lock.json written (${core.plugins.length} plugins)`)

  // --install mode: copy directly to ~/.projectflows/ (dev bootstrap)
  if (process.argv.includes("--install")) {
    const dest = join(os.homedir(), ".projectflows")
    mkdirSync(dest, { recursive: true })
    // Clean the tools/ dir first so stale pre-migration tool groups don't linger
    const toolsDest = join(dest, "tools")
    if (existsSync(toolsDest)) rmSync(toolsDest, { recursive: true, force: true })
    cpSync(staging, dest, { recursive: true, force: true })
    rmSync(staging, { recursive: true, force: true })
    console.log(`\nCore capabilities installed to ${dest}`)
    return
  }

  // Create the tarball
  mkdirSync(dirname(OUT), { recursive: true })
  const result = Bun.spawnSync(["tar", "-czf", OUT, "-C", staging, "."], {
    stdio: ["inherit", "inherit", "inherit"],
  })
  if (result.exitCode !== 0) {
    console.error("tar failed")
    process.exit(1)
  }

  // Cleanup staging
  rmSync(staging, { recursive: true, force: true })

  const size = (Bun.file(OUT).size / 1024).toFixed(0)
  console.log(`\ncore.tar.gz → ${OUT} (${size} KB)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
