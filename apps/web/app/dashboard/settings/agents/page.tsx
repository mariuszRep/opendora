"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { BotIcon, EyeOffIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { EntityCatalogSection } from "@/components/settings/entity-catalog-section"
import { RegistryPluginsSection } from "@/components/settings/registry-plugins-section"
import { useOpendoraContext } from "@/app/dashboard/projectflows-context"
import type { Agent } from "@/lib/projectflows"

export default function SettingsAgentsPage() {
  const router = useRouter()
  const { allAgents } = useOpendoraContext()
  const [search, setSearch] = useState("")

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
      <div className="flex flex-col gap-6">
        <EntityCatalogSection
          icon={BotIcon}
          title="Agents"
          items={allAgents}
          loading={false}
          search={search}
          onSearchChange={setSearch}
          toEntityItem={(a: Agent) => ({
            key: a.name,
            name: a.name,
            description: a.description,
            indicator: (
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: a.color || "#6366f1" }}
              />
            ),
            action: a.hidden ? <EyeOffIcon className="size-3 text-muted-foreground" /> : undefined,
            onClick: () => router.push(`/dashboard/agents/${(a as any)._id || a.name}`),
          })}
          filterFn={(a: Agent, q: string) => {
            const lq = q.toLowerCase()
            return (
              a.name.toLowerCase().includes(lq) ||
              (a.description?.toLowerCase().includes(lq) ?? false) ||
              (a.mode?.toLowerCase().includes(lq) ?? false)
            )
          }}
          sortFn={(a: Agent, b: Agent) => a.name.localeCompare(b.name)}
        />
        <div className="border-t pt-6">
          <RegistryPluginsSection category="agents" onInstalled={() => router.refresh()} />
        </div>
      </div>
    </SettingsPageLayout>
  )
}
