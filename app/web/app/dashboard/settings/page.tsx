"use client"

import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SettingsCard } from "@/components/settings/settings-card"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"
import { useUserProfile } from "@/hooks/use-user-profile"
import { useVoiceSettings, formatHotkey, type HotkeyConfig } from "@/hooks/use-voice-settings"
import { useTheme } from "next-themes"
import { BotIcon, MessageSquareIcon, SettingsIcon, PlugIcon, UserIcon, ClockPlusIcon, WrenchIcon, SunIcon, MoonIcon, MonitorIcon, BookOpenIcon, MicIcon, Volume2Icon, KeyboardIcon, WorkflowIcon, ActivityIcon } from "lucide-react"
import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { AGENT_COLORS } from "@/lib/agent-colors"
import { opendora } from "@/lib/opendora"

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Kyiv",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Hong_Kong",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Pacific/Auckland",
  "Pacific/Fiji",
]

export default function SettingsPage() {
  const router = useRouter()
  const { agents, sessions, connectedProviders } = useOpendoraContext()
  const { userName, setUserName, userColor, setUserColor } = useUserProfile()
  const { theme, setTheme } = useTheme()
  const { settings: voiceSettings, updateSettings: updateVoiceSettings, isLoaded: voiceLoaded } = useVoiceSettings()
  const [mounted, setMounted] = useState(false)
  const [userDialogOpen, setUserDialogOpen] = useState(false)
  const [generalDialogOpen, setGeneralDialogOpen] = useState(false)
  const [recordingHotkey, setRecordingHotkey] = useState(false)
  const [recordingKeys, setRecordingKeys] = useState<string[]>([])
  const [timezone, setTimezone] = useState("UTC")
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>("")
  const [workflows, setWorkflows] = useState<any[]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  // Sync theme, timezone, and workflow from general.json on first open
  useEffect(() => {
    if (!mounted) return
    opendora.general.get().then((data) => {
      if (data.theme && data.theme !== theme) setTheme(data.theme)
      if (data.timezone) setTimezone(data.timezone)
      if (data.selectedWorkflowId) setSelectedWorkflowId(data.selectedWorkflowId)
    }).catch(() => {})
  }, [mounted])

  // Load workflows when general dialog opens
  useEffect(() => {
    if (!generalDialogOpen) return
    opendora.workflow.list().then(setWorkflows).catch(() => setWorkflows([]))
  }, [generalDialogOpen])

  const handleSetTheme = (newTheme: string) => {
    setTheme(newTheme)
    opendora.general.update({ theme: newTheme }).catch(() => {})
  }

  const handleSetTimezone = (newTimezone: string) => {
    setTimezone(newTimezone)
    opendora.general.update({ timezone: newTimezone }).catch(() => {})
  }

  const handleSetWorkflow = (workflowId: string) => {
    setSelectedWorkflowId(workflowId)
    opendora.general.update({ selectedWorkflowId: workflowId }).catch(() => {})
  }

  // Hotkey recording effect
  useEffect(() => {
    if (!recordingHotkey) return
    const keysPressed = new Set<string>()
    let modifiers = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === "Escape") { setRecordingHotkey(false); keysPressed.clear(); setRecordingKeys([]); return }
      if (e.ctrlKey) modifiers.ctrlKey = true
      if (e.shiftKey) modifiers.shiftKey = true
      if (e.altKey) modifiers.altKey = true
      if (e.metaKey) modifiers.metaKey = true
      if (!['Control','Shift','Alt','Meta'].includes(e.key)) keysPressed.add(e.key)

      const currentKeys: string[] = []
      if (modifiers.ctrlKey) currentKeys.push('Ctrl')
      if (modifiers.shiftKey) currentKeys.push('Shift')
      if (modifiers.altKey) currentKeys.push('Alt')
      if (modifiers.metaKey) currentKeys.push('Meta')
      let displayKey = e.key
      switch (e.key) { case ' ': displayKey='Space'; break; case 'Tab': displayKey='Tab'; break; case 'Enter': displayKey='Enter'; break; case 'ArrowUp': displayKey='↑'; break; case 'ArrowDown': displayKey='↓'; break; case 'ArrowLeft': displayKey='←'; break; case 'ArrowRight': displayKey='→'; break; default: if (!['Control','Shift','Alt','Meta'].includes(e.key)) displayKey = e.key.toUpperCase() }
      if (!['Control','Shift','Alt','Meta'].includes(e.key)) currentKeys.push(displayKey)
      setRecordingKeys(currentKeys)

      const totalKeys = keysPressed.size + (modifiers.ctrlKey?1:0) + (modifiers.shiftKey?1:0) + (modifiers.altKey?1:0) + (modifiers.metaKey?1:0)
      if (totalKeys >= 1 && totalKeys <= 3 && keysPressed.size > 0) {
        const mainKey = Array.from(keysPressed)[0] || ' '
        const hotkey: HotkeyConfig = { key: mainKey, ctrlKey: modifiers.ctrlKey, shiftKey: modifiers.shiftKey, altKey: modifiers.altKey, metaKey: modifiers.metaKey }
        updateVoiceSettings({ pushToTalk: { ...voiceSettings.pushToTalk, hotkey } })
        setRecordingHotkey(false)
        keysPressed.clear()
        modifiers = { ctrlKey:false, shiftKey:false, altKey:false, metaKey:false }
        setRecordingKeys([])
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [recordingHotkey, voiceSettings.pushToTalk, updateVoiceSettings])

  const settingsCards = [
    {
      title: "User",
      description: "Your name and message color",
      icon: UserIcon,
      onClick: () => setUserDialogOpen(true),
    },
    {
      title: "General",
      description: "Theme and voice settings",
      icon: SunIcon,
      onClick: () => setGeneralDialogOpen(true),
    },
    {
      title: "Usage",
      description: "View system usage and statistics",
      icon: ActivityIcon,
      href: "/dashboard/usage",
    },
    {
      title: "Agents",
      description: "Manage your AI agents and their configurations",
      icon: BotIcon,
      href: "/dashboard/settings/agents",
      count: agents.length,
      countLabel: "agents",
    },
    {
      title: "Sessions",
      description: "View and manage all conversation sessions",
      icon: MessageSquareIcon,
      href: "/dashboard/settings/sessions",
      count: sessions.length,
      countLabel: "sessions",
    },
    {
      title: "Providers",
      description: "Connect and manage AI provider integrations",
      icon: PlugIcon,
      href: "/dashboard/settings/providers",
      count: connectedProviders.length,
      countLabel: "connected",
    },
    {
      title: "Tools",
      description: "Configure API keys for web search and code search",
      icon: WrenchIcon,
      href: "/dashboard/settings/tools",
      count: null,
      countLabel: null,
    },
    {
      title: "Schedules",
      description: "Manage background delegations",
      icon: ClockPlusIcon,
      href: "/dashboard/settings/schedules",
      count: null,
      countLabel: null,
    },
    {
      title: "Skills",
      description: "Browse and manage loaded skills",
      icon: BookOpenIcon,
      href: "/dashboard/settings/skills",
      count: null,
      countLabel: null,
    },
    {
      title: "Workflows",
      description: "Create and run multi-step agent workflows",
      icon: WorkflowIcon,
      href: "/dashboard/settings/workflows",
      count: null,
      countLabel: null,
    },
  ]

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
              <BreadcrumbPage>Settings</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <SettingsIcon className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">Settings</h1>
            </div>
            <p className="text-muted-foreground text-lg">
              Manage your OpenDora configuration and preferences
            </p>
          </div>

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {settingsCards.map((card) => {
              const Icon = card.icon
              const handleClick = 'href' in card && card.href ? () => router.push(card.href) : card.onClick
              return (
                <SettingsCard
                  key={card.title}
                  title={card.title}
                  description={card.description}
                  icon={Icon}
                  onClick={handleClick}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* User Dialog */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="user-name">Your name</Label>
              <Input
                id="user-name"
                placeholder="e.g. Alex"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Agents will see <code className="font-mono">user: {userName || "your name"}</code> at the start of every message you send.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Your color</Label>
              <div className="flex flex-wrap gap-2">
                {AGENT_COLORS.map((c) => (
                  <button
                    key={c.id}
                    title={c.label}
                    onClick={() => setUserColor(c.id)}
                    className="size-6 rounded-full transition-all"
                    style={{
                      backgroundColor: c.hex,
                      outline: userColor === c.id ? `2px solid ${c.hex}` : undefined,
                      outlineOffset: userColor === c.id ? "2px" : undefined,
                    }}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Used as the ring color on your messages.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* General Dialog */}
      <Dialog open={generalDialogOpen} onOpenChange={setGeneralDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>General Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            {/* Timezone */}
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              {mounted && (
                <Select value={timezone} onValueChange={handleSetTimezone}>
                  <SelectTrigger id="timezone" className="w-full">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {COMMON_TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                Used as the default timezone for schedules and timestamps across the system.
              </p>
            </div>

            {/* Workflow Selector */}
            <div className="space-y-2">
              <Label htmlFor="workflow">Default Workflow</Label>
              <Select value={selectedWorkflowId} onValueChange={handleSetWorkflow}>
                <SelectTrigger id="workflow" className="w-full">
                  <SelectValue placeholder="Select workflow…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {workflows.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Default workflow to run. Inputs will be auto-populated from this workflow's parameters.
              </p>
            </div>

            {/* Theme */}
            <div className="space-y-2">
              <Label htmlFor="theme">Theme</Label>
              {mounted && (
                <Select value={theme} onValueChange={handleSetTheme}>
                  <SelectTrigger id="theme" className="w-full">
                    <SelectValue placeholder="Select theme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">
                      <div className="flex items-center gap-2">
                        <SunIcon className="h-4 w-4" />
                        <span>Light</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="dark">
                      <div className="flex items-center gap-2">
                        <MoonIcon className="h-4 w-4" />
                        <span>Dark</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="system">
                      <div className="flex items-center gap-2">
                        <MonitorIcon className="h-4 w-4" />
                        <span>System</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                Select your preferred color scheme for the interface.
              </p>
            </div>

            {/* Voice Settings */}
            {voiceLoaded && (
              <>
                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <MicIcon className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Speech-to-Text</h3>
                  </div>
                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <Select
                      value={voiceSettings.stt.provider}
                      onValueChange={(v: any) => updateVoiceSettings({ stt: { ...voiceSettings.stt, provider: v } })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="browser-native">Browser Native (free)</SelectItem>
                        <SelectItem value="openai-whisper">OpenAI Whisper</SelectItem>
                        <SelectItem value="google-gemini">Google Gemini</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <Volume2Icon className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Text-to-Speech</h3>
                  </div>
                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <Select
                      value={voiceSettings.tts.provider}
                      onValueChange={(v: any) => updateVoiceSettings({ tts: { ...voiceSettings.tts, provider: v } })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI TTS</SelectItem>
                        <SelectItem value="google-gemini">Google Gemini TTS</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {voiceSettings.tts.provider === "openai" && (
                    <>
                      <div className="space-y-2">
                        <Label>Voice</Label>
                        <Select
                          value={voiceSettings.tts.voice}
                          onValueChange={(v: any) => updateVoiceSettings({ tts: { ...voiceSettings.tts, voice: v } })}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="alloy">Alloy (Neutral)</SelectItem>
                            <SelectItem value="echo">Echo (Male)</SelectItem>
                            <SelectItem value="fable">Fable (British Male)</SelectItem>
                            <SelectItem value="onyx">Onyx (Deep Male)</SelectItem>
                            <SelectItem value="nova">Nova (Female)</SelectItem>
                            <SelectItem value="shimmer">Shimmer (Warm Female)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Speed: {voiceSettings.tts.speed?.toFixed(2)}x</Label>
                        <input
                          type="range"
                          min="0.25"
                          max="4.0"
                          step="0.05"
                          value={voiceSettings.tts.speed ?? 1.0}
                          onChange={(e) => updateVoiceSettings({ tts: { ...voiceSettings.tts, speed: parseFloat(e.target.value) } })}
                          className="w-full"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <KeyboardIcon className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Push-to-Talk</h3>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="text-xs">Enable Push-to-Talk</Label>
                      <p className="text-xs text-muted-foreground">Hold hotkey to record voice</p>
                    </div>
                    <Switch
                      checked={voiceSettings.pushToTalk.enabled}
                      onCheckedChange={(checked) => updateVoiceSettings({ pushToTalk: { ...voiceSettings.pushToTalk, enabled: checked } })}
                    />
                  </div>
                  {voiceSettings.pushToTalk.enabled && (
                    <div className="space-y-2">
                      <Label>Hotkey</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 px-3 py-2 rounded-md border border-input bg-muted/30 min-h-[36px] flex items-center justify-center text-sm font-mono">
                          {recordingHotkey ? (
                            <span className="text-primary">
                              {recordingKeys.length > 0 ? recordingKeys.join(' + ') : 'Press keys...'}
                            </span>
                          ) : (
                            <span>
                              {formatHotkey(voiceSettings.pushToTalk.hotkey)}
                            </span>
                          )}
                        </div>
                        {!recordingHotkey && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setRecordingHotkey(true); setRecordingKeys([]) }}
                          >
                            {voiceSettings.pushToTalk.hotkey ? 'Change' : 'Set'}
                          </Button>
                        )}
                        {recordingHotkey && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setRecordingHotkey(false); setRecordingKeys([]) }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
