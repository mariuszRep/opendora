'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { RefSuggestion } from '@/lib/workflow-refs'
import { RefDropdown } from './ref-dropdown'

interface ExpressionInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  suggestions: RefSuggestion[]
}

export function ExpressionInput({ value, onChange, suggestions, className, ...props }: ExpressionInputProps) {
  const [open, setOpen] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const justSelected = React.useRef(false)

  function tokenStart(val: string, cursor: number): number {
    for (let i = cursor - 1; i >= 0; i--) {
      if (val[i] === '$') return i
      if (/[\s,;)}]/.test(val[i])) return -1
    }
    return -1
  }

  function partialToken(val: string, cursor: number): string | null {
    const start = tokenStart(val, cursor)
    if (start === -1) return null
    return val.slice(start, cursor)
  }

  const filtered = React.useMemo(() => {
    const partial = partialToken(value, value.length)
    if (!partial) return []
    const lower = partial.toLowerCase()
    return suggestions.filter((s) => s.ref.toLowerCase().startsWith(lower))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, suggestions])

  const isCompleteMatch = React.useMemo(() => {
    const partial = partialToken(value, value.length)
    if (!partial) return false
    return suggestions.some((s) => s.ref === partial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, suggestions])

  React.useEffect(() => {
    if (justSelected.current) { justSelected.current = false; return }
    setOpen(filtered.length > 0 && !isCompleteMatch)
    setActiveIndex(0)
  }, [filtered.length, value, isCompleteMatch])

  const select = (suggestion: RefSuggestion) => {
    justSelected.current = true
    const cur = inputRef.current?.selectionStart ?? value.length
    const start = tokenStart(value, cur)
    if (start === -1) { onChange(suggestion.ref); setOpen(false); return }
    const rest = value.slice(cur)
    const endOffset = rest.search(/[\s,;)}\]]/)
    const end = endOffset === -1 ? value.length : cur + endOffset
    onChange(value.slice(0, start) + suggestion.ref + value.slice(end))
    setOpen(false)
    const newCursor = start + suggestion.ref.length
    setTimeout(() => {
      inputRef.current?.setSelectionRange(newCursor, newCursor)
      inputRef.current?.focus()
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      if (filtered[activeIndex]) { e.preventDefault(); select(filtered[activeIndex]) }
    }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onFocus={() => { if (filtered.length > 0 && !isCompleteMatch) setOpen(true) }}
        className={cn('font-mono text-xs', className)}
        {...props}
      />
      <RefDropdown
        open={open}
        items={filtered}
        activeIndex={activeIndex}
        anchorRef={inputRef}
        onSelect={select}
        onHover={setActiveIndex}
      />
    </div>
  )
}
