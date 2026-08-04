"use client"

import { useWorkspaceLayoutContext } from "@/app/dashboard/workspace-layout-context"
import { PaneGroup } from "./pane-group"
import { SplitGrid } from "./split-grid"

export function WorkspacePanel() {
  const { groups, focusedGroupId, layoutMode } = useWorkspaceLayoutContext()

  if (layoutMode === "split") {
    return <SplitGrid groups={groups} focusedGroupId={focusedGroupId} />
  }

  return <PaneGroup group={groups[0]} isFocused />
}
