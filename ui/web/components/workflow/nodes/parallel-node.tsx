"use client"

import { Handle, Position } from "@xyflow/react"
import { Badge } from "@/components/ui/badge"

type ParallelNodeData = {
  branches?: unknown[]
  join?: "all" | "any" | "n"
  joinN?: number
}

export function ParallelNode({ data }: { data: ParallelNodeData }) {
  const count = data.branches?.length ?? 0
  const joinLabel = data.join === "n" ? `${data.joinN}/${count}` : data.join ?? "all"

  return (
    <div className="rounded-lg border border-dashed border-violet-400/60 bg-violet-50/50 px-3 py-1.5 text-center dark:border-violet-700/60 dark:bg-violet-950/20">
      <Handle type="target" position={Position.Top} className="!border-violet-500 !bg-background" />

      <div className="flex items-center justify-center gap-1.5">
        <span className="text-xs font-semibold text-violet-700 uppercase tracking-wide dark:text-violet-400">parallel</span>
        <Badge variant="outline" className="text-[10px] border-violet-300 dark:border-violet-700">
          join:{joinLabel}
        </Badge>
      </div>

      <Handle type="source" position={Position.Bottom} className="!border-violet-500 !bg-background" />
    </div>
  )
}
