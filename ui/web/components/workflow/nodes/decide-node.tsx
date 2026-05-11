"use client"

import { Handle, Position } from "@xyflow/react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

type DecideNodeData = {
  skill: string
  branches?: Record<string, { goto: string | null }>
  _active?: boolean
}

export function DecideNode({ data }: { data: DecideNodeData }) {
  const branches = data.branches ? Object.keys(data.branches) : []

  return (
    <div
      className={cn(
        "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-card-foreground shadow-sm transition-all dark:border-amber-800 dark:bg-amber-950/30",
        data._active && "ring-2 ring-primary",
      )}
    >
      <Handle type="target" position={Position.Top} className="!border-amber-500 !bg-background" />

      <div className="mb-1 flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-amber-500" />
        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide dark:text-amber-400">decide</span>
      </div>

      <div className="truncate text-sm font-medium">{data.skill}</div>

      {branches.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {branches.map((b) => (
            <Badge key={b} variant="outline" className="text-[10px] border-amber-300 dark:border-amber-700">
              {b}
            </Badge>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!border-amber-500 !bg-background" />
    </div>
  )
}
