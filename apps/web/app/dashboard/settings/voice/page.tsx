"use client"

import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useVoiceSettings, formatHotkey, type HotkeyConfig } from "@/hooks/use-voice-settings"
import { Volume2Icon, MicIcon, RotateCcwIcon, KeyboardIcon } from "lucide-react"
import { toast } from "sonner"
import { opendora } from "@/lib/opendora"

export default function VoiceSettingsPage() {
  const router = useRouter()
  const { settings, updateSettings, resetSettings, isLoaded } = useVoiceSettings()
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false)
  const [tempHotkey, setTempHotkey] = useState<HotkeyConfig | null>(null)
  const [recordingKeys, setRecordingKeys] = useState<string[]>([])
  const [googleApiKey, setGoogleApiKey] = useState("")
  const [savingGoogleKey, setSavingGoogleKey] = useState(false)
  const [localWhisperUrl, setLocalWhisperUrl] = useState("")
  const [localWhisperKey, setLocalWhisperKey] = useState("")
  const [savingLocalWhisper, setSavingLocalWhisper] = useState(false)

  const needsGemini = settings.stt.provider === "google-gemini" || settings.tts.provider === "google-gemini"
  const needsOpenAI = settings.stt.provider === "openai-whisper" || settings.tts.provider === "openai"

  const saveLocalWhisperConfig = async () => {
    if (!localWhisperUrl.trim()) return
    setSavingLocalWhisper(true)
    try {
      await opendora.auth.set("local-whisper", {
        type: "url",
        url: localWhisperUrl.trim().replace(/\/$/, ""),
        ...(localWhisperKey.trim() ? { key: localWhisperKey.trim() } : {}),
      })
      toast.success("Local Whisper server saved")
      setLocalWhisperUrl("")
      setLocalWhisperKey("")
    } catch {
      toast.error("Failed to save Local Whisper configuration")
    } finally {
      setSavingLocalWhisper(false)
    }
  }

  const saveGoogleApiKey = async () => {
    if (!googleApiKey.trim()) return
    setSavingGoogleKey(true)
    try {
      await opendora.auth.set("google", { type: "api", key: googleApiKey.trim() })
      toast.success("Google API key saved")
      setGoogleApiKey("")
    } catch {
      toast.error("Failed to save Google API key")
    } finally {
      setSavingGoogleKey(false)
    }
  }

  // Handle hotkey recording
  useEffect(() => {
    if (!isRecordingHotkey) return

    const keysPressed = new Set<string>()
    let modifiers = {
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Ignore Escape
      if (e.key === "Escape") {
        setIsRecordingHotkey(false)
        keysPressed.clear()
        setRecordingKeys([])
        return
      }

      // Track modifier keys
      if (e.ctrlKey) modifiers.ctrlKey = true
      if (e.shiftKey) modifiers.shiftKey = true
      if (e.altKey) modifiers.altKey = true
      if (e.metaKey) modifiers.metaKey = true

      // Add non-modifier keys (including special keys like Tab, Enter, etc.)
      if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        keysPressed.add(e.key)
      }

      // Update UI to show current keys being pressed
      const currentKeys: string[] = []
      if (modifiers.ctrlKey) currentKeys.push('Ctrl')
      if (modifiers.shiftKey) currentKeys.push('Shift')
      if (modifiers.altKey) currentKeys.push('Alt')
      if (modifiers.metaKey) currentKeys.push('Meta')
      
      // Handle special key display names
      let displayKey = e.key
      switch (e.key) {
        case ' ': displayKey = 'Space'; break
        case 'Tab': displayKey = 'Tab'; break
        case 'Enter': displayKey = 'Enter'; break
        case 'Escape': displayKey = 'Esc'; break
        case 'ArrowUp': displayKey = '↑'; break
        case 'ArrowDown': displayKey = '↓'; break
        case 'ArrowLeft': displayKey = '←'; break
        case 'ArrowRight': displayKey = '→'; break
        case 'Backspace': displayKey = 'Backspace'; break
        case 'Delete': displayKey = 'Delete'; break
        case 'Insert': displayKey = 'Insert'; break
        case 'Home': displayKey = 'Home'; break
        case 'End': displayKey = 'End'; break
        case 'PageUp': displayKey = 'PageUp'; break
        case 'PageDown': displayKey = 'PageDown'; break
        case 'CapsLock': displayKey = 'CapsLock'; break
        case 'NumLock': displayKey = 'NumLock'; break
        case 'ScrollLock': displayKey = 'ScrollLock'; break
        case 'Pause': displayKey = 'Pause'; break
        case 'PrintScreen': displayKey = 'PrintScreen'; break
        default:
          if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
            displayKey = e.key.toUpperCase()
          }
      }
      
      if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        currentKeys.push(displayKey)
      }
      setRecordingKeys(currentKeys)

      // Check if we have a valid combination (1-3 keys total)
      const totalKeys = keysPressed.size + 
        (modifiers.ctrlKey ? 1 : 0) + 
        (modifiers.shiftKey ? 1 : 0) + 
        (modifiers.altKey ? 1 : 0) + 
        (modifiers.metaKey ? 1 : 0)

      // Lock in the hotkey immediately when we have at least one non-modifier key
      if (totalKeys >= 1 && totalKeys <= 3 && keysPressed.size > 0) {
        // Get the primary non-modifier key
        const mainKey = Array.from(keysPressed)[0] || ' '
        
        // Create hotkey config
        const hotkey: HotkeyConfig = {
          key: mainKey,
          ctrlKey: modifiers.ctrlKey,
          shiftKey: modifiers.shiftKey,
          altKey: modifiers.altKey,
          metaKey: modifiers.metaKey,
        }

        setTempHotkey(hotkey)
        setIsRecordingHotkey(false)
        keysPressed.clear()
        modifiers = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }
        setRecordingKeys([])

        // Update settings
        updateSettings({
          pushToTalk: {
            ...settings.pushToTalk,
            hotkey,
          },
        })
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isRecordingHotkey, settings.pushToTalk, updateSettings])

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    )
  }

  return (
    <SettingsPageLayout
      title="Voice"
      headerAction={
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
      }
    >
      <div className="max-w-3xl">
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
                          provider: e.target.value as "openai-whisper" | "google-gemini" | "local-whisper" | "browser-native" | "disabled",
                        },
                      })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="browser-native">Browser Native (Chrome/Edge only, free)</option>
                    <option value="openai-whisper">OpenAI Whisper</option>
                    <option value="google-gemini">Google Gemini</option>
                    <option value="local-whisper">Local Whisper Server</option>
                    <option value="disabled">Disabled</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {settings.stt.provider === "browser-native" &&
                      "Uses browser's built-in speech recognition. Free — no API key required. Chrome/Edge only."}
                    {settings.stt.provider === "openai-whisper" &&
                      "Uses OpenAI's Whisper model for high-quality transcription. Requires an OpenAI API key."}
                    {settings.stt.provider === "google-gemini" &&
                      "Uses Google Gemini for transcription. Requires a Google API key."}
                    {settings.stt.provider === "local-whisper" &&
                      "Routes audio to a local Whisper server (OpenAI-compatible API). No cloud API key required."}
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
                          provider: e.target.value as "openai" | "google-gemini" | "browser-native" | "disabled",
                        },
                      })
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="browser-native">Browser Native (free, robotic)</option>
                    <option value="openai">OpenAI TTS</option>
                    <option value="google-gemini">Google Gemini TTS</option>
                    <option value="disabled">Disabled</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {settings.tts.provider === "browser-native" &&
                      "Uses the browser's built-in speech synthesis. Free, no API key required. Voice quality varies by OS/browser."}
                    {settings.tts.provider === "openai" &&
                      "Uses OpenAI's text-to-speech API. Requires an OpenAI API key."}
                    {settings.tts.provider === "google-gemini" &&
                      "Uses Google Gemini TTS. Requires a Google API key."}
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

            {/* Push-to-Talk Settings */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <KeyboardIcon className="h-5 w-5 text-primary" />
                  <CardTitle>Push-to-Talk</CardTitle>
                </div>
                <CardDescription>
                  Configure hotkey for hold-to-speak functionality
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Enable Push-to-Talk</label>
                    <p className="text-xs text-muted-foreground">
                      Hold a hotkey to record voice and automatically send with voice reply enabled
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.pushToTalk.enabled}
                    onClick={() =>
                      updateSettings({
                        pushToTalk: {
                          ...settings.pushToTalk,
                          enabled: !settings.pushToTalk.enabled,
                        },
                      })
                    }
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                      settings.pushToTalk.enabled ? "bg-primary" : "bg-input"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        settings.pushToTalk.enabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {settings.pushToTalk.enabled && (
                  <div className="space-y-3">
                    <label className="text-sm font-medium">Hotkey</label>
                    
                    {/* Hotkey display box */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 px-4 py-3 rounded-md border border-input bg-muted/30 min-h-[60px] flex items-center justify-center">
                        {isRecordingHotkey ? (
                          <div className="text-center">
                            <p className="text-sm font-medium text-primary">
                              {recordingKeys.length > 0 ? recordingKeys.join(' + ') : 'Press keys...'}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Press up to 3 keys
                            </p>
                          </div>
                        ) : settings.pushToTalk.hotkey ? (
                          <div className="text-center">
                            <p className="text-lg font-mono font-semibold">
                              {formatHotkey(settings.pushToTalk.hotkey)}
                            </p>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No hotkey set
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {/* Control buttons */}
                    <div className="flex items-center gap-2">
                      {!isRecordingHotkey && !settings.pushToTalk.hotkey && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsRecordingHotkey(true)
                            setTempHotkey(null)
                            setRecordingKeys([])
                          }}
                          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium"
                        >
                          Set Hotkey
                        </button>
                      )}
                      
                      {!isRecordingHotkey && settings.pushToTalk.hotkey && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setIsRecordingHotkey(true)
                              setTempHotkey(null)
                              setRecordingKeys([])
                            }}
                            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors text-sm font-medium"
                          >
                            Change
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSettings({
                                pushToTalk: {
                                  ...settings.pushToTalk,
                                  hotkey: null,
                                },
                              })
                            }
                            className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 transition-colors text-sm font-medium"
                          >
                            Reset
                          </button>
                        </>
                      )}
                      
                      {isRecordingHotkey && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsRecordingHotkey(false)
                            setRecordingKeys([])
                          }}
                          className="px-4 py-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md transition-colors text-sm font-medium"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                    
                    <p className="text-xs text-muted-foreground">
                      Press up to 3 keys including modifiers (Ctrl, Shift, Alt, Meta). Example: Ctrl + Shift + V
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Gemini API Key Setup */}
            {needsGemini && (
              <Card className="border-blue-500/50">
                <CardHeader>
                  <CardTitle className="text-base">Google API Key</CardTitle>
                  <CardDescription>Required for Google Gemini STT and TTS</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Get a free API key at <strong>aistudio.google.com</strong> → Get API key. No billing required for the free tier.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="AIza..."
                      value={googleApiKey}
                      onChange={(e) => setGoogleApiKey(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveGoogleApiKey()}
                      className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <Button onClick={saveGoogleApiKey} disabled={!googleApiKey.trim() || savingGoogleKey} size="sm">
                      {savingGoogleKey ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* OpenAI API Key Setup */}
            {needsOpenAI && (
              <Card className="bg-muted/50 border-orange-500/50">
                <CardHeader>
                  <CardTitle className="text-base">⚠️ OpenAI API Key Required</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-3">
                  <p className="font-medium text-foreground">
                    OpenAI voice features require an API key with billing — OAuth Codex tokens don't work here.
                  </p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Go to <span className="font-mono text-xs bg-muted px-1 py-0.5 rounded">Settings → Providers</span></li>
                    <li>Find <strong>OpenAI</strong> → <strong>"Manually enter API Key"</strong></li>
                    <li>Paste your key (starts with sk-...)</li>
                  </ol>
                </CardContent>
              </Card>
            )}

            {/* Browser native info */}
            {settings.stt.provider === "browser-native" && (
              <Card className="border-green-500/50">
                <CardHeader>
                  <CardTitle className="text-base">✓ No API Key Needed</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Browser-native uses Chrome/Edge's built-in speech recognition. It's free and works offline. Push-to-talk also uses the browser API directly — no backend calls.
                </CardContent>
              </Card>
            )}

            {/* Local Whisper server setup */}
            {settings.stt.provider === "local-whisper" && (
              <Card className="border-green-500/50">
                <CardHeader>
                  <CardTitle className="text-base">Local Whisper Server</CardTitle>
                  <CardDescription>
                    Connect to a locally-running Whisper server with an OpenAI-compatible API (e.g. faster-whisper-server, whisper.cpp HTTP, LocalAI).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Server URL</label>
                    <input
                      type="url"
                      placeholder="http://localhost:8000"
                      value={localWhisperUrl}
                      onChange={(e) => setLocalWhisperUrl(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <p className="text-xs text-muted-foreground">
                      The server must expose <span className="font-mono">POST /v1/audio/transcriptions</span>.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Bearer token (optional)</label>
                    <input
                      type="password"
                      placeholder="Only needed if your server requires authentication"
                      value={localWhisperKey}
                      onChange={(e) => setLocalWhisperKey(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveLocalWhisperConfig()}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <Button
                    onClick={saveLocalWhisperConfig}
                    disabled={!localWhisperUrl.trim() || savingLocalWhisper}
                    size="sm"
                  >
                    {savingLocalWhisper ? "Saving..." : "Save"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
      </div>
    </SettingsPageLayout>
  )
}
