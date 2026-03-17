/**
 * SessionSummary — migrated from opencode/src/session/summary.ts
 * Computes file-change diffs and session-level summaries.
 *
 * Dependencies injected via getConfig():
 *   config.snapshot — Snapshot.diffFull(from, to)
 *   config.storage  — Storage.read / Storage.write
 *   config.bus      — Bus.publish for SessionEvents.Diff
 */

import { MessageV2 } from "./message-v2.ts"
import { getConfig } from "./config.ts"
import { Identifier } from "@opendora/util/id"
import z from "zod"
import { fn } from "@opendora/util/fn"

// Inline unquoteGitPath
function unquoteGitPath(input: string): string {
  if (!input.startsWith('"')) return input
  if (!input.endsWith('"')) return input
  const body = input.slice(1, -1)
  const bytes: number[] = []

  for (let i = 0; i < body.length; i++) {
    const char = body[i]!
    if (char !== "\\") {
      bytes.push(char.charCodeAt(0))
      continue
    }

    const next = body[i + 1]
    if (!next) {
      bytes.push("\\".charCodeAt(0))
      continue
    }

    if (next >= "0" && next <= "7") {
      const chunk = body.slice(i + 1, i + 4)
      const match = chunk.match(/^[0-7]{1,3}/)
      if (!match) {
        bytes.push(next.charCodeAt(0))
        i++
        continue
      }
      bytes.push(parseInt(match[0], 8))
      i += match[0].length
      continue
    }

    const escaped =
      next === "n"
        ? "\n"
        : next === "r"
          ? "\r"
          : next === "t"
            ? "\t"
            : next === "b"
              ? "\b"
              : next === "f"
                ? "\f"
                : next === "v"
                  ? "\v"
                  : next === "\\" || next === '"'
                    ? next
                    : undefined

    bytes.push((escaped ?? next).charCodeAt(0))
    i++
  }

  return Buffer.from(bytes).toString()
}

const SessionDiffEvent = { type: "session.diff" }

export namespace SessionSummary {
  export const summarize = fn(
    z.object({
      sessionID: z.string(),
      messageID: z.string(),
    }),
    async (input: { sessionID: string; messageID: string }) => {
      // We need the session messages — these come from caller
      // This is called from within Session context via updateMessage callbacks
      // For now, re-export the functions so prompt.ts (still in opencode) can call them
    },
  )

  export async function summarizeWithMessages(input: {
    sessionID: string
    messageID: string
    messages: MessageV2.WithParts[]
    setSummary: (input: any) => Promise<any>
    updateMessage: (msg: any) => Promise<any>
  }) {
    await Promise.all([
      summarizeSession({ sessionID: input.sessionID, messages: input.messages, setSummary: input.setSummary }),
      summarizeMessage({ messageID: input.messageID, messages: input.messages, updateMessage: input.updateMessage }),
    ])
  }

  async function summarizeSession(input: {
    sessionID: string
    messages: MessageV2.WithParts[]
    setSummary: (input: any) => Promise<any>
  }) {
    const diffs = await computeDiff({ messages: input.messages })
    await input.setSummary({
      sessionID: input.sessionID,
      summary: {
        additions: diffs.reduce((sum: number, x: any) => sum + x.additions, 0),
        deletions: diffs.reduce((sum: number, x: any) => sum + x.deletions, 0),
        files: diffs.length,
      },
    })
    const cfg = getConfig()
    if (cfg.storage) {
      await cfg.storage.write(["session_diff", input.sessionID], diffs)
    }
    cfg.bus?.publish(SessionDiffEvent, {
      sessionID: input.sessionID,
      diff: diffs,
    })
  }

  async function summarizeMessage(input: {
    messageID: string
    messages: MessageV2.WithParts[]
    updateMessage: (msg: any) => Promise<any>
  }) {
    const messages = input.messages.filter(
      (m) => m.info.id === input.messageID || (m.info.role === "assistant" && m.info.parentID === input.messageID),
    )
    const msgWithParts = messages.find((m) => m.info.id === input.messageID)!
    if (!msgWithParts) return
    const userMsg = msgWithParts.info as MessageV2.User
    const diffs = await computeDiff({ messages })
    userMsg.summary = {
      ...userMsg.summary,
      diffs,
    }
    await input.updateMessage(userMsg)
  }

  export const diff = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message").optional(),
    }),
    async (input: { sessionID: string; messageID?: string }) => {
      const cfg = getConfig()
      if (!cfg.storage) return []
      const diffs = await cfg.storage.read<any[]>(["session_diff", input.sessionID]).catch(() => [])
      const next = diffs.map((item: any) => {
        const file = unquoteGitPath(item.file)
        if (file === item.file) return item
        return {
          ...item,
          file,
        }
      })
      const changed = next.some((item: any, i: number) => item.file !== diffs[i]?.file)
      if (changed && cfg.storage) cfg.storage.write(["session_diff", input.sessionID], next).catch(() => {})
      return next
    },
  )

  export async function computeDiff(input: { messages: MessageV2.WithParts[] }) {
    let from: string | undefined
    let to: string | undefined

    for (const item of input.messages) {
      if (!from) {
        for (const part of item.parts) {
          if (part.type === "step-start" && (part as any).snapshot) {
            from = (part as any).snapshot
            break
          }
        }
      }

      for (const part of item.parts) {
        if (part.type === "step-finish" && (part as any).snapshot) {
          to = (part as any).snapshot
        }
      }
    }

    if (from && to) {
      const snapshotSvc = getConfig().snapshot
      if (snapshotSvc) return snapshotSvc.diffFull(from, to)
    }
    return []
  }
}
