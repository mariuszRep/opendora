/**
 * Re-exports MessageV2 from @opendora/session-core.
 * DB-accessing operations (stream, parts) require session-core to be configured
 * — see configure-session-core.ts.
 */
export { MessageV2 } from "@opendora/session-core/message"
