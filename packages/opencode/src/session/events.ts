/**
 * Session and message BusEvent definitions.
 * Extracted to a standalone module so both session/index.ts and bus-bridge.ts
 * can import them without creating circular dependencies.
 */

import z from "zod"
import { BusEvent } from "@/bus/bus-event"
import { Snapshot } from "@/snapshot"
import { MessageV2 } from "./message-v2"

// Re-export MessageV2 events here so everything session-related is in one place.
export { MessageV2 }

// ─── Session.Info schema (minimal, for bus event typing) ─────────────────────
// The full Session.Info Zod schema lives in session/index.ts alongside toRow/fromRow.
// Here we use z.any() to avoid importing the full schema and pulling in all deps.
// Subscribers that need the typed Info should import Session.Info from index.ts.

const SessionInfoSchema = z.any()

export const SessionEvents = {
  Created: BusEvent.define("session.created", z.object({ info: SessionInfoSchema })),
  Updated: BusEvent.define("session.updated", z.object({ info: SessionInfoSchema })),
  Deleted: BusEvent.define("session.deleted", z.object({ info: SessionInfoSchema })),
  Diff: BusEvent.define(
    "session.diff",
    z.object({
      sessionID: z.string(),
      diff: Snapshot.FileDiff.array(),
    }),
  ),
  Error: BusEvent.define(
    "session.error",
    z.object({
      sessionID: z.string().optional(),
      error: MessageV2.Assistant.shape.error,
    }),
  ),
}
