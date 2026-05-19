"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { BellIcon, XIcon, CheckIcon, CheckCheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Notification } from "@/hooks/use-notifications"

function formatAge(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  return `${diffDay}d ago`
}

const borderColor: Record<Notification["type"], string> = {
  error: "border-l-destructive",
  warning: "border-l-amber-500",
  provider_timeout: "border-l-amber-500",
  success: "border-l-green-500",
  provider_recovered: "border-l-green-500",
  info: "border-l-blue-500",
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  notifications: Notification[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onRemove: (id: string) => void
  onClearAll: () => void
}

export function NotificationBlade({ open, onOpenChange, notifications, onMarkRead, onMarkAllRead, onRemove, onClearAll }: Props) {
  const unread = notifications.filter((n) => !n.read)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-96 flex-col gap-0 p-0">
        <SheetHeader className="flex-row items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <BellIcon className="size-4" />
            <SheetTitle className="text-sm font-medium">Notifications</SheetTitle>
            {unread.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {unread.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unread.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onMarkAllRead}>
                <CheckCheckIcon className="size-3" />
                All read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={onClearAll}>
                Clear
              </Button>
            )}
          </div>
        </SheetHeader>

        {notifications.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <BellIcon className="size-8 opacity-30" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex flex-col gap-1.5 border-l-2 px-4 py-3 transition-colors",
                    borderColor[n.type] ?? "border-l-border",
                    !n.read && "bg-muted/30",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="text-sm font-medium leading-none text-foreground">{n.title}</p>
                      <p className="text-xs text-muted-foreground">{n.message}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground/60">{formatAge(new Date(n.timestamp))}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!n.read && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onMarkRead(n.id)} title="Mark read">
                          <CheckIcon className="size-3" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground" onClick={() => onRemove(n.id)} title="Dismiss">
                        <XIcon className="size-3" />
                      </Button>
                    </div>
                  </div>
                  {n.action && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-fit text-xs"
                      onClick={() => {
                        n.action!.onClick()
                        onRemove(n.id)
                      }}
                    >
                      {n.action.label}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  )
}
