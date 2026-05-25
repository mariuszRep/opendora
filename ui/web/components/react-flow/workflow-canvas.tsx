import { Canvas } from "./canvas"
import type { ComponentProps } from "react"

type WorkflowCanvasProps = ComponentProps<typeof Canvas>

export const WorkflowCanvas = ({ ...props }: WorkflowCanvasProps) => (
  <Canvas
    selectionOnDrag={true}
    {...props}
  />
)
