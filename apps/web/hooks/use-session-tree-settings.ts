"use client"

import { useEffect, useState } from "react"
import { opendora } from "@/lib/projectflows"

export interface SessionTreeSettings {
  exclusiveExpand: boolean
  autoExpandActiveSessions: boolean
}

const DEFAULT_SETTINGS: SessionTreeSettings = {
  exclusiveExpand: true,
  autoExpandActiveSessions: false,
}

function mergeSettings(stored: Partial<SessionTreeSettings>): SessionTreeSettings {
  return { ...DEFAULT_SETTINGS, ...stored }
}

export function useSessionTreeSettings() {
  const [settings, setSettingsState] = useState<SessionTreeSettings>(DEFAULT_SETTINGS)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    opendora.general.get().then((data) => {
      if (data.sessionTree) setSettingsState(mergeSettings(data.sessionTree))
    }).catch(() => {}).finally(() => setIsLoaded(true))
  }, [])

  const updateSettings = (newSettings: Partial<SessionTreeSettings>) => {
    const updated = { ...settings, ...newSettings }
    setSettingsState(updated)
    opendora.general.update({ sessionTree: updated }).catch(() => {})
  }

  return {
    settings,
    updateSettings,
    isLoaded,
  }
}
