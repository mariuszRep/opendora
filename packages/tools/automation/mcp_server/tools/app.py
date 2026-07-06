"""Application and window management tools."""

from __future__ import annotations

import subprocess
import time
from typing import Literal

from fastmcp import FastMCP

from ..desktop import list_windows, ENV


def register(mcp: FastMCP) -> None:

    @mcp.tool(annotations={"readOnlyHint": True})
    def app_list() -> str:
        """List all visible named windows with their IDs, titles, and geometry."""
        windows = list_windows()
        if not windows:
            return "No windows found"
        lines = [
            f"wid={w.wid} \"{w.title}\" at ({w.x},{w.y}) {w.width}×{w.height}"
            for w in windows
        ]
        return f"{len(windows)} window(s):\n" + "\n".join(lines)

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def app_launch(name: str, wait: float = 1.5) -> str:
        """Launch a Linux GUI application by command name (e.g. 'xcalc', 'gedit', 'firefox').
        Waits `wait` seconds for the window to appear, then returns the updated window list."""
        subprocess.Popen(
            name.split(),
            env=ENV,
            start_new_session=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        time.sleep(wait)
        windows = list_windows()
        lines = [f"wid={w.wid} \"{w.title}\"" for w in windows]
        return f"Launched '{name}'. Windows: " + ", ".join(lines)

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def app_focus(window_id: int) -> str:
        """Bring a window to the front and give it input focus."""
        subprocess.run(["xdotool", "windowraise", str(window_id)], env=ENV, check=False)
        subprocess.run(["xdotool", "windowfocus", "--sync", str(window_id)], env=ENV, check=False)
        return f"Focused window {window_id}"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def app_move(window_id: int, x: int, y: int) -> str:
        """Move a window to screen position (x, y)."""
        subprocess.run(
            ["xdotool", "windowmove", str(window_id), str(x), str(y)],
            env=ENV, check=True,
        )
        return f"Moved window {window_id} to ({x}, {y})"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def app_resize(window_id: int, width: int, height: int) -> str:
        """Resize a window to width × height pixels."""
        subprocess.run(
            ["xdotool", "windowsize", str(window_id), str(width), str(height)],
            env=ENV, check=True,
        )
        return f"Resized window {window_id} to {width}×{height}"
