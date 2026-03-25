"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { CalendarDays } from "lucide-react"

export interface CronInputProps {
  value?: string
  onChange?: (value: string) => void
}

export function CronInput({ value = "0 0 * * *", onChange }: CronInputProps) {
  return (
    <div className="flex gap-2">
      <Input
        className="flex-1 font-mono text-sm"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="0 9 * * 1"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        title="Visual picker (coming soon)"
        disabled
      >
        <CalendarDays className="h-4 w-4" />
      </Button>
    </div>
  )
}
