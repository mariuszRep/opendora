"use client"

import { useCallback, useEffect, useState } from "react"

export type Notification = {
  id: string
  type: "provider_timeout" | "provider_recovered" | "error" | "info" | "warning" | "success"
  title: string
  message: string
  timestamp: number
  read: boolean
  expiresAt?: number
  action?: { label: string; onClick: () => void }
  providerID?: string
}

const STORAGE_KEY = "opendora:notifications"
const TTL_MS = 24 * 60 * 60 * 1000

function loadStored(): Notification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: Notification[] = raw ? JSON.parse(raw) : []
    const now = Date.now()
    return parsed.filter((n) => !n.expiresAt || n.expiresAt > now)
  } catch {
    return []
  }
}

function store(notifications: Notification[]): void {
  // actions can't be serialized — strip them before storing
  try {
    const serializable = notifications.map(({ action: _a, ...n }) => n)
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

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  return { notifications, unreadCount, addNotification, markRead, markAllRead, removeNotification, clearAll }
}
