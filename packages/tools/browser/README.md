# Browser Tool for Projectflows

Complete browser control implementation migrated from OpenClaw.

## Features

- **Full browser automation** via Playwright
- **Chrome DevTools Protocol (CDP)** integration
- **Multiple browser profiles** (isolated, user, custom)
- **Tab management** (open, close, focus, navigate)
- **DOM snapshots** with element references
- **Screenshots** (full page or element-specific)
- **UI automation** (click, type, fill forms, etc.)
- **Console access**
- **PDF generation**
- **File upload handling**
- **Dialog interaction**

## Usage

### As Projectflows Tool

```typescript
import { BrowserTool } from "@projectflows/tools/browser"

// The tool is ready to use with Projectflows's agent system
// It will automatically handle browser lifecycle and actions
```

### Starting the Browser Server

```typescript
import { startBrowserControlServiceFromConfig } from "@projectflows/tools/browser"

// Start browser control server (default port 8338)
await startBrowserControlServiceFromConfig({
  browser: {
    enabled: true,
    port: 8338,
  }
})
```

## Browser Actions

- `status` - Get browser status
- `start` - Start browser
- `stop` - Stop browser
- `profiles` - List available profiles
- `tabs` - List open tabs
- `open` - Open new tab with URL
- `close` - Close tab
- `focus` - Focus specific tab
- `navigate` - Navigate to URL
- `snapshot` - Get DOM snapshot with element refs
- `screenshot` - Capture screenshot
- `act` - Perform UI automation actions
- `console` - Access console messages
- `pdf` - Generate PDF
- `upload` - Handle file uploads
- `dialog` - Interact with dialogs

## Dependencies

- `playwright-core@1.59.1` - Browser automation

## Architecture

This is a complete copy of OpenClaw's browser extension with an adapter layer to make it compatible with Projectflows's `Tool.define` pattern.

### Directory Structure

- `src/browser/` - Core browser control logic
- `src/browser/routes/` - HTTP server routes
- `src/gateway/` - Gateway integration
- `src/cli/` - CLI commands
- `adapter.ts` - Projectflows tool adapter
- `index.ts` - Package exports

## Notes

- The browser server runs on `localhost:8338` by default
- Requires Chrome/Chromium to be installed
- Supports both isolated and user browser profiles
- Full CDP and Playwright integration included
