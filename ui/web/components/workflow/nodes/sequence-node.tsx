"use client"

import { Handle, Position } from "@xyflow/react"

type SequenceNodeData = {
  steps?: unknown[]
}

export function SequenceNode({ data }: { data: SequenceNodeData }) {
  const count = data.steps?.length ?? 0

  return (
    <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-muted/30 px-3 py-1.5 text-center">
      <Handle type="target" position={Position.Top} className="!border-muted-foreground !bg-background" />

      <div className="flex items-center justify-center gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">sequence</span>
        <span className="text-xs text-muted-foreground">({count})</span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!border-muted-foreground !bg-background" />
    </div>
  )
}
