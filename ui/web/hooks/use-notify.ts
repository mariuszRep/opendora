"use client"

import { useCallback } from "react"
import { toast } from "sonner"
import { useNotifications, type Notification } from "@/hooks/use-notifications"
import { useRouter } from "next/navigation"

export type NotifyOptions = {
  type: Notification["type"]
  title: string
  message: string
  action?: { label: string; href?: string; onClick?: () => void }
  providerID?: string
  duration?: number
}

export function useNotify() {
  const { notifications, unreadCount, addNotification, markRead, markAllRead, removeNotification, clearAll } =
    useNotifications()
  const router = useRouter()

  const notify = useCallback(
    (opts: NotifyOptions) => {
      const { type, title, message, action, providerID, duration } = opts

      const notifAction = action
        ? {
            label: action.label,
            onClick: action.onClick ?? (action.href ? () => router.push(action.href!) : () => {}),
          }
        : undefined

      addNotification({ type, title, message, action: notifAction, providerID })

      const toastMessage = title
      const toastDescription = message !== title ? message : undefined
      const toastAction = action
        ? { label: action.label, onClick: action.onClick ?? (action.href ? () => router.push(action.href!) : () => {}) }
        : undefined
      const toastDuration = duration ?? (type === "error" ? 8000 : type === "warning" ? 8000 : 4000)

      switch (type) {
        case "error":
          toast.error(toastMessage, { description: toastDescription, action: toastAction, duration: toastDuration })
          break
        case "warning":
        case "provider_timeout":
          toast.warning(toastMessage, { description: toastDescription, action: toastAction, duration: toastDuration })
          break
        case "success":
        case "provider_recovered":
          toast.success(toastMessage, { description: toastDescription, action: toastAction, duration: toastDuration })
          break
        default:
          toast(toastMessage, { description: toastDescription, action: toastAction, duration: toastDuration })
      }
    },
    [addNotification, router],
  )

  return { notify, notifications, unreadCount, markRead, markAllRead, removeNotification, clearAll }
}
