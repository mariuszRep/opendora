"use client"

import { useState, useRef, useCallback } from "react"
import { useVoiceSettings } from "./use-voice-settings"

export function useVoiceRecorder() {
  const { settings } = useVoiceSettings()
  // Ref so callbacks always read the current provider without stale closures
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // MediaRecorder path (openai-whisper / google-gemini)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Web Speech API path (browser-native)
  const recognitionRef = useRef<any | null>(null)
  const accumulatedTranscriptRef = useRef<string>("")

  const isSupported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    (typeof MediaRecorder !== "undefined" || !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition)

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      const provider = settingsRef.current.stt.provider

      if (provider === "browser-native") {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (!SpeechRecognition) {
          throw new Error("Browser speech recognition not available. Use Chrome/Edge or choose a different STT provider.")
        }
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = false
        recognition.lang = "en-US"
        accumulatedTranscriptRef.current = ""

        recognition.onresult = (event: any) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              accumulatedTranscriptRef.current += event.results[i][0].transcript + " "
            }
          }
        }

        recognitionRef.current = recognition
        recognition.start()
        setIsRecording(true)
        return
      }

      // MediaRecorder path
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("Audio recording is not supported in this browser")
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      console.error("Failed to start recording:", err)
    }
  }, [])

  const stopRecording = useCallback((): Promise<string> => {
    // Always read from ref — no stale closure
    const provider = settingsRef.current.stt.provider

    if (provider === "browser-native" && recognitionRef.current) {
      return new Promise((resolve) => {
        const recognition = recognitionRef.current!
        recognition.onend = () => {
          setIsRecording(false)
          const text = accumulatedTranscriptRef.current.trim()
          accumulatedTranscriptRef.current = ""
          recognitionRef.current = null
          resolve(text)
        }
        recognition.stop()
      })
    }

    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current
      if (!mediaRecorder || mediaRecorder.state === "inactive") {
        resolve("")
        return
      }

      mediaRecorder.onstop = async () => {
        setIsRecording(false)
        setIsTranscribing(true)

        const blob = new Blob(chunksRef.current, { type: "audio/webm" })
        mediaRecorder.stream.getTracks().forEach((track) => track.stop())

        try {
          const { opendora } = await import("@/lib/opendora")
          // Read from ref here too — ensures latest provider even mid-flight
          const currentProvider = settingsRef.current.stt.provider
          const sttProvider = currentProvider === "google-gemini" ? "google-gemini" : "openai-whisper"
          const result = await opendora.voice.stt(blob, { provider: sttProvider })
          setIsTranscribing(false)
          resolve(result.text || "")
        } catch (err) {
          console.error("Transcription error:", err)
          setIsTranscribing(false)
          resolve("")
        }
      }

      mediaRecorder.stop()
    })
  }, [])

  return {
    isSupported,
    isRecording,
    isTranscribing,
    error,
    startRecording,
    stopRecording,
  }
}
