"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Chatbot } from './chatbot'
import { Header } from './header'
import { useOpendoraContext } from './projectflows-context'
import { useWorkspaceLayoutContext } from './workspace-layout-context'
import { PreviewPanel } from "@/components/ai-elements/preview-panel"
import { WorkspacePanel } from "@/components/workspace/workspace-panel"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { opendora } from "@/lib/projectflows"

export default function Page() {
  const router = useRouter()
  useEffect(() => {
    opendora.plugin.getOnboardingStatus().then(({ needsOnboarding }) => {
      if (needsOnboarding) router.replace("/onboarding")
    }).catch(() => { /* server not ready yet — ignore */ })
  }, [router])

  const {
    webPreviewOpen,
    webPreviewUrl,
    filePreviewOpen,
    filePreviewPath,
    filePreviewDisplay,
    closePreview,
  } = useOpendoraContext()
  const { panelOpen, panelHeight, setPanelHeight } = useWorkspaceLayoutContext()

  const sidePanelOpen = webPreviewOpen || filePreviewOpen

  const mainContent = (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Chatbot is always mounted — never conditionally swapped */}
      <div className="flex min-h-0 flex-col overflow-hidden flex-1 min-w-0">
        <Chatbot />
      </div>

      {sidePanelOpen && (
        <>
          <div className="w-px bg-border shrink-0" />
          <div className="flex flex-col min-h-0 overflow-hidden w-1/2 shrink-0 bg-background">
            <PreviewPanel
              key={filePreviewOpen ? filePreviewPath : webPreviewUrl}
              defaultMode={filePreviewOpen ? "sandbox" : "web"}
              defaultUrl={webPreviewUrl}
              defaultPath={filePreviewPath}
              defaultDisplayPath={filePreviewDisplay}
              onClose={closePreview}
            />
          </div>
        </>
      )}
    </div>
  )

  return (
    <>
      <Header />
      {panelOpen ? (
        <ResizablePanelGroup orientation="vertical" className="min-h-0 flex-1">
          <ResizablePanel defaultSize={100 - panelHeight} minSize={20}>
            {mainContent}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            defaultSize={panelHeight}
            minSize={10}
            onResize={(size) => setPanelHeight(size.asPercentage)}
          >
            <WorkspacePanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        mainContent
      )}
    </>
  )
}
