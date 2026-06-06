"use client"

import * as React from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export type SettingsBreadcrumb = {
  label: string
  href?: string
  onClick?: () => void
}

export interface SettingsPageLayoutProps {
  /**
   * Breadcrumb trail for this page. The last item is rendered as the current
   * page. If omitted, the trail defaults to Dashboard > Settings > {title}.
   */
  breadcrumbs?: SettingsBreadcrumb[]
  /** Current page label (used when breadcrumbs is omitted). */
  title?: string
  /** Optional action element rendered on the right side of the header (e.g. a button). */
  headerAction?: React.ReactNode
  /**
   * When true, constrains the content to a centered max-width column used by
   * form-heavy settings pages (providers, tools, voice). Default: false (full width).
   */
  narrow?: boolean
  /**
   * When true, removes padding and scroll from the body so children fill the
   * remaining height flush to the header. Use for canvas/editor pages.
   */
  flush?: boolean
  children: React.ReactNode
}

/**
 * Unified layout for settings pages. Provides a consistent header with
 * breadcrumbs and optional right-side action, plus a consistent body with
 * padding and scroll behaviour.
 */
export function SettingsPageLayout({
  breadcrumbs,
  title,
  headerAction,
  narrow = false,
  flush = false,
  children,
}: SettingsPageLayoutProps) {
  const trail: SettingsBreadcrumb[] = breadcrumbs ?? [
    { label: "Dashboard", href: "/dashboard" },
    { label: "Settings", href: "/dashboard/settings" },
    { label: title ?? "Settings" },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Unified header */}
      <div className="flex items-center justify-between border-b px-6 py-3 shrink-0">
        <Breadcrumb>
          <BreadcrumbList>
            {trail.map((item, idx) => {
              const isLast = idx === trail.length - 1
              return (
                <React.Fragment key={`${item.label}-${idx}`}>
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage>{item.label}</BreadcrumbPage>
                    ) : item.onClick ? (
                      <BreadcrumbLink className="cursor-pointer" onClick={item.onClick}>{item.label}</BreadcrumbLink>
                    ) : item.href ? (
                      <BreadcrumbLink href={item.href}>{item.label}</BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage>{item.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                  {!isLast && <BreadcrumbSeparator />}
                </React.Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>

        {headerAction ? (
          <div className="flex items-center gap-2">{headerAction}</div>
        ) : null}
      </div>

      {/* Unified body */}
      {flush ? (
        <div className="flex-1 overflow-hidden">{children}</div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className={narrow ? "mx-auto max-w-2xl px-6 py-8" : "p-6"}>
            {children}
          </div>
        </div>
      )}
    </div>
  )
}
