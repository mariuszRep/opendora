import { Flag } from "./flag"

declare const PROJECTFLOWS_VERSION: string
declare const PROJECTFLOWS_CHANNEL: string

export const VERSION = typeof PROJECTFLOWS_VERSION === "string" ? PROJECTFLOWS_VERSION : "local"
export const CHANNEL = typeof PROJECTFLOWS_CHANNEL === "string" ? PROJECTFLOWS_CHANNEL : "local"
export const USER_AGENT = `projectflows/${CHANNEL}/${VERSION}/${Flag.PROJECTFLOWS_CLIENT}`
