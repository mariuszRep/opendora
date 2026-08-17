#!/usr/bin/env bun
/**
 * Builds the atomic GitHub Release asset manifest and the zipped static-export OTA
 * bundle (dist.zip). Depends on apps/web/out/ already existing (produced by
 * `bun run build:export` in apps/web — e.g. via `bun scripts/build-binary.ts`).
 *
 * Usage:
 *   bun scripts/build-release-manifest.ts --tag v1.2.3 [--web-out apps/web/out] [--out-dir dist]
 */
import { join, dirname } from "node:path"
import { existsSync, statSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { execSync } from "node:child_process"
import { ReleaseManifestSchema, type ReleaseManifest } from "./lib/release-manifest"

const ROOT = dirname(import.meta.dir)

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : undefined
}

const tag = arg("--tag") ?? process.env.RELEASE_TAG
if (!tag) {
  console.error("Missing --tag (e.g. v1.2.3) or RELEASE_TAG env var")
  process.exit(1)
}
const version = tag.replace(/^v/, "")

const WEB_OUT = join(ROOT, arg("--web-out") ?? "apps/web/out")
const OUT_DIR = join(ROOT, arg("--out-dir") ?? "dist")
const ZIP_NAME = "dist.zip"
const MANIFEST_NAME = "release-manifest.json"

if (!existsSync(join(WEB_OUT, "index.html"))) {
  console.error(`Static export not found at ${WEB_OUT}/index.html`)
  console.error("Run `bun run build:export` in apps/web first (or bun scripts/build-binary.ts).")
  process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })
const zipPath = join(OUT_DIR, ZIP_NAME)
if (existsSync(zipPath)) rmSync(zipPath)

console.log(`\n[1/3] Zipping ${WEB_OUT} -> ${zipPath}`)
const zipResult = Bun.spawnSync(["zip", "-r", "-X", zipPath, "."], {
  cwd: WEB_OUT,
  stdio: ["inherit", "inherit", "inherit"],
})
if (zipResult.exitCode !== 0) {
  console.error(`zip failed with exit code ${zipResult.exitCode}`)
  process.exit(zipResult.exitCode ?? 1)
}

console.log(`\n[2/3] Computing sha256...`)
const sizeBytes = statSync(zipPath).size
const hasher = new Bun.CryptoHasher("sha256")
hasher.update(await Bun.file(zipPath).arrayBuffer())
const sha256 = hasher.digest("hex")
console.log(`  ${ZIP_NAME}: ${sizeBytes} bytes, sha256=${sha256}`)

console.log(`\n[3/3] Writing ${MANIFEST_NAME}...`)
const commit = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim()

const manifest: ReleaseManifest = {
  manifestVersion: 1,
  release: { tag, version, commit, generatedAt: new Date().toISOString() },
  assets: [
    {
      id: "web-ota-bundle",
      kind: "web-ota-bundle",
      filename: ZIP_NAME,
      platform: null,
      sizeBytes,
      checksum: { algorithm: "sha256", value: sha256 },
      required: true,
    },
    // Reserved — added by later goals with required:true, e.g.:
    //   { id: "desktop-installer-windows", kind: "desktop-installer", ... }
    //   { id: "android-apk", kind: "android-apk", ... }
  ],
}

const parsed = ReleaseManifestSchema.parse(manifest) // self-validate before writing
writeFileSync(join(OUT_DIR, MANIFEST_NAME), JSON.stringify(parsed, null, 2) + "\n")
console.log(`  Wrote ${join(OUT_DIR, MANIFEST_NAME)}`)
console.log(`\nDone. dist/${ZIP_NAME} + dist/${MANIFEST_NAME} ready for release upload.`)
