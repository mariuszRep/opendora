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
    if (typeof window !== "undefined" && window.speechSynthesis?.speaking) {
      window.speechSynthesis.cancel()
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

        if (settings.tts.provider === "browser-native") {
          if (typeof window === "undefined" || !window.speechSynthesis) {
            throw new Error("Browser TTS not supported")
          }
          window.speechSynthesis.cancel()
          const utterance = new SpeechSynthesisUtterance(text)
          utterance.onend = () => {
            setPlayingId(null)
            setIsLoading(false)
          }
          utterance.onerror = () => {
            setPlayingId(null)
            setIsLoading(false)
            setError("Browser TTS failed")
          }
          window.speechSynthesis.speak(utterance)
          setIsLoading(false)
          return
        }

        const { opendora } = await import("@/lib/projectflows")
        const blob = await opendora.voice.tts({
          text,
          provider: settings.tts.provider === "google-gemini" ? "google-gemini" : "openai",
          voice: settings.tts.voice,
          model: settings.tts.openaiModel,
          speed: settings.tts.speed,
          geminiVoice: settings.tts.geminiVoice,
          geminiModel: settings.tts.geminiModel,
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
