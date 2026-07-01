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
import { mkdirSync, cpSync, rmSync, existsSync } from "node:fs"

const ROOT = dirname(import.meta.dir)
const DIST = join(ROOT, "dist")
const WEB_OUT = join(ROOT, "apps/web/out")
const DIST_WEB = join(DIST, "web")
const CLI_ENTRY = join(ROOT, "apps/cli/src/index.ts")

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

console.log(`\n[3/3] Compiling ${targets.length} binary target(s)...`)
for (const { target, suffix, ext = "" } of targets) {
  const outfile = join(DIST, `projectflows-${suffix}${ext}`)
  console.log(`  → ${target}  =>  dist/projectflows-${suffix}${ext}`)
  run("bun", [
    "build",
    "--compile",
    `--target=${target}`,
    `--outfile=${outfile}`,
    CLI_ENTRY,
  ])
}

console.log(`\nDone! Artifacts in dist/`)
console.log(`  dist/web/        — static web assets`)
for (const { suffix, ext = "" } of targets) {
  console.log(`  dist/projectflows-${suffix}${ext}`)
}
console.log(`\nTo run:`)
console.log(`  PROJECTFLOWS_WEB_DIR=dist/web dist/projectflows-${targets[0]!.suffix}${targets[0]!.ext ?? ""} serve`)
