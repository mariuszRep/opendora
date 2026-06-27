"use client"

import { useMemo, useState } from "react"
import type { RenderLayoutConfig } from "@/lib/format-translator"
import { translateAll } from "@/lib/format-translator"
import {
  SandboxTabs,
  SandboxTabsBar,
  SandboxTabsList,
  SandboxTabsTrigger,
  SandboxTabContent,
} from "./sandbox"
import { CodeBlock } from "./code-block"
import { DataView } from "./data-view"

type CodeFormatKey = "json" | "yaml" | "xml" | "markdown" | "html"
type TabLabel = "JSON" | "YAML" | "XML" | "Markdown" | "HTML Code" | "Preview"

const CODE_TABS: { label: TabLabel; key: CodeFormatKey; lang: "json" | "yaml" | "xml" | "markdown" | "html" }[] = [
  { label: "JSON", key: "json", lang: "json" },
  { label: "YAML", key: "yaml", lang: "yaml" },
  { label: "XML", key: "xml", lang: "xml" },
  { label: "Markdown", key: "markdown", lang: "markdown" },
  { label: "HTML Code", key: "html", lang: "html" },
]

export function FormatSwitcher({ data, displayProps, renderLayout }: { data: unknown; displayProps?: unknown[]; renderLayout?: RenderLayoutConfig }) {
  const [activeTab, setActiveTab] = useState<TabLabel>("Preview")
  const formats = useMemo(() => translateAll(data, renderLayout), [data, renderLayout])

  return (
    <div className="space-y-2">
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        Result
      </h4>
      <div className="rounded-md bg-muted/50 overflow-hidden">
        <SandboxTabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabLabel)}>
          <SandboxTabsBar>
            <SandboxTabsList>
              <SandboxTabsTrigger value="Preview">Preview</SandboxTabsTrigger>
              {CODE_TABS.map((f) => (
                <SandboxTabsTrigger key={f.label} value={f.label}>
                  {f.label}
                </SandboxTabsTrigger>
              ))}
            </SandboxTabsList>
          </SandboxTabsBar>
          <SandboxTabContent value="Preview">
            <div className="p-3">
              <DataView data={data} displayProps={displayProps} renderLayout={renderLayout} />
            </div>
          </SandboxTabContent>
          {CODE_TABS.map((f) => (
            <SandboxTabContent key={f.label} value={f.label}>
              <CodeBlock code={formats[f.key]} language={f.lang} />
            </SandboxTabContent>
          ))}
        </SandboxTabs>
      </div>
    </div>
  )
}
