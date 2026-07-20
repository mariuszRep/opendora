"use client"

import type { ReactNode } from "react"
import type { RenderLayoutConfig } from "@/lib/format-translator"
import { translateAll } from "@/lib/format-translator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

export type ToolCardSection = { label: string; data: unknown }

/**
 * Builds the section list for the generic tool-card layout: Instructions (only
 * when the tool's input actually carries an `instructions` field — a data-driven
 * check, not a per-node-type special case), Parameters (the rest of the input),
 * and Result (when present).
 */
export function buildToolCardSections(input: unknown, result: unknown): ToolCardSection[] {
  const sections: ToolCardSection[] = []
  if (input && typeof input === "object" && !Array.isArray(input) && "instructions" in input) {
    const { instructions, ...rest } = input as Record<string, unknown>
    sections.push({ label: "Instructions", data: instructions })
    sections.push({ label: "Parameters", data: rest })
  } else {
    sections.push({ label: "Parameters", data: input ?? {} })
  }
  if (result !== undefined) sections.push({ label: "Result", data: result })
  return sections
}

/**
 * Renders a tool card's Instructions/Parameters/Result sections stacked under
 * one shared format switch (Preview/JSON/YAML/XML/Markdown/HTML Code). Follows
 * the standard shadcn Tabs pattern — one TabsContent per format — with each
 * format's panel containing all three sections rendered in that format, so
 * switching the tab changes every section together under a single control.
 * displayProps/renderLayout (card/table layout hints) only apply to the Result
 * section — Instructions/Parameters aren't card/table-shaped data.
 */
export function ToolCardSections({
  sections, displayProps, renderLayout,
}: { sections: ToolCardSection[]; displayProps?: unknown[]; renderLayout?: RenderLayoutConfig }) {
  const renderSection = (label: string, content: ReactNode) => (
    <div key={label} className="space-y-2">
      <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </h4>
      <div className="rounded-md bg-muted/50 overflow-hidden">{content}</div>
    </div>
  )

  return (
    <Tabs defaultValue="Preview">
      <TabsList variant="line">
        <TabsTrigger value="Preview">Preview</TabsTrigger>
        {CODE_TABS.map((f) => (
          <TabsTrigger key={f.label} value={f.label}>
            {f.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="Preview">
        <div className="space-y-3">
          {sections.map(({ label, data }) => {
            const isResult = label === "Result"
            return renderSection(
              label,
              <div className="p-3">
                <DataView
                  data={data}
                  displayProps={isResult ? displayProps : undefined}
                  renderLayout={isResult ? renderLayout : undefined}
                />
              </div>,
            )
          })}
        </div>
      </TabsContent>
      {CODE_TABS.map((f) => (
        <TabsContent key={f.label} value={f.label}>
          <div className="space-y-3">
            {sections.map(({ label, data }) => {
              const isResult = label === "Result"
              return renderSection(
                label,
                <CodeBlock code={translateAll(data, isResult ? renderLayout : undefined)[f.key]} language={f.lang} />,
              )
            })}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  )
}
