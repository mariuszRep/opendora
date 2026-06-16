import type { Argv } from "yargs"
import type { Session as SDKSession, Message, Part } from "@opendora/sdk/v2"
import { Session } from "@opendora/session/session"
import { cmd } from "./cmd"
import { bootstrap } from "../bootstrap"
import { Database, eq } from "@opendora/storage/db"
import { SessionTable, MessageTable, PartTable } from "@opendora/session/sql"
import { Instance } from "@opendora/runtime/instance"
import { ShareNext } from "@opendora/session/share-next"
import { EOL } from "os"
import { Filesystem as Fs } from "@opendora/tools/filesystem/lib/primitives"

export type ShareData =
  | { type: "session"; data: SDKSession }
  | { type: "message"; data: Message }
  | { type: "part"; data: Part }
  | { type: "session_diff"; data: unknown }
  | { type: "model"; data: unknown }

/** Extract share ID from a share URL like https://opncd.ai/share/abc123 */
export function parseShareUrl(url: string): string | null {
  const match = url.match(/^https?:\/\/[^/]+\/share\/([a-zA-Z0-9_-]+)$/)
  return match ? match[1] : null
}

/**
 * Transform ShareNext API response (flat array) into the nested structure for local file storage.
 *
 * The API returns a flat array: [session, message, message, part, part, ...]
 * Local storage expects: { info: session, messages: [{ info: message, parts: [part, ...] }, ...] }
 *
 * This groups parts by their messageID to reconstruct the hierarchy before writing to disk.
 */
export function transformShareData(shareData: ShareData[]): {
  info: SDKSession
  messages: Array<{ info: Message; parts: Part[] }>
} | null {
  const sessionItem = shareData.find((d) => d.type === "session")
  if (!sessionItem) return null

  const messageMap = new Map<string, Message>()
  const partMap = new Map<string, Part[]>()

  for (const item of shareData) {
    if (item.type === "message") {
      messageMap.set(item.data.id, item.data)
    } else if (item.type === "part") {
      if (!partMap.has(item.data.messageID)) {
        partMap.set(item.data.messageID, [])
      }
      partMap.get(item.data.messageID)!.push(item.data)
    }
  }

  if (messageMap.size === 0) return null

  return {
    info: sessionItem.data,
    messages: Array.from(messageMap.values()).map((msg) => ({
      info: msg,
      parts: partMap.get(msg.id) ?? [],
    })),
  }
}

/**
 * Detect the file format based on extension or content.
 * Returns "csv", "json", or "url" (for share URLs).
 */
export function detectFormat(input: string): "csv" | "json" | "url" {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    return "url"
  }
  if (input.endsWith(".csv")) {
    return "csv"
  }
  return "json"
}

/**
 * Validation result for CSV input.
 */
export interface CsvValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  rowCount: number
  headers?: string[]
}

/**
 * Validate CSV content and return validation result.
 * Expected columns (flexible - detects available columns):
 * - id (message ID) - required for deduplication
 * - role (user/assistant/system) - required
 * - content - required
 * - name (optional, for tool calls)
 * - id (optional, for parts)
 */
export function validateCsv(content: string): CsvValidationResult {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "")
  const errors: string[] = []
  const warnings: string[] = []

  if (lines.length < 2) {
    return {
      valid: false,
      errors: ["CSV must have at least a header row and one data row"],
      warnings: [],
      rowCount: 0,
    }
  }

  const headerLine = lines[0]!
  const headers = parseCsvLine(headerLine)
  const normalizers: Record<string, (v: string) => string> = {
    id: (v) => v || "",
    role: (v) => v?.toLowerCase() || "",
    content: (v) => v || "",
    name: (v) => v || "",
    part_id: (v) => v || "",
    part_type: (v) => v || "",
  }

  // Check for required headers
  const hasRequiredHeaders = headers.some((h) => normalizers[h.toLowerCase()] && h.toLowerCase() !== "part_id" && h.toLowerCase() !== "part_type")
  if (!hasRequiredHeaders) {
    errors.push("CSV must have 'id', 'role', and 'content' columns (at minimum)")
  }

  // Normalize headers and check for key columns
  const headerMap = new Map<string, number>()
  for (let i = 0; i < headers.length; i++) {
    headerMap.set(headers[i]!.toLowerCase(), i)
  }

  const idIdx = headerMap.get("id")
  const roleIdx = headerMap.get("role")
  const contentIdx = headerMap.get("content")

  if (idIdx === undefined) {
    errors.push("Missing required 'id' column for deduplication")
  }
  if (roleIdx === undefined) {
    errors.push("Missing required 'role' column (user/assistant/system)")
  }
  if (contentIdx === undefined) {
    errors.push("Missing required 'content' column")
  }

  // Validate rows
  const dataLines = lines.slice(1)
  const seenIds = new Set<string>()
  let duplicateCount = 0

  for (let rowIdx = 0; rowIdx < dataLines.length; rowIdx++) {
    const cells = parseCsvLine(dataLines[rowIdx]!)
    if (cells.length === 0) continue

    if (idIdx !== undefined && cells[idIdx]!) {
      if (seenIds.has(cells[idIdx]!)) {
        duplicateCount++
      } else {
        seenIds.add(cells[idIdx]!)
      }
    }

    if (roleIdx !== undefined && cells[roleIdx]!) {
      const role = cells[roleIdx]!.toLowerCase()
      if (!["user", "assistant", "system", "tool"].includes(role)) {
        errors.push(`Row ${rowIdx + 2}: invalid role '${cells[roleIdx]}', expected user/assistant/system/tool`)
      }
    }
  }

  if (duplicateCount > 0) {
    warnings.push(`Found ${duplicateCount} duplicate row(s) with the same 'id' in the CSV`)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    rowCount: dataLines.length,
    headers,
  }
}

/**
 * Parse a CSV line handling quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ",") {
        result.push(current.trim())
        current = ""
      } else {
        current += char
      }
    }
  }

  result.push(current.trim())
  return result
}

/**
 * Transform validated CSV into session data structure.
 * Uses session ID from CSV or generates one if not provided.
 */
export function transformCsv(
  content: string,
  sessionId: string,
  projectId: string = "default",
): {
  info: SDKSession
  messages: Array<{ info: Message; parts: Part[] }>
} {
  const lines = content.split(/\r?\n/).filter((line) => line.trim() !== "")
  const headers = parseCsvLine(lines[0]!).map((h) => h.toLowerCase())

  const headerMap = new Map<string, number>()
  for (let i = 0; i < headers.length; i++) {
    headerMap.set(headers[i]!, i)
  }

  const idIdx = headerMap.get("id")
  const roleIdx = headerMap.get("role")
  const contentIdx = headerMap.get("content")
  const nameIdx = headerMap.get("name")
  const partIdIdx = headerMap.get("part_id")
  const partTypeIdx = headerMap.get("part_type")

  const messages: Array<{ info: Message; parts: Part[] }> = []
  const dataLines = lines.slice(1)

  for (let rowIdx = 0; rowIdx < dataLines.length; rowIdx++) {
    const cells = parseCsvLine(dataLines[rowIdx]!)
    if (cells.length === 0) continue

    const msgId = idIdx !== undefined && cells[idIdx]! ? cells[idIdx]! : `msg-${rowIdx + 1}`
    const role = roleIdx !== undefined ? cells[roleIdx]! : "user"
    const content = contentIdx !== undefined ? cells[contentIdx]! : ""

    const messageInfo = {
      id: msgId,
      sessionID: sessionId,
      role: role as Message["role"],
      content,
    } as unknown as Message

    messages.push({
      info: messageInfo,
      parts: [],
    })
  }

  const sessionInfo = {
    id: sessionId,
    projectID: projectId,
    title: `Imported session (${messages.length} messages)`,
  } as unknown as SDKSession

  return {
    info: sessionInfo,
    messages,
  }
}

export const ImportCommand = cmd({
  command: "import <file>",
  describe: "import session data from JSON file, CSV file, or URL",
  builder: (yargs: Argv) => {
    return yargs
      .positional("file", {
        describe: "path to JSON/CSV file or share URL",
        type: "string",
        demandOption: true,
      })
      .option("dry-run", {
        describe: "validate and report what would be imported without persisting",
        type: "boolean",
        default: false,
      })
      .option("session-id", {
        describe: "session ID to use (auto-generated if not provided)",
        type: "string",
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      let exportData:
        | {
            info: Session.Info
            messages: Array<{
              info: Message
              parts: Part[]
            }>
          }
        | undefined

      const isUrl = args.file.startsWith("http://") || args.file.startsWith("https://")
      const format = detectFormat(args.file)

      if (isUrl) {
        const slug = parseShareUrl(args.file)
        if (!slug) {
          process.stdout.write(`Invalid URL format. Expected: https://opncd.ai/share/<slug>${EOL}`)
          return
        }

        const baseUrl = await ShareNext.url()
        const response = await fetch(`${baseUrl}/api/share/${slug}/data`)

        if (!response.ok) {
          process.stdout.write(`Failed to fetch share data: ${response.statusText}${EOL}`)
          return
        }

        const shareData: ShareData[] = await response.json()
        const transformed = transformShareData(shareData)

        if (!transformed) {
          process.stdout.write(`Share not found or empty: ${slug}${EOL}`)
          return
        }

        exportData = transformed
      } else if (format === "csv") {
        // CSV import path
        const csvContent = await Fs.readText(args.file)
        if (!csvContent) {
          process.stdout.write(`File not found: ${args.file}${EOL}`)
          return
        }

        // Validate the CSV first
        const validation = validateCsv(csvContent)

        if (!validation.valid) {
          process.stdout.write(`CSV validation failed:${EOL}`)
          for (const err of validation.errors) {
            process.stdout.write(`  - ${err}${EOL}`)
          }
          return
        }

        if (validation.warnings.length > 0) {
          process.stdout.write(`CSV warnings:${EOL}`)
          for (const warn of validation.warnings) {
            process.stdout.write(`  - ${warn}${EOL}`)
          }
        }

        // Generate or use provided session ID
        const sessionId = args.sessionId || `csv-import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const projectId = "default"

        try {
          // Try to get current instance to use its project ID
          const _dir = Instance.directory
          if (_dir) {
            exportData = transformCsv(csvContent, sessionId, _dir)
          } else {
            exportData = transformCsv(csvContent, sessionId, projectId)
          }
        } catch {
          exportData = transformCsv(csvContent, sessionId, projectId)
        }

        // Check for duplicates in database
        if (exportData) {
          const existingSession = Database.use((db) =>
            db.select().from(SessionTable).where(eq(SessionTable.id, exportData!.info.id)).get(),
          )

          if (existingSession) {
            process.stdout.write(`Warning: session '${exportData.info.id}' already exists in database${EOL}`)
            process.stdout.write(`Use --session-id to specify a different session ID${EOL}`)
          }

          // Check for duplicate messages
          const existingMessageIds = Database.use((db) =>
            db
              .select()
              .from(MessageTable)
              .where(eq(MessageTable.session_id, exportData!.info.id))
              .all(),
          )
          const existingMsgIds = new Set(existingMessageIds.map((m) => m.id))
          const duplicateMessages = exportData.messages.filter((m) => existingMsgIds.has(m.info.id))

          if (duplicateMessages.length > 0) {
            process.stdout.write(
              `Warning: ${duplicateMessages.length} message(s) would duplicate existing records${EOL}`,
            )
          }
        }
      } else {
        // JSON import path (original behavior)
        exportData = await Fs.readJson<NonNullable<typeof exportData>>(args.file).catch(() => undefined)
        if (!exportData) {
          process.stdout.write(`File not found: ${args.file}${EOL}`)
          return
        }
      }

      if (!exportData) {
        process.stdout.write(`Failed to read session data${EOL}`)
        return
      }

      const messageCount = exportData.messages.length

      // Handle dry-run mode
      if (args.dryRun) {
        process.stdout.write(`[DRY-RUN] Would import session: ${exportData.info.id}${EOL}`)
        process.stdout.write(`[DRY-RUN] Messages: ${messageCount}${EOL}`)
        for (const msg of exportData.messages) {
          process.stdout.write(
            `  - ${msg.info.id} [${msg.info.role}]: ${(msg.info as any).content?.slice(0, 50) || "(empty)"}${(msg.info as any).content && (msg.info as any).content.length > 50 ? "..." : ""}${EOL}`,
          )
        }
        return
      }

      // Real import (not dry-run)
      Database.use((db) => db.insert(SessionTable).values(Session.toRow(exportData.info)).onConflictDoNothing().run())

      let insertedMessages = 0
      let skippedMessages = 0

      for (const msg of exportData.messages) {
        // Try to insert, skip if exists due to onConflictDoNothing
        const beforeCount = Database.use((db) =>
          db.select().from(MessageTable).where(eq(MessageTable.id, msg.info.id)).all().length,
        )

        Database.use((db) =>
          db
            .insert(MessageTable)
            .values({
              id: msg.info.id,
              session_id: exportData.info.id,
              time_created: msg.info.time?.created ?? Date.now(),
              data: msg.info,
            })
            .onConflictDoNothing()
            .run(),
        )

        const afterCount = Database.use((db) =>
          db.select().from(MessageTable).where(eq(MessageTable.id, msg.info.id)).all().length,
        )

        if (afterCount > beforeCount) {
          insertedMessages++
        } else {
          skippedMessages++
        }

        for (const part of msg.parts) {
          Database.use((db) =>
            db
              .insert(PartTable)
              .values({
                id: part.id,
                message_id: msg.info.id,
                session_id: exportData.info.id,
                data: part,
              })
              .onConflictDoNothing()
              .run(),
          )
        }
      }

      process.stdout.write(`Imported session: ${exportData.info.id}${EOL}`)
      process.stdout.write(`Messages: ${insertedMessages} inserted, ${skippedMessages} skipped${EOL}`)
    })
  },
})
