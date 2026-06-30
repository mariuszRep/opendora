"use client"

import React, { useRef, useEffect, useState, useMemo, useCallback } from "react"
import { motion } from "motion/react"
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom"
import { ArrowDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ExecutionState, LayoutOptions } from "@/lib/execution-graph/types"
import { computeLayout } from "@/lib/execution-graph/layout"

const CANVAS_OPTIONS: LayoutOptions = {
  orientation: "vertical",
  rowHeight: 32,      // dummy — Y positions come from DOM measurement
  columnWidth: 16,
  nodeRadius: 4,
  lineWidth: 2,
  nodeHeaderHeight: 24,
  showLabels: false,
  showComments: false,
  theme: "github",
}

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
  const containerRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  const [nodeCenterY, setNodeCenterY] = useState<number[]>([])
  const [svgHeight, setSvgHeight] = useState(0)

  // Call computeLayout only for X/column structure — Y values are replaced by DOM measurement
  const layout = useMemo(
    () => computeLayout(state, CANVAS_OPTIONS),
    [state]
  )

  const { columnWidth, nodeRadius, lineWidth } = CANVAS_OPTIONS
  const padX = columnWidth * 0.8
  const spacerWidth = Math.max(layout.width - 80, 40)

  // stepId → index in layout.steps
  const stepIndexMap = useMemo(() => {
    const map: Record<string, number> = {}
    layout.steps.forEach((s, i) => { map[s.id] = i })
    return map
  }, [layout.steps])

  // Resize rowRefs array when step count changes
  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, state.stepOrder.length)
  }, [state.stepOrder.length])

  // Measure row center Y positions relative to the container
  const measureRows = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const containerTop = container.getBoundingClientRect().top
    const scrollTop = container.closest("[data-overlayscrollbars-viewport]")?.scrollTop
      ?? (container.parentElement?.scrollTop ?? 0)

    const ys: number[] = new Array(state.stepOrder.length).fill(0)
    let maxBottom = 0

    for (let i = 0; i < state.stepOrder.length; i++) {
      const el = rowRefs.current[i]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      const centerY = (rect.top - containerTop) + scrollTop + rect.height / 2
      ys[i] = centerY
      maxBottom = Math.max(maxBottom, (rect.top - containerTop) + scrollTop + rect.height)
    }

    setNodeCenterY(ys)
    setSvgHeight(maxBottom)
  }, [state.stepOrder.length])

  useEffect(() => {
    measureRows()
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(measureRows)
    ro.observe(container)
    // Also observe each row for height changes (tool calls expanding, etc.)
    rowRefs.current.forEach((el) => { if (el) ro.observe(el) })
    return () => ro.disconnect()
  }, [measureRows, state.stepOrder.length])

  // Generate SVG paths using measured Y values
  const paths = useMemo(() => {
    if (nodeCenterY.length === 0) return []
    const result: { id: string; d: string; color: string }[] = []

    for (const rs of layout.steps) {
      const childIdx = stepIndexMap[rs.id]
      if (childIdx === undefined) continue
      const childX = rs.x
      const childY = nodeCenterY[childIdx]
      if (!childY) continue

      rs.step.parents.forEach((parentId, parentIdx) => {
        const parentRS = layout.steps[stepIndexMap[parentId]]
        if (!parentRS) return
        const parentIdx2 = stepIndexMap[parentId]
        const parentX = parentRS.x
        const parentY = nodeCenterY[parentIdx2]
        if (!parentY) return

        const isMergeLine = parentIdx > 0
        const rowDiff = childIdx - parentIdx2
        const curveH = Math.min(Math.abs(childY - parentY) * 0.4, 60)

        let d = ""
        if (parentRS.col === rs.col) {
          d = `M ${parentX} ${parentY} L ${childX} ${childY}`
        } else if (!isMergeLine && rowDiff <= 2) {
          const bendY = parentY + curveH
          d = `M ${parentX} ${parentY} C ${parentX} ${parentY + curveH * 0.3}, ${childX} ${bendY - curveH * 0.3}, ${childX} ${bendY} L ${childX} ${childY}`
        } else if (isMergeLine) {
          const bendY = childY - curveH
          d = `M ${parentX} ${parentY} L ${parentX} ${bendY} C ${parentX} ${bendY + curveH * 0.3}, ${childX} ${childY - curveH * 0.3}, ${childX} ${childY}`
        } else {
          const midY = parentY + (childY - parentY) * 0.5
          d = `M ${parentX} ${parentY} C ${parentX} ${parentY + curveH}, ${childX} ${midY - curveH}, ${childX} ${midY} L ${childX} ${childY}`
        }

        result.push({
          id: `${parentId}-${rs.id}-${parentIdx}`,
          d,
          color: parentRS.color,
        })
      })
    }
    return result
  }, [layout.steps, nodeCenterY, stepIndexMap])

  return (
    <StickToBottom
      key={sessionKey}
      className="relative flex-1 overflow-y-auto"
      initial="smooth"
      resize="smooth"
      role="log"
    >
      <StickToBottom.Content>
        <div ref={containerRef} className="relative">
          {/* SVG overlay — sits on the left gutter, pointer-events none so clicks reach messages */}
          <svg
            className="absolute left-0 top-0 pointer-events-none z-20"
            width={spacerWidth}
            height={Math.max(svgHeight, 1)}
            style={{ overflow: "visible" }}
          >
            {/* Paths first so nodes render on top */}
            <g>
              {paths.map((p) => (
                <motion.path
                  key={p.id}
                  d={p.d}
                  fill="none"
                  stroke={p.color}
                  strokeWidth={lineWidth}
                  strokeLinecap="round"
                  opacity={0.7}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.35 }}
                />
              ))}
            </g>

            {/* Node dots */}
            <g>
              {layout.steps.map((s, i) => {
                const y = nodeCenterY[i]
                if (!y) return null
                return (
                  <g key={`node-${s.id}`}>
                    {s.isCursor && (
                      <motion.circle
                        cx={s.x} cy={y} r={nodeRadius + 4}
                        fill="none" stroke={s.color} strokeWidth="1.5"
                        animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.1, 0.5] }}
                        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                      />
                    )}
                    <circle
                      cx={s.x} cy={y}
                      r={nodeRadius}
                      fill={s.isCursor ? "transparent" : s.color}
                      stroke={s.color}
                      strokeWidth={s.isCursor ? 2 : 0}
                    />
                    {s.isCursor && (
                      <circle cx={s.x} cy={y} r={Math.max(nodeRadius - 2, 1.5)} fill={s.color} />
                    )}
                  </g>
                )
              })}
            </g>
          </svg>

          {/* Message rows — spacer on left clears the graph column */}
          <div className="flex flex-col">
            {state.stepOrder.map((stepId, i) => (
              <div
                key={stepId}
                ref={(el) => { rowRefs.current[i] = el }}
                className="flex items-stretch"
              >
                {/* Left gutter — same width as SVG so messages start after nodes */}
                <div style={{ width: spacerWidth, minWidth: spacerWidth }} className="shrink-0" />
                {/* Full opendora MessageRow */}
                <div className="flex-1 min-w-0">
                  {children[i]}
                </div>
              </div>
            ))}
            {footer && (
              <div className="flex items-stretch">
                <div style={{ width: spacerWidth, minWidth: spacerWidth }} className="shrink-0" />
                <div className="flex-1 min-w-0">{footer}</div>
              </div>
            )}
          </div>
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
