import type { SessionManager } from "./session-manager.ts"
import type { StorageAdapter } from "./storage/adapter.ts"
import { Bus } from "./bus.ts"

export type RetentionDaemonOptions = {
  intervalMs?: number   // default 60 000 ms
}

export class RetentionDaemon {
  private timer: ReturnType<typeof setInterval> | null = null

  start(manager: SessionManager, adapter: StorageAdapter, opts: RetentionDaemonOptions = {}): void {
    if (this.timer !== null) return
    const intervalMs = opts.intervalMs ?? 60_000
    this.timer = setInterval(() => {
      this.sweep(manager, adapter).catch((err) => {
        console.error("[RetentionDaemon] sweep error:", err)
      })
    }, intervalMs)
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  // ─── Sweep ───────────────────────────────────────────────────────────────────

  private async sweep(manager: SessionManager, adapter: StorageAdapter): Promise<void> {
    const sessions = await adapter.listSessions({ status: "active" })
    const now = Date.now()

    for (const meta of sessions) {
      const { onExpire, ttlMs, maxAgeDays } = meta.retention
      if (!onExpire) continue

      let expired = false

      if (ttlMs !== undefined && now - meta.updatedAt >= ttlMs) {
        expired = true
      }

      if (!expired && maxAgeDays !== undefined) {
        const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
        if (now - meta.createdAt >= maxAgeMs) {
          expired = true
        }
      }

      if (!expired) continue

      try {
        if (onExpire === "archive") {
          await manager.archive(meta.id)
        } else if (onExpire === "close") {
          await manager.close(meta.id)
          // Apply autoArchive / autoDelete immediately after close
          if (meta.retention.autoDelete)        await manager.delete(meta.id)
          else if (meta.retention.autoArchive)  await manager.archive(meta.id)
        } else if (onExpire === "delete") {
          await manager.delete(meta.id)
        }

        Bus.publish("retention.evicted", { sessionId: meta.id, evictedCount: 1 })
      } catch (err) {
        console.error(`[RetentionDaemon] failed to apply onExpire="${onExpire}" to session ${meta.id}:`, err)
      }
    }
  }
}
