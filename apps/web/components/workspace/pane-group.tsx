"use client"

import { useWorkspaceLayoutContext } from "@/app/dashboard/workspace-layout-context"
import type { Group } from "@/hooks/use-workspace-layout"
import { cn } from "@/lib/utils"
import { TabBar } from "./tab-bar"
import { PANE_REGISTRY } from "./pane-registry"

export function PaneGroup({ group, isFocused }: { group: Group; isFocused: boolean }) {
  const { items, closeTab, selectTab, moveTab, setFocusedGroup, openTerminalTab, openSessionTab, openPreviewTab } =
    useWorkspaceLayoutContext()

  const tabs = group.tabIds.map((id) => items[id]).filter((item) => item !== undefined)
  const activeTab = group.activeTabId ? items[group.activeTabId] : undefined
  const ActivePane = activeTab ? PANE_REGISTRY[activeTab.type] : null

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-background",
        isFocused && "ring-1 ring-inset ring-primary/30",
      )}
      onMouseDown={() => setFocusedGroup(group.id)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const raw = e.dataTransfer.getData("text/plain")
        if (!raw) return
        try {
          const { tabId, fromGroupId } = JSON.parse(raw) as { tabId: string; fromGroupId: string }
          moveTab(tabId, fromGroupId, group.id)
        } catch {
          // ignore malformed drag payload
        }
      }}
    >
      <TabBar
        tabs={tabs}
        activeTabId={group.activeTabId}
        groupId={group.id}
        onSelect={(tabId) => selectTab(group.id, tabId)}
        onClose={(tabId) => closeTab(group.id, tabId)}
        onNewTerminal={() => openTerminalTab(group.id)}
        onOpenSession={(sessionId, title) => openSessionTab(sessionId, title, group.id)}
        onOpenPreview={(kind, refId, title) => openPreviewTab(kind, refId, title, group.id)}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab && ActivePane ? (
          <ActivePane item={activeTab} />
        ) : (
          <div className="flex h-full w-full items-center justify-center border border-dashed text-xs text-muted-foreground">
            Drag a tab here, or use + to open one
          </div>
        )}
      </div>
    </div>
  )
}
