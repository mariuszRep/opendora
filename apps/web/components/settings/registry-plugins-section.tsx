"use client"

import { useEffect, useState } from "react"
import { PackageIcon, DownloadIcon, Loader2Icon, CheckCircle2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { opendora, type RemotePlugin } from "@/lib/projectflows"

interface Props {
  category: "agents" | "tools" | "mcp"
  onInstalled?: () => void
}

export function RegistryPluginsSection({ category, onInstalled }: Props) {
  const [plugins, setPlugins] = useState<RemotePlugin[]>([])
  const [loading, setLoading] = useState(true)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function fetchPlugins() {
    try {
      const items = await opendora.plugin.listAvailable({ category })
      setPlugins(items)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load registry")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlugins()
  }, [category])

  async function handleInstall(pluginId: string) {
    setActionInProgress(pluginId)
    try {
      await opendora.plugin.installRemote(pluginId)
      await fetchPlugins()
      onInstalled?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Installation failed")
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
      onInstalled?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove plugin")
    } finally {
      setActionInProgress(null)
    }
  }

  if (loading) return null
  if (error) return <p className="text-xs text-destructive">{error}</p>
  if (plugins.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <PackageIcon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Available from Registry</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plugins.map((plugin) => {
          const busy = actionInProgress === plugin.id
          return (
            <Card key={plugin.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm">{plugin.name}</CardTitle>
                  {plugin.installed && <CheckCircle2Icon className="h-4 w-4 shrink-0 text-green-500" />}
                </div>
                <CardDescription className="text-xs">{plugin.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 pb-3">
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-xs">v{plugin.version}</Badge>
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {plugin.capabilities.length} capability{plugin.capabilities.length !== 1 ? "ies" : "y"}
                  </Badge>
                </div>
              </CardContent>
              <CardFooter className="border-t pt-3">
                {plugin.installed ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => handleRemove(plugin.id)}
                    disabled={busy}
                  >
                    {busy ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" /> : "Remove"}
                  </Button>
                ) : (
                  <Button size="sm" className="w-full" onClick={() => handleInstall(plugin.id)} disabled={busy}>
                    {busy ? (
                      <><Loader2Icon className="mr-2 h-3.5 w-3.5 animate-spin" />Installing...</>
                    ) : (
                      <><DownloadIcon className="mr-2 h-3.5 w-3.5" />Install</>
                    )}
                  </Button>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
