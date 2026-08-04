import dynamic from "next/dynamic"
import type { ComponentType } from "react"
import type { ViewItem, ViewItemType } from "@/hooks/use-workspace-layout"
import { SessionPane } from "./session-pane"
import { PreviewPane } from "./preview-pane"

// xterm.js touches browser-only globals at import time, so it must never be pulled into the server render.
const TerminalPane = dynamic(() => import("./terminal-pane").then((m) => m.TerminalPane), { ssr: false })

export const PANE_REGISTRY: Record<ViewItemType, ComponentType<{ item: ViewItem }>> = {
  terminal: TerminalPane,
  session: SessionPane,
  file: PreviewPane,
  web: PreviewPane,
}
