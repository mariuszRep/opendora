"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  PlayIcon,
  Loader2Icon,
  Trash2Icon,
} from "lucide-react"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { Button } from "@/components/ui/button"
import { WorkflowEditor } from "@/components/workflow/workflow-editor"
import { RunDialog } from "@/components/workflow/run-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { opendora, type Workflow } from "@/lib/opendora"
import { useOpendoraContext } from "@/app/dashboard/opendora-context"

export default function WorkflowEditorPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const ctx = useOpendoraContext()

  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [loading, setLoading] = useState(true)
  const [runOpen, setRunOpen] = useState(false)

  useEffect(() => {
    opendora.workflow
      .get(id)
      .then((w) => setWorkflow(w))
      .catch(() => router.replace("/dashboard/settings/workflows"))
      .finally(() => setLoading(false))
  }, [id])

  async function handleSave(updated: Workflow) {
    const saved = await opendora.workflow.update(id, updated)
    setWorkflow(saved)
  }

  async function handleDelete() {
    await opendora.workflow.remove(id).catch(() => {})
    router.replace("/dashboard/settings/workflows")
  }

  function handleSessionCreated(sessionId: string) {
    ctx.selectSession(sessionId)
    router.push("/dashboard")
  }

  if (loading) {
    return (
      <SettingsPageLayout
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Workflows", href: "/dashboard/settings/workflows" },
          { label: "…" },
        ]}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </div>
      </SettingsPageLayout>
    )
  }

  if (!workflow) return null

  return (
    <SettingsPageLayout
      flush
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Settings", href: "/dashboard/settings" },
        { label: "Workflows", href: "/dashboard/settings/workflows" },
        { label: workflow.name },
      ]}
      headerAction={
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                <Trash2Icon className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete workflow</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete &quot;{workflow.name}&quot;. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button size="sm" onClick={() => setRunOpen(true)}>
            <PlayIcon className="size-4" />
            Run
          </Button>
        </div>
      }
    >
      <WorkflowEditor
        workflow={workflow}
        onSave={handleSave}
      />

      <RunDialog
        workflow={workflow}
        open={runOpen}
        onOpenChange={setRunOpen}
        onSessionCreated={handleSessionCreated}
      />
    </SettingsPageLayout>
  )
}
