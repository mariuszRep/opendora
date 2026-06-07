"use client"

import { cn } from "@/lib/utils"
import { Controls } from "./controls"
import { ControlButton as ControlButtonPrimitive } from "@xyflow/react"
import type { ComponentProps } from "react"

export type WorkflowControlsProps = ComponentProps<typeof Controls>
export type WorkflowControlButtonProps = ComponentProps<typeof ControlButtonPrimitive>

export const WorkflowControlButton = ({ className, ...props }: WorkflowControlButtonProps) => (
  <ControlButtonPrimitive
    className={cn(
      "border-none! bg-transparent! hover:bg-secondary! rounded-md!",
      className
    )}
    {...props}
  />
)

export const WorkflowControls = ({ className, ...props }: WorkflowControlsProps) => (
  <Controls
    className={cn(
      "flex",
      props.orientation === "horizontal" ? "flex-row" : "flex-col",
      className
    )}
    {...props}
  />
)
