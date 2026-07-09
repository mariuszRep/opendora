#!/usr/bin/env bun
/**
 * Build script for the Tauri desktop app (Windows installer).
 *
 * Prerequisites:
 *   - Rust toolchain (stable) installed
 *   - `dist/projectflows-windows-x64.exe` (built by build-binary.ts)
 *   - `dist/web.tar.gz` and `dist/core.tar.gz`
 *
 * Usage:
 *   bun scripts/build-desktop.ts             # build Windows installer
 *   bun scripts/build-desktop.ts --debug     # debug build (faster, no installer)
 *   bun scripts/build-desktop.ts --skip-binary  # skip rebuilding the CLI binary
 */

import { join, dirname } from "node:path"
import { existsSync, cpSync, mkdirSync } from "node:fs"

const ROOT = dirname(import.meta.dir)
const DIST = join(ROOT, "dist")
const DESKTOP = join(ROOT, "apps/desktop")
const TAURI_DIR = join(DESKTOP, "src-tauri")
const BINARIES_DIR = join(TAURI_DIR, "binaries")
const RESOURCES_DIR = join(TAURI_DIR, "resources")

const isDebug = process.argv.includes("--debug")
const skipBinary = process.argv.includes("--skip-binary")

function run(cmd: string, args: string[], cwd?: string) {
  console.log(`  $ ${cmd} ${args.join(" ")}${cwd ? ` (cwd: ${cwd})` : ""}`)
  const result = Bun.spawnSync([cmd, ...args], {
    cwd: cwd ?? ROOT,
    stdio: ["inherit", "inherit", "inherit"],
  })
  if (result.exitCode !== 0) {
    console.error(`\nCommand failed with exit code ${result.exitCode}`)
    process.exit(result.exitCode ?? 1)
  }
}

// 1. Ensure CLI binary and tarballs exist
if (!skipBinary) {
  const windowsBin = join(DIST, "projectflows-windows-x64.exe")
  const webTar = join(DIST, "web.tar.gz")
  const coreTar = join(DIST, "core.tar.gz")

  const needsBuild = !existsSync(windowsBin) || !existsSync(webTar) || !existsSync(coreTar)
  if (needsBuild) {
    console.log("\n[1/4] Building CLI binary and assets (--target bun-windows-x64)...")
    run("bun", ["scripts/build-binary.ts", "--target", "bun-windows-x64"])
    run("bun", ["scripts/package-core.ts"])
  } else {
    console.log("\n[1/4] CLI artifacts already present in dist/ — skipping rebuild")
    console.log("      (use --skip-binary to suppress this check)")
  }
} else {
  console.log("\n[1/4] Skipping CLI binary build (--skip-binary)")
}

// 2. Copy sidecar binary
// Tauri sidecar naming: <name>-<rust-target-triple>.<ext>
console.log("\n[2/4] Copying sidecar binary...")
mkdirSync(BINARIES_DIR, { recursive: true })

const srcBin = join(DIST, "projectflows-windows-x64.exe")
const dstBin = join(BINARIES_DIR, "projectflows-x86_64-pc-windows-msvc.exe")

if (!existsSync(srcBin)) {
  console.error(`  ERROR: ${srcBin} not found. Run build-binary.ts first.`)
  process.exit(1)
}

cpSync(srcBin, dstBin)
console.log(`  ${srcBin} → ${dstBin}`)

// 3. Copy bundled resources (web + core tarballs)
console.log("\n[3/4] Copying bundled resources...")
mkdirSync(RESOURCES_DIR, { recursive: true })

for (const name of ["web.tar.gz", "core.tar.gz"]) {
  const src = join(DIST, name)
  const dst = join(RESOURCES_DIR, name)
  if (!existsSync(src)) {
    console.warn(`  WARNING: ${src} not found — resource will be missing from bundle`)
    continue
  }
  cpSync(src, dst)
  console.log(`  ${src} → ${dst}`)
}

// 4. Install npm deps and run Tauri build
console.log("\n[4/4] Building Tauri app...")
run("bun", ["install"], DESKTOP)

const tauriBuildArgs = ["run", "tauri", "build"]
if (isDebug) tauriBuildArgs.push("--debug")

run("bun", tauriBuildArgs, DESKTOP)

const bundleDir = join(TAURI_DIR, "target", isDebug ? "debug" : "release", "bundle")
console.log(`\nDone! Installers in:`)
console.log(`  ${bundleDir}/nsis/   — NSIS setup .exe`)
console.log(`  ${bundleDir}/msi/    — MSI installer`)
