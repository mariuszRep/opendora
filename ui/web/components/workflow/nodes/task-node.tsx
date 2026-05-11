"use client"

import { Handle, Position } from "@xyflow/react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

type TaskNodeData = {
  skill: string
  input?: Record<string, unknown>
  output: string
  _active?: boolean
}

export function TaskNode({ data }: { data: TaskNodeData }) {
  const inputKeys = data.input ? Object.keys(data.input) : []

  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-3 py-2 text-card-foreground shadow-sm transition-all",
        data._active && "ring-2 ring-primary",
      )}
    >
      <Handle type="target" position={Position.Top} className="!border-primary !bg-background" />

      <div className="mb-1 flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-blue-500" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">task</span>
      </div>

      <div className="truncate text-sm font-medium">{data.skill}</div>

      {inputKeys.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {inputKeys.slice(0, 3).map((k) => (
            <Badge key={k} variant="secondary" className="text-[10px]">
              {k}
            </Badge>
          ))}
          {inputKeys.length > 3 && (
            <Badge variant="outline" className="text-[10px]">+{inputKeys.length - 3}</Badge>
          )}
        </div>
      )}

      {data.output && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          → <span className="font-mono">{data.output}</span>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!border-primary !bg-background" />
    </div>
  )
}
