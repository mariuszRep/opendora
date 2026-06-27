"use client"

import * as React from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { BellRingIcon, ClockPlusIcon } from "lucide-react"
import type { Schedule } from "@/lib/opendora"
import { getAgentColor } from "@/lib/agent-colors"

export interface ScheduleCardProps {
  schedule: Schedule
  onEdit: (schedule: Schedule) => void
}

function parseDelegate(raw: string): { prompt: string } | null {
  try {
    const p = JSON.parse(raw)
    if (typeof p === "object" && p !== null && typeof p.prompt === "string") return p
    return null
  } catch { return null }
}

export function ScheduleCard({
  schedule,
  onEdit,
}: Pick<ScheduleCardProps, "schedule" | "onEdit">) {
  const color = getAgentColor(schedule.color)
  const delegate = schedule.action_type === "tool" ? parseDelegate(schedule.prompt ?? "") : null
  const displayPrompt = delegate ? delegate.prompt : schedule.prompt

  return (
    <Card
      className="flex flex-col cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => onEdit(schedule)}
    >
      {/* Header — title only */}
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <div className="relative flex items-center justify-center size-4 shrink-0">
            <div className="absolute inset-0 rounded-full border-2" style={{ borderColor: color.hex }} />
            <div className="size-2 rounded-full" style={{ backgroundColor: color.hex }} />
          </div>
          <span className="truncate">{schedule.name || schedule.cron_expression}</span>
        </CardTitle>
      </CardHeader>

      {/* Body — prompt only */}
      <CardContent className="flex-1">
        <p className="text-sm text-muted-foreground line-clamp-3">{displayPrompt}</p>
      </CardContent>

      {/* Footer — cron left, active status right */}
      <CardFooter className="flex items-center justify-between border-t pt-3">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ClockPlusIcon className="size-3 shrink-0" />
          {schedule.cron_expression}
        </span>
        <span className={`text-xs flex items-center gap-1 ${schedule.is_active ? "text-emerald-500" : "text-muted-foreground"}`}>
          <BellRingIcon className="size-3" />
          {schedule.is_active ? "Active" : "Paused"}
        </span>
      </CardFooter>
    </Card>
  )
}
