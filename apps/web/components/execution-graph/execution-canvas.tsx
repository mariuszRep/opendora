"use client"

import React, { useState } from "react"
import { motion } from "motion/react"
import { ExecutionState, LayoutOptions } from "@/lib/execution-graph/types"
import { computeLayout } from "@/lib/execution-graph/layout"
import { StepBadge } from "@/components/execution-graph/step-badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Copy,
  Tag,
} from "lucide-react"

interface ExecutionCanvasProps {
  state: ExecutionState
  options: LayoutOptions
  onForkFromStep: (fromStepId: string, runName: string) => void
  onSetCursorToRun: (runId: string) => void
  onAddLabel: (label: string, stepId: string) => void
  onStepClick?: (stepId: string) => void
  minimal?: boolean
}

export const ExecutionCanvas: React.FC<ExecutionCanvasProps> = ({
  state,
  options,
  onForkFromStep,
  onSetCursorToRun,
  onAddLabel,
  onStepClick,
  minimal = false,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const layout = computeLayout(state, options)
  const { rowHeight, nodeRadius, lineWidth, showLabels } = options
  const spacerWidth = Math.max(layout.width - 80, 40)

  const getStepRun = (stepId: string) => {
    const step = state.steps[stepId]
    if (!step) return null
    return state.runs[step.runId] ?? null
  }

  const handleCopyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(id)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleRowClick = (stepId: string) => {
    const step = state.steps[stepId]
    if (!step) return
    onStepClick?.(stepId)
    onSetCursorToRun(step.runId)
    setSelectedId(selectedId === stepId ? null : stepId)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Scrollable graph area */}
      <div className="flex-1 overflow-auto relative bg-sidebar">
        <div className="relative select-none" style={{ height: `${layout.height}px`, minWidth: "100%" }}>

          {/* SVG Overlay (pointer-events: none — clicks go through to rows) */}
          <div
            className="absolute left-0 top-0 pointer-events-none z-20"
            style={{ width: `${spacerWidth}px`, height: `${layout.height}px` }}
          >
            <svg width={spacerWidth} height={layout.height} className="absolute inset-0">
              {/* Paths */}
              <g>
                {layout.paths.map((p) => {
                  const isHighlighted = !!selectedId && p.id.includes("-" + selectedId + "-")
                  const isHovered = !!hoveredId && p.id.includes(hoveredId)
                  return (
                    <motion.path
                      key={p.id}
                      d={p.d}
                      fill="none"
                      stroke={p.color}
                      strokeWidth={isHighlighted ? lineWidth + 2.5 : isHovered ? lineWidth + 1 : lineWidth}
                      strokeLinecap="round"
                      opacity={isHighlighted ? 1.0 : isHovered ? 0.9 : 0.55}
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.4 }}
                    />
                  )
                })}
              </g>

              {/* Step nodes */}
              <g>
                {layout.steps.map((s) => {
                  const isHovered = hoveredId === s.id
                  const isSelected = selectedId === s.id
                  return (
                    <g key={`node-${s.id}`}>
                      {s.isCursor && (
                        <motion.circle
                          cx={s.x}
                          cy={s.y}
                          r={nodeRadius + 4}
                          fill="none"
                          stroke={s.color}
                          strokeWidth="2"
                          animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0.1, 0.6] }}
                          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                        />
                      )}
                      {(isHovered || isSelected) && (
                        <circle
                          cx={s.x}
                          cy={s.y}
                          r={nodeRadius + 4.5}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          opacity={isSelected ? 0.6 : 0.3}
                        />
                      )}
                      <circle
                        cx={s.x}
                        cy={s.y}
                        r={isHovered ? nodeRadius + 1.5 : nodeRadius}
                        fill={s.isCursor ? "transparent" : s.color}
                        stroke={s.color}
                        strokeWidth={s.isCursor ? 2.5 : 0}
                      />
                      {s.isCursor && (
                        <circle cx={s.x} cy={s.y} r={Math.max(nodeRadius - 2, 1.5)} fill={s.color} />
                      )}
                    </g>
                  )
                })}
              </g>
            </svg>
          </div>

          {/* Row list */}
          <div className="absolute inset-0 flex flex-col z-10">
            {layout.steps.map((s) => {
              const run = getStepRun(s.id)
              const runColor = run?.color ?? "#9CA3AF"
              const isHovered = hoveredId === s.id
              const isSelected = selectedId === s.id

              return (
                <div
                  key={s.id}
                  style={{ height: `${rowHeight}px`, borderLeft: `3px solid ${runColor}20` }}
                  className={cn(
                    "group flex items-center justify-between px-4 border-b border-border/40 cursor-pointer transition-all duration-150 shrink-0",
                    isSelected
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : isHovered
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground hover:bg-accent/40",
                  )}
                  onMouseEnter={() => setHoveredId(s.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => handleRowClick(s.id)}
                >
                  <div style={{ width: `${spacerWidth}px` }} className="shrink-0 h-full" />

                  <div className="flex-1 min-w-0 flex items-center gap-2.5 pr-4">
                    {!minimal && (
                      <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border/80 shrink-0">
                        {s.id.slice(0, 7)}
                      </span>
                    )}
                    {!minimal && <StepBadge type={s.step.type} />}
                    <span className="font-medium text-xs whitespace-pre-wrap break-words truncate">{s.step.content}</span>
                    {showLabels && s.step.labels.length > 0 && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {s.step.labels.map((lbl, i) => (
                          <span key={i} className="text-[10px] font-medium px-2 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-amber-400 flex items-center gap-1">
                            <Tag size={9} />
                            {lbl}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {!minimal && (
                    <div className="flex items-center gap-4 shrink-0 text-xs">
                      {s.step.author && (
                        <span className="text-muted-foreground text-[11px] font-medium hidden sm:inline">{s.step.author}</span>
                      )}
                      <span className="text-muted-foreground/60 text-[11px] font-mono whitespace-nowrap">
                        {new Date(s.step.timestamp).toLocaleDateString([], { month: "short", day: "numeric" })}
                      </span>
                      <button
                        onClick={(e) => handleCopyId(s.id, e)}
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                        title="Copy step id"
                      >
                        {copiedId === s.id ? <span className="text-[10px]">✓</span> : <Copy size={12} />}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
