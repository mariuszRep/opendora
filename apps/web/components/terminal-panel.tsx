"use client"

import { useEffect, useRef, useState } from "react"
import { Terminal as XTerm } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import { WebglAddon } from "@xterm/addon-webgl"
import "@xterm/xterm/css/xterm.css"
import { CheckIcon, CopyIcon } from "lucide-react"
import {
  Terminal,
  TerminalActions,
  TerminalClearButton,
  TerminalHeader,
  TerminalStatus,
  TerminalTitle,
} from "@/components/ai-elements/terminal"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { opendora, type PtyInfo } from "@/lib/projectflows"

const XTERM_THEME = {
  background: "#09090b",
  foreground: "#f4f4f5",
  cursor: "#f4f4f5",
  selectionBackground: "#3730a3",
}

const MONO_FALLBACK = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'

// xterm.js measures/draws glyphs on a <canvas>, whose 2D context `font` property
// requires a literal font name — it cannot resolve CSS custom properties like
// var(--font-mono), so passing that string directly silently falls back to the
// canvas default font (visibly wrong glyph widths/alignment). Resolve the actual
// font next/font injected into --font-geist-mono at runtime instead.
function resolveMonoFontFamily(): string {
  if (typeof window === "undefined") return MONO_FALLBACK
  // next/font applies the --font-geist-mono variable's className to <body>, not <html>.
  const resolved = getComputedStyle(document.body).getPropertyValue("--font-geist-mono").trim()
  return resolved ? `${resolved}, ${MONO_FALLBACK}` : MONO_FALLBACK
}

export function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const ptyIdRef = useRef<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [copied, setCopied] = useState(false)

  // Spawn one PTY when the panel mounts, kill it when the panel unmounts (i.e. is
  // closed) — one terminal per panel-open, not a pool.
  useEffect(() => {
    let cancelled = false
    let cleanupInner: (() => void) | undefined

    opendora.pty
      .create()
      .then(async (info: PtyInfo) => {
        if (cancelled) {
          opendora.pty.remove(info.id).catch(() => {})
          return
        }
        ptyIdRef.current = info.id

        const fontFamily = resolveMonoFontFamily()
        // Force the font to actually finish loading before xterm measures character
        // cell dimensions — measuring against a not-yet-loaded web font (or the
        // fallback it swaps in from) is what produces the stretched/misaligned glyphs.
        try {
          await document.fonts.load(`13px ${fontFamily}`)
          await document.fonts.ready
        } catch {
          // font loading API unsupported or failed — proceed with whatever's available
        }
        if (cancelled) return

        const container = containerRef.current
        if (!container) return

        const term = new XTerm({
          cursorBlink: true,
          fontSize: 13,
          fontFamily,
          theme: XTERM_THEME,
        })
        termRef.current = term

        const fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        term.open(container)

        // Default DOM renderer mutates real DOM nodes per character cell on every
        // write — heavy, and competes with everything else on the main thread (e.g.
        // visibly janks the sidebar's CSS transition while this panel is mounted).
        // WebGL moves rendering off that path entirely; falls back to the DOM
        // renderer (slower, not fatal) if WebGL is unavailable.
        try {
          term.loadAddon(new WebglAddon())
        } catch {
          // WebGL unavailable — falls back to the default DOM renderer, not fatal
        }

        // xterm's renderer attaches asynchronously after open() — fit() can throw
        // if called before it's ready, so every call here is deferred and defensive.
        const safeFit = () => {
          requestAnimationFrame(() => {
            try {
              fitAddon.fit()
            } catch {
              // renderer not attached yet, or the pane is mid-teardown
            }
          })
        }
        safeFit()

        const socket = opendora.pty.connect(info.id, {
          onData: (chunk) => term.write(chunk),
          onOpen: () => setConnected(true),
          onClose: () => setConnected(false),
        })

        const dataDisposable = term.onData((data) => socket.send(data))

        const sendResize = () => {
          opendora.pty.update(info.id, { size: { cols: term.cols, rows: term.rows } }).catch(() => {})
        }
        // A CSS transition elsewhere on the page (e.g. the sidebar collapsing) reflows
        // this container on nearly every animation frame — an undebounced observer
        // fires fit() + an HTTP PUT that many times in a couple hundred milliseconds,
        // which is real main-thread/network work competing with that same animation.
        // Only act once the resizing has actually settled.
        //
        // Tried also hiding the canvas (visibility) for the burst's duration to skip
        // the browser's own per-frame repaint of it — measured, and reverted: it traded
        // many small hitches for one much worse one (a 450ms freeze), because bringing
        // a hidden WebGL canvas back triggers a full texture-atlas re-upload, which is
        // itself expensive (especially on this VM's software-rendered GL). Not a win.
        let resizeSettleTimer: ReturnType<typeof setTimeout> | undefined
        const resizeObserver = new ResizeObserver(() => {
          if (resizeSettleTimer) clearTimeout(resizeSettleTimer)
          resizeSettleTimer = setTimeout(() => {
            safeFit()
            sendResize()
          }, 120)
        })
        resizeObserver.observe(container)
        sendResize()

        cleanupInner = () => {
          if (resizeSettleTimer) clearTimeout(resizeSettleTimer)
          resizeObserver.disconnect()
          dataDisposable.dispose()
          socket.close()
          // The WebGL addon can throw on dispose if its context is already torn down
          // (a known xterm.js edge case, e.g. when the container is removed from the
          // DOM around the same time). An uncaught throw here would abort the rest of
          // this function *and* the outer cleanup that removes the PTY server-side —
          // so this must never propagate.
          try {
            term.dispose()
          } catch {
            // already disposed / context lost — nothing more to clean up on the xterm side
          }
          termRef.current = null
        }
      })
      .catch(() => {
        // backend not reachable — panel just stays empty, nothing to tear down
      })

    return () => {
      cancelled = true
      // Killing the PTY server-side must happen unconditionally, even if xterm/addon
      // teardown above throws — an orphaned shell process is worse than a console warning.
      try {
        cleanupInner?.()
      } catch {
        // already logged/swallowed inside cleanupInner where possible; fall through regardless
      }
      if (ptyIdRef.current) {
        opendora.pty.remove(ptyIdRef.current).catch(() => {})
        ptyIdRef.current = null
      }
    }
  }, [])

  const handleClear = () => {
    termRef.current?.clear()
  }

  const handleCopy = async () => {
    const term = termRef.current
    if (!term) return
    term.selectAll()
    const text = term.getSelection()
    term.clearSelection()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore clipboard failures
    }
  }

  return (
    <Terminal
      output=""
      isStreaming={connected}
      onClear={handleClear}
      autoScroll={false}
      className="h-full rounded-none border-0"
      // Isolates this subtree's layout/paint from the rest of the page (and vice
      // versa) — reduces reflow cost when an ancestor (e.g. the sidebar) animates.
      style={{ contain: "layout paint" }}
    >
      <TerminalHeader>
        <TerminalTitle />
        <div className="flex items-center gap-1">
          <TerminalStatus>
            <span className={cn("size-1.5 rounded-full", connected ? "bg-green-500" : "bg-zinc-600")} />
            {connected ? "Connected" : "Connecting…"}
          </TerminalStatus>
          <TerminalActions>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              onClick={handleCopy}
              title="Copy"
            >
              {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            </Button>
            <TerminalClearButton title="Clear" />
          </TerminalActions>
        </div>
      </TerminalHeader>
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden p-2" />
    </Terminal>
  )
}
