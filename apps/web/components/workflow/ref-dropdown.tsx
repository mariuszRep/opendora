'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import type { RefSuggestion } from '@/lib/workflow-refs'

interface RefDropdownProps {
  open: boolean
  items: RefSuggestion[]
  activeIndex: number
  anchorRef: React.RefObject<HTMLElement | null>
  onSelect: (s: RefSuggestion) => void
  onHover: (i: number) => void
}

export function RefDropdown({ open, items, activeIndex, anchorRef, onSelect, onHover }: RefDropdownProps) {
  const [style, setStyle] = React.useState<React.CSSProperties>({})

  React.useLayoutEffect(() => {
    if (!open || !anchorRef.current) return

    const rect = anchorRef.current.getBoundingClientRect()
    const dropH = Math.min(items.length * 54, 220)
    const spaceBelow = window.innerHeight - rect.bottom
    const showAbove = spaceBelow < dropH + 8 && rect.top > dropH + 8

    setStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      ...(showAbove
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
      zIndex: 9999,
    })
  }, [open, items.length, anchorRef])

  // Reposition on scroll / resize
  React.useEffect(() => {
    if (!open) return
    const reposition = () => {
      if (!anchorRef.current) return
      const rect = anchorRef.current.getBoundingClientRect()
      const dropH = Math.min(items.length * 54, 220)
      const spaceBelow = window.innerHeight - rect.bottom
      const showAbove = spaceBelow < dropH + 8 && rect.top > dropH + 8
      setStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        ...(showAbove
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
        zIndex: 9999,
      })
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, items.length, anchorRef])

  if (!open || items.length === 0) return null

  return createPortal(
    <div
      style={style}
      className="bg-background border rounded-md shadow-lg max-h-[220px] overflow-y-auto"
    >
      {items.map((s, i) => (
        <button
          key={`${s.ref}-${i}`}
          type="button"
          className={cn(
            'w-full text-left px-3 py-2 text-xs transition-colors hover:bg-accent',
            i === activeIndex && 'bg-accent',
          )}
          onMouseDown={(e) => { e.preventDefault(); onSelect(s) }}
          onMouseEnter={() => onHover(i)}
        >
          <div className="font-mono text-primary">{s.ref}</div>
          {(s.source || s.description) && (
            <div className="text-[10px] text-muted-foreground mt-0.5 flex gap-1.5">
              <span>{s.source}</span>
              {s.description && <span className="opacity-70">— {s.description}</span>}
            </div>
          )}
        </button>
      ))}
    </div>,
    document.body,
  )
}
