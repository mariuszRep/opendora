"""Mouse, keyboard, and wait tools."""

from __future__ import annotations

import time
from typing import Literal

from fastmcp import FastMCP

from ..desktop import (
    mouse_click, mouse_move, mouse_move_rel,
    mouse_down, mouse_up,
    mouse_drag, mouse_drag_rel,
    mouse_scroll, mouse_hscroll,
    mouse_position,
    key_type, key_press, key_down, key_up,
    ENV,
)
import subprocess


def register(mcp: FastMCP) -> None:

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def mouse_move_to(x: int, y: int, duration: float = 0.15) -> str:
        """Move the mouse cursor to absolute screen coordinates (x, y)."""
        rx, ry = mouse_move(x, y, duration)
        return f"Moved to ({rx}, {ry})"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def mouse_move_relative(dx: int, dy: int, duration: float = 0.15) -> str:
        """Move the mouse cursor by (dx, dy) relative to its current position."""
        rx, ry = mouse_move_rel(dx, dy, duration)
        return f"Moved to ({rx}, {ry})"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def mouse_click_at(
        x: int | None = None,
        y: int | None = None,
        button: Literal["left", "right", "middle"] = "left",
        double: bool = False,
    ) -> str:
        """Click a mouse button at (x, y), or at the current position if omitted.
        Set double=True for a double-click."""
        rx, ry = mouse_click(x, y, button, double)
        return f"{'Double-clicked' if double else 'Clicked'} {button} at ({rx}, {ry})"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def mouse_press(
        x: int | None = None,
        y: int | None = None,
        button: Literal["left", "right", "middle"] = "left",
    ) -> str:
        """Press and hold a mouse button without releasing it.
        Use mouse_release to release. Useful for custom drag sequences."""
        rx, ry = mouse_down(x, y, button)
        return f"Pressed {button} at ({rx}, {ry})"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def mouse_release(
        x: int | None = None,
        y: int | None = None,
        button: Literal["left", "right", "middle"] = "left",
    ) -> str:
        """Release a held mouse button. Use after mouse_press."""
        rx, ry = mouse_up(x, y, button)
        return f"Released {button} at ({rx}, {ry})"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def mouse_drag_to(
        from_x: int, from_y: int,
        to_x: int, to_y: int,
        duration: float = 0.4,
        button: Literal["left", "right", "middle"] = "left",
    ) -> str:
        """Click and drag from (from_x, from_y) to (to_x, to_y)."""
        rx, ry = mouse_drag(from_x, from_y, to_x, to_y, duration, button)
        return f"Dragged to ({rx}, {ry})"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def mouse_drag_relative(
        dx: int, dy: int,
        duration: float = 0.4,
        button: Literal["left", "right", "middle"] = "left",
    ) -> str:
        """Drag the mouse by (dx, dy) relative to its current position."""
        rx, ry = mouse_drag_rel(dx, dy, duration, button)
        return f"Dragged to ({rx}, {ry})"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def mouse_scroll_at(
        clicks: int,
        x: int | None = None,
        y: int | None = None,
    ) -> str:
        """Scroll vertically at (x, y) or current position.
        Positive clicks = scroll up, negative = scroll down."""
        mouse_scroll(clicks, x, y)
        direction = "up" if clicks > 0 else "down"
        return f"Scrolled {direction} {abs(clicks)} click(s)"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def mouse_hscroll_at(
        clicks: int,
        x: int | None = None,
        y: int | None = None,
    ) -> str:
        """Scroll horizontally at (x, y) or current position.
        Positive clicks = scroll right, negative = scroll left."""
        mouse_hscroll(clicks, x, y)
        direction = "right" if clicks > 0 else "left"
        return f"Scrolled {direction} {abs(clicks)} click(s)"

    @mcp.tool(annotations={"readOnlyHint": True, "destructiveHint": False})
    def mouse_get_position() -> str:
        """Return the current mouse cursor position as 'x, y'."""
        x, y = mouse_position()
        return f"{x}, {y}"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def mouse_multi_click(
        points: list[dict],
        hold_ctrl: bool = False,
        delay_ms: int = 100,
    ) -> str:
        """Click multiple (x, y) coordinates in sequence.
        Each point: {"x": int, "y": int, "button": "left"|"right"|"middle"}.
        Set hold_ctrl=True to Ctrl-click each point (for multi-select)."""
        delay = delay_ms / 1000
        if hold_ctrl:
            subprocess.run(["xdotool", "keydown", "ctrl"], env=ENV, check=True)
        try:
            results = []
            for pt in points:
                rx, ry = mouse_click(pt["x"], pt["y"], pt.get("button", "left"))
                results.append(f"({rx},{ry})")
                if delay:
                    time.sleep(delay)
        finally:
            if hold_ctrl:
                subprocess.run(["xdotool", "keyup", "ctrl"], env=ENV, check=True)
        return f"Clicked {len(results)} points: {', '.join(results)}"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def keyboard_type(text: str) -> str:
        """Type a string of text into the focused window character by character.
        Click the target input first to focus it. For special keys use keyboard_press."""
        key_type(text)
        return f"Typed {len(text)} character(s)"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def keyboard_press(
        keys: str | list[str],
        presses: int = 1,
    ) -> str:
        """Press a key or key combination.
        Single key: "enter", "escape", "f5", "backspace", etc.
        Combination: ["ctrl", "c"] or ["alt", "tab"].
        Use presses to repeat a single key multiple times.
        Key names follow xdotool conventions."""
        key_press(keys, presses)
        label = "+".join(keys) if isinstance(keys, list) else keys
        return f"Pressed {label} × {presses}"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def keyboard_down(key: str) -> str:
        """Hold a key down without releasing it. Use keyboard_up to release.
        Useful for Shift+drag, sustained Ctrl, etc."""
        key_down(key)
        return f"Holding {key}"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def keyboard_up(key: str) -> str:
        """Release a key previously held with keyboard_down."""
        key_up(key)
        return f"Released {key}"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False, "idempotentHint": True})
    def wait(duration: float) -> str:
        """Pause execution for duration seconds. Use between actions to let
        animations or app state changes settle."""
        time.sleep(duration)
        return f"Waited {duration}s"
