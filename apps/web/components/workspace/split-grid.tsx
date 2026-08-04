"use client"

import type { ReactNode } from "react"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { PaneGroup } from "./pane-group"
import type { Group } from "@/hooks/use-workspace-layout"

// Pane-count -> rows of pane indices into `groups`. 3 = "2 up, one bottom", 6 = "3 / 3".
const PRESETS: Record<number, number[][]> = {
  2: [[0, 1]],
  3: [[0, 1], [2]],
  4: [[0, 1], [2, 3]],
  5: [[0, 1, 2], [3, 4]],
  6: [[0, 1, 2], [3, 4, 5]],
}

function withHandles(nodes: ReactNode[]): ReactNode[] {
  const out: ReactNode[] = []
  nodes.forEach((node, i) => {
    if (i > 0) out.push(<ResizableHandle key={`handle-${i}`} withHandle />)
    out.push(node)
  })
  return out
}

function Row({ indices, groups, focusedGroupId }: { indices: number[]; groups: Group[]; focusedGroupId: string }) {
  const panels = indices.map((i) => (
    <ResizablePanel key={groups[i].id} minSize={10}>
      <PaneGroup group={groups[i]} isFocused={groups[i].id === focusedGroupId} />
    </ResizablePanel>
  ))
  return (
    <ResizablePanelGroup orientation="horizontal" className="h-full w-full">
      {withHandles(panels)}
    </ResizablePanelGroup>
  )
}

export function SplitGrid({ groups, focusedGroupId }: { groups: Group[]; focusedGroupId: string }) {
  const rows = PRESETS[groups.length] ?? PRESETS[2]

  if (rows.length === 1) {
    return <Row indices={rows[0]} groups={groups} focusedGroupId={focusedGroupId} />
  }

  const rowPanels = rows.map((indices, i) => (
    <ResizablePanel key={i} minSize={10}>
      <Row indices={indices} groups={groups} focusedGroupId={focusedGroupId} />
    </ResizablePanel>
  ))

  return (
    <ResizablePanelGroup orientation="vertical" className="h-full w-full">
      {withHandles(rowPanels)}
    </ResizablePanelGroup>
  )
}
