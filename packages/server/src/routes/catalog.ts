import { Hono } from "hono"
import { describeRoute } from "hono-openapi"
import { PluginInstaller, CapabilityRegistry } from "@projectflows/plugin"
import { RemoteEntitySource, RemoteRegistrySource } from "@projectflows/plugin/source"
import { WorkflowStorage } from "@projectflows/workflow/storage"
import { ToolRegistry } from "@projectflows/server/tool-registry"
import { Skill } from "@projectflows/skills/skill"
import { Agent } from "@projectflows/runtime/agent"
import { Instance } from "@projectflows/runtime/instance"
import { Config } from "@projectflows/config/config"
import { lazy } from "@projectflows/util/lazy"

const DEFAULT_REGISTRY_URL = "https://projectflows.ai"

export type CatalogState = "installed" | "available" | "local-only"

export type CatalogRecord = {
  id: string
  type: "agent" | "skill" | "tool" | "workflow" | "plugin"
  name: string
  description: string
  state: CatalogState
  version?: string
  pluginId?: string
  sourceGroup?: string
  scope?: "global" | "project"
  provided?: "core" | "entity"
}

async function buildEntityRecords(
  registryUrl: string,
  typeFilter?: string,
): Promise<CatalogRecord[]> {
  const capabilities = await CapabilityRegistry.load()
  const capByKey = new Map(capabilities.map((c) => [`${c.type}:${c.name}`, c]))

  const entityTypes = (["agent", "skill", "tool", "workflow"] as const).filter(
    (t) => !typeFilter || t === typeFilter,
  )

  const records: CatalogRecord[] = []

  for (const entityType of entityTypes) {
    const [remoteEntities, localItems] = await Promise.all([
      RemoteEntitySource.list(registryUrl, { type: entityType }).catch(() => []),
      loadLocal(entityType),
    ])

    const remoteById = new Map(remoteEntities.map((r) => [r.id, r]))
    const localIds = new Set(localItems.map((l) => l.id))

    // Local items — installed or local-only
    for (const local of localItems) {
      const remote = remoteById.get(local.id)
      const cap = capByKey.get(`${entityType}:${local.id}`) ?? capByKey.get(`${entityType}:${local.name}`)
      records.push({
        id: local.id,
        type: entityType,
        name: local.name,
        description: local.description,
        state: remote ? "installed" : "local-only",
        version: remote?.version,
        pluginId: cap?.pluginId ?? remote?.pluginId,
        sourceGroup: cap?.sourceGroup,
        scope: cap?.scope,
      })
    }

    // Remote-only items — available
    for (const remote of remoteEntities) {
      if (localIds.has(remote.id)) continue
      records.push({
        id: remote.id,
        type: entityType,
        name: remote.name,
        description: remote.description,
        state: "available",
        version: remote.version,
        pluginId: remote.pluginId,
      })
    }
  }

  return records
}

async function buildPluginRecords(registryUrl: string): Promise<CatalogRecord[]> {
  const [installed, remote] = await Promise.all([
    PluginInstaller.list().catch(() => []),
    RemoteRegistrySource.list(registryUrl).catch(() => []),
  ])

  const installedById = new Map(installed.map((p) => [p.pluginId, p]))
  const remoteById = new Map(remote.map((r) => [r.id, r]))
  const records: CatalogRecord[] = []

  // Installed plugins
  for (const p of installed) {
    const remoteEntry = remoteById.get(p.pluginId)
    records.push({
      id: p.pluginId,
      type: "plugin",
      name: remoteEntry?.name ?? p.pluginId,
      description: remoteEntry?.description ?? "",
      state: "installed",
      version: p.version,
      scope: p.scope,
      provided: remoteEntry?.provided,
    })
  }

  // Available (remote only)
  for (const r of remote) {
    if (installedById.has(r.id)) continue
    records.push({
      id: r.id,
      type: "plugin",
      name: r.name,
      description: r.description,
      state: "available",
      version: r.version,
      provided: r.provided,
    })
  }

  return records
}

type LocalItem = { id: string; name: string; description: string }

async function loadLocal(type: "agent" | "skill" | "tool" | "workflow"): Promise<LocalItem[]> {
  switch (type) {
    case "agent": {
      const agents = await Agent.list().catch(() => [])
      return agents.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description ?? "",
      }))
    }
    case "skill": {
      const skills = await Skill.all().catch(() => [])
      return skills.map((s) => ({
        id: s.name,
        name: s.name,
        description: s.description ?? "",
      }))
    }
    case "tool": {
      const tools = ToolRegistry.all()
      return tools.map((t) => ({
        id: t.id,
        name: t.id,
        description: "",
      }))
    }
    case "workflow": {
      const workflows = await WorkflowStorage.list(Instance.directory).catch(() => [])
      return workflows.map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description ?? "",
      }))
    }
  }
}

export const CatalogRoutes = lazy(() =>
  new Hono().get(
    "/",
    describeRoute({
      summary: "Unified catalog index — all entity types with install state and provenance",
      operationId: "catalog.list",
      responses: {
        200: { description: "Catalog records" },
      },
    }),
    async (c) => {
      const { searchParams } = new URL(c.req.url)
      const typeFilter = searchParams.get("type") ?? undefined
      const stateFilter = searchParams.get("state") ?? undefined
      const q = (searchParams.get("q") ?? "").toLowerCase()

      const cfg = await Config.get()
      const registryUrl = cfg.registry?.url ?? DEFAULT_REGISTRY_URL

      const [entityRecords, pluginRecords] = await Promise.all([
        typeFilter && typeFilter !== "plugin"
          ? buildEntityRecords(registryUrl, typeFilter)
          : typeFilter === "plugin"
          ? Promise.resolve([])
          : buildEntityRecords(registryUrl),
        !typeFilter || typeFilter === "plugin"
          ? buildPluginRecords(registryUrl)
          : Promise.resolve([]),
      ])

      let records = [...entityRecords, ...pluginRecords]

      if (stateFilter) {
        records = records.filter((r) => r.state === stateFilter)
      }

      if (q) {
        records = records.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.description.toLowerCase().includes(q) ||
            r.id.toLowerCase().includes(q),
        )
      }

      return c.json(records)
    },
  ),
)
