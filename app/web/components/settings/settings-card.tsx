"use client"

import { LucideIcon } from "lucide-react"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export interface SettingsCardProps {
  title: string | React.ReactNode
  description?: string
  icon?: LucideIcon
  footer?: React.ReactNode
  action?: React.ReactNode
  onDoubleClick?: () => void
  onClick?: () => void
  className?: string
  children?: React.ReactNode
}

export function SettingsCard({
  title,
  description,
  icon: Icon,
  footer,
  action,
  onDoubleClick,
  onClick,
  className,
  children,
}: SettingsCardProps) {
  return (
    <Card
      className={`hover:shadow-md hover:border-primary/50 transition-all h-full flex flex-col ${footer ? "pb-0" : ""} ${onClick || onDoubleClick ? "cursor-pointer" : ""} ${className || ""}`}
      onDoubleClick={onDoubleClick}
      onClick={onClick}
    >
      <CardHeader className="pb-2 flex-1">
        <div className="flex items-start gap-2 min-w-0">
          {Icon && (
            <div className="shrink-0">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base leading-tight">{title}</CardTitle>
            {description && (
              <CardDescription className="text-sm line-clamp-2 mt-1">
                {description}
              </CardDescription>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </CardHeader>
      {children}
      {footer && (
        <CardFooter className="border-t bg-muted/30 pt-4 pb-6 mt-auto -mb-6">
          {footer}
        </CardFooter>
      )}
    </Card>
  )
}
