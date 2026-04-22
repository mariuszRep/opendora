"use client"

import { useEffect, useState } from "react"
import { CheckCircle2Icon, CircleIcon, Loader2Icon, MonitorIcon, Trash2Icon, WrenchIcon } from "lucide-react"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { opendora } from "@/lib/opendora"

type GlobalConfig = {
  tool_config?: {
    exa?: { apiKey?: string; useApiKey?: boolean }
    desktop?: { enabled?: boolean }
  }
  [k: string]: unknown
}

const DESKTOP_TOOLS = [
  {
    group: "Mouse",
    tools: [
      { id: "desktop_mouse_move", label: "Mouse Move", desc: "Move cursor to coordinates" },
      { id: "desktop_mouse_click", label: "Mouse Click", desc: "Click at a position" },
      { id: "desktop_mouse_drag", label: "Mouse Drag", desc: "Drag from one point to another" },
      { id: "desktop_mouse_scroll", label: "Mouse Scroll", desc: "Scroll in a direction" },
      { id: "desktop_mouse_position", label: "Mouse Position", desc: "Get current cursor position" },
    ],
  },
  {
    group: "Keyboard",
    tools: [
      { id: "desktop_keyboard_type", label: "Keyboard Type", desc: "Type text" },
      { id: "desktop_keyboard_press", label: "Keyboard Press", desc: "Press key combinations" },
    ],
  },
  {
    group: "Screen",
    tools: [
      { id: "desktop_screen_capture", label: "Screen Capture", desc: "Take a screenshot" },
      { id: "desktop_screen_find_image", label: "Find Image", desc: "Find image on screen" },
      { id: "desktop_screen_wait_for_image", label: "Wait For Image", desc: "Wait until image appears" },
      { id: "desktop_screen_size", label: "Screen Size", desc: "Get screen dimensions" },
      { id: "desktop_screen_read_pixel", label: "Read Pixel", desc: "Read pixel color at coordinates" },
    ],
  },
  {
    group: "Window",
    tools: [
      { id: "desktop_window_list", label: "Window List", desc: "List open windows" },
      { id: "desktop_window_active", label: "Active Window", desc: "Get the active window" },
      { id: "desktop_window_focus", label: "Window Focus", desc: "Focus a window by title" },
      { id: "desktop_window_move", label: "Window Move", desc: "Move a window" },
      { id: "desktop_window_resize", label: "Window Resize", desc: "Resize a window" },
    ],
  },
  {
    group: "Clipboard",
    tools: [
      { id: "desktop_clipboard_read", label: "Clipboard Read", desc: "Read clipboard text" },
      { id: "desktop_clipboard_write", label: "Clipboard Write", desc: "Write text to clipboard" },
    ],
  },
]

export default function ToolsPage() {
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig | null>(null)
  const [exaApiKey, setExaApiKey] = useState("")
  const [savingExaKey, setSavingExaKey] = useState(false)
  const [exaKeyError, setExaKeyError] = useState<string | null>(null)
  const [savingExaToggle, setSavingExaToggle] = useState(false)
  const [savingDesktop, setSavingDesktop] = useState(false)

  useEffect(() => {
    opendora.config.get().then(setGlobalConfig).catch(() => {})
  }, [])

  const exa = globalConfig?.tool_config?.exa
  const hasKey = !!exa?.apiKey
  const useApiKey = !!exa?.useApiKey
  const desktopEnabled = !!globalConfig?.tool_config?.desktop?.enabled

  async function handleSaveExaApiKey() {
    if (!exaApiKey.trim()) return
    setSavingExaKey(true)
    setExaKeyError(null)
    try {
      await opendora.config.update({
        tool_config: { exa: { ...exa, apiKey: exaApiKey.trim() } },
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
        tool_config: { exa: { useApiKey: false } },
      })
      opendora.config.get().then(setGlobalConfig).catch(() => {})
    } catch (err) {
      console.error("Failed to remove EXA API key:", err)
    }
  }

  async function handleToggleUseApiKey(value: boolean) {
    setSavingExaToggle(true)
    try {
      await opendora.config.update({
        tool_config: { exa: { ...exa, useApiKey: value } },
      })
      opendora.config.get().then(setGlobalConfig).catch(() => {})
    } finally {
      setSavingExaToggle(false)
    }
  }

  async function handleToggleDesktop(value: boolean) {
    setSavingDesktop(true)
    try {
      await opendora.config.update({
        tool_config: { desktop: { enabled: value } },
      })
      opendora.config.get().then(setGlobalConfig).catch(() => {})
    } finally {
      setSavingDesktop(false)
    }
  }

  return (
    <SettingsPageLayout title="Tools" narrow>
      <div className="flex flex-col gap-6">
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
                  {savingExaToggle && <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />}
                  <Switch
                    checked={useApiKey}
                    onCheckedChange={handleToggleUseApiKey}
                    disabled={savingExaToggle}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MonitorIcon className="size-5 text-muted-foreground" />
                <CardTitle className="text-lg">Desktop Automation</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                {savingDesktop && <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />}
                <Switch
                  checked={desktopEnabled}
                  onCheckedChange={handleToggleDesktop}
                  disabled={savingDesktop}
                />
              </div>
            </div>
            <CardDescription>
              Control the mouse, keyboard, screen, windows, and clipboard. Requires native prerequisites — see desktop/README.md. Disabled in sandbox mode.
            </CardDescription>
          </CardHeader>
          {desktopEnabled && (
            <CardContent className="space-y-4">
              {DESKTOP_TOOLS.map(({ group, tools }) => (
                <div key={group}>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{group}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {tools.map((tool) => (
                      <div key={tool.id} className="flex flex-col gap-0.5 px-3 py-2 border rounded-md bg-muted/30">
                        <span className="text-sm font-medium">{tool.label}</span>
                        <span className="text-xs text-muted-foreground">{tool.desc}</span>
                        <span className="text-xs font-mono text-muted-foreground/60">{tool.id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      </div>
    </SettingsPageLayout>
  )
}
