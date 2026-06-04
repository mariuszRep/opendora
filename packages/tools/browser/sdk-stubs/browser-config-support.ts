// Comprehensive stub for openclaw/plugin-sdk/browser-config-support
export const DEFAULT_BROWSER_CONTROL_PORT = 8338

export function resolveBrowserProfile(profileName: string): any {
  return {
    name: profileName,
    type: profileName === "user" ? "existing-session" : "isolated",
  }
}

export function resolveGatewayPort(): number {
  return 8338
}

export function deriveDefaultBrowserControlPort(): number {
  return 8338
}

export function deriveDefaultBrowserCdpPortRange(): [number, number] {
  return [9222, 9322]
}

export function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function resolveBrowserConfig(config: any, rootConfig?: any): any {
  return {
    enabled: config?.enabled !== false,
    controlPort: config?.controlPort || 8338,
    profiles: config?.profiles || { default: { type: "isolated" } },
    cdpPortRange: config?.cdpPortRange || [9222, 9322],
  }
}

export function normalizeProfileName(name: string): string {
  return name.trim().toLowerCase()
}

export function isValidProfileName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name)
}

export const CONFIG_DIR = process.env.OPENCODE_CONFIG_DIR || process.env.HOME + "/.projectflows"

export function resolveUserPath(path: string): string {
  return path.replace(/^~/, process.env.HOME || "")
}

export function shortenHomePath(path: string): string {
  const home = process.env.HOME
  if (home && path.startsWith(home)) {
    return "~" + path.slice(home.length)
  }
  return path
}
