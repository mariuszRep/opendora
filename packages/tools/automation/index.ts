export { PyAutoGUIMouseClickTool } from "./mouse/mouse-click.ts"
export { PyAutoGUIMouseMoveTool } from "./mouse/mouse-move.ts"
export { PyAutoGUIMouseMoveRelativeTool } from "./mouse/mouse-move-relative.ts"
export { PyAutoGUIMousePressTool } from "./mouse/mouse-press.ts"
export { PyAutoGUIMouseReleaseTool } from "./mouse/mouse-release.ts"
export { PyAutoGUIMouseScrollTool } from "./mouse/mouse-scroll.ts"
export { PyAutoGUIMouseScrollHorizontalTool } from "./mouse/mouse-scroll-horizontal.ts"
export { PyAutoGUIMouseDragTool } from "./mouse/mouse-drag.ts"
export { PyAutoGUIMouseDragRelativeTool } from "./mouse/mouse-drag-relative.ts"
export { PyAutoGUIMousePositionTool } from "./mouse/mouse-position.ts"

export { PyAutoGUIKeyboardPressTool } from "./keyboard/keyboard-press.ts"
export { PyAutoGUIKeyboardTypeTool } from "./keyboard/keyboard-type.ts"
export { PyAutoGUIKeyboardDownTool } from "./keyboard/keyboard-down.ts"
export { PyAutoGUIKeyboardUpTool } from "./keyboard/keyboard-up.ts"

export { PyAutoGUIScreenScreenshotTool } from "./screen/screen-screenshot.ts"
export { PyAutoGUIScreenScreenshotWindowTool } from "./screen/screen-screenshot-window.ts"
export { PyAutoGUIScreenLocateTool } from "./screen/screen-locate.ts"
export { PyAutoGUIScreenLocateAllTool } from "./screen/screen-locate-all.ts"
export { PyAutoGUIScreenPixelTool } from "./screen/screen-pixel.ts"
export { PyAutoGUIScreenSizeTool } from "./screen/screen-size.ts"

export { PyAutoGUISnapshotTool } from "./snapshot/snapshot.ts"
export { PyAutoGUISnapshotWindowTool } from "./snapshot/snapshot-window.ts"

export { PyAutoGUIAppTool } from "./app/app.ts"
export { PyAutoGUIClipboardTool } from "./clipboard/clipboard.ts"
export { PyAutoGUIWaitTool } from "./misc/wait.ts"
export { PyAutoGUIMultiClickTool } from "./misc/multi-click.ts"
export { PyAutoGUINotifyTool } from "./misc/notify.ts"

import { PyAutoGUIMouseClickTool } from "./mouse/mouse-click.ts"
import { PyAutoGUIMouseMoveTool } from "./mouse/mouse-move.ts"
import { PyAutoGUIMouseMoveRelativeTool } from "./mouse/mouse-move-relative.ts"
import { PyAutoGUIMousePressTool } from "./mouse/mouse-press.ts"
import { PyAutoGUIMouseReleaseTool } from "./mouse/mouse-release.ts"
import { PyAutoGUIMouseScrollTool } from "./mouse/mouse-scroll.ts"
import { PyAutoGUIMouseScrollHorizontalTool } from "./mouse/mouse-scroll-horizontal.ts"
import { PyAutoGUIMouseDragTool } from "./mouse/mouse-drag.ts"
import { PyAutoGUIMouseDragRelativeTool } from "./mouse/mouse-drag-relative.ts"
import { PyAutoGUIMousePositionTool } from "./mouse/mouse-position.ts"
import { PyAutoGUIKeyboardPressTool } from "./keyboard/keyboard-press.ts"
import { PyAutoGUIKeyboardTypeTool } from "./keyboard/keyboard-type.ts"
import { PyAutoGUIKeyboardDownTool } from "./keyboard/keyboard-down.ts"
import { PyAutoGUIKeyboardUpTool } from "./keyboard/keyboard-up.ts"
import { PyAutoGUIScreenScreenshotTool } from "./screen/screen-screenshot.ts"
import { PyAutoGUIScreenScreenshotWindowTool } from "./screen/screen-screenshot-window.ts"
import { PyAutoGUIScreenLocateTool } from "./screen/screen-locate.ts"
import { PyAutoGUIScreenLocateAllTool } from "./screen/screen-locate-all.ts"
import { PyAutoGUIScreenPixelTool } from "./screen/screen-pixel.ts"
import { PyAutoGUIScreenSizeTool } from "./screen/screen-size.ts"
import { PyAutoGUISnapshotTool } from "./snapshot/snapshot.ts"
import { PyAutoGUISnapshotWindowTool } from "./snapshot/snapshot-window.ts"
import { PyAutoGUIAppTool } from "./app/app.ts"
import { PyAutoGUIClipboardTool } from "./clipboard/clipboard.ts"
import { PyAutoGUIWaitTool } from "./misc/wait.ts"
import { PyAutoGUIMultiClickTool } from "./misc/multi-click.ts"
import { PyAutoGUINotifyTool } from "./misc/notify.ts"
import type { Tool } from "../tool.ts"

export const PYAUTOGUI_TOOLS: Tool.Info[] = [
  PyAutoGUIMouseClickTool,
  PyAutoGUIMouseMoveTool,
  PyAutoGUIMouseMoveRelativeTool,
  PyAutoGUIMousePressTool,
  PyAutoGUIMouseReleaseTool,
  PyAutoGUIMouseScrollTool,
  PyAutoGUIMouseScrollHorizontalTool,
  PyAutoGUIMouseDragTool,
  PyAutoGUIMouseDragRelativeTool,
  PyAutoGUIMousePositionTool,
  PyAutoGUIKeyboardPressTool,
  PyAutoGUIKeyboardTypeTool,
  PyAutoGUIKeyboardDownTool,
  PyAutoGUIKeyboardUpTool,
  PyAutoGUIScreenScreenshotTool,
  PyAutoGUIScreenScreenshotWindowTool,
  PyAutoGUIScreenLocateTool,
  PyAutoGUIScreenLocateAllTool,
  PyAutoGUIScreenPixelTool,
  PyAutoGUIScreenSizeTool,
  PyAutoGUISnapshotTool,
  PyAutoGUISnapshotWindowTool,
  PyAutoGUIAppTool,
  PyAutoGUIClipboardTool,
  PyAutoGUIWaitTool,
  PyAutoGUIMultiClickTool,
  PyAutoGUINotifyTool,
]
