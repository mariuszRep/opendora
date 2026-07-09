"use client"

import { useEffect, useState } from "react"
import { opendora } from "@/lib/projectflows"
import { Button } from "@/components/ui/button"
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react"

const DISMISS_KEY = "pf_setup_dismissed"
const CORE_PACK_ID = "developer-basic"

type Status = "checking" | "ok" | "missing" | "installing" | "done" | "error"

export function SetupCheck() {
  const [status, setStatus] = useState<Status>("checking")
  const [dismissed, setDismissed] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true)
      return
    }
    checkStatus()
  }, [])

  async function checkStatus() {
    try {
      const { needsOnboarding } = await opendora.plugin.getOnboardingStatus()
      setStatus(needsOnboarding ? "missing" : "ok")
    } catch {
      // If the server isn't up yet or the check fails, stay silent
      setStatus("ok")
    }
  }

  async function installCore() {
    setStatus("installing")
    setErrorMsg(null)
    try {
      await opendora.plugin.installCatalogPack(CORE_PACK_ID)
      setStatus("done")
      // Auto-dismiss after a short delay
      setTimeout(() => setDismissed(true), 3000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setStatus("error")
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1")
    setDismissed(true)
    opendora.plugin.skipOnboarding().catch(() => {})
  }

  if (dismissed || status === "ok" || status === "checking") return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 rounded-lg border bg-background shadow-lg">
      <div className="flex items-start gap-3 p-4">
        {status === "missing" || status === "error" ? (
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        ) : status === "done" ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
        ) : (
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
        )}

        <div className="flex-1 space-y-1">
          {status === "done" ? (
            <>
              <p className="text-sm font-medium">Core capabilities installed</p>
              <p className="text-xs text-muted-foreground">
                Agents, filesystem tools, web search, and skill manager are ready.
              </p>
            </>
          ) : status === "installing" ? (
            <>
              <p className="text-sm font-medium">Installing core capabilities…</p>
              <p className="text-xs text-muted-foreground">This may take a moment.</p>
            </>
          ) : status === "error" ? (
            <>
              <p className="text-sm font-medium">Installation failed</p>
              <p className="text-xs text-muted-foreground">{errorMsg}</p>
              <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={installCore}>
                Retry
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Core capabilities not installed</p>
              <p className="text-xs text-muted-foreground">
                Agents, tools, and skills are missing. Install the Developer Basic pack to get started.
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="h-7 text-xs" onClick={installCore}>
                  Install now
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={dismiss}>
                  Skip
                </Button>
              </div>
            </>
          )}
        </div>

        {(status === "missing" || status === "error") && (
          <button onClick={dismiss} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
