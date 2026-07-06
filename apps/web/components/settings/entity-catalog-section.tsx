"use client"

import * as React from "react"
import { DownloadIcon, Loader2Icon, SearchIcon, Trash2Icon } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SettingsCard } from "@/components/settings/settings-card"

// ── Shared types ──────────────────────────────────────────────────────────

export type EntityType = "agent" | "skill" | "tool" | "workflow" | "plugin" | "tool-group"
export type EntityState = "installed" | "available" | "local-only"

export interface MergedEntityItem {
  key: string
  type: EntityType
  id: string
  name: string
  description?: string
  state: EntityState
  version?: string
  pluginId?: string
  /** Leading indicator, e.g. an agent color dot */
  indicator?: React.ReactNode
  /** Navigate/open for installed + local-only items (card click) */
  onManage?: () => void
  /** Install from registry for available items */
  onInstall?: () => Promise<void>
  installing?: boolean
  /** Remove from local for installed (registry) items */
  onUninstall?: () => Promise<void>
  uninstalling?: boolean
  /** Delete local-only items */
  onDelete?: () => Promise<void>
  deleting?: boolean
}

// ── EntityCatalogCard ─────────────────────────────────────────────────────

function EntityCatalogCard({ item }: { item: MergedEntityItem }) {
  const title = item.indicator ? (
    <div className="flex items-center gap-2">
      {item.indicator}
      <span>{item.name}</span>
    </div>
  ) : (
    item.name
  )

  const footer = (
    <div className="flex w-full items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        {item.version && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
            v{item.version}
          </Badge>
        )}
      </div>
      {item.state === "available" && (
        <Button
          size="sm"
          className="h-6 gap-1 text-xs shrink-0 px-2"
          onClick={(e) => { e.stopPropagation(); item.onInstall?.() }}
          disabled={item.installing || !item.onInstall}
        >
          {item.installing ? <Loader2Icon className="size-3 animate-spin" /> : <DownloadIcon className="size-3" />}
          {item.installing ? "Installing…" : "Install"}
        </Button>
      )}
      {item.state === "installed" && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 gap-1 text-xs shrink-0 px-2"
          onClick={(e) => { e.stopPropagation(); item.onUninstall?.() }}
          disabled={item.uninstalling || !item.onUninstall}
        >
          {item.uninstalling && <Loader2Icon className="size-3 animate-spin" />}
          {item.uninstalling ? "Removing…" : "Uninstall"}
        </Button>
      )}
      {item.state === "local-only" && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 gap-1 text-xs shrink-0 px-2 text-destructive hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); item.onDelete?.() }}
          disabled={item.deleting || !item.onDelete}
        >
          {item.deleting ? <Loader2Icon className="size-3 animate-spin" /> : <Trash2Icon className="size-3" />}
          {item.deleting ? "Deleting…" : "Delete"}
        </Button>
      )}
    </div>
  )

  return (
    <SettingsCard
      title={title}
      description={item.description}
      footer={footer}
      onClick={item.state !== "available" ? item.onManage : undefined}
    />
  )
}

// ── EntityCatalogSection ──────────────────────────────────────────────────

export type CatalogFilter = "all" | "installed" | "available"

export interface EntityCatalogSectionProps {
  icon: LucideIcon
  title: string
  items: MergedEntityItem[]
  loading: boolean
  filter: CatalogFilter
  onFilterChange: (f: CatalogFilter) => void
  search: string
  onSearchChange: (s: string) => void
  sortFn?: (a: MergedEntityItem, b: MergedEntityItem) => number
  headerAction?: React.ReactNode
  searchPlaceholder?: string
  emptyMessage?: string
}

export function EntityCatalogSection({
  icon: Icon,
  title,
  items,
  loading,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  sortFn,
  headerAction,
  searchPlaceholder,
  emptyMessage,
}: EntityCatalogSectionProps) {
  const installed = items.filter((i) => i.state === "installed" || i.state === "local-only")
  const available = items.filter((i) => i.state === "available")

  const filterButtons: { label: string; value: CatalogFilter; count?: number }[] = [
    { label: "All", value: "all" },
    { label: "Installed", value: "installed", count: installed.length },
    { label: "Available", value: "available", count: available.length },
  ]

  const afterFilter =
    filter === "all" ? items :
    filter === "installed" ? installed :
    available

  const afterSearch = search
    ? afterFilter.filter((i) =>
        i.name.toLowerCase().includes(search.toLowerCase()) ||
        (i.description?.toLowerCase().includes(search.toLowerCase()) ?? false)
      )
    : afterFilter

  const sorted = sortFn ? [...afterSearch].sort(sortFn) : afterSearch

  const countLabel = loading
    ? "Loading…"
    : `${installed.length} installed`

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{countLabel}</p>
          </div>
        </div>
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </div>

      {/* Search + filter row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder ?? `Search ${title.toLowerCase()}…`}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filter tabs */}
        <Tabs value={filter} onValueChange={(v) => onFilterChange(v as CatalogFilter)}>
          <TabsList>
            {filterButtons.map((btn) => (
              <TabsTrigger key={btn.value} value={btn.value}>
                {btn.label}
                {btn.count !== undefined && (
                  <span className="ml-1 text-xs opacity-60">({btn.count})</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Grid / states */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {emptyMessage ??
            (search
              ? `No ${title.toLowerCase()} match your search.`
              : filter !== "all"
              ? `No ${filter} ${title.toLowerCase()}.`
              : `No ${title.toLowerCase()} found.`)}
        </p>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {sorted.map((item) => (
            <EntityCatalogCard key={item.key} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
