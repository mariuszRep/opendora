#!/usr/bin/env bun
/**
 * Build script for the Tauri desktop app.
 *
 * Prerequisites:
 *   - Rust toolchain (stable) installed
 *   - `dist/projectflows-<platform>` (built by build-binary.ts)
 *   - `dist/web.tar.gz` and `dist/core.tar.gz`
 *
 * Usage:
 *   bun scripts/build-desktop.ts              # build desktop bundle for this OS
 *   bun scripts/build-desktop.ts --stage-only # copy sidecar/resources only
 *   bun scripts/build-desktop.ts --dev        # stage sidecar/resources and run tauri dev
 *   bun scripts/build-desktop.ts --appimage   # include AppImage when building on Linux
 *   bun scripts/build-desktop.ts --debug      # debug build (faster, no installer)
 *   bun scripts/build-desktop.ts --skip-binary
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
const isDev = process.argv.includes("--dev")
const stageOnly = process.argv.includes("--stage-only")
const includeAppImage = process.argv.includes("--appimage")
const skipBinary = process.argv.includes("--skip-binary")

type DesktopTarget = {
  bunTarget: string
  distName: string
  sidecarName: string
}

function currentDesktopTarget(): DesktopTarget {
  const arch = process.arch === "arm64" ? "arm64" : "x64"

  if (process.platform === "win32") {
    if (arch !== "x64") throw new Error("Windows desktop packaging currently supports x64 only")
    return {
      bunTarget: "bun-windows-x64",
      distName: "projectflows-windows-x64.exe",
      sidecarName: "projectflows-x86_64-pc-windows-msvc.exe",
    }
  }

  if (process.platform === "darwin") {
    return {
      bunTarget: arch === "arm64" ? "bun-darwin-arm64" : "bun-darwin-x64",
      distName: `projectflows-darwin-${arch}`,
      sidecarName: `projectflows-${arch === "arm64" ? "aarch64" : "x86_64"}-apple-darwin`,
    }
  }

  return {
    bunTarget: arch === "arm64" ? "bun-linux-arm64" : "bun-linux-x64-musl",
    distName: `projectflows-linux-${arch}`,
    sidecarName: `projectflows-${arch === "arm64" ? "aarch64" : "x86_64"}-unknown-linux-gnu`,
  }
}

const target = currentDesktopTarget()

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
  const platformBin = join(DIST, target.distName)
  const webTar = join(DIST, "web.tar.gz")
  const coreTar = join(DIST, "core.tar.gz")

  const needsBuild = !existsSync(platformBin) || !existsSync(webTar) || !existsSync(coreTar)
  if (needsBuild) {
    console.log(`\n[1/4] Building CLI binary and assets (--target ${target.bunTarget})...`)
    run("bun", ["scripts/build-binary.ts", "--target", target.bunTarget])
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

const srcBin = join(DIST, target.distName)
const dstBin = join(BINARIES_DIR, target.sidecarName)

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
if (stageOnly) {
  console.log("\n[4/4] Staged Tauri sidecar/resources (--stage-only)")
  process.exit(0)
}

console.log(isDev ? "\n[4/4] Starting Tauri dev app..." : "\n[4/4] Building Tauri app...")
run("bun", ["install"], DESKTOP)

const tauriBuildArgs = ["run", "tauri", isDev ? "dev" : "build"]
if (!isDev && isDebug) tauriBuildArgs.push("--debug")
if (!isDev && process.platform === "linux") {
  tauriBuildArgs.push("--bundles", includeAppImage ? "deb,rpm,appimage" : "deb,rpm")
}

run("bun", tauriBuildArgs, DESKTOP)

const bundleDir = join(TAURI_DIR, "target", isDebug ? "debug" : "release", "bundle")
if (!isDev) {
  console.log(`\nDone! Bundles in:`)
  console.log(`  ${bundleDir}`)
}
