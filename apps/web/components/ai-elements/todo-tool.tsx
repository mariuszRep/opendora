"use client"

import type { ToolPart } from "@/lib/projectflows"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { CheckCircle2Icon, CircleDashedIcon } from "lucide-react"

type TodoItem = {
  id: string
  content: string
  status: "pending" | "in-progress" | "completed"
  priority?: "high" | "medium" | "low"
}

function getTodoMetadata(tool: ToolPart): TodoItem[] {
  if ("metadata" in tool.state && tool.state.metadata && Array.isArray((tool.state.metadata as { todos?: TodoItem[] }).todos)) {
    return (tool.state.metadata as { todos: TodoItem[] }).todos
  }
  // Fall back to parsing input if metadata not yet available
  const input = "input" in tool.state ? tool.state.input : undefined
  if (input && Array.isArray((input as { todos?: TodoItem[] }).todos)) {
    return (input as { todos: TodoItem[] }).todos
  }
  return []
}

const priorityColors: Record<string, string> = {
  high: "text-red-500",
  medium: "text-yellow-500",
  low: "text-muted-foreground",
}

function TodoRow({ item, index }: { item: TodoItem; index: number }) {
  const isCompleted = item.status === "completed"
  const isInProgress = item.status === "in-progress"

  return (
    <div className="flex items-start gap-3 py-2.5">
      {/* Status indicator */}
      {isCompleted ? (
        <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-green-500" />
      ) : isInProgress ? (
        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">
          {index + 1}
        </span>
      ) : (
        <CircleDashedIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground/60" />
      )}

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "text-sm leading-snug",
            isCompleted && "text-muted-foreground line-through",
            isInProgress && "font-medium text-foreground",
            !isCompleted && !isInProgress && "text-muted-foreground"
          )}
        >
          {item.content}
        </span>
      </div>

      {/* Priority badge */}
      {item.priority && !isCompleted && (
        <Badge
          variant="outline"
          className={cn("shrink-0 text-[10px] capitalize", priorityColors[item.priority])}
        >
          {item.priority}
        </Badge>
      )}
    </div>
  )
}

export type TodoToolContentProps = {
  tool: ToolPart
}

export const TodoToolContent = ({ tool }: TodoToolContentProps) => {
  const todos = getTodoMetadata(tool)

  if (todos.length === 0) {
    return (
      <div className="rounded-md border bg-background px-4 py-6 text-center text-sm text-muted-foreground">
        No todos
      </div>
    )
  }

  const pending = todos.filter((t) => t.status === "pending").length
  const inProgress = todos.filter((t) => t.status === "in-progress").length
  const completed = todos.filter((t) => t.status === "completed").length

  return (
    <div className="rounded-md border bg-background">
      {/* Summary row */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {todos.length} task{todos.length !== 1 ? "s" : ""}
        </span>
        {inProgress > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {inProgress} in progress
          </Badge>
        )}
        {completed > 0 && (
          <Badge variant="secondary" className="gap-1 text-[10px] text-green-600">
            <CheckCircle2Icon className="size-3" />
            {completed} done
          </Badge>
        )}
      </div>

      {/* Todo list */}
      <div className="divide-y px-3">
        {todos.map((item, index) => (
          <TodoRow key={item.id} item={item} index={index} />
        ))}
      </div>
    </div>
  )
}

export function getTodoToolTitle(tool: ToolPart): string {
  const todos = getTodoMetadata(tool)
  if (todos.length === 0) {
    const input = "input" in tool.state ? tool.state.input : undefined
    const count = Array.isArray((input as { todos?: unknown[] })?.todos)
      ? (input as { todos: unknown[] }).todos.length
      : 0
    return count > 0 ? `${count} todos` : "Todo List"
  }
  const remaining = todos.filter((t) => t.status !== "completed").length
  return `${remaining} todo${remaining !== 1 ? "s" : ""}`
}

const TODO_TOOLS = new Set(["todowrite", "todoread"])

export function isTodoTool(toolName: string): boolean {
  return TODO_TOOLS.has(toolName)
}
