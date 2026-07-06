"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AppWindowIcon,
  BotIcon,
  BrainIcon,
  ClockIcon,
  FolderOpenIcon,
  GitBranchIcon,
  GlobeIcon,
  HistoryIcon,
  Loader2Icon,
  MessageSquareIcon,
  MonitorIcon,
  LayersIcon,
  Settings2Icon,
  SettingsIcon,
  TerminalIcon,
  UsersIcon,
  WrenchIcon,
  XIcon,
  ZapIcon,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { SettingsPageLayout } from "@/components/settings/settings-page-layout"
import { EntityCatalogSection } from "@/components/settings/entity-catalog-section"
import { SettingsCard } from "@/components/settings/settings-card"
import { mergeWithRemote, useEntityCatalog } from "@/hooks/use-entity-catalog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  opendora,
  type ToolSchema,
  type ToolGroupManifest,
  type ToolGroupConfigField,
  type RemoteEntity,
} from "@/lib/projectflows"
import { useToolSchemas, refreshSchemas } from "@/hooks/use-tool-schemas"
import type { CatalogFilter } from "@/components/settings/entity-catalog-section"

// ── Icon lookup ───────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Terminal: TerminalIcon,
  Brain: BrainIcon,
  History: HistoryIcon,
  Chrome: AppWindowIcon,
  Bot: BotIcon,
  Globe: GlobeIcon,
  FolderOpen: FolderOpenIcon,
  Monitor: MonitorIcon,
  Clock: ClockIcon,
  Wrench: WrenchIcon,
  Zap: ZapIcon,
  Users: UsersIcon,
  Settings: SettingsIcon,
  GitBranch: GitBranchIcon,
  MessageSquare: MessageSquareIcon,
}

function groupIcon(iconName: string): LucideIcon {
  return ICON_MAP[iconName] ?? WrenchIcon
}

// ── Config helpers ─────────────────────────────────────────────────────────────

type GlobalConfig = { tool_config?: Record<string, unknown>; [k: string]: unknown }

function getConfigValue(config: GlobalConfig | null, dottedKey: string): unknown {
  if (!config?.tool_config) return undefined
  const parts = dottedKey.split(".")
  let cur: unknown = config.tool_config
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function buildNestedUpdate(dottedKey: string, value: unknown): Record<string, unknown> {
  const parts = dottedKey.split(".")
  const root: Record<string, unknown> = {}
  let node = root
  for (let i = 0; i < parts.length - 1; i++) {
    node[parts[i]!] = {}
    node = node[parts[i]!] as Record<string, unknown>
  }
  node[parts[parts.length - 1]!] = value
  return root
}

// ── ToolSchemaDialog ──────────────────────────────────────────────────────────

function ToolSchemaDialog({ tool, onClose }: { tool: ToolSchema | null; onClose: () => void }) {
  if (!tool) return null
  const json = JSON.stringify(
    { name: tool.id, description: tool.description, inputSchema: tool.inputSchema },
    null,
    2,
  )
  return (
    <Dialog open={!!tool} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="flex-row items-center gap-3 border-b px-4 py-3 shrink-0">
          <div className="p-1.5 rounded-md bg-primary/10 text-primary shrink-0">
            <WrenchIcon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-sm font-mono font-semibold leading-none truncate">
              {tool.id}
            </DialogTitle>
            {tool.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{tool.description}</p>
            )}
          </div>
          <Button size="icon-sm" variant="ghost" className="size-7 shrink-0" onClick={onClose}>
            <XIcon className="size-4" />
          </Button>
        </DialogHeader>
        <div className="flex-1 overflow-auto p-4">
          <pre className="text-xs bg-muted rounded border p-3 overflow-auto font-mono leading-relaxed whitespace-pre-wrap">
            {json}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── ConfigFieldRow ─────────────────────────────────────────────────────────────

function ConfigFieldRow({
  field,
  config,
  onSave,
}: {
  field: ToolGroupConfigField
  config: GlobalConfig | null
  onSave: (key: string, value: unknown) => Promise<void>
}) {
  const current = getConfigValue(config, field.key)
  const [inputVal, setInputVal] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!inputVal.trim()) return
    setSaving(true)
    try {
      await onSave(field.key, inputVal.trim())
      setInputVal("")
    } finally {
      setSaving(false)
    }
  }

  if (field.type === "boolean") {
    return (
      <div className="flex items-center justify-between px-4 py-3 border rounded-lg">
        <div>
          <div className="text-sm font-medium">{field.label}</div>
          {field.description && (
            <div className="text-xs text-muted-foreground">{field.description}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saving && <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />}
          <Switch
            checked={!!current}
            disabled={saving}
            onCheckedChange={async (v) => {
              setSaving(true)
              try { await onSave(field.key, v) } finally { setSaving(false) }
            }}
          />
        </div>
      </div>
    )
  }

  const hasValue = current != null && current !== ""
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{field.label}</Label>
        {hasValue && (
          <span className="text-xs text-green-600 dark:text-green-400">Configured</span>
        )}
      </div>
      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
      <div className="flex gap-2">
        <Input
          type={field.type === "password" ? "password" : "text"}
          placeholder={field.placeholder ?? (hasValue ? "••••••••" : field.label)}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave() }}
          className={field.type === "password" ? "font-mono" : ""}
        />
        <Button onClick={handleSave} disabled={saving || !inputVal.trim()}>
          {saving && <Loader2Icon className="mr-2 size-3.5 animate-spin" />}
          Save
        </Button>
      </div>
    </div>
  )
}

// ── GroupDetailSheet ──────────────────────────────────────────────────────────

function GroupDetailSheet({
  manifest,
  schemas,
  config,
  onClose,
  onConfigSave,
  onToolClick,
}: {
  manifest: ToolGroupManifest | null
  schemas: ToolSchema[]
  config: GlobalConfig | null
  onClose: () => void
  onConfigSave: (key: string, value: unknown) => Promise<void>
  onToolClick: (tool: ToolSchema) => void
}) {
  const Icon = manifest ? groupIcon(manifest.icon) : WrenchIcon
  const groupTools = schemas.filter((s) => s.group === manifest?.id)

  return (
    <Sheet open={!!manifest} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto flex flex-col gap-6 p-6">
        {manifest && (
          <>
            <SheetHeader className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <SheetTitle>{manifest.name}</SheetTitle>
                  {manifest.description && (
                    <p className="text-sm text-muted-foreground mt-0.5">{manifest.description}</p>
                  )}
                </div>
              </div>
            </SheetHeader>

            {/* Tool cards */}
            {groupTools.length > 0 && (
              <div className="space-y-3">
                <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Tools ({groupTools.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {groupTools.map((tool) => (
                    <SettingsCard
                      key={tool.id}
                      title={<span className="font-mono text-sm">{tool.id}</span>}
                      description={tool.description}
                      onClick={() => onToolClick(tool)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Config fields */}
            {manifest.config && manifest.config.fields.length > 0 && (
              <div className="space-y-4">
                <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Configuration
                </div>
                {manifest.config.fields.map((field) => (
                  <ConfigFieldRow
                    key={field.key}
                    field={field}
                    config={config}
                    onSave={onConfigSave}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ToolsPage() {
  const [globalConfig, setGlobalConfig] = useState<GlobalConfig | null>(null)
  const { schemas: toolSchemas, loading: loadingSchemas } = useToolSchemas()
  const [remoteTools, setRemoteTools] = useState<RemoteEntity[]>([])
  const [installing, setInstalling] = useState<string | null>(null)
  const [uninstallingTool, setUninstallingTool] = useState<string | null>(null)
  const [toolView, setToolView] = useState<"tools" | "groups">("tools")
  const [filter, setFilter] = useState<CatalogFilter>("all")
  const [search, setSearch] = useState("")
  const [selectedTool, setSelectedTool] = useState<ToolSchema | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<ToolGroupManifest | null>(null)

  useEffect(() => {
    opendora.config.get().then(setGlobalConfig).catch(() => {})
    opendora.entity.listAvailable({ type: "tool" }).then(setRemoteTools).catch(() => {})
  }, [])

  async function handleInstall(id: string) {
    setInstalling(id)
    try {
      await opendora.entity.installRemote("tool", id)
      opendora.entity.listAvailable({ type: "tool" }).then(setRemoteTools).catch(() => {})
    } finally {
      setInstalling(null)
    }
  }

  async function handleToolRemove(id: string) {
    setUninstallingTool(id)
    try {
      await opendora.entity.removeLocal("tool", id)
      refreshSchemas()
      opendora.entity.listAvailable({ type: "tool" }).then(setRemoteTools).catch(() => {})
    } finally {
      setUninstallingTool(null)
    }
  }

  const { items: groupItems, loading: loadingGroups } = useEntityCatalog(
    "tool-group",
    () => opendora.agent.toolGroups(),
    (m: ToolGroupManifest) => ({
      id: m.id,
      type: "tool-group" as const,
      name: m.name,
      description: m.description,
      onManage: () => setSelectedGroup(m),
    }),
    refreshSchemas,
  )

  async function handleConfigSave(dottedKey: string, value: unknown) {
    await opendora.config.update({ tool_config: buildNestedUpdate(dottedKey, value) })
    opendora.config.get().then(setGlobalConfig).catch(() => {})
  }

  const toolItems = useMemo(
    () =>
      mergeWithRemote(
        toolSchemas,
        remoteTools,
        (t) => ({
          id: t.id,
          type: "tool" as const,
          name: t.id,
          description: t.description,
          onManage: () => setSelectedTool(t),
          onUninstall: async () => handleToolRemove(t.id),
          onDelete: async () => handleToolRemove(t.id),
        }),
        "tool",
        handleInstall,
        installing,
        undefined,
        uninstallingTool,
        undefined,
        uninstallingTool,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toolSchemas, remoteTools, installing, uninstallingTool],
  )

  return (
    <SettingsPageLayout title="Tools">
      <div className="flex flex-col gap-6">
        {/* Tools / Groups toggle */}
        <Tabs value={toolView} onValueChange={(v) => { setToolView(v as "tools" | "groups"); setSearch("") }}>
          <TabsList>
            <TabsTrigger value="tools">Tools</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
          </TabsList>
        </Tabs>

        {toolView === "tools" ? (
          <EntityCatalogSection
            icon={WrenchIcon}
            title="Tools"
            items={toolItems}
            loading={loadingSchemas}
            filter={filter}
            onFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            sortFn={(a, b) => a.name.localeCompare(b.name)}
          />
        ) : (
          <EntityCatalogSection
            icon={LayersIcon}
            title="Tool Groups"
            items={groupItems}
            loading={loadingGroups}
            filter={filter}
            onFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            sortFn={(a, b) => a.name.localeCompare(b.name)}
          />
        )}
      </div>

      <GroupDetailSheet
        manifest={selectedGroup}
        schemas={toolSchemas}
        config={globalConfig}
        onClose={() => setSelectedGroup(null)}
        onConfigSave={handleConfigSave}
        onToolClick={setSelectedTool}
      />

      <ToolSchemaDialog tool={selectedTool} onClose={() => setSelectedTool(null)} />
    </SettingsPageLayout>
  )
}
