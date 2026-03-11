import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Auth } from "../../auth"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { NamedError } from "@opencode-ai/util/error"

export const VoiceRoutes = lazy(() =>
  new Hono()
    .post(
      "/stt",
      describeRoute({
        summary: "Speech-to-text transcription",
        description: "Transcribe audio to text using OpenAI Whisper API",
        operationId: "voice.stt",
        responses: {
          200: {
            description: "Transcription result",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    text: z.string(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 500),
        },
      }),
      async (c) => {
        try {
          const formData = await c.req.formData()
          const audio = formData.get("audio")

          if (!audio || !(audio instanceof Blob)) {
            return c.json({ error: "Audio file is required" }, { status: 400 })
          }

          // Get OpenAI credentials from auth system
          // Voice APIs (Whisper/TTS) ONLY work with API key, NOT OAuth Codex tokens
          const auth = await Auth.get("openai")
          console.log("[STT] Auth result:", auth ? { type: auth.type, hasKey: !!(auth as any).key } : null)

          if (!auth || auth.type !== "api") {
            return c.json(
              { error: "OpenAI API key required for voice features. OAuth Codex tokens don't have voice permissions. Please add an API key via: Settings → Providers → OpenAI → Manually enter API Key" },
              { status: 401 }
            )
          }

          const apiKey = auth.key

          // Prepare form data for OpenAI Whisper API
          const openaiFormData = new FormData()
          openaiFormData.append("file", audio, "recording.webm")
          openaiFormData.append("model", "whisper-1")

          // Call OpenAI Whisper API
          const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
            body: openaiFormData,
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error("OpenAI Whisper API error:", errorText)
            return c.json(
              { error: "Transcription failed" },
              { status: response.status }
            )
          }

          const result = await response.json()
          return c.json({ text: result.text })
        } catch (error) {
          console.error("STT route error:", error)
          return c.json(
            { error: "Internal server error" },
            { status: 500 }
          )
        }
      }
    )
    .post(
      "/tts",
      describeRoute({
        summary: "Text-to-speech synthesis",
        description: "Convert text to speech using OpenAI TTS API",
        operationId: "voice.tts",
        responses: {
          200: {
            description: "Audio stream",
            content: {
              "audio/mpeg": {
                schema: {
                  type: "string",
                  format: "binary",
                },
              },
            },
          },
          ...errors(400, 500),
        },
      }),
      validator(
        "json",
        z.object({
          text: z.string(),
          voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional(),
          model: z.enum(["tts-1", "tts-1-hd"]).optional(),
          speed: z.number().min(0.25).max(4.0).optional(),
        })
      ),
      async (c) => {
        try {
          const { text, voice = "alloy", model = "tts-1", speed = 1.0 } = c.req.valid("json")

          if (!text || typeof text !== "string") {
            return c.json({ error: "Text is required" }, { status: 400 })
          }

          // Get OpenAI credentials from auth system
          // Voice APIs (Whisper/TTS) ONLY work with API key, NOT OAuth Codex tokens
          const auth = await Auth.get("openai")
          console.log("[TTS] Auth result:", auth ? { type: auth.type, hasKey: !!(auth as any).key } : null)

          if (!auth || auth.type !== "api") {
            return c.json(
              { error: "OpenAI API key required for voice features. OAuth Codex tokens don't have voice permissions. Please add an API key via: Settings → Providers → OpenAI → Manually enter API Key" },
              { status: 401 }
            )
          }

          const apiKey = auth.key

          // Call OpenAI TTS API
          const response = await fetch("https://api.openai.com/v1/audio/speech", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              input: text.slice(0, 4096), // OpenAI limit
              voice,
              speed: Math.max(0.25, Math.min(4.0, speed)), // Clamp to valid range
              response_format: "mp3",
            }),
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error("OpenAI TTS API error:", errorText)
            return c.json(
              { error: "Text-to-speech generation failed" },
              { status: response.status }
            )
          }

          // Stream the audio back to the client
          return new Response(response.body, {
            headers: {
              "Content-Type": "audio/mpeg",
            },
          })
        } catch (error) {
          console.error("TTS route error:", error)
          return c.json(
            { error: "Internal server error" },
            { status: 500 }
          )
        }
      }
    )
)
