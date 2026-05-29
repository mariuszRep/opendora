"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  PlayIcon,
  Loader2Icon,
  Trash2Icon,
  WorkflowIcon,
  CodeIcon,
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
  const [view, setView] = useState<"flow" | "json">("flow")
  const [jsonText, setJsonText] = useState("")
  const [jsonError, setJsonError] = useState<string | null>(null)

  useEffect(() => {
    opendora.workflow
      .get(id)
      .then((w) => setWorkflow(w))
      .catch(() => router.replace("/dashboard/settings/workflows"))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (workflow && view === "json") {
      setJsonText(JSON.stringify(workflow, null, 2))
      setJsonError(null)
    }
  }, [view, workflow])

  async function handleSave(updated: Workflow) {
    const saved = await opendora.workflow.update(id, updated)
    setWorkflow(saved)
  }

  async function handleJsonSave() {
    try {
      const parsed = JSON.parse(jsonText)
      const saved = await opendora.workflow.update(id, parsed)
      setWorkflow(saved)
      setJsonError(null)
    } catch (e: any) {
      setJsonError(e?.message ?? "Invalid JSON")
    }
  }

  async function handleDelete() {
    await opendora.workflow.remove(id).catch(() => {})
    router.replace("/dashboard/settings/workflows")
  }

  function handleSessionCreated(sessionId: string, agentId: string) {
    // Pass the agent id as a hint so the agent tab updates eagerly even before
    // the new worker session arrives via SSE. We must NOT call ctx.selectAgent
    // here: that picks an *existing* session for the agent (active/remembered/
    // first), which would briefly select an unrelated past session and flicker
    // its messages into view before the workflow's session is selected.
    ctx.selectSession(sessionId, agentId)
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
          <div className="flex items-center rounded-md border bg-muted/40 p-0.5">
            <Button
              variant={view === "flow" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={() => setView("flow")}
            >
              <WorkflowIcon className="size-3.5" />
              Flow
            </Button>
            <Button
              variant={view === "json" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs"
              onClick={() => setView("json")}
            >
              <CodeIcon className="size-3.5" />
              JSON
            </Button>
          </div>

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
      {view === "flow" ? (
        <WorkflowEditor
          workflow={workflow}
          onSave={handleSave}
        />
      ) : (
        <div className="flex flex-col gap-2 p-4 h-full">
          <textarea
            className="flex-1 min-h-[60vh] w-full rounded-md border bg-muted/30 p-3 font-mono text-xs text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            value={jsonText}
            onChange={(e) => { setJsonText(e.target.value); setJsonError(null) }}
            spellCheck={false}
          />
          {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
          <div className="flex justify-end">
            <Button size="sm" onClick={handleJsonSave}>Save JSON</Button>
          </div>
        </div>
      )}

      <RunDialog
        workflow={workflow}
        open={runOpen}
        onOpenChange={setRunOpen}
        onSessionCreated={handleSessionCreated}
      />
    </SettingsPageLayout>
  )
}
