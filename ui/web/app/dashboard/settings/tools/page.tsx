"use client"

import { useEffect, useState } from "react"
import { CheckCircle2Icon, CircleIcon, Loader2Icon, Trash2Icon, WrenchIcon } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { opendora } from "@/lib/opendora"

export default function ToolsPage() {
  const [globalConfig, setGlobalConfig] = useState<{ tool_config?: { exa?: { apiKey?: string; useApiKey?: boolean } }; [k: string]: unknown } | null>(null)
  const [exaApiKey, setExaApiKey] = useState("")
  const [savingExaKey, setSavingExaKey] = useState(false)
  const [exaKeyError, setExaKeyError] = useState<string | null>(null)
  const [savingToggle, setSavingToggle] = useState(false)

  useEffect(() => {
    opendora.config.get().then(setGlobalConfig).catch(() => {})
  }, [])

  const exa = globalConfig?.tool_config?.exa
  const hasKey = !!exa?.apiKey
  const useApiKey = !!exa?.useApiKey

  async function handleSaveExaApiKey() {
    if (!exaApiKey.trim()) return
    setSavingExaKey(true)
    setExaKeyError(null)
    try {
      await opendora.config.update({
        tool_config: {
          exa: { ...exa, apiKey: exaApiKey.trim() },
        },
      })
      setExaApiKey("")
      opendora.config.get().then(setGlobalConfig).catch(() => {})
    } catch (err) {
      setExaKeyError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSavingExaKey(false)
    }
  }

  async function handleRemoveExaApiKey() {
    try {
      await opendora.config.update({
        tool_config: {
          exa: { useApiKey: false },
        },
      })
      opendora.config.get().then(setGlobalConfig).catch(() => {})
    } catch (err) {
      console.error("Failed to remove EXA API key:", err)
    }
  }

  async function handleToggleUseApiKey(value: boolean) {
    setSavingToggle(true)
    try {
      await opendora.config.update({
        tool_config: { exa: { ...exa, useApiKey: value } },
      })
      opendora.config.get().then(setGlobalConfig).catch(() => {})
    } finally {
      setSavingToggle(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b px-6 py-3 shrink-0">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard/settings">Settings</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Tools</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-8 flex flex-col gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <WrenchIcon className="size-5 text-muted-foreground" />
                <CardTitle className="text-lg">Tool Configuration</CardTitle>
              </div>
              <CardDescription>
                Configure API keys for tools. EXA AI API key is used for both web search and code search.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <div className="font-medium">EXA AI</div>
                  <div className="text-sm text-muted-foreground">Web search and code search</div>
                </div>
                <div className="flex items-center gap-2">
                  {hasKey ? (
                    <>
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle2Icon className="size-3.5" />
                        Configured
                      </span>
                      <Button size="sm" variant="ghost" onClick={handleRemoveExaApiKey}>
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CircleIcon className="size-3.5" />
                      Not configured
                    </span>
                  )}
                </div>
              </div>

              {!hasKey && (
                <div className="space-y-2">
                  <Label htmlFor="exa-api-key">EXA AI API Key</Label>
                  <Input
                    id="exa-api-key"
                    type="password"
                    placeholder="exa-…"
                    value={exaApiKey}
                    onChange={(e) => setExaApiKey(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveExaApiKey() }}
                    className="font-mono"
                  />
                  {exaKeyError && <p className="text-xs text-destructive">{exaKeyError}</p>}
                  <div className="flex gap-2">
                    <Button onClick={handleSaveExaApiKey} disabled={savingExaKey || !exaApiKey.trim()}>
                      {savingExaKey && <Loader2Icon className="mr-2 size-3.5 animate-spin" />}
                      Save
                    </Button>
                  </div>
                </div>
              )}

              {hasKey && (
                <div className="flex items-center justify-between px-4 py-3 border rounded-lg">
                  <div>
                    <div className="text-sm font-medium">Use API key</div>
                    <div className="text-xs text-muted-foreground">Route requests through your API key</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {savingToggle && <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />}
                    <Switch
                      checked={useApiKey}
                      onCheckedChange={handleToggleUseApiKey}
                      disabled={savingToggle}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
