import { Global } from "@projectflows/util/global"
import { Log } from "@projectflows/util/log"
import path from "path"
import * as Version from "@projectflows/util/version"
import { Flag } from "@projectflows/util/flag"
import { lazy } from "@projectflows/util/lazy"
import { Filesystem } from "@projectflows/util/filesystem"
import { ModelsDevSchema } from "./models-schema"

// Try to import bundled snapshot (generated at build time)
// Falls back to undefined in dev mode when snapshot doesn't exist
/* @ts-ignore */

export namespace ModelsDev {
  export const Model = ModelsDevSchema.Model
  export type Model = ModelsDevSchema.Model

  export const Provider = ModelsDevSchema.Provider
  export type Provider = ModelsDevSchema.Provider

  const log = Log.create({ service: "models.dev" })
  const filepath = path.join(Global.Path.cache, "models.json")

  function url() {
    return Flag.OPENCODE_MODELS_URL || "https://models.dev"
  }

  export const Data = lazy(async () => {
    const result = await Filesystem.readJson(Flag.OPENCODE_MODELS_PATH ?? filepath).catch(() => {})
    if (result) return result
    // @ts-ignore
    const snapshot = await import("./models-snapshot")
      .then((m) => m.snapshot as Record<string, unknown>)
      .catch(() => undefined)
    if (snapshot) return snapshot
    if (Flag.OPENCODE_DISABLE_MODELS_FETCH) return {}
    const json = await fetch(`${url()}/api.json`).then((x) => x.text())
    return JSON.parse(json)
  })

  export async function get() {
    const result = await Data()
    return result as Record<string, Provider>
  }

  export async function refresh() {
    const result = await fetch(`${url()}/api.json`, {
      headers: {
        "User-Agent": Version.USER_AGENT,
      },
      signal: AbortSignal.timeout(10 * 1000),
    }).catch((e) => {
      log.error("Failed to fetch models.dev", {
        error: e,
      })
    })
    if (result && result.ok) {
      const text = await result.text()
      await Filesystem.write(filepath, text)
      // Push parsed data directly into the lazy cache so the next get() is instant
      ModelsDev.Data.set(Promise.resolve(JSON.parse(text)))
    }
  }
}

if (!Flag.OPENCODE_DISABLE_MODELS_FETCH && !process.argv.includes("--get-yargs-completions")) {
  ModelsDev.refresh()
  setInterval(
    async () => {
      await ModelsDev.refresh()
    },
    60 * 1000 * 60,
  ).unref()
}
