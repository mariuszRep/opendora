"use client"

import { useState, useRef, useCallback } from "react"

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const isSupported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia

  const startRecording = useCallback(async () => {
    try {
      setError(null)

      if (!isSupported) {
        const reason =
          typeof window === "undefined"
            ? "Not running in a browser context (SSR)"
            : !navigator.mediaDevices?.getUserMedia
              ? "getUserMedia is unavailable (often due to non-HTTPS / insecure context, or a restricted browser environment)"
              : typeof MediaRecorder === "undefined"
                ? "MediaRecorder is unavailable in this browser"
                : "Audio recording is not supported"

        throw new Error(reason)
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
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      console.error("Failed to start recording:", err)
    }
  }, [isSupported])

  const stopRecording = useCallback((): Promise<string> => {
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

        // Stop all tracks
        mediaRecorder.stream.getTracks().forEach((track) => track.stop())

        try {
          const { opendora } = await import("@/lib/opendora")
          const result = await opendora.voice.stt(blob)
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
