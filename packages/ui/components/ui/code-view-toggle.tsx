"use client"

import { EyeIcon } from "lucide-react"
import { RiBracesLine } from "react-icons/ri"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface CodeViewToggleProps {
  viewMode: "code" | "view"
  onViewChange: (mode: "code" | "view") => void
  hasView?: boolean
  className?: string
}

export function CodeViewToggle({ 
  viewMode, 
  onViewChange, 
  hasView = true,
  className 
}: CodeViewToggleProps) {
  if (!hasView) return null

  return (
    <div
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer",
        className
      )}
      onClick={(e) => {
        e.stopPropagation()
        onViewChange(viewMode === "code" ? "view" : "code")
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          e.stopPropagation()
          onViewChange(viewMode === "code" ? "view" : "code")
        }
      }}
    >
      <Label className="cursor-pointer pointer-events-none">
        {viewMode === "code" ? (
          <EyeIcon className="h-4 w-4" />
        ) : (
          <RiBracesLine className="h-4 w-4" />
        )}
      </Label>
    </div>
  )
}
