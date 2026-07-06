"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { opendora, type RemoteEntity } from "@/lib/projectflows"
import type { EntityType, EntityState, MergedEntityItem } from "@/components/settings/entity-catalog-section"

type BaseFields = Pick<MergedEntityItem, "name" | "description" | "type" | "indicator" | "onManage"> & {
  onDelete?: () => Promise<void>
  onUninstall?: () => Promise<void>
}

/** Pure merge: local items + remote registry items → MergedEntityItem[]. */
export function mergeWithRemote<L>(
  localItems: L[],
  remoteItems: RemoteEntity[],
  toBase: (item: L) => { id: string } & BaseFields,
  entityType: EntityType,
  onInstall: (id: string) => Promise<void>,
  installing: string | null = null,
  onUninstall?: (id: string) => Promise<void>,
  uninstalling: string | null = null,
  onDelete?: (id: string) => Promise<void>,
  deleting: string | null = null,
): MergedEntityItem[] {
  const remoteById = new Map(remoteItems.map((r) => [r.id, r]))
  const localIds = new Set<string>()

  const localMerged: MergedEntityItem[] = localItems.map((item) => {
    const { id, onDelete: itemOnDelete, onUninstall: itemOnUninstall, ...base } = toBase(item)
    localIds.add(id)
    const remote = remoteById.get(id)
    const isInstalled = !!remote
    const resolvedOnUninstall = itemOnUninstall ?? (onUninstall ? () => onUninstall(id) : undefined)
    const resolvedOnDelete = itemOnDelete ?? (onDelete ? () => onDelete(id) : undefined)
    return {
      ...base,
      key: `local-${id}`,
      id,
      state: isInstalled ? ("installed" as EntityState) : ("local-only" as EntityState),
      version: remote?.version,
      pluginId: remote?.pluginId,
      ...(isInstalled ? { onUninstall: resolvedOnUninstall, uninstalling: !itemOnUninstall && uninstalling === id } : {}),
      ...(!isInstalled ? { onDelete: resolvedOnDelete, deleting: !itemOnDelete && deleting === id } : {}),
    }
  })

  const availableMerged: MergedEntityItem[] = remoteItems
    .filter((r) => !r.installed && !localIds.has(r.id))
    .map((r) => ({
      key: `remote-${r.id}`,
      id: r.id,
      type: entityType,
      name: r.name,
      description: r.description,
      state: "available" as EntityState,
      version: r.version,
      pluginId: r.pluginId,
      onInstall: () => onInstall(r.id),
      installing: installing === r.id,
    }))

  return [...localMerged, ...availableMerged]
}

/** Hook for entity types with a simple async fetcher (skills, workflows, tool-groups). */
export function useEntityCatalog<L>(
  entityType: "skill" | "workflow" | "agent" | "tool" | "tool-group",
  localFetcher: () => Promise<L[]>,
  toBase: (item: L) => { id: string } & BaseFields,
  afterChange?: () => void,
): {
  items: MergedEntityItem[]
  loading: boolean
  error: string | null
  reload: () => void
} {
  const fetcherRef = useRef(localFetcher)
  fetcherRef.current = localFetcher
  const toBaseRef = useRef(toBase)
  toBaseRef.current = toBase

  const [localItems, setLocalItems] = useState<L[]>([])
  const [remoteItems, setRemoteItems] = useState<RemoteEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [installing, setInstalling] = useState<string | null>(null)
  const [uninstalling, setUninstalling] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      fetcherRef.current(),
      opendora.entity.listAvailable({ type: entityType }).catch(() => [] as RemoteEntity[]),
    ])
      .then(([local, remote]) => {
        setLocalItems(local)
        setRemoteItems(remote)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false))
  }, [entityType])

  useEffect(() => {
    load()
  }, [load])

  async function handleInstall(id: string) {
    setInstalling(id)
    try {
      await opendora.entity.installRemote(entityType, id)
      afterChange?.()
      load()
    } finally {
      setInstalling(null)
    }
  }

  async function handleUninstall(id: string) {
    setUninstalling(id)
    try {
      await opendora.entity.removeLocal(entityType, id)
      afterChange?.()
      load()
    } finally {
      setUninstalling(null)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await opendora.entity.removeLocal(entityType, id)
      afterChange?.()
      load()
    } finally {
      setDeleting(null)
    }
  }

  const items = useMemo(
    () => mergeWithRemote(
      localItems, remoteItems, toBaseRef.current, entityType as EntityType,
      handleInstall, installing,
      handleUninstall, uninstalling,
      handleDelete, deleting,
    ),
    [localItems, remoteItems, installing, uninstalling, deleting, entityType],
  )

  return { items, loading, error, reload: load }
}
