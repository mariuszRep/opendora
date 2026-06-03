# WebPreview Component Usage

## Overview

WebPreview is an official AI Elements component that displays web content in an iframe with navigation controls. It has been added to opendora without replacing any existing custom AI Elements components.

## Installation

WebPreview was installed via:
```bash
npx shadcn@latest add https://elements.ai-sdk.dev/api/registry/web-preview.json
```

## Components

- `WebPreview` - Main container component with URL state management
- `WebPreviewNavigation` - Navigation bar container
- `WebPreviewUrl` - URL input field with Enter key support
- `WebPreviewBody` - iframe that loads the URL
- `WebPreviewConsole` - Optional console log display (collapsible)

## Basic Usage

```tsx
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewNavigation,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview";

export default function MyComponent() {
  return (
    <WebPreview defaultUrl="https://example.com">
      <WebPreviewNavigation>
        <WebPreviewUrl />
      </WebPreviewNavigation>
      <WebPreviewBody />
    </WebPreview>
  );
}
```

## Integration with Browser Tool

The browser tool (`packages/tools/browser/`) returns URLs that can be displayed in WebPreview:

```tsx
// When browser tool returns a URL from browse action
const browserResult = await browserTool.execute({
  action: "browse",
  url: "https://example.com"
});

// browserResult.metadata contains: { targetId, url, title }

<WebPreview defaultUrl={browserResult.metadata.url}>
  <WebPreviewNavigation>
    <WebPreviewUrl />
  </WebPreviewNavigation>
  <WebPreviewBody />
</WebPreview>
```

## Integration with WebFetch Tool

The WebFetch tool (`packages/tools/browse-and-web/webfetch.ts`) is automatically integrated with WebPreview in the chat interface. When a WebFetch tool is used:

- The tool header displays the fetched URL's hostname (e.g., "Fetch: example.com")
- Action buttons include "Side Panel" and "Open" options
- When in view mode (eyeball icon), the WebPreview component is automatically displayed showing the fetched website
- When in code mode (code icon), the raw tool input parameters are shown
- Clicking "Side Panel" opens the preview in a right-side panel for larger viewing
- Clicking "Open" opens the URL in a new tab
- The tool supports code/view mode toggle to switch between raw input and the preview UI
- The URL is displayed in the WebPreview navigation bar to avoid duplication

The integration is handled by `webfetch-tool.tsx` which:
- Extracts the URL from the tool input parameters
- Automatically displays the WebPreview when in view mode
- Provides side panel and new tab opening options
- Uses the WebPreview navigation bar to display the URL (avoiding header duplication)

This integration is automatically applied to all WebFetch tool uses in the chat interface.

## Props

### WebPreview

- `defaultUrl?: string` - Initial URL to load
- `onUrlChange?: (url: string) => void` - Callback when URL changes
- `className?: string` - Additional CSS classes

### WebPreviewUrl

- `value?: string` - Controlled URL value
- `onChange?: (event: ChangeEvent) => void` - Custom change handler
- `onKeyDown?: (event: KeyboardEvent) => void` - Custom keydown handler

### WebPreviewBody

- `src?: string` - Override URL for iframe (defaults to context URL)
- `loading?: ReactNode` - Loading indicator
- `className?: string` - Additional CSS classes

## Notes

- TooltipProvider is already configured in `app/layout.tsx`
- WebPreview uses a context pattern for state management
- The iframe has sandbox attributes for security
- Console component is optional and can be added for debugging

## Custom Components Preserved

All existing custom AI Elements components remain unchanged:
- conversation, message, prompt-input, tool, reasoning, suggestion
- code-block, attachments, model-selector, speech-input
- delegate-tool, todo-tool, session-tree-tool, shimmer, sources
