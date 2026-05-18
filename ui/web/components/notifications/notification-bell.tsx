"use client"

import { BellIcon, XIcon, CheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { type Notification } from "@/hooks/use-notifications"

// Simple timestamp formatter without external dependency
function formatDistanceToNow(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return "just now"
  if (diffMin < 60) return `${diffMin} minute${diffMin > 1 ? "s" : ""} ago`
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? "s" : ""} ago`
  return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`
}

type NotificationBellProps = {
  unreadCount: number
  children: React.ReactNode
}

export function NotificationBell({ unreadCount, children }: NotificationBellProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <BellIcon className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type NotificationPanelProps = {
  notifications: Notification[]
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onRemove: (id: string) => void
  onClearAll: () => void
}

export function NotificationPanel({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onRemove,
  onClearAll,
}: NotificationPanelProps) {
  if (notifications.length === 0) {
    return (
      <>
        <DropdownMenuLabel>No notifications</DropdownMenuLabel>
      </>
    )
  }

  const unread = notifications.filter((n) => !n.read)

  return (
    <>
      <DropdownMenuLabel className="flex items-center justify-between">
        <span>Notifications</span>
        {unread.length > 0 && (
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onMarkAllRead}>
            Mark all read
          </Button>
        )}
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <div className="max-h-96 overflow-y-auto">
        {notifications.map((n) => (
          <DropdownMenuItem
            key={n.id}
            className="flex flex-col items-start gap-1 p-3"
            onSelect={() => onMarkRead(n.id)}
          >
            <div className="flex w-full items-start justify-between gap-2">
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium leading-none">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.message}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(n.timestamp, { addSuffix: true })}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!n.read && <div className="h-2 w-2 rounded-full bg-blue-500" />}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemove(n.id)
                  }}
                >
                  <XIcon className="size-3" />
                </Button>
              </div>
            </div>
          </DropdownMenuItem>
        ))}
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onClearAll}>
        <XIcon className="mr-2 size-4" />
        Clear all notifications
      </DropdownMenuItem>
    </>
  )
}
