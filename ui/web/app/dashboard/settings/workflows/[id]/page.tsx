"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  PlayIcon,
  SaveIcon,
  CheckIcon,
  Loader2Icon,
  Trash2Icon,
} from "lucide-react"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { WorkflowCanvas } from "@/components/workflow/canvas"
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
  const [jsonText, setJsonText] = useState("")
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [runOpen, setRunOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("canvas")
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    opendora.workflow
      .get(id)
      .then((w) => {
        setWorkflow(w)
        setJsonText(JSON.stringify(w, null, 2))
      })
      .catch(() => router.replace("/dashboard/settings/workflows"))
      .finally(() => setLoading(false))
  }, [id])

  function handleJsonChange(text: string) {
    setJsonText(text)
    try {
      const parsed = JSON.parse(text)
      setWorkflow(parsed as Workflow)
      setJsonError(null)
    } catch {
      setJsonError("Invalid JSON")
    }
  }

  async function handleSave() {
    if (!workflow || jsonError) return
    setSaving(true)
    try {
      const updated = await opendora.workflow.update(id, workflow)
      setWorkflow(updated)
      setJsonText(JSON.stringify(updated, null, 2))
      setJsonError(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setJsonError(e?.message ?? "Failed to save")
    } finally {
      setSaving(false)
    }
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
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={saving || !!jsonError}
          >
            {saving ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : saved ? (
              <CheckIcon className="size-4 text-green-500" />
            ) : (
              <SaveIcon className="size-4" />
            )}
            Save
          </Button>

          <Button size="sm" onClick={() => setRunOpen(true)}>
            <PlayIcon className="size-4" />
            Run
          </Button>
        </div>
      }
    >
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-fit">
          <TabsTrigger value="canvas">Canvas</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="canvas" className="mt-4 rounded-xl border overflow-hidden">
          <WorkflowCanvas workflow={workflow} height={560} />
        </TabsContent>

        <TabsContent value="json" className="flex-1 mt-4">
          <div className="relative font-mono text-sm rounded-xl border overflow-hidden" style={{ minHeight: 500 }}>
            <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
              <span className="text-xs text-muted-foreground">{workflow.id}.json</span>
              {jsonError && <span className="text-xs text-destructive">{jsonError}</span>}
            </div>
            <textarea
              ref={textareaRef}
              className="w-full resize-none bg-background p-4 outline-none font-mono text-sm leading-relaxed"
              style={{ minHeight: 460 }}
              value={jsonText}
              onChange={(e) => handleJsonChange(e.target.value)}
              spellCheck={false}
            />
          </div>
        </TabsContent>
      </Tabs>

      <RunDialog
        workflow={workflow}
        open={runOpen}
        onOpenChange={setRunOpen}
        onSessionCreated={handleSessionCreated}
      />
    </SettingsPageLayout>
  )
}
