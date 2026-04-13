// Stub for openclaw/plugin-sdk/browser-node-runtime
export interface BrowserNode {
  nodeId: string
  connected: boolean
  capabilities: string[]
}

export async function listBrowserNodes(): Promise<BrowserNode[]> {
  // No nodes by default - browser runs locally
  return []
}
