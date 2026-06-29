"use client"

import { useState, useCallback, useEffect } from "react"
import { GlobeIcon, TerminalIcon, ScrollTextIcon, XIcon, PlayIcon, RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { opendora, type FileContent } from "@/lib/projectflows"
import { WebPreview, WebPreviewBody } from "@/components/ai-elements/web-preview"
import { detectLanguage } from "@/components/ai-elements/file-preview"
import { CodeBlock } from "@/components/ai-elements/code-block"
import { MessageResponse } from "@/components/ai-elements/message"
import {
  SandboxTabs,
  SandboxTabsBar,
  SandboxTabsList,
  SandboxTabsTrigger,
  SandboxTabContent,
} from "@/components/ai-elements/sandbox"
import {
  Artifact,
  ArtifactHeader,
  ArtifactTitle,
  ArtifactDescription,
  ArtifactActions,
  ArtifactAction,
  ArtifactContent,
} from "@/components/ai-elements/artifact"

// ── Shared file-fetch hook ────────────────────────────────────────────────────

function useFileContent(path: string) {
  const [data, setData] = useState<FileContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!path) return
    setLoading(true)
    setError(null)
    try {
      setData(await opendora.file.content(path))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => { load() }, [load])

  return { data, loading, error, reload: load }
}

// ── Shared empty/error/loading states ────────────────────────────────────────

function FileBodyState({ loading, error, data, empty }: { loading: boolean; error: string | null; data: FileContent | null; empty?: boolean }) {
  if (loading && !data) return <p className="px-4 py-8 text-center text-xs text-muted-foreground">Loading…</p>
  if (error) return <p className="px-4 py-8 text-center text-xs text-destructive">Failed to load file</p>
  if (data?.type === "binary") return <p className="px-4 py-8 text-center text-xs text-muted-foreground">Binary file — preview not available</p>
  if (empty) return <p className="px-4 py-8 text-center text-xs text-muted-foreground">Enter a file path and press ▶</p>
  return null
}

// ── Sandbox body ─────────────────────────────────────────────────────────────

function fileExt(filePath: string) {
  return (filePath.split(".").pop() ?? "").toLowerCase()
}

function isHtmlFile(filePath: string) {
  const ext = fileExt(filePath)
  return ext === "html" || ext === "htm"
}

function isMarkdownFile(filePath: string) {
  const ext = fileExt(filePath)
  return ext === "md" || ext === "mdx"
}

function SandboxBody({ path, displayPath }: { path: string; displayPath: string }) {
  const { data, loading, error, reload } = useFileContent(path)
  const language = detectLanguage(displayPath || path)
  const isHtml = isHtmlFile(displayPath || path)
  const isMarkdown = isMarkdownFile(displayPath || path)

  return (
    <SandboxTabs defaultValue="code" className="flex h-full flex-col">
      <SandboxTabsBar>
        <SandboxTabsList>
          <SandboxTabsTrigger value="code">Code</SandboxTabsTrigger>
          <SandboxTabsTrigger value="output">Output</SandboxTabsTrigger>
        </SandboxTabsList>
        <div className="ml-auto pr-2">
          <Button size="icon-sm" variant="ghost" className="size-7" onClick={reload} disabled={loading} title="Refresh">
            <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </SandboxTabsBar>

      <SandboxTabContent value="code" className="min-h-0 flex-1 overflow-auto">
        <FileBodyState loading={loading} error={error} data={data} empty={!path} />
        {data?.type === "text" && data.content !== "" && (
          <CodeBlock code={data.content} language={language} showLineNumbers className="rounded-none border-0" />
        )}
        {data?.type === "text" && data.content === "" && !loading && (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">File is empty or not found</p>
        )}
      </SandboxTabContent>

      <SandboxTabContent value="output" className="min-h-0 flex-1 overflow-hidden">
        {!path ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">Enter a file path and press ▶</p>
        ) : loading && !data ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">Loading…</p>
        ) : error ? (
          <p className="px-4 py-8 text-center text-xs text-destructive">Failed to load file</p>
        ) : isHtml && data?.type === "text" && data.content ? (
          // oxlint-disable-next-line eslint-plugin-react(iframe-missing-sandbox)
          <iframe
            className="size-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
            srcDoc={data.content}
            title="Output"
          />
        ) : isMarkdown && data?.type === "text" && data.content ? (
          <MessageResponse className="prose dark:prose-invert max-w-none overflow-auto p-6 text-sm">
            {data.content}
          </MessageResponse>
        ) : (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            No renderable output for this file type
          </p>
        )}
      </SandboxTabContent>
    </SandboxTabs>
  )
}

// ── Artifact body ─────────────────────────────────────────────────────────────

function ArtifactBody({ path, displayPath }: { path: string; displayPath: string }) {
  const { data, loading, error, reload } = useFileContent(path)
  const language = detectLanguage(displayPath || path)
  const headerPath = displayPath || path
  const name = headerPath.split("/").pop() ?? headerPath

  return (
    <Artifact className="h-full rounded-none border-0">
      <ArtifactHeader>
        <div className="min-w-0 flex-1">
          <ArtifactTitle>{name}</ArtifactTitle>
          <ArtifactDescription className="truncate font-mono text-[10px]">{headerPath}</ArtifactDescription>
        </div>
        <ArtifactActions>
          <ArtifactAction icon={RefreshCwIcon} tooltip="Refresh" onClick={reload} disabled={loading} />
        </ArtifactActions>
      </ArtifactHeader>
      <ArtifactContent className="min-h-0 flex-1 overflow-auto p-0">
        <FileBodyState loading={loading} error={error} data={data} empty={!path} />
        {data?.type === "text" && data.content !== "" && (
          <CodeBlock code={data.content} language={language} showLineNumbers className="rounded-none border-0" />
        )}
        {data?.type === "text" && data.content === "" && !loading && (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">File is empty or not found</p>
        )}
      </ArtifactContent>
    </Artifact>
  )
}

// ── PreviewPanel ──────────────────────────────────────────────────────────────

type Mode = "web" | "sandbox" | "artifact"

export type PreviewPanelProps = {
  defaultMode?: Mode
  defaultUrl?: string
  defaultPath?: string
  defaultDisplayPath?: string
  onClose?: () => void
  className?: string
}

export function PreviewPanel({
  defaultMode = "web",
  defaultUrl = "",
  defaultPath = "",
  defaultDisplayPath,
  onClose,
  className,
}: PreviewPanelProps) {
  const [mode, setMode] = useState<Mode>(defaultMode)
  const [urlInput, setUrlInput] = useState(defaultUrl)
  const [pathInput, setPathInput] = useState(defaultPath)
  const [activeUrl, setActiveUrl] = useState(defaultUrl)
  const [activePath, setActivePath] = useState(defaultPath)
  const [activeDisplayPath, setActiveDisplayPath] = useState(defaultDisplayPath ?? defaultPath)

  const switchMode = useCallback((newMode: Mode) => {
    setMode(newMode)
    // When switching from web to a file mode, mirror the URL into the path
    // field if it looks like a local filesystem path and the path field is empty.
    if (newMode !== "web" && !pathInput && urlInput.startsWith("/")) {
      setPathInput(urlInput)
      setActivePath(urlInput)
      setActiveDisplayPath(urlInput)
    }
  }, [urlInput, pathInput])

  const handlePreview = useCallback(() => {
    if (mode === "web") {
      setActiveUrl(urlInput)
    } else {
      setActivePath(pathInput)
      setActiveDisplayPath(pathInput)
    }
  }, [mode, urlInput, pathInput])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handlePreview()
    },
    [handlePreview]
  )

  return (
    <div className={cn("flex size-full flex-col bg-card", className)}>
      {/* Unified toolbar */}
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        {/* 3-way mode toggle */}
        <div className="flex items-center rounded-md border bg-muted p-0.5 gap-0.5 shrink-0">
          <Button
            size="sm"
            variant={mode === "web" ? "secondary" : "ghost"}
            className="h-6 gap-1 px-2 text-xs"
            onClick={() => switchMode("web")}
          >
            <GlobeIcon className="size-3" />
            Web
          </Button>
          <Button
            size="sm"
            variant={mode === "sandbox" ? "secondary" : "ghost"}
            className="h-6 gap-1 px-2 text-xs"
            onClick={() => switchMode("sandbox")}
          >
            <TerminalIcon className="size-3" />
            Sandbox
          </Button>
          <Button
            size="sm"
            variant={mode === "artifact" ? "secondary" : "ghost"}
            className="h-6 gap-1 px-2 text-xs"
            onClick={() => switchMode("artifact")}
          >
            <ScrollTextIcon className="size-3" />
            Artifact
          </Button>
        </div>

        {/* Preview button — left of input */}
        <Button
          size="icon-sm"
          variant="secondary"
          className="size-7 shrink-0"
          onClick={handlePreview}
          title="Preview"
        >
          <PlayIcon className="size-3.5" />
        </Button>

        {/* Input: URL or file path depending on mode */}
        <Input
          className="h-7 flex-1 font-mono text-xs"
          placeholder={mode === "web" ? "https://…" : "/path/to/file"}
          value={mode === "web" ? urlInput : pathInput}
          onChange={(e) =>
            mode === "web" ? setUrlInput(e.target.value) : setPathInput(e.target.value)
          }
          onKeyDown={handleKeyDown}
        />

        {/* Close */}
        {onClose && (
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-7 shrink-0"
            onClick={onClose}
            title="Close"
          >
            <XIcon className="size-4" />
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === "web" ? (
          <WebPreview
            key={activeUrl}
            defaultUrl={activeUrl}
            className="h-full rounded-none border-0"
          >
            <WebPreviewBody />
          </WebPreview>
        ) : mode === "sandbox" ? (
          <SandboxBody key={activePath} path={activePath} displayPath={activeDisplayPath} />
        ) : (
          <ArtifactBody key={activePath} path={activePath} displayPath={activeDisplayPath} />
        )}
      </div>
    </div>
  )
}
