"use client"

import { useCallback, useEffect, useState } from "react"
import type { BundledLanguage } from "shiki"
import { XIcon, RefreshCwIcon, FileIcon } from "lucide-react"
import { CodeBlock } from "@/components/ai-elements/code-block"
import { Button } from "@/components/ui/button"
import { opendora, type FileContent } from "@/lib/opendora"
import { cn } from "@/lib/utils"

// ── Language detection ───────────────────────────────────────────────────────
//
// Maps file extensions to Shiki BundledLanguage identifiers. Unmapped files
// fall back to "text" which Shiki renders as plain monospace with no
// highlighting.

const EXT_TO_LANG: Record<string, BundledLanguage> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "jsonc",
  md: "markdown",
  mdx: "mdx",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  xml: "xml",
  svg: "xml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "fish",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  swift: "swift",
  dart: "dart",
  lua: "lua",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
  dockerfile: "docker",
}

export function detectLanguage(path: string): BundledLanguage {
  const name = path.split("/").pop() ?? path
  if (name.toLowerCase() === "dockerfile") return "docker"
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : ""
  return EXT_TO_LANG[ext] ?? ("text" as BundledLanguage)
}

// ── Component ────────────────────────────────────────────────────────────────

export type FilePreviewProps = {
  /** Path passed to the backend /file/content API. Must be relative to
   *  Instance.directory or the backend will join it incorrectly. */
  path: string
  /** Path shown in the header. Defaults to `path`. Typically the absolute path. */
  displayPath?: string
  onClose?: () => void
  className?: string
  /** Hide the built-in header (filename, refresh, close buttons). */
  hideHeader?: boolean
}

export function FilePreview({ path, displayPath, onClose, className, hideHeader }: FilePreviewProps) {
  const [data, setData] = useState<FileContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const content = await opendora.file.content(path)
      setData(content)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => {
    load()
  }, [load])

  const headerPath = displayPath ?? path
  const name = headerPath.split("/").pop() ?? headerPath
  const language = detectLanguage(headerPath)

  return (
    <div className={cn("flex size-full flex-col bg-card", className)}>
      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <FileIcon className="size-4 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="truncate text-[10px] font-mono text-muted-foreground">{headerPath}</span>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-7 shrink-0"
            onClick={load}
            title="Refresh"
            disabled={loading}
          >
            <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
          </Button>
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
      )}

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-auto">
        {loading && !data ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">Loading…</p>
        ) : error ? (
          <p
            className="px-4 py-8 text-center text-xs text-destructive"
            title={error}
          >
            {error.includes("Access denied")
              ? "Access denied"
              : error.includes("not found")
                ? "File not found"
                : "Failed to load file"}
          </p>
        ) : data?.type === "binary" ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            <p>Binary file — preview not available</p>
            {data.mimeType && (
              <p className="mt-1 font-mono text-[10px]">{data.mimeType}</p>
            )}
          </div>
        ) : data ? (
          <CodeBlock
            className="rounded-none border-0"
            code={data.content}
            language={language}
            showLineNumbers
          />
        ) : null}
      </div>
    </div>
  )
}
