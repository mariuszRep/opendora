// Stub for openclaw/plugin-sdk/ssrf-runtime
import type { SSRFPolicy } from "./ssrf-policy"

export async function validateURL(url: string, policy: SSRFPolicy): Promise<void> {
  // Basic URL validation - can be enhanced later
  try {
    new URL(url)
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }
}

export function isPrivateIP(hostname: string): boolean {
  // Simple check for private IPs
  return (
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.16.") ||
    hostname === "localhost" ||
    hostname === "127.0.0.1"
  )
}
