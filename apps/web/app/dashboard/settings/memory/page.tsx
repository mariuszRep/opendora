"use client"

import { BrainIcon } from "lucide-react"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { useOpendoraContext } from "@/app/dashboard/projectflows-context"
import { MemoryBrowser } from "@/components/memory/memory-browser"

export default function MemorySettingsPage() {
  const { sessions, agents } = useOpendoraContext()
  const directory = sessions[0]?.directory ?? null

  return (
    <SettingsPageLayout title="Memory">
      {directory ? (
        <MemoryBrowser directory={directory} agents={agents} />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-muted-foreground">
          <BrainIcon className="size-8 opacity-30" />
          <p className="text-sm">No active sessions</p>
          <p className="text-xs text-muted-foreground/70">Start a session to manage memories for this project.</p>
        </div>
      )}
    </SettingsPageLayout>
  )
}
