#!/usr/bin/env bun
/**
 * Build all non-core tool groups into external .js bundles and install them
 * into ~/.projectflows/tools/<group>/tools/.
 *
 * Groups that are already external (filesystem, memory, shell, web) are skipped.
 */
import { $ } from "bun"
import fs from "fs/promises"
import os from "os"
import path from "path"

const TOOLS_ROOT = path.join(import.meta.dir, "..")
const HOME_TOOLS = path.join(os.homedir(), ".projectflows", "tools")

type BuildTarget = {
  group: string
  /** Relative to TOOLS_ROOT; each file becomes one output .js (named by basename) */
  entrypoints: string[]
}

const TARGETS: BuildTarget[] = [
  {
    group: "agents",
    entrypoints: ["agents/index.ts"],
  },
  {
    group: "automation",
    entrypoints: ["automation/index.ts"],
  },
  {
    group: "browser",
    // index.ts has non-tool exports (server functions); build tools directly
    entrypoints: ["browser/simple-browser.ts", "browser/playwright-mode.ts"],
  },
  {
    group: "communication",
    entrypoints: ["communication/index.ts"],
  },
  {
    group: "desktop",
    entrypoints: ["desktop/index.ts"],
  },
  {
    group: "schedule",
    entrypoints: ["schedule/index.ts"],
  },
  {
    group: "sessions",
    entrypoints: ["sessions/index.ts"],
  },
  {
    group: "skills",
    entrypoints: ["skills/index.ts"],
  },
  {
    group: "system",
    // index.ts re-exports non-system tools; build only the 4 system tools directly
    entrypoints: ["system/invalid.ts", "system/lsp.ts", "system/log-lesson.ts", "system/todo.ts"],
  },
  {
    group: "tool-registry",
    entrypoints: ["tool-registry/index.ts"],
  },
  {
    group: "workflows",
    entrypoints: ["workflows/index.ts"],
  },
]

async function main() {
  for (const { group, entrypoints } of TARGETS) {
    const outDir = path.join(HOME_TOOLS, group, "tools")
    await fs.mkdir(outDir, { recursive: true })

    // Copy group.json
    const groupJsonSrc = path.join(TOOLS_ROOT, group, "group.json")
    const groupJsonDest = path.join(HOME_TOOLS, group, "group.json")
    await fs.copyFile(groupJsonSrc, groupJsonDest)

    for (const ep of entrypoints) {
      const src = path.join(TOOLS_ROOT, ep)
      const outName = path.basename(ep, path.extname(ep)) + ".js"
      const outFile = path.join(outDir, outName)

      process.stdout.write(`  Building ${group}/${path.basename(ep)} → ${outFile} ... `)
      const result = await $`bun build ${src} --outfile ${outFile} --target bun`.cwd(TOOLS_ROOT).nothrow()
      if (result.exitCode !== 0) {
        console.error(`FAIL\n${result.stderr.toString()}`)
      } else {
        const stat = await fs.stat(outFile)
        console.log(`OK (${Math.round(stat.size / 1024)} KB)`)
      }
    }
  }

  console.log("\nDone. Restart the OpenDora server to pick up the new external groups.")
}

await main()
