"use client"

import { Handle, Position } from "@xyflow/react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

type Data = { type: "decide"; prompt: string; branches: string[]; _active?: boolean }

export function DecideNode({ data }: { data: Data }) {
  const preview = data.prompt?.length > 55 ? data.prompt.slice(0, 52) + "…" : data.prompt
  return (
    <div className={cn("rounded-xl border-2 border-orange-500 bg-orange-50 dark:bg-orange-950/30 px-3 py-2 shadow-sm min-w-[200px] max-w-[240px]", data._active && "ring-2 ring-primary")}>
      <Handle type="target" position={Position.Top} className="!border-orange-500 !bg-background" />
      <div className="flex items-center gap-1.5 mb-1">
        <span className="size-2 rounded-full bg-orange-500" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400">decide</span>
      </div>
      <div className="text-xs text-muted-foreground leading-snug mb-1.5">{preview}</div>
      <div className="flex flex-wrap gap-1">
        {(data.branches ?? []).map((b) => (
          <Badge key={b} variant="outline" className="text-[10px] border-orange-300">{b}</Badge>
        ))}
      </div>
      <Handle type="source" position={Position.Bottom} className="!border-orange-500 !bg-background" />
    </div>
  )
}
