"use client"

import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from "react"

export function useEntityList<T>(fetcher: () => Promise<T[]>): {
  items: T[]
  setItems: Dispatch<SetStateAction<T[]>>
  loading: boolean
  error: string | null
  reload: () => void
} {
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetcherRef.current()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { items, setItems, loading, error, reload: load }
}
