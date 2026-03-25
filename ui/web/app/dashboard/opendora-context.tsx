"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useOpendora, type UseOpendoraResult } from "@/hooks/use-opendora"

const OpendoraContext = createContext<UseOpendoraResult | null>(null)

export function OpendoraProvider({ children }: { children: ReactNode }) {
  const value = useOpendora()
  return <OpendoraContext.Provider value={value}>{children}</OpendoraContext.Provider>
}

export function useOpendoraContext(): UseOpendoraResult {
  const ctx = useContext(OpendoraContext)
  if (!ctx) throw new Error("useOpendoraContext must be used inside OpendoraProvider")
  return ctx
}
