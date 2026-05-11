"use client"

import { Handle, Position } from "@xyflow/react"
import { Badge } from "@/components/ui/badge"

type ForeachNodeData = {
  items: string
  as: string
  mode?: "sequential" | "parallel"
}

export function ForeachNode({ data }: { data: ForeachNodeData }) {
  return (
    <div className="rounded-lg border border-dashed border-emerald-400/60 bg-emerald-50/50 px-3 py-1.5 dark:border-emerald-700/60 dark:bg-emerald-950/20">
      <Handle type="target" position={Position.Top} className="!border-emerald-500 !bg-background" />

      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide dark:text-emerald-400">foreach</span>
        <Badge variant="outline" className="text-[10px] border-emerald-300 dark:border-emerald-700">
          {data.mode ?? "sequential"}
        </Badge>
      </div>

      <div className="mt-0.5 text-[11px] text-muted-foreground">
        <span className="font-mono">{data.items}</span>
        {" as "}
        <span className="font-mono text-emerald-700 dark:text-emerald-400">${data.as}</span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!border-emerald-500 !bg-background" />
    </div>
  )
}
