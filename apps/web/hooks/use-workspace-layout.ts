"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { nanoid } from "nanoid"
import { opendora } from "@/lib/projectflows"

export type ViewItemType = "terminal" | "session" | "file" | "web"

export type ViewItem = {
  id: string
  type: ViewItemType
  refId: string
  title: string
}

export type Group = {
  id: string
  tabIds: string[]
  activeTabId: string | null
}

export type LayoutMode = "tabs" | "split"

const STORAGE_KEY = "workspace-layout-prefs"
const MIN_SPLIT = 2
const MAX_SPLIT = 6

type StoredPrefs = {
  layoutMode: LayoutMode
  splitCount: number
  panelOpen: boolean
  panelHeight: number
}

const DEFAULT_PREFS: StoredPrefs = { layoutMode: "tabs", splitCount: 2, panelOpen: false, panelHeight: 30 }

function loadPrefs(): StoredPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<StoredPrefs>
    return {
      layoutMode: parsed.layoutMode === "split" ? "split" : "tabs",
      splitCount: Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, parsed.splitCount ?? DEFAULT_PREFS.splitCount)),
      panelOpen: Boolean(parsed.panelOpen),
      panelHeight: Math.min(80, Math.max(10, parsed.panelHeight ?? DEFAULT_PREFS.panelHeight)),
    }
  } catch {
    return DEFAULT_PREFS
  }
}

function savePrefs(prefs: StoredPrefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // ignore — e.g. private browsing quota
  }
}

function emptyGroup(): Group {
  return { id: nanoid(), tabIds: [], activeTabId: null }
}

function makeInitialGroups(prefs: StoredPrefs): Group[] {
  const count = prefs.layoutMode === "split" ? prefs.splitCount : 1
  return Array.from({ length: count }, emptyGroup)
}

export type UseWorkspaceLayoutResult = {
  items: Record<string, ViewItem>
  groups: Group[]
  focusedGroupId: string
  panelOpen: boolean
  panelHeight: number
  layoutMode: LayoutMode
  splitCount: number
  openTerminalTab: (groupId?: string) => Promise<void>
  openSessionTab: (sessionId: string, title: string, groupId?: string) => void
  openPreviewTab: (kind: "file" | "web", refId: string, title: string, groupId?: string) => void
  closeTab: (groupId: string, tabId: string) => Promise<void>
  selectTab: (groupId: string, tabId: string) => void
  moveTab: (tabId: string, fromGroupId: string, toGroupId: string) => void
  setFocusedGroup: (groupId: string) => void
  togglePanel: () => void
  setPanelHeight: (percent: number) => void
  setLayoutMode: (mode: LayoutMode) => void
  increaseSplit: () => void
  decreaseSplit: () => void
}

export function useWorkspaceLayout(): UseWorkspaceLayoutResult {
  const [prefs, setPrefs] = useState<StoredPrefs>(() => loadPrefs())
  const [items, setItems] = useState<Record<string, ViewItem>>({})
  const [groups, setGroups] = useState<Group[]>(() => makeInitialGroups(loadPrefs()))
  const [focusedGroupId, setFocusedGroupId] = useState<string>(() => groups[0].id)
  const hydrated = useRef(false)

  useEffect(() => {
    savePrefs(prefs)
  }, [prefs])

  // Recover any still-running PTY sessions after a page reload — dumped into the first group.
  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    opendora.pty
      .list()
      .then((sessions) => {
        const running = sessions.filter((s) => s.status === "running")
        if (running.length === 0) return
        const newItems: ViewItem[] = running.map((s) => ({ id: s.id, type: "terminal", refId: s.id, title: s.title }))
        setItems((prev) => {
          const next = { ...prev }
          for (const item of newItems) next[item.id] = item
          return next
        })
        setGroups((prev) => {
          const next = [...prev]
          const target = next[0]
          const tabIds = [...target.tabIds, ...newItems.map((i) => i.id)]
          next[0] = { ...target, tabIds, activeTabId: target.activeTabId ?? tabIds[0] ?? null }
          return next
        })
      })
      .catch(() => {
        // backend not ready yet — ignore, user can still open a new terminal
      })
  }, [])

  const addTabToGroup = useCallback((item: ViewItem, groupId: string) => {
    setItems((prev) => ({ ...prev, [item.id]: item }))
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, tabIds: [...g.tabIds, item.id], activeTabId: item.id } : g)),
    )
    setFocusedGroupId(groupId)
    setPrefs((p) => (p.panelOpen ? p : { ...p, panelOpen: true }))
  }, [])

  const openTerminalTab = useCallback(
    async (groupId?: string) => {
      const info = await opendora.pty.create()
      addTabToGroup({ id: info.id, type: "terminal", refId: info.id, title: info.title }, groupId ?? focusedGroupId)
    },
    [addTabToGroup, focusedGroupId],
  )

  const openSessionTab = useCallback(
    (sessionId: string, title: string, groupId?: string) => {
      addTabToGroup({ id: nanoid(), type: "session", refId: sessionId, title }, groupId ?? focusedGroupId)
    },
    [addTabToGroup, focusedGroupId],
  )

  const openPreviewTab = useCallback(
    (kind: "file" | "web", refId: string, title: string, groupId?: string) => {
      addTabToGroup({ id: nanoid(), type: kind, refId, title }, groupId ?? focusedGroupId)
    },
    [addTabToGroup, focusedGroupId],
  )

  const closeTab = useCallback(
    async (groupId: string, tabId: string) => {
      const item = items[tabId]
      let stillOpenElsewhere = false
      setGroups((prev) =>
        prev.map((g) => {
          if (g.id !== groupId) {
            if (g.tabIds.includes(tabId)) stillOpenElsewhere = true
            return g
          }
          const tabIds = g.tabIds.filter((id) => id !== tabId)
          const activeTabId = g.activeTabId === tabId ? (tabIds[tabIds.length - 1] ?? null) : g.activeTabId
          return { ...g, tabIds, activeTabId }
        }),
      )
      if (!stillOpenElsewhere) {
        setItems((prev) => {
          const next = { ...prev }
          delete next[tabId]
          return next
        })
        if (item?.type === "terminal") {
          await opendora.pty.remove(item.refId).catch(() => {
            // already gone server-side
          })
        }
      }
    },
    [items],
  )

  const selectTab = useCallback((groupId: string, tabId: string) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, activeTabId: tabId } : g)))
    setFocusedGroupId(groupId)
  }, [])

  const moveTab = useCallback((tabId: string, fromGroupId: string, toGroupId: string) => {
    if (fromGroupId === toGroupId) return
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id === fromGroupId) {
          const tabIds = g.tabIds.filter((id) => id !== tabId)
          const activeTabId = g.activeTabId === tabId ? (tabIds[tabIds.length - 1] ?? null) : g.activeTabId
          return { ...g, tabIds, activeTabId }
        }
        if (g.id === toGroupId) {
          if (g.tabIds.includes(tabId)) return g
          return { ...g, tabIds: [...g.tabIds, tabId], activeTabId: tabId }
        }
        return g
      }),
    )
    setFocusedGroupId(toGroupId)
  }, [])

  const setFocusedGroup = useCallback((groupId: string) => setFocusedGroupId(groupId), [])

  const togglePanel = useCallback(() => setPrefs((p) => ({ ...p, panelOpen: !p.panelOpen })), [])

  const setPanelHeight = useCallback((percent: number) => setPrefs((p) => ({ ...p, panelHeight: percent })), [])

  const setLayoutMode = useCallback(
    (mode: LayoutMode) => {
      setPrefs((p) => (p.layoutMode === mode ? p : { ...p, layoutMode: mode }))
      setGroups((prev) => {
        if (mode === "split") {
          const extra = Array.from({ length: Math.max(0, prefs.splitCount - prev.length) }, emptyGroup)
          return [...prev, ...extra]
        }
        // Collapse to tabs: merge every group's tabs into one strip, in pane order.
        const merged: Group = {
          id: prev[0]?.id ?? nanoid(),
          tabIds: prev.flatMap((g) => g.tabIds),
          activeTabId: prev.find((g) => g.id === focusedGroupId)?.activeTabId ?? prev[0]?.activeTabId ?? null,
        }
        setFocusedGroupId(merged.id)
        return [merged]
      })
    },
    [prefs.splitCount, focusedGroupId],
  )

  const increaseSplit = useCallback(() => {
    setPrefs((p) => (p.layoutMode !== "split" ? p : { ...p, splitCount: Math.min(MAX_SPLIT, p.splitCount + 1) }))
    setGroups((prev) => (prev.length >= MAX_SPLIT ? prev : [...prev, emptyGroup()]))
  }, [])

  const decreaseSplit = useCallback(() => {
    setPrefs((p) => (p.layoutMode !== "split" ? p : { ...p, splitCount: Math.max(MIN_SPLIT, p.splitCount - 1) }))
    setGroups((prev) => {
      if (prev.length <= MIN_SPLIT) return prev
      const removed = prev[prev.length - 1]
      const next = prev.slice(0, -1)
      const last = next[next.length - 1]
      next[next.length - 1] = {
        ...last,
        tabIds: [...last.tabIds, ...removed.tabIds],
        activeTabId: last.activeTabId ?? removed.activeTabId,
      }
      if (focusedGroupId === removed.id) setFocusedGroupId(last.id)
      return next
    })
  }, [focusedGroupId])

  return {
    items,
    groups,
    focusedGroupId,
    panelOpen: prefs.panelOpen,
    panelHeight: prefs.panelHeight,
    layoutMode: prefs.layoutMode,
    splitCount: prefs.splitCount,
    openTerminalTab,
    openSessionTab,
    openPreviewTab,
    closeTab,
    selectTab,
    moveTab,
    setFocusedGroup,
    togglePanel,
    setPanelHeight,
    setLayoutMode,
    increaseSplit,
    decreaseSplit,
  }
}
