/**
 * Shared types for vendor session importers.
 *
 * Importers read a source file from another agent (Claude Code, Codex,
 * Antigravity, Windsurf) and materialise it as an opendora session, its
 * MessageV2 messages and their parts. The source vendor and native id are
 * preserved on every row, and the original records are preserved verbatim in
 * `vendor_raw` / `vendor_raw_header` columns for lossless round-trip.
 */

export type Vendor = "claude" | "codex" | "antigravity" | "windsurf"

export interface ImportOptions {
  /**
   * Project id to attach the imported session to. Required because opendora's
   * session table has a FK onto `project`. Callers typically maintain a
   * dedicated "imported" project or reuse the current project.
   */
  projectID: string
  /**
   * Path to the source file on disk. The file is streamed line by line for
   * JSONL vendors and read whole for binary vendors.
   */
  sourcePath: string
  /**
   * Opendora session id to use. If omitted a new id is generated. If a session
   * with `(vendor, native_id)` already exists the caller should pass its id to
   * re-import into the same row, otherwise a duplicate session will be created.
   */
  sessionID?: string
  /**
   * Override the slug and directory for the session row. Defaults come from
   * vendor metadata when available.
   */
  slug?: string
  directory?: string
  /**
   * Opendora agent id to tag imported user and assistant messages with.
   * Defaults to the vendor name.
   */
  agent?: string
}

export interface ImportResult {
  vendor: Vendor
  sessionID: string
  nativeID: string | null
  messagesImported: number
  partsImported: number
  /** Count of source records the importer could not map and dropped. */
  recordsSkipped: number
  /** The first error encountered, if any. Importers do not throw on per-record issues. */
  warnings: string[]
}
