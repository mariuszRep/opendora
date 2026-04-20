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

export default function Page() {
  const { webPreviewOpen, webPreviewUrl } = useOpendoraContext()

  return (
    <>
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Chatbot is always mounted — never conditionally swapped */}
        <div className="flex min-h-0 flex-col overflow-hidden flex-1 min-w-0">
          <Chatbot />
        </div>

        {webPreviewOpen && (
          <>
            <div className="w-px bg-border shrink-0" />
            <div className="flex flex-col min-h-0 overflow-hidden w-1/2 shrink-0 bg-background">
              <WebPreview key={webPreviewUrl} defaultUrl={webPreviewUrl}>
                <WebPreviewNavigation>
                  <WebPreviewUrl />
                </WebPreviewNavigation>
                <WebPreviewBody />
              </WebPreview>
            </div>
          </>
        )}
      </div>
    </>
  )
}
