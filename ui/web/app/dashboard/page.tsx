"use client"

import { Chatbot } from './chatbot'
import { Header } from './header'
import { useOpendoraContext } from './opendora-context'
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewNavigation,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview"
import { FilePreview } from "@/components/ai-elements/file-preview"

export default function Page() {
  const {
    webPreviewOpen,
    webPreviewUrl,
    filePreviewOpen,
    filePreviewPath,
    filePreviewDisplay,
    closeFilePreview,
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
              {filePreviewOpen ? (
                <FilePreview
                  key={filePreviewPath}
                  path={filePreviewPath}
                  displayPath={filePreviewDisplay}
                  onClose={closeFilePreview}
                />
              ) : (
                <WebPreview key={webPreviewUrl} defaultUrl={webPreviewUrl}>
                  <WebPreviewNavigation>
                    <WebPreviewUrl />
                  </WebPreviewNavigation>
                  <WebPreviewBody />
                </WebPreview>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}
