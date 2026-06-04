"use client";

import {
  WebPreview,
  WebPreviewBody,
  WebPreviewNavigation,
  WebPreviewUrl,
} from "./web-preview";

export default function WebPreviewTest() {
  return (
    <div className="flex size-full flex-col">
      <h1 className="p-4 text-2xl font-bold">WebPreview Component Test</h1>
      <div className="flex-1 p-4">
        <WebPreview className="h-full" defaultUrl="https://example.com">
          <WebPreviewNavigation>
            <WebPreviewUrl />
          </WebPreviewNavigation>
          <WebPreviewBody />
        </WebPreview>
      </div>
    </div>
  );
}
