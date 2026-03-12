"use client"

import { useEffect, useState } from "react"

export interface VoiceSettings {
  stt: {
    provider: "openai-whisper" | "browser-native" | "disabled"
    openaiModel?: "whisper-1"
  }
  tts: {
    provider: "openai" | "disabled"
    openaiModel?: "tts-1" | "tts-1-hd"
    voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"
    speed?: number
  }
  pushToTalk: {
    enabled: boolean
    hotkey: HotkeyConfig | null
  }
}

export interface HotkeyConfig {
  key: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}

const DEFAULT_SETTINGS: VoiceSettings = {
  stt: {
    provider: "openai-whisper",
    openaiModel: "whisper-1",
  },
  tts: {
    provider: "openai",
    openaiModel: "tts-1",
    voice: "alloy",
    speed: 1.0,
  },
  pushToTalk: {
    enabled: true,
    hotkey: {
      key: " ",
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    },
  },
}

const STORAGE_KEY = "opendora-voice-settings"

export function useVoiceSettings() {
  const [settings, setSettingsState] = useState<VoiceSettings>(DEFAULT_SETTINGS)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        setSettingsState({ ...DEFAULT_SETTINGS, ...parsed })
      }
    } catch (error) {
      console.error("Failed to load voice settings:", error)
    } finally {
      setIsLoaded(true)
    }
  }, [])

  // Save settings to localStorage
  const updateSettings = (newSettings: Partial<VoiceSettings>) => {
    const updated = {
      ...settings,
      ...newSettings,
      stt: { ...settings.stt, ...newSettings.stt },
      tts: { ...settings.tts, ...newSettings.tts },
      pushToTalk: { ...settings.pushToTalk, ...newSettings.pushToTalk },
    }
    setSettingsState(updated)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch (error) {
      console.error("Failed to save voice settings:", error)
    }
  }

  const resetSettings = () => {
    setSettingsState(DEFAULT_SETTINGS)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (error) {
      console.error("Failed to reset voice settings:", error)
    }
  }

  return {
    settings,
    updateSettings,
    resetSettings,
    isLoaded,
  }
}

export function formatHotkey(hotkey: HotkeyConfig | null): string {
  if (!hotkey) return "Not set"

  const parts: string[] = []
  if (hotkey.ctrlKey) parts.push("Ctrl")
  if (hotkey.altKey) parts.push("Alt")
  if (hotkey.shiftKey) parts.push("Shift")
  if (hotkey.metaKey) parts.push("Meta")

  let keyName = hotkey.key
  
  // Handle special key display names
  switch (hotkey.key) {
    case " ": keyName = "Space"; break
    case "Tab": keyName = "Tab"; break
    case "Enter": keyName = "Enter"; break
    case "Escape": keyName = "Esc"; break
    case "ArrowUp": keyName = "↑"; break
    case "ArrowDown": keyName = "↓"; break
    case "ArrowLeft": keyName = "←"; break
    case "ArrowRight": keyName = "→"; break
    case "Backspace": keyName = "Backspace"; break
    case "Delete": keyName = "Delete"; break
    case "Insert": keyName = "Insert"; break
    case "Home": keyName = "Home"; break
    case "End": keyName = "End"; break
    case "PageUp": keyName = "PageUp"; break
    case "PageDown": keyName = "PageDown"; break
    case "CapsLock": keyName = "CapsLock"; break
    case "NumLock": keyName = "NumLock"; break
    case "ScrollLock": keyName = "ScrollLock"; break
    case "Pause": keyName = "Pause"; break
    case "PrintScreen": keyName = "PrintScreen"; break
    default:
      if (hotkey.key.length === 1) keyName = hotkey.key.toUpperCase()
  }

  parts.push(keyName)
  return parts.join(" + ")
}

export function matchesHotkey(event: KeyboardEvent, hotkey: HotkeyConfig | null): boolean {
  if (!hotkey) return false

  return (
    event.key === hotkey.key &&
    event.ctrlKey === hotkey.ctrlKey &&
    event.shiftKey === hotkey.shiftKey &&
    event.altKey === hotkey.altKey &&
    event.metaKey === hotkey.metaKey
  )
}
