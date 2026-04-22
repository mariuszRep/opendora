export { DesktopMouseMoveTool } from "./mouse/mouse-move.ts"
export { DesktopMouseClickTool } from "./mouse/mouse-click.ts"
export { DesktopMouseDragTool } from "./mouse/mouse-drag.ts"
export { DesktopMouseScrollTool } from "./mouse/mouse-scroll.ts"
export { DesktopMousePositionTool } from "./mouse/mouse-position.ts"

export { DesktopKeyboardTypeTool } from "./keyboard/keyboard-type.ts"
export { DesktopKeyboardPressTool } from "./keyboard/keyboard-press.ts"

export { DesktopScreenCaptureTool } from "./screen/screen-capture.ts"
export { DesktopScreenFindImageTool } from "./screen/screen-find-image.ts"
export { DesktopScreenWaitForImageTool } from "./screen/screen-wait-for-image.ts"
export { DesktopScreenSizeTool } from "./screen/screen-size.ts"
export { DesktopScreenReadPixelTool } from "./screen/screen-read-pixel.ts"

export { DesktopWindowListTool } from "./window/window-list.ts"
export { DesktopWindowActiveTool } from "./window/window-active.ts"
export { DesktopWindowFocusTool } from "./window/window-focus.ts"
export { DesktopWindowMoveTool } from "./window/window-move.ts"
export { DesktopWindowResizeTool } from "./window/window-resize.ts"

export { DesktopClipboardReadTool } from "./clipboard/clipboard-read.ts"
export { DesktopClipboardWriteTool } from "./clipboard/clipboard-write.ts"

import { DesktopMouseMoveTool } from "./mouse/mouse-move.ts"
import { DesktopMouseClickTool } from "./mouse/mouse-click.ts"
import { DesktopMouseDragTool } from "./mouse/mouse-drag.ts"
import { DesktopMouseScrollTool } from "./mouse/mouse-scroll.ts"
import { DesktopMousePositionTool } from "./mouse/mouse-position.ts"
import { DesktopKeyboardTypeTool } from "./keyboard/keyboard-type.ts"
import { DesktopKeyboardPressTool } from "./keyboard/keyboard-press.ts"
import { DesktopScreenCaptureTool } from "./screen/screen-capture.ts"
import { DesktopScreenFindImageTool } from "./screen/screen-find-image.ts"
import { DesktopScreenWaitForImageTool } from "./screen/screen-wait-for-image.ts"
import { DesktopScreenSizeTool } from "./screen/screen-size.ts"
import { DesktopScreenReadPixelTool } from "./screen/screen-read-pixel.ts"
import { DesktopWindowListTool } from "./window/window-list.ts"
import { DesktopWindowActiveTool } from "./window/window-active.ts"
import { DesktopWindowFocusTool } from "./window/window-focus.ts"
import { DesktopWindowMoveTool } from "./window/window-move.ts"
import { DesktopWindowResizeTool } from "./window/window-resize.ts"
import { DesktopClipboardReadTool } from "./clipboard/clipboard-read.ts"
import { DesktopClipboardWriteTool } from "./clipboard/clipboard-write.ts"
import type { Tool } from "../tool.ts"

export const DESKTOP_TOOLS: Tool.Info[] = [
  DesktopMouseMoveTool,
  DesktopMouseClickTool,
  DesktopMouseDragTool,
  DesktopMouseScrollTool,
  DesktopMousePositionTool,
  DesktopKeyboardTypeTool,
  DesktopKeyboardPressTool,
  DesktopScreenCaptureTool,
  DesktopScreenFindImageTool,
  DesktopScreenWaitForImageTool,
  DesktopScreenSizeTool,
  DesktopScreenReadPixelTool,
  DesktopWindowListTool,
  DesktopWindowActiveTool,
  DesktopWindowFocusTool,
  DesktopWindowMoveTool,
  DesktopWindowResizeTool,
  DesktopClipboardReadTool,
  DesktopClipboardWriteTool,
]
