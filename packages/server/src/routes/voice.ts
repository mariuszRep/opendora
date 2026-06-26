import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Auth } from "@projectflows/auth"
import { errors } from "../error"
import { lazy } from "@projectflows/util/lazy"

function pcmToWav(pcmBuffer: ArrayBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): ArrayBuffer {
  const dataSize = pcmBuffer.byteLength
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeStr(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, "WAVE")
  writeStr(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, (sampleRate * numChannels * bitsPerSample) / 8, true)
  view.setUint16(32, (numChannels * bitsPerSample) / 8, true)
  view.setUint16(34, bitsPerSample, true)
  writeStr(36, "data")
  view.setUint32(40, dataSize, true)
  new Uint8Array(buffer, 44).set(new Uint8Array(pcmBuffer))
  return buffer
}

export const VoiceRoutes = lazy(() =>
  new Hono()
    .post(
      "/stt",
      describeRoute({
        summary: "Speech-to-text transcription",
        description: "Transcribe audio to text using OpenAI Whisper or Google Gemini",
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
          const provider = (formData.get("provider") as string) || "openai-whisper"

          if (!audio || !(audio instanceof Blob)) {
            return c.json({ error: "Audio file is required" }, { status: 400 })
          }

          if (audio.size < 1024) {
            return c.json(
              { error: `Recording too short (${audio.size} bytes). Please record at least half a second of audio.` },
              { status: 400 },
            )
          }

          if (provider === "local-whisper") {
            const config = await Auth.get("local-whisper")
            if (!config || config.type !== "url" || !config.url) {
              return c.json(
                { error: "Local Whisper server URL not configured. Please add it via: Settings → Voice → Speech-to-Text → Local Whisper Server URL" },
                { status: 401 },
              )
            }

            const whisperForm = new FormData()
            whisperForm.append("file", audio, "recording.webm")

            const headers: Record<string, string> = {}
            if (config.key) headers["Authorization"] = `Bearer ${config.key}`

            const response = await fetch(`${config.url.replace(/\/$/, "")}/v1/audio/transcriptions`, {
              method: "POST",
              headers,
              body: whisperForm,
            })

            if (!response.ok) {
              const errorText = await response.text()
              console.error("Local Whisper STT error:", errorText)
              return c.json({ error: "Local Whisper transcription failed" }, { status: response.status as any })
            }

            const result = await response.json() as any
            return c.json({ text: result.text })
          }

          if (provider === "google-gemini") {
            const auth = await Auth.get("google")
            if (!auth || auth.type !== "api") {
              return c.json(
                { error: "Google API key required for Gemini voice features. Please add an API key via: Settings → Providers → Google → Manually enter API Key" },
                { status: 401 },
              )
            }

            const audioBase64 = Buffer.from(await audio.arrayBuffer()).toString("base64")
            const mimeType = audio.type || "audio/webm"

            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${auth.key}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{
                    parts: [
                      { text: "Transcribe the following audio accurately. Return only the transcription text, nothing else." },
                      { inlineData: { mimeType, data: audioBase64 } },
                    ],
                  }],
                }),
              },
            )

            if (!response.ok) {
              const errorText = await response.text()
              console.error("Gemini STT API error:", errorText)
              return c.json({ error: "Transcription failed" }, { status: response.status as any })
            }

            const result = await response.json() as any
            const text = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
            return c.json({ text: text.trim() })
          }

          // Default: OpenAI Whisper
          const auth = await Auth.get("openai")
          console.log("[STT] Auth result:", auth ? { type: auth.type, hasKey: !!(auth as any).key } : null)

          if (!auth || auth.type !== "api") {
            return c.json(
              { error: "OpenAI API key required for voice features. OAuth Codex tokens don't have voice permissions. Please add an API key via: Settings → Providers → OpenAI → Manually enter API Key" },
              { status: 401 },
            )
          }

          const openaiFormData = new FormData()
          openaiFormData.append("file", audio, "recording.webm")
          openaiFormData.append("model", "whisper-1")

          const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${auth.key}` },
            body: openaiFormData,
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error("OpenAI Whisper API error:", errorText)
            return c.json({ error: "Transcription failed" }, { status: response.status as any })
          }

          const result = await response.json() as any
          return c.json({ text: result.text })
        } catch (error) {
          console.error("STT route error:", error)
          return c.json({ error: "Internal server error" }, { status: 500 })
        }
      },
    )
    .post(
      "/tts",
      describeRoute({
        summary: "Text-to-speech synthesis",
        description: "Convert text to speech using OpenAI TTS or Google Gemini",
        operationId: "voice.tts",
        responses: {
          200: {
            description: "Audio stream",
            content: {
              "audio/mpeg": { schema: { type: "string", format: "binary" } },
              "audio/wav": { schema: { type: "string", format: "binary" } },
            },
          },
          ...errors(400, 500),
        },
      }),
      validator(
        "json",
        z.object({
          text: z.string(),
          provider: z.enum(["openai", "google-gemini"]).optional(),
          // OpenAI options
          voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional(),
          model: z.enum(["tts-1", "tts-1-hd"]).optional(),
          speed: z.number().min(0.25).max(4.0).optional(),
          // Gemini options
          geminiVoice: z.string().optional(),
          geminiModel: z.string().optional(),
        }),
      ),
      async (c) => {
        try {
          const {
            text,
            provider = "openai",
            voice = "alloy",
            model = "tts-1",
            speed = 1.0,
            geminiVoice = "Kore",
            geminiModel = "gemini-3.1-flash-tts-preview",
          } = c.req.valid("json")

          if (!text || typeof text !== "string") {
            return c.json({ error: "Text is required" }, { status: 400 })
          }

          if (provider === "google-gemini") {
            const auth = await Auth.get("google")
            console.log("[TTS] Gemini auth result:", auth ? { type: auth.type, hasKey: !!(auth as any).key } : null)

            if (!auth || auth.type !== "api") {
              return c.json(
                { error: "Google API key required for Gemini voice features. Please add an API key via: Settings → Providers → Google → Manually enter API Key" },
                { status: 401 },
              )
            }

            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${auth.key}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: text.slice(0, 5000) }] }],
                  generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: {
                      voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: geminiVoice },
                      },
                    },
                  },
                }),
              },
            )

            if (!response.ok) {
              const errorText = await response.text()
              console.error("Gemini TTS API error:", errorText)
              return c.json({ error: "Text-to-speech generation failed" }, { status: response.status as any })
            }

            const result = await response.json() as any
            const part = result?.candidates?.[0]?.content?.parts?.[0]
            if (!part?.inlineData?.data) {
              return c.json({ error: "No audio data in Gemini response" }, { status: 500 })
            }

            const pcmBuffer = Buffer.from(part.inlineData.data, "base64")
            const wavBuffer = pcmToWav(pcmBuffer.buffer.slice(pcmBuffer.byteOffset, pcmBuffer.byteOffset + pcmBuffer.byteLength) as ArrayBuffer)

            return new Response(wavBuffer, {
              headers: { "Content-Type": "audio/wav" },
            })
          }

          // Default: OpenAI TTS
          const auth = await Auth.get("openai")
          console.log("[TTS] Auth result:", auth ? { type: auth.type, hasKey: !!(auth as any).key } : null)

          if (!auth || auth.type !== "api") {
            return c.json(
              { error: "OpenAI API key required for voice features. OAuth Codex tokens don't have voice permissions. Please add an API key via: Settings → Providers → OpenAI → Manually enter API Key" },
              { status: 401 },
            )
          }

          const response = await fetch("https://api.openai.com/v1/audio/speech", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${auth.key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              input: text.slice(0, 4096),
              voice,
              speed: Math.max(0.25, Math.min(4.0, speed)),
              response_format: "mp3",
            }),
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error("OpenAI TTS API error:", errorText)
            return c.json({ error: "Text-to-speech generation failed" }, { status: response.status as any })
          }

          return new Response(response.body, {
            headers: { "Content-Type": "audio/mpeg" },
          })
        } catch (error) {
          console.error("TTS route error:", error)
          return c.json({ error: "Internal server error" }, { status: 500 })
        }
      },
    ),
)
