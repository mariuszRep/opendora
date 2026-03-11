"use client"

import { useRouter } from "next/navigation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useVoiceSettings } from "@/hooks/use-voice-settings"
import { Volume2Icon, MicIcon, RotateCcwIcon } from "lucide-react"
import { toast } from "sonner"

export default function VoiceSettingsPage() {
  const router = useRouter()
  const { settings, updateSettings, resetSettings, isLoaded } = useVoiceSettings()

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
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
              <BreadcrumbPage>Voice</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            resetSettings()
            toast.success("Voice settings reset to defaults")
          }}
        >
          <RotateCcwIcon className="h-4 w-4 mr-2" />
          Reset to Defaults
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-3xl">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <Volume2Icon className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold">Voice Settings</h1>
            </div>
            <p className="text-muted-foreground text-lg">
              Configure speech-to-text and text-to-speech preferences
            </p>
          </div>

          <div className="space-y-6">
            {/* Speech-to-Text Settings */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <MicIcon className="h-5 w-5 text-primary" />
                  <CardTitle>Speech-to-Text</CardTitle>
                </div>
                <CardDescription>
                  Configure how voice input is transcribed
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Provider</label>
                  <select
                    value={settings.stt.provider}
                    onChange={(e) =>
                      updateSettings({
                        stt: {
                          ...settings.stt,
                          provider: e.target.value as "openai-whisper" | "browser-native" | "disabled",
                        },
                      })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="openai-whisper">OpenAI Whisper (Recommended)</option>
                    <option value="browser-native">Browser Native (Chrome/Edge only)</option>
                    <option value="disabled">Disabled</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {settings.stt.provider === "openai-whisper" &&
                      "Uses OpenAI's Whisper model for high-quality transcription. Requires OPENAI_API_KEY."}
                    {settings.stt.provider === "browser-native" &&
                      "Uses browser's built-in speech recognition (Chrome/Edge only). No API key required."}
                    {settings.stt.provider === "disabled" && "Voice input will be disabled."}
                  </p>
                </div>

                {settings.stt.provider === "openai-whisper" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Model</label>
                    <select
                      value={settings.stt.openaiModel}
                      onChange={(e) =>
                        updateSettings({
                          stt: {
                            ...settings.stt,
                            openaiModel: e.target.value as "whisper-1",
                          },
                        })
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="whisper-1">whisper-1</option>
                    </select>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Text-to-Speech Settings */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Volume2Icon className="h-5 w-5 text-primary" />
                  <CardTitle>Text-to-Speech</CardTitle>
                </div>
                <CardDescription>
                  Configure how AI responses are read aloud
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Provider</label>
                  <select
                    value={settings.tts.provider}
                    onChange={(e) =>
                      updateSettings({
                        tts: {
                          ...settings.tts,
                          provider: e.target.value as "openai" | "disabled",
                        },
                      })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="openai">OpenAI TTS</option>
                    <option value="disabled">Disabled</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {settings.tts.provider === "openai" &&
                      "Uses OpenAI's text-to-speech API. Requires OPENAI_API_KEY."}
                    {settings.tts.provider === "disabled" &&
                      "Text-to-speech will be disabled. Listen buttons will not appear."}
                  </p>
                </div>

                {settings.tts.provider === "openai" && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Model</label>
                      <select
                        value={settings.tts.openaiModel}
                        onChange={(e) =>
                          updateSettings({
                            tts: {
                              ...settings.tts,
                              openaiModel: e.target.value as "tts-1" | "tts-1-hd",
                            },
                          })
                        }
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="tts-1">tts-1 (Faster, lower latency)</option>
                        <option value="tts-1-hd">tts-1-hd (Higher quality)</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Voice</label>
                      <select
                        value={settings.tts.voice}
                        onChange={(e) =>
                          updateSettings({
                            tts: {
                              ...settings.tts,
                              voice: e.target.value as
                                | "alloy"
                                | "echo"
                                | "fable"
                                | "onyx"
                                | "nova"
                                | "shimmer",
                            },
                          })
                        }
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="alloy">Alloy (Neutral)</option>
                        <option value="echo">Echo (Male)</option>
                        <option value="fable">Fable (British Male)</option>
                        <option value="onyx">Onyx (Deep Male)</option>
                        <option value="nova">Nova (Female)</option>
                        <option value="shimmer">Shimmer (Warm Female)</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Speed: {settings.tts.speed?.toFixed(2) ?? "1.00"}x
                      </label>
                      <input
                        type="range"
                        min="0.25"
                        max="4.0"
                        step="0.05"
                        value={settings.tts.speed ?? 1.0}
                        onChange={(e) =>
                          updateSettings({
                            tts: {
                              ...settings.tts,
                              speed: parseFloat(e.target.value),
                            },
                          })
                        }
                        className="w-full"
                      />
                      <p className="text-xs text-muted-foreground">
                        Adjust playback speed (0.25x to 4.0x)
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Info Card */}
            <Card className="bg-muted/50 border-orange-500/50">
              <CardHeader>
                <CardTitle className="text-base">⚠️ Important: API Key Required</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-3">
                <p className="font-medium text-foreground">
                  Voice features require an OpenAI API key, NOT OAuth Codex tokens.
                </p>
                <div className="space-y-2">
                  <p className="font-semibold text-foreground">Setup Steps:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Go to <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">Settings → Providers</span></li>
                    <li>Find <strong>OpenAI</strong> provider</li>
                    <li>Click <strong>"Manually enter API Key"</strong></li>
                    <li>Paste your OpenAI API key (starts with sk-...)</li>
                  </ol>
                </div>
                <p className="text-xs italic">
                  Note: If you're using OAuth Codex for chat, adding an API key will replace it.
                  You can switch back to OAuth later via the same menu.
                </p>
                <p className="text-xs">
                  Voice input will appear as a microphone button in the chat interface.
                  Hover over AI responses to see the "Listen" button for text-to-speech.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
