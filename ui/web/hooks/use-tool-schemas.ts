'use client'

import * as React from 'react'
import { opendora, type ToolSchema } from '@/lib/opendora'

let _cache: ToolSchema[] | null = null
let _promise: Promise<ToolSchema[]> | null = null

export function useToolSchemas() {
  const [schemas, setSchemas] = React.useState<ToolSchema[]>(_cache ?? [])
  const [loading, setLoading] = React.useState(_cache === null)

  React.useEffect(() => {
    if (_cache !== null) {
      setSchemas(_cache)
      setLoading(false)
      return
    }
    if (!_promise) {
      _promise = opendora.agent.toolSchemas().catch(() => [])
    }
    _promise.then((data) => {
      _cache = data
      setSchemas(data)
      setLoading(false)
    })
  }, [])

  return { schemas, loading }
}
