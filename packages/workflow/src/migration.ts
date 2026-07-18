import fs from "fs"
import path from "path"

/**
 * One-time migration from flat ~/.projectflows/workflows/<id>.json layout to the
 * per-workflow folder layout ~/.projectflows/workflows/<id>/workflow.json.
 *
 * Idempotent — safe to call on every startup. If a per-workflow folder already
 * exists (e.g. an ad hoc scripts/ folder created by hand before this migration
 * existed), the json is moved into it rather than treated as a conflict.
 *
 * Non-.json files found flat in the directory (e.g. stray docs) are left
 * untouched and logged, since there's no way to infer which workflow they
 * belong to.
 *
 * Synchronous and blocking by design: called once at server startup, before
 * any request can reach WorkflowStorage, to avoid a race between an in-flight
 * migration and a concurrent read of a half-migrated directory.
 *
 * @param dir A workflows root to migrate, e.g. ~/.projectflows/workflows.
 * @returns true if any file was migrated, false if already migrated / nothing to do.
 */
export function runWorkflowMigrationIfNeeded(dir: string): boolean {
  let entries: string[]
  try {
    entries = fs.readdirSync(dir)
  } catch {
    return false
  }

  const flatFiles = entries.filter((f) => f.endsWith(".json"))
  if (flatFiles.length === 0) return false

  const skipped: string[] = []
  let migrated = 0

  for (const file of flatFiles) {
    const id = path.basename(file, ".json")
    const src = path.join(dir, file)
    const destDir = path.join(dir, id)
    const dest = path.join(destDir, "workflow.json")

    try {
      if (!fs.statSync(src).isFile()) continue
      fs.mkdirSync(destDir, { recursive: true })
      fs.renameSync(src, dest)
      migrated++
    } catch (err) {
      skipped.push(`${file} (${err instanceof Error ? err.message : String(err)})`)
    }
  }

  const remaining = entries.filter((f) => !flatFiles.includes(f))
  const strayNonJson = remaining.filter((f) => {
    if (f.startsWith(".")) return false
    try {
      return fs.statSync(path.join(dir, f)).isFile()
    } catch {
      return false
    }
  })
  if (strayNonJson.length > 0) {
    console.warn(
      `[workflow migration] left ${strayNonJson.length} non-.json file(s) untouched in ${dir}: ${strayNonJson.join(", ")}`,
    )
  }
  if (skipped.length > 0) {
    console.warn(`[workflow migration] failed to migrate ${skipped.length} file(s) in ${dir}: ${skipped.join(", ")}`)
  }
  if (migrated > 0) {
    console.log(`[workflow migration] migrated ${migrated} workflow(s) to folder layout in ${dir}`)
  }

  return migrated > 0
}
