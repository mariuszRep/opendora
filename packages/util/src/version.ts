import { Flag } from "./flag"

declare const OPENCODE_VERSION: string
declare const OPENCODE_CHANNEL: string

export const VERSION = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local"
export const CHANNEL = typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : "local"
export const USER_AGENT = `opencode/${CHANNEL}/${VERSION}/${Flag.OPENCODE_CLIENT}`
