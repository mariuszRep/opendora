"use client"

import React from "react"
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom"
import { ArrowDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ExecutionState } from "@/lib/execution-graph/types"

interface ConversationCanvasProps {
  state: ExecutionState
  children: React.ReactNode[]
  footer?: React.ReactNode
  sessionKey?: string
}

export function ConversationCanvas({
  state,
  children,
  footer,
  sessionKey,
}: ConversationCanvasProps) {
  return (
    <StickToBottom
      key={sessionKey}
      className="relative flex-1 overflow-y-auto"
      initial="smooth"
      resize="smooth"
      role="log"
    >
      <StickToBottom.Content>
        <div className="flex flex-col">
          {state.stepOrder.map((stepId, i) => (
            <div key={stepId}>
              {children[i]}
            </div>
          ))}
          {footer}
        </div>
      </StickToBottom.Content>

      <ScrollToBottomButton />
    </StickToBottom>
  )
}

function ScrollToBottomButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()
  if (isAtBottom) return null
  return (
    <Button
      className="absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full dark:bg-background dark:hover:bg-muted"
      onClick={() => scrollToBottom()}
      size="icon"
      type="button"
      variant="outline"
    >
      <ArrowDownIcon className="size-4" />
    </Button>
  )
}
