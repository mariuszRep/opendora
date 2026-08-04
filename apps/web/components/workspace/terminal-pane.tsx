"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { Terminal as XTerm } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
import { opendora } from "@/lib/projectflows"
import type { ViewItem } from "@/hooks/use-workspace-layout"

const LIGHT_THEME = {
  background: "#ffffff",
  foreground: "#1a1a1a",
  cursor: "#1a1a1a",
  selectionBackground: "#c7d2fe",
}

const DARK_THEME = {
  background: "#0a0a0a",
  foreground: "#e5e5e5",
  cursor: "#e5e5e5",
  selectionBackground: "#3730a3",
}

export function TerminalPane({ item }: { item: ViewItem }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "var(--font-mono), ui-monospace, monospace",
      theme: resolvedTheme === "light" ? LIGHT_THEME : DARK_THEME,
    })
    termRef.current = term

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)

    // xterm's renderer attaches asynchronously after open() — fit() can throw
    // ("Cannot read properties of undefined (reading 'dimensions')") if called
    // before it's ready, so every call here is deferred a frame and defensive.
    const safeFit = () => {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit()
        } catch {
          // renderer not attached yet, or pane is mid-teardown — next observed resize will retry
        }
      })
    }

    safeFit()

    const socket = opendora.pty.connect(item.refId, {
      onData: (chunk) => term.write(chunk),
    })

    const dataDisposable = term.onData((data) => socket.send(data))

    const sendResize = () => {
      opendora.pty.update(item.refId, { size: { cols: term.cols, rows: term.rows } }).catch(() => {
        // pane may already be closing
      })
    }

    const resizeObserver = new ResizeObserver(() => {
      safeFit()
      sendResize()
    })
    resizeObserver.observe(container)
    sendResize()

    return () => {
      resizeObserver.disconnect()
      dataDisposable.dispose()
      socket.close()
      term.dispose()
      termRef.current = null
    }
    // item.refId identifies the PTY session — the whole connection is re-established if it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.refId])

  useEffect(() => {
    if (!termRef.current) return
    termRef.current.options.theme = resolvedTheme === "light" ? LIGHT_THEME : DARK_THEME
  }, [resolvedTheme])

  return <div ref={containerRef} className="h-full w-full overflow-hidden bg-background p-2" />
}
