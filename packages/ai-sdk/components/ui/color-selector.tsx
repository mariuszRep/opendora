"use client"

import { AGENT_COLORS, type AgentColorId } from "@/lib/agent-colors"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface ColorSelectorProps {
  value: AgentColorId
  onChange: (color: AgentColorId) => void
  label?: string
}

export function ColorSelector({ value, onChange, label = "Color" }: ColorSelectorProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {AGENT_COLORS.map((c) => {
          const isSelected = value === c.id
          return (
            <button
              key={c.id}
              type="button"
              title={c.label}
              onClick={() => onChange(c.id as AgentColorId)}
              className={cn(
                "size-8 rounded-full border-2 transition-all",
                "hover:border-ring/50",
                "focus-visible:outline-hidden focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                isSelected 
                  ? "border-ring ring-3 ring-ring/50" 
                  : "border-transparent"
              )}
              style={{
                backgroundColor: c.hex,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
