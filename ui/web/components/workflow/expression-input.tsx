'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { RefSuggestion } from '@/lib/workflow-refs'

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

  // Find the $-token starting position before the cursor
  function tokenStart(val: string, cursor: number): number {
    for (let i = cursor - 1; i >= 0; i--) {
      if (val[i] === '$') return i
      if (/[\s,;)}]/.test(val[i])) return -1
    }
    return -1
  }

  // Current partial token at cursor (e.g. "$ctx.co")
  function partialToken(val: string, cursor: number): string | null {
    const start = tokenStart(val, cursor)
    if (start === -1) return null
    return val.slice(start, cursor)
  }

  const cursor = inputRef.current?.selectionStart ?? value.length

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
    if (justSelected.current) {
      justSelected.current = false
      return
    }
    setOpen(filtered.length > 0 && !isCompleteMatch)
    setActiveIndex(0)
  }, [filtered.length, value, isCompleteMatch])

  const select = (suggestion: RefSuggestion) => {
    justSelected.current = true
    const cur = inputRef.current?.selectionStart ?? value.length
    const start = tokenStart(value, cur)
    if (start === -1) { onChange(suggestion.ref); setOpen(false); return }

    // Find end of current token (whitespace or end)
    const rest = value.slice(cur)
    const endOffset = rest.search(/[\s,;)}\]]/)
    const end = endOffset === -1 ? value.length : cur + endOffset

    const next = value.slice(0, start) + suggestion.ref + value.slice(end)
    onChange(next)
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
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg overflow-hidden max-h-56 overflow-y-auto">
          {filtered.map((s, i) => (
            <button
              key={s.ref}
              type="button"
              className={cn(
                'w-full text-left px-3 py-2 text-xs transition-colors hover:bg-accent',
                i === activeIndex && 'bg-accent',
              )}
              onMouseDown={(e) => { e.preventDefault(); select(s) }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <div className="font-mono text-primary">{s.ref}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 flex gap-1.5">
                <span>{s.source}</span>
                {s.description && <span className="opacity-70">— {s.description}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
