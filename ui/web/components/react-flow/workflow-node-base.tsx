import {
  Node,
  NodeHeader,
  NodeTitle,
  NodeDescription,
  NodeAction,
  NodeContent,
  NodeFooter,
} from "./node"
import type { ComponentProps } from "react"

export type WorkflowNodeBaseProps = ComponentProps<typeof Node>
export const WorkflowNodeBase = Node

export type WorkflowNodeHeaderProps = ComponentProps<typeof NodeHeader>
export const WorkflowNodeHeader = NodeHeader

export type WorkflowNodeTitleProps = ComponentProps<typeof NodeTitle>
export const WorkflowNodeTitle = NodeTitle

export type WorkflowNodeDescriptionProps = ComponentProps<typeof NodeDescription>
export const WorkflowNodeDescription = NodeDescription

export type WorkflowNodeActionProps = ComponentProps<typeof NodeAction>
export const WorkflowNodeAction = NodeAction

export type WorkflowNodeContentProps = ComponentProps<typeof NodeContent>
export const WorkflowNodeContent = NodeContent

export type WorkflowNodeFooterProps = ComponentProps<typeof NodeFooter>
export const WorkflowNodeFooter = NodeFooter
