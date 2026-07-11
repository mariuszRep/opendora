#!/usr/bin/env bun
/**
 * Build script for single-binary distribution.
 *
 * Produces:
 *   dist/projectflows-<os>-<arch>   (compiled Bun binary)
 *   dist/web/                       (static web assets, shared across platforms)
 *
 * Usage:
 *   bun scripts/build-binary.ts                    # current platform only
 *   bun scripts/build-binary.ts --all-platforms    # all supported platforms
 *   bun scripts/build-binary.ts --target bun-linux-x64-musl
 */

import { join, dirname } from "node:path"
import { mkdirSync, cpSync, rmSync, existsSync, statSync, readdirSync, readFileSync } from "node:fs"

const ROOT = dirname(import.meta.dir)
const DIST = join(ROOT, "dist")
const WEB_OUT = join(ROOT, "apps/web/out")
const DIST_WEB = join(DIST, "web")
const CLI_ENTRY = join(ROOT, "apps/cli/src/index.ts")
const MIGRATION_DIR = join(ROOT, "packages/storage/migration")

// Mirrors packages/storage/src/db.ts's `migrations()` fallback exactly — a compiled
// binary has no real filesystem to scan (`import.meta.dirname` resolves to Bun's virtual
// embedded-file path), so migrations must be baked in at compile time via `define`, or
// `Database.Client` crashes on first use with an ENOENT scandir error.
function loadMigrations(): { sql: string; timestamp: number }[] {
  function timeOf(name: string): number {
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(name)
    if (!match) return 0
    return Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    )
  }

  const entries = readdirSync(MIGRATION_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .map((name) => {
      const file = join(MIGRATION_DIR, name, "migration.sql")
      if (!existsSync(file)) return undefined
      const raw = readFileSync(file, "utf-8")
      const statements = raw
        .split(/;\s*\n/)
        .map((s) =>
          s
            .split("\n")
            .filter((line) => !line.trim().startsWith("--"))
            .join("\n")
            .trim(),
        )
        .filter((s) => s.length > 0)
      if (statements.length === 0) return undefined
      return { sql: statements.join(";\n--> statement-breakpoint\n") + ";", timestamp: timeOf(name) }
    })
    .filter((entry): entry is { sql: string; timestamp: number } => entry !== undefined)

  return entries.sort((a, b) => a.timestamp - b.timestamp)
}

const ALL_TARGETS = [
  { target: "bun-linux-x64-musl", suffix: "linux-x64" },
  { target: "bun-linux-arm64", suffix: "linux-arm64" },
  { target: "bun-darwin-x64", suffix: "darwin-x64" },
  { target: "bun-darwin-arm64", suffix: "darwin-arm64" },
  { target: "bun-windows-x64", suffix: "windows-x64", ext: ".exe" },
]

function currentTarget(): { target: string; suffix: string; ext?: string } {
  const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "darwin" : "linux"
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  const musl = os === "linux" ? "-musl" : ""
  const found = ALL_TARGETS.find((t) => t.suffix === `${os}-${arch}`)
  return found ?? { target: `bun-${os}-${arch}${musl}`, suffix: `${os}-${arch}` }
}

function run(cmd: string, args: string[], cwd?: string) {
  console.log(`  $ ${cmd} ${args.join(" ")}${cwd ? ` (cwd: ${cwd})` : ""}`)
  const result = Bun.spawnSync([cmd, ...args], {
    cwd,
    stdio: ["inherit", "inherit", "inherit"],
  })
  if (result.exitCode !== 0) {
    console.error(`\nCommand failed with exit code ${result.exitCode}`)
    process.exit(result.exitCode ?? 1)
  }
}

// 1. Build the static web export
console.log("\n[1/3] Building static web export...")
run("bun", ["run", "build:export"], join(ROOT, "apps/web"))

if (!existsSync(join(WEB_OUT, "index.html"))) {
  console.error("Static export did not produce apps/web/out/index.html")
  process.exit(1)
}

// 2. Copy web assets to dist/web/
console.log("\n[2/3] Copying web assets to dist/web/...")
mkdirSync(DIST, { recursive: true })
if (existsSync(DIST_WEB)) rmSync(DIST_WEB, { recursive: true, force: true })
cpSync(WEB_OUT, DIST_WEB, { recursive: true })
console.log(`  Copied ${WEB_OUT} → ${DIST_WEB}`)

// 2.5. Package web assets as tarball for distribution
console.log("\n[2.5] Creating dist/web.tar.gz...")
run("tar", ["-czf", join(DIST, "web.tar.gz"), "-C", DIST, "web"])

// 2.6. Package core capabilities into core.tar.gz
console.log("\n[2.6] Creating dist/core.tar.gz...")
run("bun", ["run", join(ROOT, "scripts/package-core.ts")])

// 3. Compile binary(ies)
const allPlatforms = process.argv.includes("--all-platforms")
const customTarget = (() => {
  const idx = process.argv.indexOf("--target")
  if (idx !== -1) return process.argv[idx + 1]
  return undefined
})()

const targets = allPlatforms
  ? ALL_TARGETS
  : customTarget
    ? [{ target: customTarget, suffix: customTarget.replace(/^bun-/, ""), ext: customTarget.includes("windows") ? ".exe" : undefined }]
    : [currentTarget()]

// Load the OpenTUI Solid plugin for JSX/TSX transformation
// (required by apps/cli/src/cli/cmd/tui/ for the terminal UI)
const solidPluginPath = join(ROOT, "apps/cli/node_modules/@opentui/solid/scripts/solid-plugin.ts")
let solidPlugin: any
try {
  solidPlugin = (await import(solidPluginPath)).default
} catch {
  console.warn("  Warning: @opentui/solid plugin not found; TSX files may not compile correctly.")
  solidPlugin = undefined
}

const CLI_TSCONFIG = join(ROOT, "apps/cli/tsconfig.json")

const migrations = loadMigrations()
console.log(`\nLoaded ${migrations.length} migrations for compile-time embedding`)

console.log(`\n[3/3] Compiling ${targets.length} binary target(s)...`)
for (const { target, suffix, ext = "" } of targets) {
  const outfile = join(DIST, `projectflows-${suffix}${ext}`)
  console.log(`  → ${target}  =>  dist/projectflows-${suffix}${ext}`)

  const result = await Bun.build({
    entrypoints: [CLI_ENTRY],
    plugins: solidPlugin ? [solidPlugin] : [],
    tsconfig: CLI_TSCONFIG,
    external: ["electron"],
    define: {
      OPENCODE_MIGRATIONS: JSON.stringify(migrations),
    },
    compile: {
      target: target as any,
      outfile,
    },
  })

  if (!result.success) {
    for (const log of result.logs) {
      console.error(`  ${log}`)
    }
    process.exit(1)
  }

  const size = (statSync(outfile).size / 1024 / 1024).toFixed(1)
  console.log(`    ✓ ${size} MB`)
}

console.log(`\nDone! Artifacts in dist/`)
console.log(`  dist/web/        — static web assets`)
for (const { suffix, ext = "" } of targets) {
  console.log(`  dist/projectflows-${suffix}${ext}`)
}
console.log(`\nTo run:`)
console.log(`  PROJECTFLOWS_WEB_DIR=dist/web dist/projectflows-${targets[0]!.suffix}${targets[0]!.ext ?? ""} serve`)
