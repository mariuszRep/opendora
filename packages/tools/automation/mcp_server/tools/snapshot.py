"""Snapshot tools — annotated screenshots with labeled interactive elements."""

from __future__ import annotations

import os
import subprocess
import tempfile

from fastmcp import FastMCP
from fastmcp.utilities.types import Image as MCPImage

from ..desktop import (
    list_windows, screen_screenshot_window,
    annotate, screen_size, mouse_position, ENV,
)


def register(mcp: FastMCP) -> None:

    @mcp.tool(annotations={"readOnlyHint": True})
    def snapshot() -> tuple[MCPImage, str]:
        """Capture the desktop state: a composited screenshot of all open windows
        annotated with numbered orange labels, plus a text list of windows with
        their IDs, titles, and coordinates.

        Use the returned element list to find window_id values for
        screenshot_window(), snapshot_window(), app_focus(), etc.
        Click a window's center using mouse_click_at(x + width//2, y + height//2)."""
        import pyautogui
        from PIL import Image

        windows = list_windows()
        if not windows:
            # Fallback: plain scrot
            ss, _, _ = __import__("desktop", fromlist=["screen_screenshot"]).screen_screenshot()
            return MCPImage(path=ss), "No windows found"

        # Composite per-window captures (scrot is black on WSLg)
        sz = pyautogui.size()
        scale = min(1.0, 1920 / sz.width)
        cw, ch = int(sz.width * scale), int(sz.height * scale)
        canvas = Image.new("RGB", (cw, ch), (30, 30, 30))

        elements = []
        for i, w in enumerate(windows):
            win_ss = tempfile.mktemp(suffix=".png")
            try:
                subprocess.run(["import", "-window", str(w.wid), win_ss],
                               env=ENV, check=True, capture_output=True)
                wimg = Image.open(win_ss)
                px, py = int(w.x * scale), int(w.y * scale)
                pw, ph = max(int(w.width * scale), 1), max(int(w.height * scale), 1)
                canvas.paste(wimg.resize((pw, ph)), (px, py))
                os.unlink(win_ss)
            except Exception:
                pass
            elements.append({
                "label": i + 1,
                "wid": w.wid, "title": w.title,
                "x": int(w.x * scale), "y": int(w.y * scale),
                "width": int(w.width * scale), "height": int(w.height * scale),
                "abs_x": w.x, "abs_y": w.y,
                "abs_width": w.width, "abs_height": w.height,
            })

        canvas_path = tempfile.mktemp(suffix=".png")
        canvas.save(canvas_path)
        annotated = annotate(canvas_path, elements)
        os.unlink(canvas_path)

        lines = [
            f"[{e['label']}] wid={e['wid']} \"{e['title']}\" "
            f"at ({e['abs_x']},{e['abs_y']}) {e['abs_width']}×{e['abs_height']}"
            for e in elements
        ]
        return MCPImage(path=annotated), "\n".join(lines)

    @mcp.tool(annotations={"readOnlyHint": True})
    def snapshot_window(window_id: int) -> tuple[MCPImage, str]:
        """Capture a specific app window annotated with numbered labels for each
        interactive sub-element (buttons, inputs, checkboxes, etc.).

        Returns the annotated window screenshot and a list of elements with
        abs_x/abs_y absolute screen coordinates — pass those directly to
        mouse_click_at() to click any labeled element.

        Get window_id from snapshot() or app_list()."""
        import pyautogui

        win_ss, win_w, win_h = screen_screenshot_window(window_id)

        # Get window absolute position
        result = subprocess.run(
            ["xdotool", "getwindowgeometry", str(window_id)],
            env=ENV, capture_output=True, text=True,
        )
        win_x, win_y = 0, 0
        for line in result.stdout.splitlines():
            if "Position" in line:
                try:
                    xy = line.split(":")[1].split("(")[0].strip().split(",")
                    win_x, win_y = int(xy[0]), int(xy[1])
                except (IndexError, ValueError):
                    pass

        # Find all visible subwindows inside this window
        r = subprocess.run(["xdotool", "search", "--onlyvisible", "--name", ""],
                           env=ENV, capture_output=True, text=True)
        all_wids = []
        for line in r.stdout.strip().splitlines():
            line = line.strip()
            if line:
                try:
                    all_wids.append(int(line))
                except ValueError:
                    pass

        elements = []
        label = 1
        for child_wid in all_wids:
            if child_wid == window_id:
                continue
            g = subprocess.run(["xdotool", "getwindowgeometry", str(child_wid)],
                                env=ENV, capture_output=True, text=True).stdout
            try:
                pl = next(l for l in g.splitlines() if "Position" in l)
                gl = next(l for l in g.splitlines() if "Geometry" in l)
                cxy = pl.split(":")[1].split("(")[0].strip().split(",")
                cwh = gl.split(":")[1].strip().split("x")
                cx, cy = int(cxy[0]), int(cxy[1])
                cw, ch = int(cwh[0]), int(cwh[1])
            except (StopIteration, IndexError, ValueError):
                continue
            if cx < win_x or cy < win_y:
                continue
            if cx + cw > win_x + win_w or cy + ch > win_y + win_h:
                continue
            if cw < 10 or ch < 10:
                continue
            rel_x, rel_y = cx - win_x, cy - win_y
            elements.append({
                "label": label,
                "wid": child_wid,
                "x": rel_x, "y": rel_y,
                "abs_x": cx, "abs_y": cy,
                "width": cw, "height": ch,
            })
            label += 1

        if elements:
            win_elements = [{"label": e["label"], "x": e["x"], "y": e["y"],
                              "width": e["width"], "height": e["height"]} for e in elements]
            annotated = annotate(win_ss, win_elements)
            os.unlink(win_ss)
        else:
            annotated = win_ss

        lines = [
            f"[{e['label']}] abs({e['abs_x']},{e['abs_y']}) {e['width']}×{e['height']}"
            for e in elements
        ]
        summary = f"{len(elements)} element(s) in window {window_id}"
        if lines:
            summary += ":\n" + "\n".join(lines)
        return MCPImage(path=annotated), summary
