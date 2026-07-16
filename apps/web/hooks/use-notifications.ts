"use client"

import { useCallback, useEffect, useState } from "react"

export type Notification = {
  id: string
  type:
    | "provider_timeout"
    | "provider_recovered"
    | "error"
    | "info"
    | "warning"
    | "success"
    | "permission_request"
    | "question_request"
  title: string
  message: string
  timestamp: number
  read: boolean
  expiresAt?: number
  action?: { label: string; onClick: () => void }
  providerID?: string
  permissionRequestID?: string
  questionRequestID?: string
  sessionID?: string
  memoryDelete?: { directory: string; name: string; scope: string; agentID?: string; callID?: string }
}

const STORAGE_KEY = "opendora:notifications"
const TTL_MS = 24 * 60 * 60 * 1000

function loadStored(): Notification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: Notification[] = raw ? JSON.parse(raw) : []
    const now = Date.now()
    // Permission/question requests are ephemeral — never restore them across reloads;
    // the server will re-emit `permission.asked`/`question.asked` if the request is still alive.
    return parsed.filter(
      (n) => n.type !== "permission_request" && n.type !== "question_request" && (!n.expiresAt || n.expiresAt > now),
    )
  } catch {
    return []
  }
}

function store(notifications: Notification[]): void {
  // actions can't be serialized — strip them before storing.
  // permission_request/question_request entries are ephemeral and are excluded from storage.
  try {
    const serializable = notifications
      .filter((n) => n.type !== "permission_request" && n.type !== "question_request")
      .map(({ action: _a, ...n }) => n)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable.slice(0, 100)))
  } catch {}
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>(loadStored)

  useEffect(() => {
    store(notifications)
  }, [notifications])

  const addNotification = useCallback(
    (n: Omit<Notification, "id" | "timestamp" | "read" | "expiresAt">) => {
      const notification: Notification = {
        ...n,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        read: false,
        expiresAt: n.action ? undefined : Date.now() + TTL_MS,
      }
      setNotifications((prev) => [notification, ...prev].slice(0, 100))
      return notification
    },
    [],
  )

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }, [])

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  const removeByPermissionID = useCallback((permissionRequestID: string) => {
    setNotifications((prev) => prev.filter((n) => n.permissionRequestID !== permissionRequestID))
  }, [])

  const removeByQuestionID = useCallback((questionRequestID: string) => {
    setNotifications((prev) => prev.filter((n) => n.questionRequestID !== questionRequestID))
  }, [])

  const removeByMemoryCallID = useCallback((callID: string) => {
    setNotifications((prev) => prev.filter((n) => n.memoryDelete?.callID !== callID))
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  return {
    notifications,
    unreadCount,
    addNotification,
    markRead,
    markAllRead,
    removeNotification,
    removeByPermissionID,
    removeByQuestionID,
    removeByMemoryCallID,
    clearAll,
  }
}
