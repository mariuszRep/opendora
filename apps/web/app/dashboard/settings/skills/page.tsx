"use client"

import { useEffect, useRef, useState } from "react"
import { BookOpenIcon, SearchIcon, MapPinIcon, XIcon, SaveIcon, CheckIcon, WrenchIcon, ChevronDownIcon } from "lucide-react"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { SettingsCard } from "@/components/settings/settings-card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { MessageResponse } from "@/components/ai-elements/message"
import { CodeViewToggle } from "@/components/ui/code-view-toggle"
import { opendora, type Skill } from "@/lib/projectflows"
import { useToolSchemas } from "@/hooks/use-tool-schemas"
import { HIDDEN_TOOLS } from "@/lib/tool-groups"

function originFromLocation(location: string): string {
  if (location.includes("anthropic")) return "anthropic"
  if (location.includes("vercel")) return "vercel"
  if (location.includes("github")) return "github"
  if (location.includes("clawhub")) return "clawhub"
  if (location.includes(".projectflows")) return "projectflows"
  return "local"
}

const ORIGIN_COLORS: Record<string, string> = {
  anthropic: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  vercel: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  github: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  clawhub: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  projectflows: "bg-primary/10 text-primary",
  local: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
}

// ── CodeEditorTextarea ─────────────────────────────────────────────────────
// Visually matches the existing CodeBlock component:
//   p-4  |  w-8 line-num  |  mr-4 gap  |  code text
// The line-number column is 48px (w-12 = 16px pl + 32px content, text-right).
// The gap div is 16px (matching before:mr-4).
// The textarea starts with no left padding — code text at the same x as CodeBlock.
// Both use font-mono text-sm with line-height 1.25rem.

function CodeEditorTextarea({
  value,
  onChange,
  onKeyDown,
  innerRef,
}: {
  value: string
  onChange: (v: string) => void
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>
  innerRef: React.RefObject<HTMLTextAreaElement | null>
}) {
  const lineNumsRef = useRef<HTMLDivElement>(null)
  const lines = value.split("\n")

  function syncScroll() {
    if (lineNumsRef.current && innerRef.current) {
      lineNumsRef.current.scrollTop = innerRef.current.scrollTop
    }
  }

  return (
    <div className="flex h-full font-mono text-sm dark:bg-[#0d1117] bg-white">
      {/* Line numbers — w-12 (48px) with pl-4 leaves 32px (=w-8) for the number text */}
      <div
        ref={lineNumsRef}
        aria-hidden
        className="shrink-0 select-none pt-4 pl-4 w-12 text-right overflow-y-scroll [&::-webkit-scrollbar]:hidden"
        style={{ lineHeight: "1.25rem", scrollbarWidth: "none" }}
      >
        {lines.map((_, i) => (
          <div key={i} className="dark:text-[#6e7681] text-[#8c959f]" style={{ lineHeight: "1.25rem" }}>
            {i + 1}
          </div>
        ))}
      </div>

      {/* Gap — 16px matching before:mr-4 in the original CodeBlock */}
      <div className="w-4 shrink-0" />

      {/* Editable textarea — fills remaining space, no extra left padding */}
      <textarea
        ref={innerRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={syncScroll}
        spellCheck={false}
        className="flex-1 resize-none bg-transparent dark:text-[#e6edf3] text-[#1f2328] outline-none pt-4 pb-4 pr-4 overflow-auto"
        style={{
          lineHeight: "1.25rem",
          whiteSpace: "pre",
          overflowWrap: "normal",
          caretColor: "currentColor",
        }}
      />
    </div>
  )
}

// ── ToolsMultiSelect ──────────────────────────────────────────────────────

function ToolsMultiSelect({
  value,
  onChange,
  options,
}: {
  value: string[]
  onChange: (tools: string[]) => void
  options: string[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch("")
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const filtered = search
    ? options.filter((t) => t.toLowerCase().includes(search.toLowerCase()))
    : options

  function toggle(tool: string) {
    onChange(value.includes(tool) ? value.filter((t) => t !== tool) : [...value, tool])
  }

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-7 w-full flex-wrap items-center gap-1 rounded-lg border border-input bg-transparent px-2 py-1 text-xs transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {value.length === 0 ? (
          <span className="text-muted-foreground">Select tools…</span>
        ) : (
          value.map((tool) => (
            <span
              key={tool}
              className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium"
            >
              {tool}
              <XIcon
                className="size-3 cursor-pointer opacity-60 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); toggle(tool) }}
              />
            </span>
          ))
        )}
        <ChevronDownIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-[200] mt-1 w-full min-w-[220px] rounded-lg border bg-popover shadow-md">
          <div className="p-2 pb-1">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search tools…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 pl-8 text-xs"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">No tools found</p>
            ) : (
              filtered.map((tool) => (
                <label
                  key={tool}
                  className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 hover:bg-muted"
                >
                  <Checkbox
                    checked={value.includes(tool)}
                    onCheckedChange={() => toggle(tool)}
                  />
                  <span className="font-mono text-xs">{tool}</span>
                </label>
              ))
            )}
          </div>
          {value.length > 0 && (
            <div className="border-t p-1">
              <button
                type="button"
                className="w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
                onClick={() => onChange([])}
              >
                Clear all ({value.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── SkillPreviewDialog ─────────────────────────────────────────────────────

function SkillPreviewDialog({
  skill,
  availableTools,
  onClose,
  onSaved,
  onToolsSaved,
}: {
  skill: Skill | null
  availableTools: string[]
  onClose: () => void
  onSaved: (location: string, content: string) => void
  onToolsSaved: (name: string, tools: string[]) => void
}) {
  const [viewMode, setViewMode] = useState<"code" | "view">("view")
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const [savingTools, setSavingTools] = useState(false)
  const [toolsSavedFlash, setToolsSavedFlash] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Reset state whenever a different skill is opened
  useEffect(() => {
    if (skill) {
      setDraft(skill.content)
      setSelectedTools(skill.tools ?? [])
      setViewMode("view")
      setSaveError(null)
      setSavedFlash(false)
      setToolsSavedFlash(false)
    }
  }, [skill?.location])

  // Focus textarea when entering code mode
  useEffect(() => {
    if (viewMode === "code") {
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [viewMode])

  if (!skill) return null

  const origin = originFromLocation(skill.location)
  const colorClass = ORIGIN_COLORS[origin] ?? ORIGIN_COLORS.local
  const isDirty = draft !== skill.content
  const isToolsDirty = JSON.stringify(selectedTools.slice().sort()) !== JSON.stringify((skill.tools ?? []).slice().sort())

  async function handleSave() {
    if (!skill || !isDirty || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await opendora.skill.update(skill.location, draft)
      onSaved(skill.location, draft)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveTools() {
    if (!skill || !isToolsDirty || savingTools) return
    setSavingTools(true)
    try {
      await opendora.skill.updateConfig(skill.name, { tools: selectedTools })
      onToolsSaved(skill.name, selectedTools)
      setToolsSavedFlash(true)
      setTimeout(() => setToolsSavedFlash(false), 2000)
    } catch {
      // silent — tools save is best-effort
    } finally {
      setSavingTools(false)
    }
  }

  return (
    <Dialog open={!!skill} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col gap-0 p-0 w-full sm:w-[90vw] sm:max-w-5xl max-h-[85vh] overflow-hidden"
      >
        {/* Header */}
        <DialogHeader className="flex-row items-center gap-3 border-b px-4 py-3 shrink-0">
          <div className="p-1.5 rounded-md bg-primary/10 text-primary shrink-0">
            <BookOpenIcon className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-sm font-semibold leading-none">
                {skill.name}
              </DialogTitle>
              <Badge variant="secondary" className={`text-xs px-1.5 py-0 ${colorClass}`}>
                {origin}
              </Badge>
              {isDirty && (
                <span className="text-[10px] text-muted-foreground italic">unsaved</span>
              )}
            </div>
            {skill.description && (
              <DialogDescription className="text-xs text-muted-foreground truncate">
                {skill.description}
              </DialogDescription>
            )}
            <p className="text-[10px] font-mono text-muted-foreground/70 truncate">
              {skill.location}
            </p>
          </div>

          {viewMode === "code" && (
            <Button
              size="sm"
              variant={savedFlash ? "default" : "outline"}
              className="h-7 gap-1.5 text-xs shrink-0"
              onClick={handleSave}
              disabled={!isDirty || saving}
            >
              {savedFlash ? (
                <><CheckIcon className="size-3" />Saved</>
              ) : (
                <><SaveIcon className="size-3" />{saving ? "Saving…" : "Save"}</>
              )}
            </Button>
          )}

          <CodeViewToggle viewMode={viewMode} onViewChange={setViewMode} />
          <Button size="icon-sm" variant="ghost" className="size-7 shrink-0" onClick={onClose}>
            <XIcon className="size-4" />
          </Button>
        </DialogHeader>

        {/* Tools bar */}
        <div className="shrink-0 border-b px-4 py-2 flex items-center gap-2">
          <WrenchIcon className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground shrink-0">Tools:</span>
          <ToolsMultiSelect
            value={selectedTools}
            onChange={setSelectedTools}
            options={availableTools}
          />
          <Button
            size="sm"
            variant={toolsSavedFlash ? "default" : "outline"}
            className="h-7 gap-1 text-xs shrink-0"
            onClick={handleSaveTools}
            disabled={!isToolsDirty || savingTools}
          >
            {toolsSavedFlash ? (
              <><CheckIcon className="size-3" />Saved</>
            ) : (
              <><SaveIcon className="size-3" />{savingTools ? "Saving…" : "Save"}</>
            )}
          </Button>
        </div>

        {saveError && (
          <div className="shrink-0 border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {saveError}
          </div>
        )}

        {/* Body — overflow-hidden when editing so the textarea scrolls itself */}
        <div className={`min-h-0 flex-1 ${viewMode === "code" ? "overflow-hidden" : "overflow-auto"}`}>
          {viewMode === "code" ? (
            <CodeEditorTextarea
              value={draft}
              onChange={setDraft}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                  e.preventDefault()
                  handleSave()
                }
              }}
              innerRef={textareaRef}
            />
          ) : (
            <MessageResponse className="prose dark:prose-invert max-w-none py-5 pr-6 pl-14 text-sm">
              {draft}
            </MessageResponse>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([])
  const { schemas: toolSchemas } = useToolSchemas()
  const availableTools = toolSchemas.map((t) => t.id).filter((id) => !HIDDEN_TOOLS.has(id))
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Skill | null>(null)

  useEffect(() => {
    opendora.skill.list()
      .then(setSkills)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function handleSaved(location: string, content: string) {
    setSkills((prev) => prev.map((s) => (s.location === location ? { ...s, content } : s)))
    setSelected((prev) => (prev?.location === location ? { ...prev, content } : prev))
  }

  function handleToolsSaved(name: string, tools: string[]) {
    setSkills((prev) => prev.map((s) => (s.name === name ? { ...s, tools } : s)))
    setSelected((prev) => (prev?.name === name ? { ...prev, tools } : prev))
  }

  const filtered = (search
    ? skills.filter((s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase())
      )
    : skills
  ).slice().sort((a, b) => a.name.localeCompare(b.name))

  return (
    <SettingsPageLayout title="Skills">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <BookOpenIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Skills</h2>
            <p className="text-sm text-muted-foreground">
              {loading ? "Loading…" : `${skills.length} skill${skills.length === 1 ? "" : "s"} available`}
            </p>
          </div>
        </div>

        <div className="relative max-w-sm">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search skills…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground">Loading skills…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {search ? "No skills match your search." : "No skills found."}
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((skill) => {
              const origin = originFromLocation(skill.location)
              const colorClass = ORIGIN_COLORS[origin] ?? ORIGIN_COLORS.local
              return (
                <SettingsCard
                  key={skill.name}
                  title={skill.name}
                  description={skill.description || "No description"}
                  onClick={() => setSelected(skill)}
                />
              )
            })}
          </div>
        )}
      </div>

      <SkillPreviewDialog skill={selected} availableTools={availableTools} onClose={() => setSelected(null)} onSaved={handleSaved} onToolsSaved={handleToolsSaved} />
    </SettingsPageLayout>
  )
}
