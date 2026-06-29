"use client"

import React, { useState } from "react";
import { motion } from "motion/react";
import { ExecutionState, LayoutOptions } from "@/lib/execution-graph/types";
import { computeLayout } from "@/lib/execution-graph/layout";
import { StepBadge } from "@/components/execution-graph/step-badge";
import {
  ChevronDown,
  Target,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  MoreHorizontal,
  Copy,
  Zap,
} from "lucide-react";

export interface ExecutionCanvasProps {
  state: ExecutionState;
  options: LayoutOptions;
  onSetCursorToRun?: (runId: string) => void;
}

export const ExecutionCanvas: React.FC<ExecutionCanvasProps> = ({
  state,
  options,
  onSetCursorToRun,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const layout = computeLayout(state, options);
  const { rowHeight, nodeRadius, lineWidth, showLabels } = options;
  const spacerWidth = Math.max(layout.width - 80, 40);

  const getStepRun = (stepId: string) => {
    const step = state.steps[stepId];
    if (!step) return null;
    return state.runs[step.runId] ?? null;
  };

  const handleCopyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRowClick = (stepId: string) => {
    const step = state.steps[stepId];
    if (!step) return;
    onSetCursorToRun?.(step.runId);
    setSelectedId(selectedId === stepId ? null : stepId);
  };

  const scrollRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };
  const scrollToTop = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  return (
    <div className="flex flex-col h-full bg-[#09090b] border border-zinc-800/80 overflow-hidden font-sans text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#09090b] border-b border-zinc-800/80 select-none shrink-0">
        <div className="flex items-center gap-1.5 text-zinc-100 font-semibold text-xs tracking-wide">
          <ChevronDown size={13} className="text-zinc-400" />
          <span>Execution Graph</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-400">
          <button className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800/60 hover:bg-zinc-800 text-[10px] text-zinc-200 transition-colors border border-zinc-700/50">
            <Zap size={10} className="text-zinc-300" />
            <span className="font-medium">Live</span>
          </button>
          <button onClick={scrollToTop} className="p-0.5 hover:bg-zinc-800 rounded hover:text-zinc-200 transition-colors" title="Scroll to top">
            <ArrowUp size={13} />
          </button>
          <button onClick={scrollToBottom} className="p-0.5 hover:bg-zinc-800 rounded hover:text-zinc-200 transition-colors" title="Scroll to bottom">
            <ArrowDown size={13} />
          </button>
          <button className="p-0.5 hover:bg-[#18181b] rounded hover:text-zinc-200 transition-colors">
            <RefreshCw size={13} />
          </button>
          <button className="p-0.5 hover:bg-[#18181b] rounded hover:text-zinc-200 transition-colors">
            <MoreHorizontal size={13} />
          </button>
        </div>
      </div>

      {/* Scrollable graph area */}
      <div ref={scrollRef} className="flex-1 overflow-auto relative bg-[#09090b]">
        <div className="relative select-none" style={{ height: `${layout.height}px`, minWidth: "100%" }}>

          {/* SVG overlay — pointer-events:none so clicks go through to rows */}
          <div
            className="absolute left-0 top-0 pointer-events-none z-20"
            style={{ width: `${spacerWidth}px`, height: `${layout.height}px` }}
          >
            <svg width={spacerWidth} height={layout.height} className="absolute inset-0">
              <g>
                {layout.paths.map((p) => {
                  const isHighlighted = !!selectedId && p.id.includes("-" + selectedId + "-");
                  const isHovered = !!hoveredId && p.id.includes(hoveredId);
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
                  );
                })}
              </g>

              <g>
                {layout.steps.map((s) => {
                  const isHovered = hoveredId === s.id;
                  const isSelected = selectedId === s.id;
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
                          stroke="#FFFFFF"
                          strokeWidth="1.5"
                          opacity={isSelected ? 0.9 : 0.5}
                        />
                      )}
                      <circle
                        cx={s.x}
                        cy={s.y}
                        r={isHovered ? nodeRadius + 1.5 : nodeRadius}
                        fill={s.isCursor ? "#09090b" : s.color}
                        stroke={s.color}
                        strokeWidth={s.isCursor ? 2.5 : 0}
                      />
                      {s.isCursor && (
                        <circle cx={s.x} cy={s.y} r={Math.max(nodeRadius - 2, 1.5)} fill={s.color} />
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          {/* Row list */}
          <div className="absolute inset-0 flex flex-col z-10">
            {layout.steps.map((s) => {
              const run = getStepRun(s.id);
              const runColor = run?.color ?? "#9CA3AF";
              const isHovered = hoveredId === s.id;
              const isSelected = selectedId === s.id;

              return (
                <div
                  key={s.id}
                  style={{ height: `${rowHeight}px`, borderLeft: `3px solid ${runColor}20` }}
                  className={`group flex items-center justify-between px-4 border-b border-zinc-900/40 cursor-default transition-all duration-150 shrink-0 ${
                    isSelected
                      ? "bg-indigo-500/5 text-white"
                      : isHovered
                      ? "bg-zinc-900/80 text-white"
                      : "text-zinc-300 hover:bg-zinc-900/40"
                  }`}
                  onMouseEnter={() => setHoveredId(s.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => handleRowClick(s.id)}
                >
                  {/* Spacer matching SVG width */}
                  <div style={{ width: `${spacerWidth}px` }} className="shrink-0 h-full" />

                  <div className="flex-1 min-w-0 flex items-center gap-2.5 pr-4">
                    <span className="font-mono text-[11px] text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-900/80 shrink-0">
                      {s.id.slice(0, 7)}
                    </span>
                    <StepBadge type={s.step.type} />
                    <span className="font-medium text-zinc-100 text-xs truncate">{s.step.content}</span>
                    {showLabels && s.step.labels.length > 0 && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {s.step.labels.map((lbl, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-medium px-2 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-amber-400"
                          >
                            {lbl}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-xs">
                    {s.step.author && (
                      <span className="text-zinc-500 text-[11px] font-medium hidden sm:inline">{s.step.author}</span>
                    )}
                    <span className="text-zinc-600 text-[11px] font-mono whitespace-nowrap">
                      {new Date(s.step.timestamp).toLocaleDateString([], { month: "short", day: "numeric" })}
                    </span>
                    <button
                      onClick={(e) => handleCopyId(s.id, e)}
                      className="p-1 rounded text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800/50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      title="Copy step id"
                    >
                      {copiedId === s.id ? <span className="text-[10px]">✓</span> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
