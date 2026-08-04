"use client"

import { useState } from "react"
import { PlusIcon, XIcon, TerminalIcon, MessageSquareIcon, FileIcon, GlobeIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileTreePanel } from "@/components/file-tree/file-tree-panel"
import { useOpendoraContext } from "@/app/dashboard/projectflows-context"
import type { ViewItem, ViewItemType } from "@/hooks/use-workspace-layout"

const TAB_ICON: Record<ViewItemType, typeof TerminalIcon> = {
  terminal: TerminalIcon,
  session: MessageSquareIcon,
  file: FileIcon,
  web: GlobeIcon,
}

function OpenPreviewDialog({
  open,
  onOpenChange,
  rootPath,
  onOpenPreview,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rootPath?: string
  onOpenPreview: (kind: "file" | "web", refId: string, title: string) => void
}) {
  const [url, setUrl] = useState("")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Open preview</DialogTitle>
        </DialogHeader>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!url.trim()) return
            onOpenPreview("web", url.trim(), url.trim())
            setUrl("")
            onOpenChange(false)
          }}
        >
          <Input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Button type="submit" size="sm">
            Open URL
          </Button>
        </form>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border">
          {rootPath ? (
            <FileTreePanel
              rootPath={rootPath}
              onFileClick={(node) => {
                onOpenPreview("file", node.path, node.name)
                onOpenChange(false)
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
              Select a session in the sidebar to browse its files
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function TabBar({
  tabs,
  activeTabId,
  groupId,
  onSelect,
  onClose,
  onNewTerminal,
  onOpenSession,
  onOpenPreview,
}: {
  tabs: ViewItem[]
  activeTabId: string | null
  groupId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNewTerminal: () => void
  onOpenSession: (sessionId: string, title: string) => void
  onOpenPreview: (kind: "file" | "web", refId: string, title: string) => void
}) {
  const { sessions, selectedSession } = useOpendoraContext()
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const rootPath = selectedSession?.paths?.[0]?.path ?? selectedSession?.path ?? selectedSession?.cwd

  return (
    <div className="flex h-8 shrink-0 items-center gap-0.5 border-b bg-muted/30 px-1">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = TAB_ICON[tab.type]
          const active = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", JSON.stringify({ tabId: tab.id, fromGroupId: groupId }))
                e.dataTransfer.effectAllowed = "move"
              }}
              onClick={() => onSelect(tab.id)}
              className={cn(
                "group/tab flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs select-none",
                active ? "bg-background text-foreground" : "text-muted-foreground hover:bg-background/60",
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="max-w-32 truncate">{tab.title}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
                className="rounded-sm p-0.5 opacity-0 hover:bg-muted group-hover/tab:opacity-100"
                title="Close"
              >
                <XIcon className="size-3" />
              </button>
            </div>
          )
        })}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" title="Open new tab">
            <PlusIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onNewTerminal}>
            <TerminalIcon className="size-3.5" />
            New Terminal
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <MessageSquareIcon className="size-3.5" />
              Open Session
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
              {sessions.length === 0 ? (
                <DropdownMenuItem disabled>No sessions yet</DropdownMenuItem>
              ) : (
                sessions.map((s) => (
                  <DropdownMenuItem key={s.id} onSelect={() => onOpenSession(s.id, s.title || s.id)}>
                    <span className="truncate">{s.title || s.id}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setPreviewDialogOpen(true)}>
            <GlobeIcon className="size-3.5" />
            Open Preview…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <OpenPreviewDialog
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        rootPath={rootPath}
        onOpenPreview={onOpenPreview}
      />
    </div>
  )
}
