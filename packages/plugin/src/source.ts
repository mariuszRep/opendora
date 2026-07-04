import fs from "fs/promises"
import os from "os"
import path from "path"
import { Plugin } from "./manifest.js"

export interface PluginPackage {
  manifest: Plugin.Manifest
  sourcePath: string
}

export interface PluginSource {
  fetch(uri: string): Promise<PluginPackage>
}

export class LocalPathSource implements PluginSource {
  async fetch(uri: string): Promise<PluginPackage> {
    const manifestPath = path.join(uri, "manifest.json")
    let raw: unknown
    try {
      raw = JSON.parse(await fs.readFile(manifestPath, "utf-8"))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`Cannot read manifest at ${manifestPath}: ${msg}`)
    }
    return { manifest: Plugin.validate(raw), sourcePath: uri }
  }
}

export type RemotePlugin = {
  id: string
  name: string
  description: string
  version: string
  download: string
  category: string
  tags: string[]
  status: string
  capabilities: { type: string; name: string; sourceGroup?: string }[]
}

export namespace RemoteRegistrySource {
  export async function list(baseUrl: string, opts?: { category?: string; q?: string }): Promise<RemotePlugin[]> {
    const url = new URL("/api/plugins", baseUrl)
    if (opts?.category) url.searchParams.set("category", opts.category)
    if (opts?.q) url.searchParams.set("q", opts.q)

    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`Registry request failed: ${res.status} ${res.statusText}`)
    return res.json() as Promise<RemotePlugin[]>
  }

  export async function get(baseUrl: string, pluginId: string): Promise<RemotePlugin | null> {
    const url = new URL(`/api/plugins/${encodeURIComponent(pluginId)}`, baseUrl)
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Registry request failed: ${res.status} ${res.statusText}`)
    return res.json() as Promise<RemotePlugin>
  }

  // Downloads a plugin zip from the registry and extracts it to a temp directory.
  // Returns the path to the extracted plugin directory (caller is responsible for cleanup).
  export async function downloadAndExtract(baseUrl: string, pluginId: string): Promise<string> {
    const plugin = await get(baseUrl, pluginId)
    if (!plugin) throw new Error(`Plugin not found in registry: ${pluginId}`)

    const downloadUrl = new URL(plugin.download, baseUrl).toString()
    const res = await fetch(downloadUrl, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`)

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `pf-plugin-${pluginId}-`))
    const zipPath = path.join(tmpDir, `${pluginId}.zip`)

    const buf = await res.arrayBuffer()
    await fs.writeFile(zipPath, Buffer.from(buf))

    const extractDir = path.join(tmpDir, "extracted")
    await fs.mkdir(extractDir, { recursive: true })

    const proc = Bun.spawnSync(["unzip", "-q", zipPath, "-d", extractDir])
    if (proc.exitCode !== 0) {
      await fs.rm(tmpDir, { recursive: true, force: true })
      throw new Error(`Failed to unzip plugin: ${new TextDecoder().decode(proc.stderr)}`)
    }

    await fs.rm(zipPath)
    return extractDir
  }
}

export type RemoteEntity = {
  id: string
  name: string
  description: string
  type: "agent" | "skill" | "tool" | "workflow"
  pluginId: string
  version: string
  download: string
  tags: string[]
  dependencies: string[]
}

export namespace RemoteEntitySource {
  export async function list(
    baseUrl: string,
    opts?: { type?: string; q?: string; pluginId?: string },
  ): Promise<RemoteEntity[]> {
    const url = new URL("/api/entities", baseUrl)
    if (opts?.type) url.searchParams.set("type", opts.type)
    if (opts?.q) url.searchParams.set("q", opts.q)
    if (opts?.pluginId) url.searchParams.set("pluginId", opts.pluginId)
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) throw new Error(`Entity registry request failed: ${res.status} ${res.statusText}`)
    return res.json() as Promise<RemoteEntity[]>
  }

  export async function get(baseUrl: string, type: string, name: string): Promise<RemoteEntity | null> {
    const url = new URL(`/api/entities/${encodeURIComponent(type)}/${encodeURIComponent(name)}`, baseUrl)
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Registry request failed: ${res.status} ${res.statusText}`)
    return res.json() as Promise<RemoteEntity>
  }

  // Downloads an entity zip and extracts to a temp dir. Returns extract path (caller cleans up).
  export async function downloadAndExtract(baseUrl: string, type: string, name: string): Promise<string> {
    const entity = await get(baseUrl, type, name)
    if (!entity) throw new Error(`Entity not found in registry: ${type}/${name}`)

    const downloadUrl = new URL(entity.download, baseUrl).toString()
    const res = await fetch(downloadUrl, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`Download failed: ${res.status} ${res.statusText}`)

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `pf-entity-${type}-${name}-`))
    const zipPath = path.join(tmpDir, `${name}.zip`)

    const buf = await res.arrayBuffer()
    await fs.writeFile(zipPath, Buffer.from(buf))

    const extractDir = path.join(tmpDir, "extracted")
    await fs.mkdir(extractDir, { recursive: true })

    const proc = Bun.spawnSync(["unzip", "-q", zipPath, "-d", extractDir])
    if (proc.exitCode !== 0) {
      await fs.rm(tmpDir, { recursive: true, force: true })
      throw new Error(`Failed to unzip entity: ${new TextDecoder().decode(proc.stderr)}`)
    }

    await fs.rm(zipPath)
    return extractDir
  }
}
