"use client"

import { useState, useRef, useCallback } from "react"
import { useVoiceSettings } from "./use-voice-settings"

export function useTextToSpeech() {
  const { settings } = useVoiceSettings()
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      if (audioRef.current.src) {
        URL.revokeObjectURL(audioRef.current.src)
      }
      audioRef.current = null
    }
    setPlayingId(null)
    setIsLoading(false)
  }, [])

  const speak = useCallback(
    async (text: string, messageId: string) => {
      // If TTS is disabled, do nothing
      if (settings.tts.provider === "disabled") {
        return
      }

      // If already playing this message, stop it
      if (playingId === messageId) {
        stop()
        return
      }

      // Stop any currently playing audio
      stop()

      setIsLoading(true)
      setPlayingId(messageId)

      try {
        setError(null)
        const { opendora } = await import("@/lib/opendora")
        const blob = await opendora.voice.tts({
          text,
          voice: settings.tts.voice,
          model: settings.tts.openaiModel,
          speed: settings.tts.speed,
        })
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio

        audio.onended = () => {
          URL.revokeObjectURL(url)
          audioRef.current = null
          setPlayingId(null)
          setIsLoading(false)
        }

        audio.onerror = () => {
          URL.revokeObjectURL(url)
          audioRef.current = null
          setPlayingId(null)
          setIsLoading(false)
          setError("Audio playback failed")
        }

        await audio.play()
        setIsLoading(false)
      } catch (err) {
        const message = err instanceof Error ? err.message : "TTS failed"
        setError(message)
        setPlayingId(null)
        setIsLoading(false)
      }
    },
    [settings.tts, playingId, stop]
  )

  return {
    speak,
    stop,
    playingId,
    isLoading,
    error,
    isEnabled: settings.tts.provider !== "disabled",
  }
}
