"use client"

import { useCallback, useEffect, useState } from "react"

export type Notification = {
  id: string
  type: "provider_timeout" | "provider_recovered" | "error" | "info"
  title: string
  message: string
  timestamp: number
  read: boolean
  providerID?: string
}

const STORAGE_KEY = "opendora:notifications"

function loadStored(): Notification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function store(notifications: Notification[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, 100)))
  } catch {}
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>(loadStored)

  useEffect(() => {
    store(notifications)
  }, [notifications])

  const addNotification = useCallback((n: Omit<Notification, "id" | "timestamp" | "read">) => {
    const notification: Notification = {
      ...n,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      read: false,
    }
    setNotifications((prev) => [notification, ...prev].slice(0, 100))
    return notification
  }, [])

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    )
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

  return {
    notifications,
    unreadCount,
    addNotification,
    markRead,
    markAllRead,
    removeNotification,
    clearAll,
  }
}
