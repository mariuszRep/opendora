import { Hono } from "hono"
import fs from "fs/promises"
import { existsSync, readFileSync } from "fs"
import path from "path"
import { Global } from "@opendora/util/global"
import { lazy } from "@opendora/util/lazy"

type VoiceSettings = {
  stt: { provider: string; openaiModel?: string }
  tts: { provider: string; openaiModel?: string; voice?: string; speed?: number }
  pushToTalk: {
    enabled: boolean
    hotkey: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean } | null
  }
}

type GeneralSettings = {
  theme?: string
  timezone?: string
  voice?: VoiceSettings
}

const DEFAULT: GeneralSettings = {
  theme: "system",
  timezone: "UTC",
  voice: {
    stt: { provider: "openai-whisper", openaiModel: "whisper-1" },
    tts: { provider: "openai", openaiModel: "tts-1", voice: "alloy", speed: 1.0 },
    pushToTalk: {
      enabled: true,
      hotkey: { key: " ", ctrlKey: true, shiftKey: false, altKey: false, metaKey: false },
    },
  },
}

function generalDir() {
  return path.join(Global.Path.config, "general")
}

function filePath() {
  return path.join(generalDir(), "general.json")
}

async function readGeneral(): Promise<GeneralSettings> {
  try {
    const text = await fs.readFile(filePath(), "utf8")
    return deepMerge(DEFAULT, JSON.parse(text))
  } catch {
    return { ...DEFAULT }
  }
}

async function writeGeneral(data: GeneralSettings): Promise<void> {
  await fs.mkdir(generalDir(), { recursive: true })
  await fs.writeFile(filePath(), JSON.stringify(data, null, 2))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge(target: any, source: any): any {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] !== null &&
      typeof target[key] === "object"
    ) {
      result[key] = deepMerge(target[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

export function getGlobalTimezone(): string {
  try {
    const p = filePath()
    if (!existsSync(p)) return "UTC"
    const raw = JSON.parse(readFileSync(p, "utf8"))
    return raw.timezone || "UTC"
  } catch {
    return "UTC"
  }
}

export const GeneralRoutes = lazy(() =>
  new Hono()
    .get("/", async (c) => {
      return c.json(await readGeneral())
    })
    .patch("/", async (c) => {
      const patch = await c.req.json<Partial<GeneralSettings>>()
      const current = await readGeneral()
      const updated = deepMerge(current, patch)
      await writeGeneral(updated)
      return c.json(updated)
    }),
)
