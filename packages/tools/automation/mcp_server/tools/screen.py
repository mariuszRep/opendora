"""Screen capture, pixel reading, and image location tools."""

from __future__ import annotations

import base64
from pathlib import Path

from fastmcp import FastMCP
from fastmcp.utilities.types import Image as MCPImage

from ..desktop import (
    screen_screenshot, screen_screenshot_window,
    screen_pixel, screen_locate, screen_locate_all,
    screen_size,
)


def register(mcp: FastMCP) -> None:

    @mcp.tool(annotations={"readOnlyHint": True})
    def screenshot(path: str | None = None) -> MCPImage:
        """Capture a full-screen screenshot and return it as an image.
        On WSLg the full-screen buffer is black for most apps — prefer
        screenshot_window to capture a specific app reliably."""
        out, w, h = screen_screenshot(path)
        return MCPImage(path=out)

    @mcp.tool(annotations={"readOnlyHint": True})
    def screenshot_window(window_id: int, path: str | None = None) -> MCPImage:
        """Capture a specific X11 window by its numeric ID and return it as an image.
        This is the reliable screenshot method on WSLg/XWayland.
        Get window IDs from snapshot() or app_list()."""
        out, w, h = screen_screenshot_window(window_id, path)
        return MCPImage(path=out)

    @mcp.tool(annotations={"readOnlyHint": True})
    def get_screen_size() -> str:
        """Return the screen dimensions as 'width x height' in pixels."""
        w, h = screen_size()
        return f"{w} x {h}"

    @mcp.tool(annotations={"readOnlyHint": True})
    def get_pixel_color(x: int, y: int) -> str:
        """Read the RGB color of a single pixel at screen coordinate (x, y).
        Returns a string like 'rgb(255, 128, 0)'."""
        r, g, b = screen_pixel(x, y)
        return f"rgb({r}, {g}, {b})"

    @mcp.tool(annotations={"readOnlyHint": True})
    def locate_on_screen(image_path: str, confidence: float = 0.9) -> str:
        """Find an image (needle) on the screen using template matching.
        Returns center coordinates and bounding box, or 'not found'.
        confidence range: 0.0–1.0 (lower = more fuzzy matches)."""
        match = screen_locate(image_path, confidence)
        if match is None:
            return "not found"
        return (
            f"found at center ({match['x']}, {match['y']}) "
            f"region ({match['left']}, {match['top']}, {match['width']}×{match['height']}) "
            f"confidence={match['confidence']:.3f}"
        )

    @mcp.tool(annotations={"readOnlyHint": True})
    def locate_all_on_screen(image_path: str, confidence: float = 0.9) -> str:
        """Find all occurrences of an image on screen using template matching.
        Returns a list of center coordinates for each match."""
        matches = screen_locate_all(image_path, confidence)
        if not matches:
            return "not found"
        lines = [
            f"[{i+1}] center ({m['x']}, {m['y']}) confidence={m['confidence']:.3f}"
            for i, m in enumerate(matches)
        ]
        return f"{len(matches)} match(es):\n" + "\n".join(lines)
