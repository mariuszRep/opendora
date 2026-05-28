'use client'

import * as React from 'react'
import { useStore } from '@xyflow/react'
import { cn } from '@/lib/utils'

interface WorkflowZoomBarProps {
  className?: string
  /** Min/max zoom used to compute progress percentage. Defaults match React Flow defaults. */
  minZoom?: number
  maxZoom?: number
  /** Auto-hide delay in ms after the last zoom change. */
  hideDelay?: number
}

/**
 * Bar that visualises the current React Flow zoom level. Fades in whenever the
 * zoom changes and fades out after `hideDelay` ms of inactivity.
 *
 * Must be rendered inside a ReactFlowProvider (or inside <ReactFlow>).
 */
export function WorkflowZoomBar({
  className,
  minZoom = 0.5,
  maxZoom = 2,
  hideDelay = 1500,
}: WorkflowZoomBarProps) {
  const zoom = useStore((s) => s.transform[2])
  const [visible, setVisible] = React.useState(false)
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const firstRender = React.useRef(true)

  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    setVisible(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setVisible(false), hideDelay)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [zoom, hideDelay])

  const pct = Math.round(zoom * 100)
  const progress = Math.max(
    0,
    Math.min(1, (zoom - minZoom) / (maxZoom - minZoom))
  )

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-1',
        'rounded-md border bg-card shadow-sm',
        'transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
        className
      )}
    >
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-[width] duration-150"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground tabular-nums w-9 text-right">
        {pct}%
      </span>
    </div>
  )
}
