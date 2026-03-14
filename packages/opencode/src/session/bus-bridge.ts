/**
 * Bridges PingPong's Bus events to OpenDora's Bus.
 *
 * PingPong's SessionManager fires events on PingPong's Bus when sessions change.
 * This module subscribes to those events and re-publishes them on OpenDora's Bus
 * so the rest of OpenDora (SSE layer, UI, etc.) stays informed.
 *
 * Call BusBridge.start() once at server startup, after the Database is ready.
 */

import { Bus as PPBus } from "@opendora/session"
import type { BusHandle } from "@opendora/session"
import { Bus } from "@/bus"
import { Database, eq } from "../storage/db"
import { SessionTable } from "./session.sql"
import { fromRow } from "./from-row"
import { SessionEvents } from "./events"

const handles: BusHandle[] = []

export namespace BusBridge {
  export function start(): void {
    if (handles.length > 0) return // already started

    handles.push(
      PPBus.subscribe("session.created", ({ meta }) => {
        const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, meta.id)).get())
        if (!row) return
        Bus.publish(SessionEvents.Created, { info: fromRow(row) })
      }),

      PPBus.subscribe("session.updated", ({ id }) => {
        const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, id)).get())
        if (!row) return
        Bus.publish(SessionEvents.Updated, { info: fromRow(row) })
      }),

      PPBus.subscribe("session.archived", ({ id }) => {
        const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, id)).get())
        if (!row) return
        Bus.publish(SessionEvents.Updated, { info: fromRow(row) })
      }),

      PPBus.subscribe("session.closed", ({ id }) => {
        const row = Database.use((db) => db.select().from(SessionTable).where(eq(SessionTable.id, id)).get())
        if (!row) return
        Bus.publish(SessionEvents.Updated, { info: fromRow(row) })
      }),

      PPBus.subscribe("session.deleted", ({ id }) => {
        // Row is already gone — publish a minimal deleted event
        Bus.publish(SessionEvents.Deleted, {
          info: { id, slug: "", projectID: "", directory: "", title: "", version: "", time: { created: 0, updated: 0 } } as any,
        })
      }),
    )
  }

  export function stop(): void {
    for (const h of handles) PPBus.unsubscribe(h)
    handles.length = 0
  }
}
