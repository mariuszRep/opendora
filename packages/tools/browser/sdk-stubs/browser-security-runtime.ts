// Stub for openclaw/plugin-sdk/browser-security-runtime
export interface SecurityAudit {
  allowed: boolean
  reason?: string
}

export async function auditBrowserRequest(url: string): Promise<SecurityAudit> {
  // Allow all by default - can add restrictions later
  return { allowed: true }
}
