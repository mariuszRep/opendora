'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import type { RefSuggestion } from '@/lib/workflow-refs'

const REF_PATTERN = /(\$(?:input|output|ctx)\.[a-zA-Z0-9_.]+)/g

function buildHTML(text: string) {
  REF_PATTERN.lastIndex = 0
  const esc = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
  return esc.replace(REF_PATTERN, (ref) =>
    `<code class="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">${ref}</code>`
  ) || '<br>'
}

function getOffset(el: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel?.rangeCount) return 0
  const range = sel.getRangeAt(0)
  const pre = range.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(range.endContainer, range.endOffset)
  return pre.toString().length
}

function setOffset(el: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let rem = offset
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (rem <= node.length) {
      const r = document.createRange()
      r.setStart(node, rem)
      r.collapse(true)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(r)
      return
    }
    rem -= node.length
  }
  const r = document.createRange()
  r.selectNodeContents(el)
  r.collapse(false)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(r)
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

export function PromptInput({ value, onChange, suggestions, placeholder, className }: PromptInputProps) {
  const editorRef = React.useRef<HTMLDivElement>(null)
  const pendingCursor = React.useRef<number | null>(null)
  const [open, setOpen] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(0)
  const [cursor, setCursor] = React.useState(0)
  const justSelected = React.useRef(false)

  React.useLayoutEffect(() => {
    const el = editorRef.current
    if (!el) return
    el.innerHTML = buildHTML(value)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  React.useLayoutEffect(() => {
    const el = editorRef.current
    if (!el) return
    if ((el.textContent ?? '') === value) return
    el.innerHTML = buildHTML(value)
    const offset = pendingCursor.current ?? value.length
    pendingCursor.current = null
    setOffset(el, offset)
  }, [value])

  const updateCursor = () => {
    if (editorRef.current) setCursor(getOffset(editorRef.current))
  }

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
    const el = editorRef.current
    const cur = el ? getOffset(el) : value.length
    const start = tokenStart(value, cur)
    if (start === -1) { onChange(s.ref); setOpen(false); return }
    const rest = value.slice(cur)
    const endOffset = rest.search(/[\s,;)}\]]/)
    pendingCursor.current = start + s.ref.length
    onChange(value.slice(0, start) + s.ref + value.slice(endOffset === -1 ? value.length : cur + endOffset))
    setOpen(false)
  }, [value, onChange])

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (open && filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, filtered.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Tab' && filtered[activeIndex]) { e.preventDefault(); select(filtered[activeIndex]); return }
      if (e.key === 'Escape') { setOpen(false); return }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      document.execCommand('insertText', false, '\n')
    }
  }

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
  }

  return (
    <div className={cn('relative', className)}>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        data-placeholder={placeholder}
        className={cn(
          'min-h-[120px] w-full rounded-lg border border-input bg-background px-2.5 py-2 font-mono text-sm',
          'outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          'whitespace-pre-wrap break-words empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground',
        )}
        onInput={(e) => { onChange(e.currentTarget.textContent ?? ''); updateCursor() }}
        onKeyDown={onKeyDown}
        onKeyUp={updateCursor}
        onClick={updateCursor}
        onSelect={updateCursor}
        onPaste={onPaste}
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
