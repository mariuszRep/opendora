#!/usr/bin/env bun
/**
 * Fails release publication if required manifest assets are missing, an on-disk
 * checksum doesn't match, or the manifest's release tag doesn't match the tag being
 * published. Run after all release-job artifact downloads, before creating the
 * GitHub Release.
 *
 * Usage:
 *   bun scripts/validate-release-assets.ts --manifest dist/release-manifest.json \
 *     --tag v1.2.3 --assets-dir dist --assets-dir windows-installer
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { ReleaseManifestSchema } from "./lib/release-manifest"

function args(flag: string): string[] {
  const out: string[] = []
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === flag && process.argv[i + 1]) out.push(process.argv[i + 1]!)
  }
  return out
}
const arg = (flag: string) => args(flag)[0]

const manifestPath = arg("--manifest")
const expectedTag = arg("--tag")
const assetDirs = args("--assets-dir")

if (!manifestPath || !expectedTag || assetDirs.length === 0) {
  console.error("Usage: --manifest <path> --tag <tag> --assets-dir <dir> [--assets-dir <dir> ...]")
  process.exit(1)
}
if (!existsSync(manifestPath)) {
  console.error(`Manifest not found: ${manifestPath}`)
  process.exit(1)
}

const parseResult = ReleaseManifestSchema.safeParse(JSON.parse(readFileSync(manifestPath, "utf-8")))
if (!parseResult.success) {
  console.error("Manifest failed schema validation:")
  console.error(parseResult.error.format())
  process.exit(1)
}
const manifest = parseResult.data
const errors: string[] = []

if (manifest.release.tag !== expectedTag) {
  errors.push(`Manifest release.tag "${manifest.release.tag}" != expected tag "${expectedTag}"`)
}

const fileIndex = new Map<string, string>()
for (const dir of assetDirs) {
  if (!existsSync(dir)) continue
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isFile()) fileIndex.set(name, full)
  }
}

for (const asset of manifest.assets) {
  const found = fileIndex.get(asset.filename)
  if (!found) {
    if (asset.required) errors.push(`Required asset "${asset.id}" (${asset.filename}) not found in ${assetDirs.join(", ")}`)
    continue
  }
  const size = statSync(found).size
  if (asset.sizeBytes !== null && size !== asset.sizeBytes) {
    errors.push(`Asset "${asset.id}" size mismatch: manifest=${asset.sizeBytes} on-disk=${size}`)
  }
  if (asset.checksum) {
    const hasher = new Bun.CryptoHasher("sha256")
    hasher.update(await Bun.file(found).arrayBuffer())
    const actual = hasher.digest("hex")
    if (actual !== asset.checksum.value) {
      errors.push(`Asset "${asset.id}" sha256 mismatch: manifest=${asset.checksum.value} actual=${actual}`)
    }
  }
}

if (errors.length > 0) {
  console.error(`\nRelease asset validation FAILED (${errors.length} issue(s)):`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}
console.log(
  `Release asset validation passed for tag ${expectedTag}: ${manifest.assets.length} asset(s) checked ` +
    `(${manifest.assets.filter((a) => a.required).length} required).`,
)
