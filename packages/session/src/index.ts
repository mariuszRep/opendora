// ─── Original @opendora/session exports ──────────────────────────────────────
export { Session as PingPongSession } from "./pingpong-session"
export { SessionManager } from "./session-manager"
export { SessionQueue } from "./session-queue"
export type { StorageAdapter } from "./storage/adapter"
export type { Actor, Message, MessageKind, MessagePart, Parent, PingOptions, PongOptions,
              StreamOptions, InputProvenance, SendPolicy,
              SessionType, SessionStatus, SessionMeta, SessionParent,
              SessionFilter, CreateSessionOptions, RetentionPolicy } from "./types"
export type { MessageStream } from "./pingpong-session"
export { DEFAULT_RETENTION, evaluateSendPolicy } from "./types"
export { Bus } from "./bus"
export type { BusEventMap, BusHandle } from "./bus"
export { RetentionDaemon } from "./daemon"
export type { RetentionDaemonOptions } from "./daemon"
export type { SyncAdapter } from "./sync-adapter"

// ─── OpenDora session runtime ─────────────────────────────────────────────────
export { Session, sessionManager, retentionDaemon } from "./session"

// Core session types and schemas
export * from "./message-v2"
export * from "./events"
export * from "./from-row"
export * from "./retry"
export * from "./todo"
export * from "./status"

// SQL tables
export * from "./session.sql"

// Storage adapter
export { OpenDoraStorageAdapter, openDoraStorageAdapter, rowToMeta } from "./opendora-storage-adapter"
export type { CreateContext } from "./opendora-storage-adapter"

// Bus bridge
export { BusBridge } from "./bus-bridge"

// Configure
export { configure, getConfig } from "./config"
export type { SessionCoreConfig } from "./config"

// Migrated session logic
export { SessionProcessor } from "./processor"
export { SessionSummary } from "./summary"
export { SessionRevert } from "./revert"
export { SessionCompaction } from "./compaction"
export { TokenUsage, parseRateLimitHeaders } from "./token-usage"
export { TokenUsageTable } from "./token-usage.sql"
export type { Purpose as TokenUsagePurpose, RecordInput as TokenUsageRecordInput } from "./token-usage"
