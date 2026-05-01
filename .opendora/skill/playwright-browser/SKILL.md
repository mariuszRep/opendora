---
name: playwright-browser
description: "Use when automating, testing, debugging, or inspecting the OpenDora UI or any web page via Playwright MCP. Covers all 22 browser tools (navigation, observation, interaction, scripting, and control). Load this alongside playwright-mcp-responsibility when browser work is needed."
origin: opendora
---

# Playwright Browser

Use this skill when you are operating a browser through Playwright MCP tools. It covers every available tool, when to choose one over another, and OpenDora-specific patterns for testing the local UI at `http://localhost:3000`.

Load `playwright-mcp-responsibility` alongside this skill for safety and external-impact guidance. This skill focuses on **how** to use the tools effectively.

## Switching browser mode (headed / headless)

The browser starts in whatever mode is set in `opendora.json`. To switch mid-session run:

```bash
.opendora/bin/playwright-mode headed    # shows a visible browser window via WSLg
.opendora/bin/playwright-mode headless  # invisible, default for automation
```

This disconnects the MCP, rewrites the config flag, and reconnects — all in one call. The MCP server stays running; only the browser process is cycled. After it returns, all `playwright_browser_*` tools work normally against the new browser instance.

**When to switch to headed:** the user needs to authenticate to a site. Show the window, navigate to the login page, tell the user to log in, wait for confirmation, switch back to headless.

**When to switch to headless:** automation is finalised and will run on a schedule — no window needed.

## Variables

- `{{target_url}}` — page or route to open, e.g. `http://localhost:3000/dashboard/agents/pandora/tools`
- `{{task_type}}` — observe, test, debug, fill, scrape, or automate
- `{{browser_state}}` — fresh session, existing tab, or authenticated context

## Tool Reference

All tools are prefixed `playwright_` in OpenDora (the MCP server name is `playwright`).

### Navigation

**`playwright_browser_navigate`** — navigate to a URL.
- `url` (required): absolute URL to load.
- Waits for page load by default. Always navigate before any other action on a new page.
- Prefer this over `browser_run_code` for simple navigation.

**`playwright_browser_navigate_back`** — go back one step in browser history.
- No parameters. Use to return from a detail view or after following a link.

**`playwright_browser_tabs`** — list, create, close, or switch browser tabs.
- `action` (required): `list` | `new` | `close` | `select`
- `index`: tab index, used with `close` or `select`
- `url`: initial URL for `new` tab
- Use `list` first to understand open tabs before creating more. Prefer single-tab workflows unless the task explicitly requires multiple pages.

---

### Observation

**`playwright_browser_snapshot`** — capture the accessibility tree of the current page. **Prefer this over screenshot for most tasks.**
- `target`: scope snapshot to a specific element (ref or selector)
- `filename`: save to a markdown file instead of returning inline
- `depth`: limit tree depth for large pages
- `boxes`: include `[box=x,y,w,h]` bounding data per element
- Returns structured, text-based representation that exposes roles, labels, refs, and interactive state. Use refs from this output as `target` values in subsequent interaction tools.

**`playwright_browser_take_screenshot`** — capture a visual image of the page.
- `element` / `target`: scope to a specific element
- `type`: `png` (default) or `jpeg`
- `filename`: where to save. Use relative paths. Defaults to `page-{timestamp}.png`.
- `fullPage`: capture full scrollable height, not just the viewport
- Use for visual verification, UI regression checks, or when showing the user a rendered state. **Do not use as input for action targeting** — use `browser_snapshot` refs instead.

**`playwright_browser_console_messages`** — return browser console output.
- `level`: `verbose` | `info` | `warning` | `error` (each level includes more severe). Default: `info`.
- `all`: if `true`, return all messages since session start, not just since last navigation
- `filename`: save to file instead of returning inline
- Call after navigation or interaction when debugging JS errors, React warnings, or failed API calls.

**`playwright_browser_network_requests`** — return all network requests since page load.
- `static`: include static assets (images, fonts, scripts). Default: `false`.
- `requestBody`: include request bodies. Default: `false`.
- `requestHeaders`: include request headers. Default: `false`.
- `filter`: regex string to filter URLs, e.g. `"/api/.*"`
- `filename`: save to file instead of returning inline
- Use to inspect API calls, check request payloads, or verify that the UI is hitting the right backend endpoints.

---

### Interaction

**`playwright_browser_click`** — click an element.
- `element` (required): human-readable description of the target (e.g. `"Save changes button"`)
- `target` (required): element ref from `browser_snapshot` or a CSS/text selector
- `doubleClick`: perform a double-click. Default: `false`.
- `button`: `left` (default) | `right` | `middle`
- `modifiers`: array of `Alt` | `Control` | `Meta` | `Shift`
- Always take a snapshot first to obtain the `target` ref. Prefer refs over selectors for accuracy.

**`playwright_browser_type`** — type text into a focused editable element.
- `element` (required): human-readable description
- `target` (required): element ref or selector
- `text` (required): text to type
- `submit`: press Enter after typing. Default: `false`.
- `slowly`: type one character at a time (useful for autocomplete/typeahead). Default: `false`.
- Use for single-field input. Use `browser_fill_form` when filling multiple fields at once.

**`playwright_browser_fill_form`** — fill multiple form fields in one call.
- `fields` (required): array of `{ element, target, value }` objects
- More efficient than repeated `browser_type` calls when a form has several inputs. Executes fills atomically.

**`playwright_browser_press_key`** — press a keyboard key.
- `key` (required): key name (`ArrowLeft`, `Enter`, `Tab`, `Escape`, `a`, etc.)
- Use for keyboard shortcuts, dismissing modals, cycling through focusable elements, or submitting without a submit button.

**`playwright_browser_hover`** — hover the pointer over an element.
- `element` (required): human-readable description
- `target` (required): element ref or selector
- Use to trigger tooltips, reveal hover-only UI, or open dropdown menus that require hover state.

**`playwright_browser_select_option`** — select one or more options in a `<select>` dropdown.
- `element` (required): human-readable description
- `target` (required): element ref or selector
- `values` (required): array of option values to select. For single-select, pass one element.

**`playwright_browser_drag`** — drag one element onto another.
- `startElement` (required): human-readable description of the drag source
- `startTarget` (required): element ref or selector for the drag source
- `endElement` (required): human-readable description of the drop target
- `endTarget` (required): element ref or selector for the drop target
- Use for sortable lists, kanban cards, or resizing splitters.

**`playwright_browser_drop`** — drop external files or MIME data onto an element (simulates dragging from outside the browser).
- `element` (required): human-readable description of the drop zone
- `target` (required): element ref or selector
- `paths`: array of absolute file paths to drop
- `data`: map of MIME type → string, e.g. `{"text/plain": "hello"}`
- At least one of `paths` or `data` is required.

**`playwright_browser_file_upload`** — upload files through a file chooser dialog.
- `paths` (required): array of absolute file paths. Omit to cancel the chooser.
- Must be called after an action that opens the file chooser (e.g. clicking an upload button).

**`playwright_browser_handle_dialog`** — accept or dismiss a browser dialog (alert, confirm, prompt).
- `accept` (required): `true` to accept, `false` to dismiss
- `promptText`: text to enter if the dialog is a prompt
- Call immediately after the action that triggers the dialog. Unhandled dialogs block further interaction.

---

### Scripting

**`playwright_browser_evaluate`** — evaluate a JavaScript expression in the page context.
- `element`: human-readable element description (grants permission to interact with that element)
- `target`: element ref or selector (makes the element available in the function argument)
- `function` (required): `() => { ... }` or `(element) => { ... }` when targeting an element
- `filename`: save result to file instead of returning inline
- Use for reading computed state, checking DOM properties, or triggering JS methods not exposed via the UI. Avoid for navigation or clicks — use dedicated tools instead.

**`playwright_browser_run_code`** — run a full Playwright code snippet with `page` as the argument.
- `code` (required): `async (page) => { ... }` — full Playwright API available
- `filename`: load code from a file; if both provided, `code` wins
- Use for complex multi-step flows, custom waits, or when the dedicated tools are insufficient. Prefer dedicated tools for simple single-step actions. Results are returned as the function's return value.

---

### Control

**`playwright_browser_close`** — close the current page.
- No parameters. Call when done to release the browser process and any held state.

**`playwright_browser_resize`** — resize the browser window.
- `width` (required): viewport width in pixels
- `height` (required): viewport height in pixels
- Call before taking screenshots or testing responsive layouts. Common sizes: `1280×900` (desktop), `768×1024` (tablet), `390×844` (mobile).

**`playwright_browser_wait_for`** — wait for a condition before proceeding.
- `time`: seconds to wait unconditionally
- `text`: wait until this text appears on the page
- `url`: wait until page URL matches
- `textGone`: wait until this text disappears
- Use after navigation or interactions that trigger async updates, loading states, or animations. Prefer `text`/`textGone` waits over fixed `time` waits.

---

## Choosing The Right Tool

| Goal | Use |
|------|-----|
| Understand page structure before acting | `browser_snapshot` |
| Visual proof / share with user | `browser_take_screenshot` |
| Click a button or link | `browser_snapshot` → `browser_click` |
| Fill one field | `browser_type` |
| Fill a form with multiple fields | `browser_fill_form` |
| Trigger a keyboard shortcut | `browser_press_key` |
| Read JS-computed state | `browser_evaluate` |
| Multi-step Playwright flow | `browser_run_code` |
| Check what API calls fired | `browser_network_requests` |
| Check for JS errors | `browser_console_messages` |
| Wait for async content to load | `browser_wait_for` |
| Dismiss an alert/confirm/prompt | `browser_handle_dialog` |
| Upload a file | `browser_file_upload` |
| Drop external data onto page | `browser_drop` |
| Open page in new tab | `browser_tabs` with `action: new` |

---

## Standard Workflow

1. **Navigate** — `browser_navigate` to `{{target_url}}`
2. **Observe** — `browser_snapshot` to understand the current page state and collect element refs
3. **Wait if needed** — `browser_wait_for` if content is loading or async
4. **Act** — use interaction tools with refs from step 2
5. **Verify** — `browser_snapshot` or `browser_take_screenshot` to confirm the result
6. **Debug if broken** — `browser_console_messages` and `browser_network_requests` for errors
7. **Close** — `browser_close` when done

---

## OpenDora UI Patterns

The OpenDora UI runs at `http://localhost:3000`. Common routes:

| Route | Purpose |
|-------|---------|
| `/dashboard/agents/{id}` | Agent settings — Main tab |
| `/dashboard/agents/{id}` → Tools tab | Tool selection per agent |
| `/dashboard/agents/{id}` → Skills tab | Skill assignment per agent |

**Navigating to a tab**: After landing on `/dashboard/agents/{id}`, take a snapshot to find the tab refs, then `browser_click` the desired tab. Do not guess tab text — confirm via snapshot first.

**Waiting for data**: The UI fetches agent config and tool lists from the backend on mount. After navigation, use `browser_wait_for` with `text` matching a known group name (e.g. `"Filesystem"`) before asserting tool counts.

**Checking tool groups**: After clicking the Tools tab, take a `browser_snapshot` to read group names and tool counts. Each MCP server appears as its own card with an `MCP` badge.

**Expanding a group**: Click the group card header (`browser_click`) to expand it, then snapshot again to read the individual tool checkboxes.

**Viewport for full page**: Set `1280×2400` with `browser_resize` before a `browser_take_screenshot` with `fullPage: true` to capture all tool groups without scrolling.

---

## Rules

- Always snapshot before clicking. Refs from `browser_snapshot` are more reliable than text or CSS selectors.
- Do not use `browser_take_screenshot` as input for targeting. It is for display only.
- Prefer `browser_fill_form` over repeated `browser_type` when filling more than one field.
- Use `browser_wait_for` with `text` rather than fixed `time` sleeps wherever possible.
- Handle dialogs immediately — unhandled dialogs block all subsequent tool calls.
- Close the browser when done: `browser_close` releases resources.
- For OpenDora localhost work, prefer snapshots over screenshots to keep context size small.
