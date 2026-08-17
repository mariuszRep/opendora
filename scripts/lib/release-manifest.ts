/**
 * Shared schema for the atomic GitHub Release asset manifest.
 *
 * Contract shared by the CLI/server release pipeline and the planned Electron
 * (electron-desktop-wrapper-and-updates) and Capacitor Android
 * (capacitor-android-wrapper-and-ota) wrappers. One release identity + a flat list
 * of assets; each records whether it's required for the release to be atomic, its
 * filename, and an optional sha256 checksum (used for integrity verification, in
 * particular by the Capgo OTA client).
 *
 * Schema stability: bump manifestVersion only for breaking changes. New AssetKind
 * values and new optional fields are additive.
 */
import { z } from "zod"

export const AssetKind = z.enum([
  "web-ota-bundle", // zipped static export for Capacitor/Capgo OTA (this goal)
  "cli-binary", // reserved, not populated by this goal
  "desktop-installer", // reserved: electron-builder installer (electron-desktop-wrapper-and-updates)
  "desktop-updater-metadata", // reserved: electron-updater latest*.yml (same goal)
  "android-apk", // reserved: signed APK (capacitor-android-wrapper-and-ota)
])
export type AssetKind = z.infer<typeof AssetKind>

export const ChecksumSchema = z.object({
  algorithm: z.literal("sha256"),
  value: z.string().regex(/^[0-9a-f]{64}$/, "sha256 must be 64 lowercase hex chars"),
})
export type Checksum = z.infer<typeof ChecksumSchema>

export const AssetEntrySchema = z.object({
  id: z.string().min(1),
  kind: AssetKind,
  filename: z.string().min(1),
  platform: z.string().nullable().default(null),
  sizeBytes: z.number().int().nonnegative().nullable().default(null),
  checksum: ChecksumSchema.nullable().default(null),
  required: z.boolean(),
})
export type AssetEntry = z.infer<typeof AssetEntrySchema>

export const ReleaseManifestSchema = z.object({
  manifestVersion: z.literal(1),
  release: z.object({
    tag: z.string().min(1),
    version: z.string().min(1), // tag with a leading "v" stripped, if present
    commit: z.string().min(1),
    generatedAt: z.string().datetime(),
  }),
  assets: z.array(AssetEntrySchema).min(1),
})
export type ReleaseManifest = z.infer<typeof ReleaseManifestSchema>
