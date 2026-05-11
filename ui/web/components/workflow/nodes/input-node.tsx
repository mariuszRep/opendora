"use client"

import { Handle, Position } from "@xyflow/react"
import { cn } from "@/lib/utils"

type Data = { type: "input"; fields: Array<{ name: string; type: string }>; _active?: boolean }

export function InputNode({ data }: { data: Data }) {
  return (
    <div className={cn("rounded-xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 shadow-sm min-w-[160px]", data._active && "ring-2 ring-primary")}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="size-2 rounded-full bg-emerald-500" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">input</span>
      </div>
      {data.fields?.length > 0 && (
        <div className="space-y-0.5">
          {data.fields.map((f) => (
            <div key={f.name} className="text-xs text-muted-foreground font-mono">
              {f.name}: <span className="text-emerald-600 dark:text-emerald-400">{f.type}</span>
            </div>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!border-emerald-500 !bg-background" />
    </div>
  )
}
