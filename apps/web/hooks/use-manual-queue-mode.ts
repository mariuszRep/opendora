"use client"

import { useEffect, useState } from "react"
import { opendora } from "@/lib/projectflows"

export function useManualQueueMode() {
  const [manualQueueMode, setManualQueueModeState] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    opendora.general.get().then((data) => {
      if (data.manualQueueMode !== undefined) setManualQueueModeState(data.manualQueueMode)
    }).catch(() => {}).finally(() => setIsLoaded(true))
  }, [])

  const setManualQueueMode = (value: boolean) => {
    setManualQueueModeState(value)
    opendora.general.update({ manualQueueMode: value }).catch(() => {})
  }

  return {
    manualQueueMode,
    setManualQueueMode,
    isLoaded,
  }
}
