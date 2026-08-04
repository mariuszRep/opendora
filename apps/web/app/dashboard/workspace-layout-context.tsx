"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useWorkspaceLayout, type UseWorkspaceLayoutResult } from "@/hooks/use-workspace-layout"

const WorkspaceLayoutContext = createContext<UseWorkspaceLayoutResult | null>(null)

export function WorkspaceLayoutProvider({ children }: { children: ReactNode }) {
  const value = useWorkspaceLayout()
  return <WorkspaceLayoutContext.Provider value={value}>{children}</WorkspaceLayoutContext.Provider>
}

export function useWorkspaceLayoutContext(): UseWorkspaceLayoutResult {
  const ctx = useContext(WorkspaceLayoutContext)
  if (!ctx) throw new Error("useWorkspaceLayoutContext must be used inside WorkspaceLayoutProvider")
  return ctx
}
