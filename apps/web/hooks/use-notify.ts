"use client"

import { useCallback } from "react"
import { toast } from "sonner"
import { useNotifications, type Notification } from "@/hooks/use-notifications"
import { useRouter } from "next/navigation"
import { playNotificationSound } from "@/lib/notification-sound"

export type NotifyOptions = {
  type: Notification["type"]
  title: string
  message: string
  action?: { label: string; href?: string; onClick?: () => void }
  providerID?: string
  permissionRequestID?: string
  questionRequestID?: string
  sessionID?: string
  duration?: number
  silent?: boolean
  memoryDelete?: { directory: string; name: string; scope: string; agentID?: string; callID?: string }
}

export function useNotify() {
  const {
    notifications,
    unreadCount,
    addNotification,
    markRead,
    markAllRead,
    removeNotification,
    removeByPermissionID,
    removeByQuestionID,
    clearAll,
  } = useNotifications()
  const router = useRouter()

  const notify = useCallback(
    (opts: NotifyOptions) => {
      const { type, title, message, action, providerID, permissionRequestID, questionRequestID, sessionID, duration, silent, memoryDelete } = opts

      const notifAction = action
        ? {
            label: action.label,
            onClick: action.onClick ?? (action.href ? () => router.push(action.href!) : () => {}),
          }
        : undefined

      addNotification({ type, title, message, action: notifAction, providerID, permissionRequestID, questionRequestID, sessionID, memoryDelete })

      if (!silent) {
        playNotificationSound({ variant: type === "permission_request" || type === "question_request" || type === "error" ? "alert" : "default" })
      }

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
        case "permission_request":
          toast(toastMessage, {
            description: toastDescription,
            action: toastAction,
            // Permission requests are sticky — they should remain visible until
            // the user responds (or the server signals `permission.replied`).
            duration: duration ?? Infinity,
            id: permissionRequestID ? `perm-${permissionRequestID}` : undefined,
          })
          break
        case "question_request":
          toast(toastMessage, {
            description: toastDescription,
            action: toastAction,
            // Question requests are sticky — they should remain visible until
            // the user responds (or the server signals `question.replied`/`question.rejected`).
            duration: duration ?? Infinity,
            id: questionRequestID ? `question-${questionRequestID}` : undefined,
          })
          break
        default:
          toast(toastMessage, { description: toastDescription, action: toastAction, duration: toastDuration })
      }
    },
    [addNotification, router],
  )

  const dismissPermissionToast = useCallback((permissionRequestID: string) => {
    toast.dismiss(`perm-${permissionRequestID}`)
  }, [])

  const dismissQuestionToast = useCallback((questionRequestID: string) => {
    toast.dismiss(`question-${questionRequestID}`)
  }, [])

  return {
    notify,
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    removeNotification,
    removeByPermissionID,
    removeByQuestionID,
    dismissPermissionToast,
    dismissQuestionToast,
    clearAll,
  }
}
