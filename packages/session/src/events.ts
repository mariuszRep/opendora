/**
 * Session and message BusEvent definitions.
 * Extracted to a standalone module so session/index.ts and bus-bridge.ts
 * can import them without creating circular dependencies.
 */

import z from "zod"
import { MessageV2 } from "./message-v2"

export { MessageV2 }

// Inline BusEvent.define — same pattern as opencode/src/bus/bus-event.ts
// TODO: use @opendora/bus when it exists
function defineBusEvent<Type extends string, Properties extends z.ZodType>(
  type: Type,
  properties: Properties,
) {
  return { type, properties }
}

// Session.Info for bus events — use z.any() to avoid circular dep
const SessionInfoSchema = z.any()

// Snapshot.FileDiff used as z.any() to avoid importing opencode snapshot
const FileDiffSchema = z.any()

export const SessionEvents = {
  Created: defineBusEvent("session.created", z.object({ info: SessionInfoSchema })),
  Updated: defineBusEvent("session.updated", z.object({ info: SessionInfoSchema })),
  Deleted: defineBusEvent("session.deleted", z.object({ info: SessionInfoSchema })),
  Diff: defineBusEvent(
    "session.diff",
    z.object({
      sessionID: z.string(),
      diff: FileDiffSchema.array(),
    }),
  ),
  Error: defineBusEvent(
    "session.error",
    z.object({
      sessionID: z.string().optional(),
      error: MessageV2.Assistant.shape.error,
    }),
  ),
}
