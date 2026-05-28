'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import type { RefSuggestion } from '@/lib/workflow-refs'

const REF_PATTERN = /(\$(?:input|output|ctx)\.[a-zA-Z0-9_.]+)/g

function highlight(text: string) {
  REF_PATTERN.lastIndex = 0
  const escaped = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
  return escaped.replace(REF_PATTERN, (ref) => {
    const bg = ref.startsWith('$input.')
      ? 'color-mix(in oklch, var(--chart-1) 18%, transparent)'
      : 'color-mix(in oklch, var(--chart-2) 18%, transparent)'
    return `<mark style="background:${bg};border-radius:3px">${ref}</mark>`
  }) + '​'
}

function tokenStart(val: string, cur: number): number {
  for (let i = cur - 1; i >= 0; i--) {
    if (val[i] === '$') return i
    if (/[\s,;)}\]]/.test(val[i])) return -1
  }
  return -1
}

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  suggestions: RefSuggestion[]
  placeholder?: string
  rows?: number
  className?: string
}

export function PromptInput({ value, onChange, suggestions, placeholder, rows = 8, className }: PromptInputProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const backdropRef = React.useRef<HTMLDivElement>(null)
  const [open, setOpen] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(0)
  const [cursor, setCursor] = React.useState(0)
  const justSelected = React.useRef(false)

  const updateCursor = () => setCursor(textareaRef.current?.selectionStart ?? 0)

  const partialStart = tokenStart(value, cursor)
  const partial = partialStart === -1 ? null : value.slice(partialStart, cursor)
  const filtered = partial ? suggestions.filter((s) => s.ref.toLowerCase().startsWith(partial.toLowerCase())) : []
  const isComplete = filtered.length === 1 && filtered[0]?.ref === partial

  React.useEffect(() => {
    if (justSelected.current) { justSelected.current = false; return }
    setOpen(filtered.length > 0 && !isComplete)
    setActiveIndex(0)
  }, [filtered.length, value, isComplete])

  const select = React.useCallback((s: RefSuggestion) => {
    justSelected.current = true
    const cur = textareaRef.current?.selectionStart ?? value.length
    const start = tokenStart(value, cur)
    if (start === -1) { onChange(s.ref); setOpen(false); return }
    const rest = value.slice(cur)
    const endOffset = rest.search(/[\s,;)}\]]/)
    onChange(value.slice(0, start) + s.ref + value.slice(endOffset === -1 ? value.length : cur + endOffset))
    setOpen(false)
    const newCursor = start + s.ref.length
    setTimeout(() => { textareaRef.current?.setSelectionRange(newCursor, newCursor); textareaRef.current?.focus() }, 0)
  }, [value, onChange])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || filtered.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Tab' && filtered[activeIndex]) { e.preventDefault(); select(filtered[activeIndex]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className={cn('relative', className)}>
      <div
        ref={backdropRef}
        aria-hidden
        className="pointer-events-none absolute inset-[1px] overflow-hidden rounded-[calc(var(--radius)-1px)] px-2.5 py-2 font-mono text-base md:text-sm whitespace-pre-wrap break-words"
        style={{ color: 'transparent' }}
        dangerouslySetInnerHTML={{ __html: highlight(value) }}
      />
      <Textarea
        ref={textareaRef}
        value={value}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        className="relative font-mono bg-transparent"
        onChange={(e) => { onChange(e.target.value); updateCursor() }}
        onKeyDown={onKeyDown}
        onKeyUp={updateCursor}
        onClick={updateCursor}
        onSelect={updateCursor}
        onScroll={() => { if (backdropRef.current && textareaRef.current) backdropRef.current.scrollTop = textareaRef.current.scrollTop }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onFocus={() => { updateCursor(); if (filtered.length > 0 && !isComplete) setOpen(true) }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((s, i) => (
            <button
              key={s.ref}
              type="button"
              className={cn('w-full text-left px-3 py-2 text-xs transition-colors hover:bg-accent', i === activeIndex && 'bg-accent')}
              onMouseDown={(e) => { e.preventDefault(); select(s) }}
              onMouseEnter={() => setActiveIndex(i)}
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
        </div>
      )}
    </div>
  )
}
