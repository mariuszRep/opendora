import { cn } from "@/lib/utils"
import { MiniMap as MiniMapPrimitive } from "@xyflow/react"
import type { ComponentProps } from "react"

export type WorkflowMiniMapProps = ComponentProps<typeof MiniMapPrimitive>

export const WorkflowMiniMap = ({ className, ...props }: WorkflowMiniMapProps) => (
  <MiniMapPrimitive
    className={cn(
      "m-4 overflow-hidden rounded-md border bg-card shadow-sm",
      className
    )}
    pannable
    zoomable
    ariaLabel="Workflow MiniMap"
    maskColor="color-mix(in srgb, var(--card) 60%, transparent)"
    nodeColor="var(--muted-foreground)"
    bgColor="transparent"
    nodeStrokeColor="transparent"
    nodeBorderRadius={4}
    {...props}
  />
)
