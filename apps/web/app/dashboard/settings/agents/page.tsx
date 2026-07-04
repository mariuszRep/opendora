"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { BotIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { EntityCatalogSection } from "@/components/settings/entity-catalog-section"
import { mergeWithRemote } from "@/hooks/use-entity-catalog"
import { useOpendoraContext } from "@/app/dashboard/projectflows-context"
import { opendora, type RemoteEntity } from "@/lib/projectflows"
import type { CatalogFilter } from "@/components/settings/entity-catalog-section"

export default function SettingsAgentsPage() {
  const router = useRouter()
  const { allAgents } = useOpendoraContext()
  const [remoteAgents, setRemoteAgents] = useState<RemoteEntity[]>([])
  const [installing, setInstalling] = useState<string | null>(null)
  const [filter, setFilter] = useState<CatalogFilter>("all")
  const [search, setSearch] = useState("")

  useEffect(() => {
    opendora.entity.listAvailable({ type: "agent" }).then(setRemoteAgents).catch(() => {})
  }, [])

  async function handleInstall(id: string) {
    setInstalling(id)
    try {
      await opendora.entity.installRemote("agent", id)
      opendora.entity.listAvailable({ type: "agent" }).then(setRemoteAgents).catch(() => {})
    } finally {
      setInstalling(null)
    }
  }

  const items = useMemo(
    () =>
      mergeWithRemote(
        allAgents,
        remoteAgents,
        (a) => ({
          id: a._id,
          type: "agent" as const,
          name: a.name,
          description: a.description,
          indicator: (
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: a.color || "#6366f1" }}
            />
          ),
          onManage: () => router.push(`/dashboard/agents/${a._id}`),
          onDelete: async () => { await opendora.agent.remove(a._id) },
          onUninstall: async () => { await opendora.agent.remove(a._id) },
        }),
        "agent",
        handleInstall,
        installing,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allAgents, remoteAgents, installing],
  )

  return (
    <SettingsPageLayout
      title="Agents"
      headerAction={
        <Button onClick={() => router.push("/dashboard/agents/new")}>
          <PlusIcon className="mr-2 h-4 w-4" />
          New Agent
        </Button>
      }
    >
      <EntityCatalogSection
        icon={BotIcon}
        title="Agents"
        items={items}
        loading={false}
        filter={filter}
        onFilterChange={setFilter}
        search={search}
        onSearchChange={setSearch}
        sortFn={(a, b) => a.name.localeCompare(b.name)}
      />
    </SettingsPageLayout>
  )
}
