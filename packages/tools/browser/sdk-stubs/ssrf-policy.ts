// Stub for openclaw/plugin-sdk/ssrf-policy
export interface SSRFPolicy {
  allowPrivateIPs: boolean
  allowLoopback: boolean
  blockedDomains?: string[]
}

export function getDefaultSSRFPolicy(): SSRFPolicy {
  return {
    allowPrivateIPs: false,
    allowLoopback: true,
    blockedDomains: [],
  }
}
