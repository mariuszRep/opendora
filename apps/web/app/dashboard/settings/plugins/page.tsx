"use client"

import { useEffect, useState, useMemo } from "react"
import {
  PackageIcon,
  Loader2Icon,
} from "lucide-react"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { EntityCatalogSection } from "@/components/settings/entity-catalog-section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { opendora, type PluginListItem, type RemotePlugin } from "@/lib/projectflows"
import type { CatalogFilter, MergedEntityItem } from "@/components/settings/entity-catalog-section"

type Category = "all" | "agents" | "tools" | "mcp"

type MergedPlugin = RemotePlugin & { localInfo?: PluginListItem }

export default function PluginsPage() {
  const [remotePlugins, setRemotePlugins] = useState<RemotePlugin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<CatalogFilter>("all")
  const [category, setCategory] = useState<Category>("all")
  const [search, setSearch] = useState("")
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  const [installPath, setInstallPath] = useState("")
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [showLocalInstall, setShowLocalInstall] = useState(false)

  async function fetchPlugins() {
    setLoading(true)
    setError(null)
    try {
      setRemotePlugins(await opendora.plugin.listAvailable())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load plugins")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPlugins() }, [])

  async function handleInstallRemote(id: string) {
    setActionInProgress(id)
    try {
      await opendora.plugin.installRemote(id)
      await fetchPlugins()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Installation failed")
    } finally {
      setActionInProgress(null)
    }
  }

  async function handleRemove(id: string) {
    if (!confirm(`Remove plugin "${id}"?`)) return
    setActionInProgress(id)
    try {
      await opendora.plugin.remove(id)
      await fetchPlugins()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove plugin")
    } finally {
      setActionInProgress(null)
    }
  }

  async function handleToggle(plugin: MergedPlugin) {
    if (!plugin.localInfo) return
    setActionInProgress(plugin.id)
    try {
      if (plugin.localInfo.enabled) {
        await opendora.plugin.disable(plugin.id)
      } else {
        await opendora.plugin.enable(plugin.id)
      }
      await fetchPlugins()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update plugin")
    } finally {
      setActionInProgress(null)
    }
  }

  async function handleLocalInstall() {
    if (!installPath.trim()) return
    setInstalling(true)
    setInstallError(null)
    try {
      await opendora.plugin.install(installPath.trim())
      setInstallPath("")
      await fetchPlugins()
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : "Installation failed")
    } finally {
      setInstalling(false)
    }
  }

  const categoryFiltered = useMemo(
    () => remotePlugins.filter((p) => category === "all" || p.category === category),
    [remotePlugins, category],
  )

  const items = useMemo<MergedEntityItem[]>(
    () =>
      categoryFiltered.map((p) => ({
        key: p.id,
        id: p.id,
        type: "plugin" as const,
        name: p.name,
        description: p.description,
        version: p.version,
        state: p.installed ? ("installed" as const) : ("available" as const),
        onInstall: !p.installed ? () => handleInstallRemote(p.id) : undefined,
        installing: actionInProgress === p.id && !p.installed,
        onUninstall: p.installed ? () => handleRemove(p.id) : undefined,
        uninstalling: actionInProgress === p.id && !!p.installed,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryFiltered, actionInProgress],
  )

  const installedPlugins = useMemo<MergedPlugin[]>(
    () => remotePlugins.filter((p) => p.installed).map((p) => ({ ...p })),
    [remotePlugins],
  )

  const categoryButtons: { label: string; value: Category }[] = [
    { label: "All", value: "all" },
    { label: "Agents", value: "agents" },
    { label: "Tools", value: "tools" },
    { label: "MCP", value: "mcp" },
  ]

  return (
    <SettingsPageLayout title="Plugins">
      <div className="space-y-6">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Category filter */}
        <Tabs value={category} onValueChange={(v) => setCategory(v as Category)}>
          <TabsList>
            {categoryButtons.map((btn) => (
              <TabsTrigger key={btn.value} value={btn.value}>{btn.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Discovery grid */}
        <EntityCatalogSection
          icon={PackageIcon}
          title="Plugins"
          items={items}
          loading={loading}
          filter={filter}
          onFilterChange={setFilter}
          search={search}
          onSearchChange={setSearch}
          sortFn={(a, b) => a.name.localeCompare(b.name)}
        />

        {/* Installed plugins — enable/disable management */}
        {installedPlugins.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Manage installed
            </h3>
            <div className="divide-y rounded-lg border">
              {installedPlugins.map((plugin) => {
                const busy = actionInProgress === plugin.id
                return (
                  <div key={plugin.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{plugin.name}</p>
                      {plugin.version && (
                        <p className="text-xs text-muted-foreground">v{plugin.version}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {busy && <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />}
                      <span className="text-xs text-muted-foreground">
                        {plugin.localInfo?.enabled ? "Enabled" : "Disabled"}
                      </span>
                      <Switch
                        checked={plugin.localInfo?.enabled ?? true}
                        onCheckedChange={() => handleToggle(plugin)}
                        disabled={busy}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Local install (advanced) */}
        <div className="border-t pt-4">
          <button
            onClick={() => setShowLocalInstall((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {showLocalInstall ? "▼" : "▶"} Install from local path (advanced)
          </button>
          {showLocalInstall && (
            <div className="mt-3 flex gap-2">
              <Input
                placeholder="/path/to/plugin"
                value={installPath}
                onChange={(e) => setInstallPath(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLocalInstall()}
                className="flex-1 text-sm"
              />
              <Button size="sm" onClick={handleLocalInstall} disabled={installing || !installPath.trim()}>
                {installing ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : "Install"}
              </Button>
            </div>
          )}
          {installError && <p className="mt-2 text-xs text-destructive">{installError}</p>}
        </div>
      </div>
    </SettingsPageLayout>
  )
}
