"use client"

import { useEffect, useRef, useState } from "react"
import { BookOpenIcon, SearchIcon, MapPinIcon, XIcon, SaveIcon, CheckIcon } from "lucide-react"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { MessageResponse } from "@/components/ai-elements/message"
import { CodeViewToggle } from "@/components/ui/code-view-toggle"
import { opendora } from "@/lib/opendora"

type Skill = {
  name: string
  description: string
  location: string
  content: string
}

function originFromLocation(location: string): string {
  if (location.includes("anthropic")) return "anthropic"
  if (location.includes("vercel")) return "vercel"
  if (location.includes("github")) return "github"
  if (location.includes("clawhub")) return "clawhub"
  if (location.includes(".opendora")) return "opendora"
  return "local"
}

const ORIGIN_COLORS: Record<string, string> = {
  anthropic: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  vercel: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  github: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  clawhub: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  opendora: "bg-primary/10 text-primary",
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

// ── SkillPreviewDialog ─────────────────────────────────────────────────────

function SkillPreviewDialog({
  skill,
  onClose,
  onSaved,
}: {
  skill: Skill | null
  onClose: () => void
  onSaved: (location: string, content: string) => void
}) {
  const [viewMode, setViewMode] = useState<"code" | "view">("view")
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Reset state whenever a different skill is opened
  useEffect(() => {
    if (skill) {
      setDraft(skill.content)
      setViewMode("view")
      setSaveError(null)
      setSavedFlash(false)
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

  const filtered = search
    ? skills.filter((s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase())
      )
    : skills

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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((skill) => {
              const origin = originFromLocation(skill.location)
              const colorClass = ORIGIN_COLORS[origin] ?? ORIGIN_COLORS.local
              return (
                <Card
                  key={skill.name}
                  className="flex flex-col cursor-pointer hover:shadow-md hover:border-primary/50 transition-all"
                  onClick={() => setSelected(skill)}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-tight">{skill.name}</CardTitle>
                      <Badge variant="secondary" className={`shrink-0 text-xs ${colorClass}`}>
                        {origin}
                      </Badge>
                    </div>
                    <CardDescription className="text-sm line-clamp-2">
                      {skill.description || "No description"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 mt-auto">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                      <MapPinIcon className="h-3 w-3 shrink-0" />
                      <span className="truncate font-mono">{skill.location}</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <SkillPreviewDialog skill={selected} onClose={() => setSelected(null)} onSaved={handleSaved} />
    </SettingsPageLayout>
  )
}
