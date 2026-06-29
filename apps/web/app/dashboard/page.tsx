"use client"

import { Chatbot } from './chatbot'
import { Header } from './header'
import { useOpendoraContext } from './projectflows-context'
import { PreviewPanel } from "@/components/ai-elements/preview-panel"

export default function Page() {
  const {
    webPreviewOpen,
    webPreviewUrl,
    filePreviewOpen,
    filePreviewPath,
    filePreviewDisplay,
    closePreview,
  } = useOpendoraContext()

  const sidePanelOpen = webPreviewOpen || filePreviewOpen

  return (
    <>
      <Header />
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
    </>
  )
}
