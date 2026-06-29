"use client"

import type { ToolPart } from "@/lib/projectflows"
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewNavigation,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview"

export function getWebFetchUrl(tool: ToolPart): string | undefined {
  const input = "input" in tool.state ? tool.state.input : undefined
  if (input && typeof (input as { url?: string }).url === "string") {
    return (input as { url: string }).url
  }
  return undefined
}

export type WebFetchToolContentProps = {
  tool: ToolPart
}

export const WebFetchToolContent = ({ tool }: WebFetchToolContentProps) => {
  const url = getWebFetchUrl(tool)

  if (!url) {
    return (
      <div className="rounded-md border bg-background px-4 py-6 text-center text-sm text-muted-foreground">
        No URL available
      </div>
    )
  }

  return (
    <div className="h-[400px]">
      <WebPreview defaultUrl={url}>
        <WebPreviewNavigation>
          <WebPreviewUrl />
        </WebPreviewNavigation>
        <WebPreviewBody />
      </WebPreview>
    </div>
  )
}


export function getWebFetchToolTitle(tool: ToolPart): string {
  const url = getWebFetchUrl(tool)
  if (url) {
    try {
      const hostname = new URL(url).hostname
      return `Fetch: ${hostname}`
    } catch {
      return `Fetch: ${url.slice(0, 30)}…`
    }
  }
  return "WebFetch"
}

const WEBFETCH_TOOLS = new Set(["webfetch"])

export function isWebFetchTool(toolName: string): boolean {
  return WEBFETCH_TOOLS.has(toolName)
}
