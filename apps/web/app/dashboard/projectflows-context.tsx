"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useOpendora, type UseOpendoraResult } from "@/hooks/use-projectflows"
import { useNotify, type NotifyOptions } from "@/hooks/use-notify"
import type { Notification } from "@/hooks/use-notifications"

export type { NotifyOptions }

export type OpendoraContextValue = UseOpendoraResult & {
  notify: (opts: NotifyOptions) => void
  notifications: Notification[]
  unreadCount: number
  markRead: (id: string) => void
  markAllRead: () => void
  removeNotification: (id: string) => void
  removeByPermissionID: (permissionRequestID: string) => void
  removeByQuestionID: (questionRequestID: string) => void
  clearAll: () => void
}

const OpendoraContext = createContext<OpendoraContextValue | null>(null)

export function OpendoraProvider({ children }: { children: ReactNode }) {
  const {
    notify,
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    removeNotification,
    removeByPermissionID,
    dismissPermissionToast,
    removeByQuestionID,
    dismissQuestionToast,
    clearAll,
  } = useNotify()
  const opendoraValue = useOpendora({
    notify,
    removeByPermissionID,
    dismissPermissionToast,
    removeByQuestionID,
    dismissQuestionToast,
  })
  const value: OpendoraContextValue = {
    ...opendoraValue,
    notify,
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    removeNotification,
    removeByPermissionID,
    removeByQuestionID,
    clearAll,
  }
  return <OpendoraContext.Provider value={value}>{children}</OpendoraContext.Provider>
}

export function useOpendoraContext(): OpendoraContextValue {
  const ctx = useContext(OpendoraContext)
  if (!ctx) throw new Error("useOpendoraContext must be used inside OpendoraProvider")
  return ctx
}
