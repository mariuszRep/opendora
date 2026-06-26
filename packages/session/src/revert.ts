/**
 * SessionRevert — migrated from opencode/src/session/revert.ts
 * Handles revert/unrevert/cleanup of session state.
 *
 * Dependencies injected via getConfig():
 *   config.snapshot — Snapshot.track/revert/diff/restore
 *   config.storage  — Storage.write
 *   config.bus      — Bus.publish for SessionEvents.Diff
 *   config.db       — for direct DB access (MessageTable, PartTable deletes)
 */

import z from "zod"
import { Identifier } from "@projectflows/util/id"
import { MessageV2 } from "./message-v2.ts"
import { getConfig } from "./config.ts"
import { SessionSummary } from "./summary.ts"
import { MessageTable, PartTable } from "./session.sql.ts"
import { eq } from "drizzle-orm"

const SessionDiffEvent = { type: "session.diff" }
const MessageRemovedEvent = { type: "message.removed" }
const PartRemovedEvent = { type: "part.removed" }

export namespace SessionRevert {
  export const RevertInput = z.object({
    sessionID: Identifier.schema("session"),
    messageID: Identifier.schema("message"),
    partID: Identifier.schema("part").optional(),
  })
  export type RevertInput = z.infer<typeof RevertInput>

  export async function revert(
    input: RevertInput,
    deps: {
      assertNotBusy: (sessionID: string) => void
      getMessages: (sessionID: string) => Promise<MessageV2.WithParts[]>
      getSession: (sessionID: string) => Promise<any>
      setRevert: (input: any) => Promise<any>
    },
  ) {
    deps.assertNotBusy(input.sessionID)
    const all = await deps.getMessages(input.sessionID)
    let lastUser: MessageV2.User | undefined
    const session = await deps.getSession(input.sessionID)

    let revert: any
    const patches: any[] = []
    for (const msg of all) {
      if (msg.info.role === "user") lastUser = msg.info
      const remaining = []
      for (const part of msg.parts) {
        if (revert) {
          if (part.type === "patch") {
            patches.push(part)
          }
          continue
        }

        if (!revert) {
          if ((msg.info.id === input.messageID && !input.partID) || part.id === input.partID) {
            const partID = remaining.some((item: any) => ["text", "tool"].includes(item.type)) ? input.partID : undefined
            revert = {
              messageID: !partID && lastUser ? lastUser.id : msg.info.id,
              partID,
            }
          }
          remaining.push(part)
        }
      }
    }

    if (revert) {
      const snapshotSvc = getConfig().snapshot
      revert.snapshot = session.revert?.snapshot ?? (snapshotSvc ? await snapshotSvc.track() : undefined)
      if (snapshotSvc) await snapshotSvc.revert(patches)
      if (revert.snapshot && snapshotSvc) revert.diff = await snapshotSvc.diff(revert.snapshot)
      const rangeMessages = all.filter((msg: any) => msg.info.id >= revert!.messageID)
      const diffs = await SessionSummary.computeDiff({ messages: rangeMessages })
      const cfg = getConfig()
      if (cfg.storage) await cfg.storage.write(["session_diff", input.sessionID], diffs)
      cfg.bus?.publish(SessionDiffEvent, {
        sessionID: input.sessionID,
        diff: diffs,
      })
      return deps.setRevert({
        sessionID: input.sessionID,
        revert,
        summary: {
          additions: diffs.reduce((sum: number, x: any) => sum + x.additions, 0),
          deletions: diffs.reduce((sum: number, x: any) => sum + x.deletions, 0),
          files: diffs.length,
        },
      })
    }
    return session
  }

  export async function unrevert(
    input: { sessionID: string },
    deps: {
      assertNotBusy: (sessionID: string) => void
      getSession: (sessionID: string) => Promise<any>
      clearRevert: (sessionID: string) => Promise<any>
    },
  ) {
    deps.assertNotBusy(input.sessionID)
    const session = await deps.getSession(input.sessionID)
    if (!session.revert) return session
    const snapshotSvc = getConfig().snapshot
    if (session.revert.snapshot && snapshotSvc) await snapshotSvc.restore(session.revert.snapshot)
    return deps.clearRevert(input.sessionID)
  }

  export async function cleanup(
    session: any,
    deps: {
      getMessages: (sessionID: string) => Promise<MessageV2.WithParts[]>
      clearRevert: (sessionID: string) => Promise<any>
    },
  ) {
    if (!session.revert) return
    const sessionID = session.id
    const msgs = await deps.getMessages(sessionID)
    const messageID = session.revert.messageID
    const preserve: MessageV2.WithParts[] = []
    const remove: MessageV2.WithParts[] = []
    let target: MessageV2.WithParts | undefined
    for (const msg of msgs) {
      if (msg.info.id < messageID) {
        preserve.push(msg)
        continue
      }
      if (msg.info.id > messageID) {
        remove.push(msg)
        continue
      }
      if (session.revert.partID) {
        preserve.push(msg)
        target = msg
        continue
      }
      remove.push(msg)
    }

    const db = getConfig().db
    const bus = getConfig().bus

    for (const msg of remove) {
      db.delete(MessageTable).where(eq(MessageTable.id, msg.info.id)).run()
      bus?.publish(MessageRemovedEvent, { sessionID: sessionID, messageID: msg.info.id })
    }

    if (session.revert.partID && target) {
      const partID = session.revert.partID
      const removeStart = target.parts.findIndex((part: any) => part.id === partID)
      if (removeStart >= 0) {
        const preserveParts = target.parts.slice(0, removeStart)
        const removeParts = target.parts.slice(removeStart)
        target.parts = preserveParts
        for (const part of removeParts) {
          db.delete(PartTable).where(eq(PartTable.id, part.id)).run()
          bus?.publish(PartRemovedEvent, {
            sessionID: sessionID,
            messageID: target.info.id,
            partID: part.id,
          })
        }
      }
    }
    await deps.clearRevert(sessionID)
  }
}
