import { BusEvent } from "@projectflows/util/bus-event"
import z from "zod"

/**
 * Shared with @projectflows/tools File/FileWatcher so runtime (format.ts, vcs.ts) can
 * subscribe to these events without depending on the package that owns the
 * implementation — tools already depends on runtime, so the reverse would cycle.
 */
export const FileEditedEvent = BusEvent.define(
  "file.edited",
  z.object({
    file: z.string(),
  }),
)

export const FileWatcherUpdatedEvent = BusEvent.define(
  "file.watcher.updated",
  z.object({
    file: z.string(),
    event: z.union([z.literal("add"), z.literal("change"), z.literal("unlink")]),
  }),
)
