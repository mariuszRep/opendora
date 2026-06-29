"use client"

import { useEffect, useRef, useState } from "react"
import { opendora, type ProviderUsageState } from "@/lib/projectflows"

const POLL_INTERVAL_MS = 30_000

export type ProviderUsageMap = Record<string, ProviderUsageState>

export type UseProviderUsageResult = {
  data: ProviderUsageMap
  isLoading: boolean
  error: string | null
}

export function useProviderUsage(): UseProviderUsageResult {
  const [data, setData] = useState<ProviderUsageMap>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetch() {
      try {
        const result = await opendora.provider.usage()
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetch()

    intervalRef.current = setInterval(fetch, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [])

  return { data, isLoading, error }
}
