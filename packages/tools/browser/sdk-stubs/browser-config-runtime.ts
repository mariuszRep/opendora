// Stub for openclaw/plugin-sdk/browser-config-runtime
export interface BrowserConfig {
  enabled: boolean
  controlPort: number
  profiles: Record<string, any>
}

export function loadBrowserConfig(): BrowserConfig {
  return {
    enabled: true,
    controlPort: 8338,
    profiles: {
      default: {
        type: "isolated",
      },
    },
  }
}
