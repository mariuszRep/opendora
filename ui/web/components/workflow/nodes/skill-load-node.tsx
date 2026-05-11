"use client"

import { Handle, Position } from "@xyflow/react"
import { cn } from "@/lib/utils"

type Data = { type: "skill_load"; skill: string; storeAs?: string; _active?: boolean }

export function SkillLoadNode({ data }: { data: Data }) {
  return (
    <div className={cn("rounded-xl border bg-card px-3 py-2 shadow-sm min-w-[160px]", data._active && "ring-2 ring-primary")}>
      <Handle type="target" position={Position.Top} className="!border-primary !bg-background" />
      <div className="flex items-center gap-1.5 mb-1">
        <span className="size-2 rounded-full bg-violet-500" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">skill load</span>
      </div>
      <div className="text-sm font-medium truncate">{data.skill}</div>
      {data.storeAs && (
        <div className="mt-0.5 text-[10px] text-muted-foreground font-mono">→ ctx.{data.storeAs}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!border-primary !bg-background" />
    </div>
  )
}
