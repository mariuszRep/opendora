"""Clipboard and notification tools."""

from __future__ import annotations

import subprocess
from typing import Literal

from fastmcp import FastMCP

from ..desktop import ENV


def register(mcp: FastMCP) -> None:

    @mcp.tool(annotations={"readOnlyHint": True})
    def clipboard_get() -> str:
        """Read and return the current X11 clipboard contents."""
        r = subprocess.run(
            ["xclip", "-selection", "clipboard", "-o"],
            env=ENV, capture_output=True, text=True,
        )
        return r.stdout or "(clipboard is empty)"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False})
    def clipboard_set(text: str) -> str:
        """Replace the X11 clipboard with the given text."""
        subprocess.run(
            ["xclip", "-selection", "clipboard", "-i"],
            input=text, env=ENV, text=True, check=True,
        )
        return f"Clipboard set ({len(text)} chars)"

    @mcp.tool(annotations={"readOnlyHint": False, "destructiveHint": False, "idempotentHint": False})
    def notify(
        title: str,
        message: str = "",
        urgency: Literal["low", "normal", "critical"] = "normal",
        timeout_ms: int | None = None,
    ) -> str:
        """Send a desktop notification via notify-send."""
        args = ["notify-send", "--urgency", urgency]
        if timeout_ms is not None:
            args += ["--expire-time", str(timeout_ms)]
        args.append(title)
        if message:
            args.append(message)
        subprocess.run(args, env=ENV, check=False)
        return f"Notification sent: '{title}'"
