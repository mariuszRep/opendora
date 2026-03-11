import fs from "fs"
import path from "path"
import { randomUUID } from "crypto"
import type { StorageAdapter } from "../adapter.ts"
import type { Message, SessionFilter, SessionMeta } from "../../index.ts"

type SessionIndex = Record<string, SessionMeta>

export class JsonlAdapter implements StorageAdapter {
  private dir: string
  private indexPath: string
  private cache: { index: SessionIndex; mtimeMs: number } | null = null

  constructor(dir: string) {
    this.dir = dir
    this.indexPath = path.join(dir, "sessions.json")
    fs.mkdirSync(path.join(dir, "archived"), { recursive: true })
  }

  // ─── Index (sessions.json) ──────────────────────────────────────────────────

  private readIndex(): SessionIndex {
    try {
      const stat = fs.statSync(this.indexPath)
      if (this.cache && this.cache.mtimeMs === stat.mtimeMs) {
        return structuredClone(this.cache.index)
      }
      const raw = fs.readFileSync(this.indexPath, "utf-8")
      const index = JSON.parse(raw) as SessionIndex
      this.cache = { index: structuredClone(index), mtimeMs: stat.mtimeMs }
      return index
    } catch {
      return {}
    }
  }

  private writeIndex(index: SessionIndex): void {
    this.cache = null
    const tmp = `${this.indexPath}.${process.pid}.${randomUUID()}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(index, null, 2), { encoding: "utf-8", mode: 0o600 })
    fs.renameSync(tmp, this.indexPath)
  }

  // ─── JSONL helpers ──────────────────────────────────────────────────────────

  private sessionFile(id: string): string {
    return path.join(this.dir, `${id}.jsonl`)
  }

  private archivedFile(id: string): string {
    return path.join(this.dir, "archived", `${id}.jsonl`)
  }

  // ─── Sessions ───────────────────────────────────────────────────────────────

  async createSession(meta: SessionMeta): Promise<void> {
    const index = this.readIndex()
    index[meta.id] = meta
    this.writeIndex(index)
    fs.writeFileSync(this.sessionFile(meta.id), "", "utf-8")
  }

  async getSession(id: string): Promise<SessionMeta | null> {
    const index = this.readIndex()
    return index[id] ?? null
  }

  async updateSession(id: string, patch: Partial<SessionMeta>): Promise<void> {
    const index = this.readIndex()
    if (!index[id]) return
    index[id] = { ...index[id], ...patch, updatedAt: Date.now() }

    if (patch.status === "archived") {
      const src = this.sessionFile(id)
      const dst = this.archivedFile(id)
      if (fs.existsSync(src)) fs.renameSync(src, dst)
    }

    if (patch.status === "closed" && index[id].type === "scratchpad") {
      const src = this.sessionFile(id)
      if (fs.existsSync(src)) fs.unlinkSync(src)
    }

    this.writeIndex(index)
  }

  async listSessions(filter?: SessionFilter): Promise<SessionMeta[]> {
    const index = this.readIndex()
    let results = Object.values(index)
    if (filter?.type)     results = results.filter((s) => s.type === filter.type)
    if (filter?.status)   results = results.filter((s) => s.status === filter.status)
    if (filter?.parentId) results = results.filter((s) => s.parent?.sessionId === filter.parentId)
    return results.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async deleteSession(id: string): Promise<void> {
    const index = this.readIndex()
    delete index[id]
    this.writeIndex(index)
    for (const f of [this.sessionFile(id), this.archivedFile(id)]) {
      if (fs.existsSync(f)) fs.unlinkSync(f)
    }
  }

  // ─── Messages ───────────────────────────────────────────────────────────────

  async appendMessage(msg: Message): Promise<void> {
    const file = this.sessionFile(msg.sessionId)
    fs.appendFileSync(file, JSON.stringify(msg) + "\n", "utf-8")

    const meta = await this.getSession(msg.sessionId)
    const cap = meta?.retention.maxMessages
    if (cap) {
      const messages = await this.getMessages(msg.sessionId)
      if (messages.length > cap) {
        const evictCount = messages.length - cap
        console.warn(
          `[JsonlAdapter] evicting ${evictCount} oldest message(s) from session ${msg.sessionId} (maxMessages=${cap})`
        )
        const kept = messages.slice(evictCount)
        const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
        fs.writeFileSync(tmp, kept.map((m) => JSON.stringify(m)).join("\n") + "\n", "utf-8")
        fs.renameSync(tmp, file)
      }
    }
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    const file = this.sessionFile(sessionId)
    if (!fs.existsSync(file)) return []
    const raw = fs.readFileSync(file, "utf-8")
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Message)
  }

  async getMessage(id: string): Promise<Message | null> {
    // scan all active sessions — use SqliteAdapter for large-scale lookup
    const index = this.readIndex()
    for (const sessionId of Object.keys(index)) {
      const msgs = await this.getMessages(sessionId)
      const found = msgs.find((m) => m.id === id)
      if (found) return found
    }
    return null
  }
}
