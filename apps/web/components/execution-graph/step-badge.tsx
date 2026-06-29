"use client"

import React from "react";
import { StepType } from "@/lib/execution-graph/types";
import { cn } from "@/lib/utils";

const TYPE_CONFIG: Record<StepType, { label: string; className: string }> = {
  user: {
    label: "user",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/25",
  },
  assistant: {
    label: "asst",
    className: "bg-sky-500/15 text-sky-400 border-sky-500/25",
  },
  tool_call: {
    label: "tool",
    className: "bg-violet-500/15 text-violet-400 border-violet-500/25",
  },
  tool_result: {
    label: "result",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  },
  node_output: {
    label: "node",
    className: "bg-indigo-500/15 text-indigo-400 border-indigo-500/25",
  },
  generic: {
    label: "step",
    className: "bg-muted/60 text-muted-foreground border-border/40",
  },
};

interface StepBadgeProps {
  type: StepType;
  className?: string;
}

export const StepBadge: React.FC<StepBadgeProps> = ({ type, className }) => {
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.generic;
  return (
    <span
      className={cn(
        "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
};
