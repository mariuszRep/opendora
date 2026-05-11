"use client"

import { Handle, Position } from "@xyflow/react"
import { cn } from "@/lib/utils"

type Data = { type: "agent"; prompt: string; output?: string; _active?: boolean }

export function AgentNode({ data }: { data: Data }) {
  const preview = data.prompt?.length > 60 ? data.prompt.slice(0, 57) + "…" : data.prompt
  return (
    <div className={cn("rounded-xl border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/30 px-3 py-2 shadow-sm min-w-[200px] max-w-[240px]", data._active && "ring-2 ring-primary")}>
      <Handle type="target" position={Position.Top} className="!border-blue-500 !bg-background" />
      <div className="flex items-center gap-1.5 mb-1">
        <span className="size-2 rounded-full bg-blue-500" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">agent</span>
        {data.output && (
          <span className="ml-auto text-[10px] text-muted-foreground font-mono">→ {data.output}</span>
        )}
      </div>
      <div className="text-xs text-muted-foreground leading-snug">{preview}</div>
      <Handle type="source" position={Position.Bottom} className="!border-blue-500 !bg-background" />
    </div>
  )
}
