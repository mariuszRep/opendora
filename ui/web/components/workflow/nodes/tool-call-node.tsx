"use client"

import { Handle, Position } from "@xyflow/react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

type Data = { type: "tool_call"; tool: string; args: Record<string, string>; output?: string; _active?: boolean }

export function ToolCallNode({ data }: { data: Data }) {
  const argKeys = Object.keys(data.args ?? {})
  return (
    <div className={cn("rounded-xl border bg-card px-3 py-2 shadow-sm min-w-[160px]", data._active && "ring-2 ring-primary")}>
      <Handle type="target" position={Position.Top} className="!border-primary !bg-background" />
      <div className="flex items-center gap-1.5 mb-1">
        <span className="size-2 rounded-full bg-amber-500" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">tool call</span>
      </div>
      <div className="text-sm font-medium font-mono truncate">{data.tool}</div>
      {argKeys.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {argKeys.slice(0, 3).map((k) => (
            <Badge key={k} variant="secondary" className="text-[10px]">{k}</Badge>
          ))}
          {argKeys.length > 3 && <Badge variant="outline" className="text-[10px]">+{argKeys.length - 3}</Badge>}
        </div>
      )}
      {data.output && (
        <div className="mt-1 text-[10px] text-muted-foreground">→ <span className="font-mono">{data.output}</span></div>
      )}
      <Handle type="source" position={Position.Bottom} className="!border-primary !bg-background" />
    </div>
  )
}
