"use client"

import { useEffect, useState, useMemo } from "react"
import {
  PackageIcon,
  Trash2Icon,
  DownloadIcon,
  SearchIcon,
  Loader2Icon,
  CheckCircle2Icon,
} from "lucide-react"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { opendora, type PluginListItem, type RemotePlugin } from "@/lib/projectflows"

type Filter = "all" | "installed" | "available"
type Category = "all" | "agents" | "tools" | "mcp"

type MergedPlugin = RemotePlugin & {
  localInfo?: PluginListItem
}

export default function PluginsPage() {
  const [remotePlugins, setRemotePlugins] = useState<RemotePlugin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [category, setCategory] = useState<Category>("all")
  const [search, setSearch] = useState("")
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  // Install from local path (advanced)
  const [installPath, setInstallPath] = useState("")
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [showLocalInstall, setShowLocalInstall] = useState(false)

  async function fetchPlugins() {
    setLoading(true)
    setError(null)
    try {
      const available = await opendora.plugin.listAvailable()
      setRemotePlugins(available)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load plugins")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlugins()
  }, [])

  const filtered = useMemo<MergedPlugin[]>(() => {
    let list: MergedPlugin[] = remotePlugins.map((p) => ({ ...p }))

    if (filter === "installed") list = list.filter((p) => p.installed)
    if (filter === "available") list = list.filter((p) => !p.installed)
    if (category !== "all") list = list.filter((p) => p.category === category)

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }

    return list
  }, [remotePlugins, filter, category, search])

  async function handleInstallRemote(pluginId: string) {
    setActionInProgress(pluginId)
    try {
      await opendora.plugin.installRemote(pluginId)
      await fetchPlugins()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Installation failed")
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

  async function handleRemove(pluginId: string) {
    if (!confirm(`Remove plugin "${pluginId}"?`)) return
    setActionInProgress(pluginId)
    try {
      await opendora.plugin.remove(pluginId)
      await fetchPlugins()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove plugin")
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

  const filterButtons: { label: string; value: Filter }[] = [
    { label: "All", value: "all" },
    { label: "Installed", value: "installed" },
    { label: "Available", value: "available" },
  ]

  const categoryButtons: { label: string; value: Category }[] = [
    { label: "All", value: "all" },
    { label: "Agents", value: "agents" },
    { label: "Tools", value: "tools" },
    { label: "MCP", value: "mcp" },
  ]

  return (
    <SettingsPageLayout title="Plugins">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            <PackageIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Plugins</h2>
            <p className="text-sm text-muted-foreground">
              {loading ? "Loading…" : `${remotePlugins.length} plugin${remotePlugins.length === 1 ? "" : "s"} available`}
            </p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
            {filterButtons.map((btn) => (
              <button
                key={btn.value}
                onClick={() => setFilter(btn.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  filter === btn.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {btn.label}
                {btn.value === "installed" && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    ({remotePlugins.filter((p) => p.installed).length})
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
              {categoryButtons.map((btn) => (
                <button
                  key={btn.value}
                  onClick={() => setCategory(btn.value)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    category === btn.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search plugins..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {/* Plugin grid */}
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2Icon className="h-4 w-4 animate-spin" />
            Loading plugins...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No plugins match your filters.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((plugin) => {
              const isInstalled = plugin.installed
              const busy = actionInProgress === plugin.id

              return (
                <Card key={plugin.id} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <PackageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <CardTitle className="text-sm">{plugin.name}</CardTitle>
                      </div>
                      {isInstalled && (
                        <CheckCircle2Icon className="h-4 w-4 shrink-0 text-green-500" />
                      )}
                    </div>
                    <CardDescription className="text-xs leading-relaxed">
                      {plugin.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="flex-1 pb-3">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-xs">
                        v{plugin.version}
                      </Badge>
                      <Badge variant="secondary" className="text-xs capitalize">
                        {plugin.category}
                      </Badge>
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        {plugin.capabilities.length} capability{plugin.capabilities.length !== 1 ? "ies" : "y"}
                      </Badge>
                    </div>
                  </CardContent>

                  <CardFooter className="border-t pt-3">
                    {isInstalled ? (
                      <div className="flex w-full items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={plugin.localInfo?.enabled ?? true}
                            onCheckedChange={() => handleToggle(plugin)}
                            disabled={busy}
                          />
                          <span className="text-xs text-muted-foreground">
                            {plugin.localInfo?.enabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove(plugin.id)}
                          disabled={busy}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          {busy ? (
                            <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2Icon className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => handleInstallRemote(plugin.id)}
                        disabled={busy}
                      >
                        {busy ? (
                          <>
                            <Loader2Icon className="mr-2 h-3.5 w-3.5 animate-spin" />
                            Installing...
                          </>
                        ) : (
                          <>
                            <DownloadIcon className="mr-2 h-3.5 w-3.5" />
                            Install
                          </>
                        )}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              )
            })}
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
