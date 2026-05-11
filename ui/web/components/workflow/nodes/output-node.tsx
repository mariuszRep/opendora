"use client"

import { Handle, Position } from "@xyflow/react"
import { cn } from "@/lib/utils"

type Data = { type: "output"; message?: string; _active?: boolean }

export function OutputNode({ data }: { data: Data }) {
  return (
    <div className={cn("rounded-xl border-2 border-muted-foreground/40 bg-muted/30 px-3 py-2 shadow-sm min-w-[140px]", data._active && "ring-2 ring-primary")}>
      <Handle type="target" position={Position.Top} className="!border-muted-foreground !bg-background" />
      <div className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-muted-foreground/60" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">output</span>
      </div>
      {data.message && (
        <div className="mt-1 text-[10px] text-muted-foreground truncate max-w-[180px]">{data.message}</div>
      )}
    </div>
  )
}
