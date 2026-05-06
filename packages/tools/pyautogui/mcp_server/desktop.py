"""
WSLg/X11 desktop backend — shared by all tool modules.

WSLg quirks:
- Clicks: XTest events (pyautogui default) don't reach XWayland apps.
  Use `xdotool mousemove X Y click N` instead.
- Full-screen screenshots: scrot returns a black image on WSLg because the
  compositor buffer isn't exposed. Capture per-window with ImageMagick `import`.
- mouseinfo: opens a Display at import time → mock it to avoid Xlib auth
  failure. All other Xlib calls work fine without XAUTHORITY on WSLg.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from typing import NamedTuple
from unittest.mock import MagicMock

# Suppress mouseinfo Xlib auth failure at import time.
sys.modules.setdefault("mouseinfo", MagicMock())

import pyautogui  # noqa: E402

pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.0

DISPLAY: str = os.environ.get("DISPLAY", ":0")
ENV: dict[str, str] = {**os.environ, "DISPLAY": DISPLAY}


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

class Window(NamedTuple):
    wid: int
    title: str
    x: int
    y: int
    width: int
    height: int


# ---------------------------------------------------------------------------
# Mouse
# ---------------------------------------------------------------------------

def mouse_move(x: int, y: int, duration: float = 0.15) -> tuple[int, int]:
    pyautogui.moveTo(x, y, duration=duration)
    pos = pyautogui.position()
    return pos.x, pos.y


def mouse_move_rel(dx: int, dy: int, duration: float = 0.15) -> tuple[int, int]:
    pyautogui.moveRel(dx, dy, duration=duration)
    pos = pyautogui.position()
    return pos.x, pos.y


def mouse_click(x: int | None, y: int | None,
                button: str = "left", double: bool = False) -> tuple[int, int]:
    if x is None or y is None:
        pos = pyautogui.position()
        x, y = pos.x, pos.y
    btn = {"left": 1, "middle": 2, "right": 3}.get(button, 1)
    if double:
        subprocess.run(
            ["xdotool", "mousemove", str(x), str(y), "click", "--repeat", "2", str(btn)],
            env=ENV, check=True,
        )
    else:
        subprocess.run(
            ["xdotool", "mousemove", str(x), str(y), "click", str(btn)],
            env=ENV, check=True,
        )
    pos = pyautogui.position()
    return pos.x, pos.y


def mouse_down(x: int | None, y: int | None, button: str = "left") -> tuple[int, int]:
    if x is None or y is None:
        pos = pyautogui.position()
        x, y = pos.x, pos.y
    btn = {"left": 1, "middle": 2, "right": 3}.get(button, 1)
    subprocess.run(
        ["xdotool", "mousemove", str(x), str(y), "mousedown", str(btn)],
        env=ENV, check=True,
    )
    return x, y


def mouse_up(x: int | None, y: int | None, button: str = "left") -> tuple[int, int]:
    if x is None or y is None:
        pos = pyautogui.position()
        x, y = pos.x, pos.y
    btn = {"left": 1, "middle": 2, "right": 3}.get(button, 1)
    subprocess.run(
        ["xdotool", "mousemove", str(x), str(y), "mouseup", str(btn)],
        env=ENV, check=True,
    )
    return x, y


def mouse_drag(from_x: int, from_y: int, to_x: int, to_y: int,
               duration: float = 0.4, button: str = "left") -> tuple[int, int]:
    pyautogui.moveTo(from_x, from_y, duration=0.1)
    pyautogui.dragTo(to_x, to_y, duration=duration, button=button)
    pos = pyautogui.position()
    return pos.x, pos.y


def mouse_drag_rel(dx: int, dy: int, duration: float = 0.4,
                   button: str = "left") -> tuple[int, int]:
    pyautogui.dragRel(dx, dy, duration=duration, button=button)
    pos = pyautogui.position()
    return pos.x, pos.y


def mouse_scroll(clicks: int, x: int | None = None, y: int | None = None) -> None:
    btn = 4 if clicks > 0 else 5
    move = (["mousemove", str(x), str(y)] if x is not None and y is not None else [])
    for _ in range(abs(clicks)):
        subprocess.run(["xdotool"] + move + ["click", str(btn)], env=ENV, check=True)


def mouse_hscroll(clicks: int, x: int | None = None, y: int | None = None) -> None:
    # Button 6 = scroll left, 7 = scroll right
    btn = 7 if clicks > 0 else 6
    move = (["mousemove", str(x), str(y)] if x is not None and y is not None else [])
    for _ in range(abs(clicks)):
        subprocess.run(["xdotool"] + move + ["click", str(btn)], env=ENV, check=True)


def mouse_position() -> tuple[int, int]:
    pos = pyautogui.position()
    return pos.x, pos.y


def screen_size() -> tuple[int, int]:
    sz = pyautogui.size()
    return sz.width, sz.height


# ---------------------------------------------------------------------------
# Keyboard
# ---------------------------------------------------------------------------

def key_type(text: str) -> None:
    subprocess.run(
        ["xdotool", "type", "--clearmodifiers", "--delay", "0", text],
        env=ENV, check=True,
    )


def key_press(keys: str | list[str], presses: int = 1) -> None:
    if isinstance(keys, str):
        keys = [keys]
    key_str = "+".join(keys)
    for _ in range(presses):
        subprocess.run(["xdotool", "key", "--clearmodifiers", key_str], env=ENV, check=True)


def key_down(key: str) -> None:
    subprocess.run(["xdotool", "keydown", "--clearmodifiers", key], env=ENV, check=True)


def key_up(key: str) -> None:
    subprocess.run(["xdotool", "keyup", "--clearmodifiers", key], env=ENV, check=True)


# ---------------------------------------------------------------------------
# Screen
# ---------------------------------------------------------------------------

def screen_screenshot(path: str | None = None) -> tuple[str, int, int]:
    out = path or tempfile.mktemp(suffix=".png")
    subprocess.run(["scrot", "-z", out], env=ENV, check=True)
    from PIL import Image
    img = Image.open(out)
    return out, img.width, img.height


def screen_screenshot_window(window_id: int, path: str | None = None) -> tuple[str, int, int]:
    out = path or tempfile.mktemp(suffix=".png")
    subprocess.run(["import", "-window", str(window_id), out], env=ENV, check=True)
    from PIL import Image
    img = Image.open(out)
    return out, img.width, img.height


def screen_pixel(x: int, y: int) -> tuple[int, int, int]:
    """Return (r, g, b) color of the pixel at (x, y)."""
    from PIL import Image
    ss = tempfile.mktemp(suffix=".png")
    subprocess.run(["scrot", "-z", ss], env=ENV, check=True)
    img = Image.open(ss).convert("RGB")
    os.unlink(ss)
    r, g, b = img.getpixel((x, y))
    return r, g, b


def screen_locate(image_path: str, confidence: float = 0.9) -> dict | None:
    import cv2
    import numpy as np
    from PIL import Image
    ss = tempfile.mktemp(suffix=".png")
    subprocess.run(["scrot", "-z", ss], env=ENV, check=True)
    haystack = np.array(Image.open(ss).convert("RGB"))
    needle = np.array(Image.open(image_path).convert("RGB"))
    os.unlink(ss)
    result = cv2.matchTemplate(haystack, needle, cv2.TM_CCOEFF_NORMED)
    _, max_val, _, max_loc = cv2.minMaxLoc(result)
    if max_val < confidence:
        return None
    nh, nw = needle.shape[:2]
    return {
        "x": max_loc[0] + nw // 2, "y": max_loc[1] + nh // 2,
        "left": max_loc[0], "top": max_loc[1],
        "width": nw, "height": nh, "confidence": float(max_val),
    }


def screen_locate_all(image_path: str, confidence: float = 0.9) -> list[dict]:
    import cv2
    import numpy as np
    from PIL import Image
    ss = tempfile.mktemp(suffix=".png")
    subprocess.run(["scrot", "-z", ss], env=ENV, check=True)
    haystack = np.array(Image.open(ss).convert("RGB"))
    needle = np.array(Image.open(image_path).convert("RGB"))
    os.unlink(ss)
    result = cv2.matchTemplate(haystack, needle, cv2.TM_CCOEFF_NORMED)
    nh, nw = needle.shape[:2]
    locs = np.where(result >= confidence)
    matches = []
    for pt in zip(*locs[::-1]):
        matches.append({
            "x": pt[0] + nw // 2, "y": pt[1] + nh // 2,
            "left": pt[0], "top": pt[1],
            "width": nw, "height": nh,
            "confidence": float(result[pt[1], pt[0]]),
        })
    # Non-max suppression: remove overlapping boxes
    deduped: list[dict] = []
    for m in sorted(matches, key=lambda m: -m["confidence"]):
        if all(abs(m["x"] - d["x"]) > nw // 2 or abs(m["y"] - d["y"]) > nh // 2 for d in deduped):
            deduped.append(m)
    return deduped


# ---------------------------------------------------------------------------
# Window management
# ---------------------------------------------------------------------------

def _parse_window(wid: int) -> Window | None:
    name_r = subprocess.run(["xdotool", "getwindowname", str(wid)],
                             env=ENV, capture_output=True, text=True)
    name = name_r.stdout.strip()
    if not name:
        return None
    geom_r = subprocess.run(["xdotool", "getwindowgeometry", str(wid)],
                              env=ENV, capture_output=True, text=True)
    try:
        lines = geom_r.stdout.splitlines()
        pos = next(l for l in lines if "Position" in l)
        geo = next(l for l in lines if "Geometry" in l)
        xy = pos.split(":")[1].split("(")[0].strip().split(",")
        wh = geo.split(":")[1].strip().split("x")
        x, y, w, h = int(xy[0]), int(xy[1]), int(wh[0]), int(wh[1])
    except (StopIteration, IndexError, ValueError):
        return None
    if w < 20 or h < 20 or (w > 7000 and h > 3000):
        return None
    return Window(wid=wid, title=name, x=x, y=y, width=w, height=h)


def list_windows() -> list[Window]:
    r = subprocess.run(["xdotool", "search", "--onlyvisible", "--name", ""],
                       env=ENV, capture_output=True, text=True)
    windows = []
    for line in r.stdout.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            w = _parse_window(int(line))
            if w:
                windows.append(w)
        except ValueError:
            pass
    return windows


# ---------------------------------------------------------------------------
# Snapshot / annotation
# ---------------------------------------------------------------------------

def annotate(image_path: str, elements: list[dict], radius: int = 18) -> str:
    from PIL import Image, ImageDraw, ImageFont
    img = Image.open(image_path).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 16)
    except OSError:
        font = ImageFont.load_default()
    for el in elements:
        cx = el["x"] + el["width"] // 2
        cy = el["y"] + el["height"] // 2
        label = str(el["label"])
        draw.ellipse([(cx - radius, cy - radius), (cx + radius, cy + radius)],
                     fill=(255, 80, 0, 220), outline=(255, 255, 255, 255), width=2)
        bbox = draw.textbbox((0, 0), label, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text((cx - tw // 2, cy - th // 2), label, fill=(255, 255, 255, 255), font=font)
    out = tempfile.mktemp(suffix="_annotated.png")
    Image.alpha_composite(img, overlay).convert("RGB").save(out)
    return out
