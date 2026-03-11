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
