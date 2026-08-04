"use client"

import { PreviewPanel } from "@/components/ai-elements/preview-panel"
import type { ViewItem } from "@/hooks/use-workspace-layout"

export function PreviewPane({ item }: { item: ViewItem }) {
  if (item.type === "web") {
    return <PreviewPanel key={item.id} defaultMode="web" defaultUrl={item.refId} />
  }
  return <PreviewPanel key={item.id} defaultMode="sandbox" defaultPath={item.refId} defaultDisplayPath={item.title} />
}
