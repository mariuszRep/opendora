"use client"

import { useEffect, useState } from "react"
import { Bot, CheckCircle2Icon, DownloadIcon, Loader2Icon, PackageIcon, Wrench, Workflow, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { opendora, type RemoteEntity } from "@/lib/projectflows"

const TYPE_ICONS = {
  agent: Bot,
  skill: Zap,
  tool: Wrench,
  workflow: Workflow,
} as const

interface Props {
  entityType: "agent" | "skill" | "tool" | "workflow"
  onInstalled?: () => void
}

export function RegistryEntitiesSection({ entityType, onInstalled }: Props) {
  const [entities, setEntities] = useState<RemoteEntity[]>([])
  const [loading, setLoading] = useState(true)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const Icon = TYPE_ICONS[entityType]

  async function fetchEntities() {
    try {
      const items = await opendora.entity.listAvailable({ type: entityType })
      setEntities(items)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load registry")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEntities()
  }, [entityType])

  async function handleInstall(name: string) {
    setActionInProgress(name)
    try {
      await opendora.entity.installRemote(entityType, name)
      await fetchEntities()
      onInstalled?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Installation failed")
    } finally {
      setActionInProgress(null)
    }
  }

  if (loading) return null
  if (error) return <p className="text-xs text-destructive">{error}</p>
  if (entities.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <PackageIcon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Available from Registry</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entities.map((entity) => {
          const busy = actionInProgress === entity.id
          return (
            <Card key={`${entity.pluginId}-${entity.id}`} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <CardTitle className="text-sm">{entity.name}</CardTitle>
                  </div>
                  {entity.installed && <CheckCircle2Icon className="h-4 w-4 shrink-0 text-green-500" />}
                </div>
                {entity.description && (
                  <CardDescription className="text-xs line-clamp-2">{entity.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="flex-1 pb-3">
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline" className="text-xs">v{entity.version}</Badge>
                  <Badge variant="secondary" className="text-xs text-muted-foreground">{entity.pluginId}</Badge>
                </div>
              </CardContent>
              <CardFooter className="border-t pt-3">
                {entity.installed ? (
                  <Button variant="outline" size="sm" className="w-full text-muted-foreground" disabled>
                    <CheckCircle2Icon className="mr-2 h-3.5 w-3.5" />
                    Installed
                  </Button>
                ) : (
                  <Button size="sm" className="w-full" onClick={() => handleInstall(entity.id)} disabled={busy}>
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
