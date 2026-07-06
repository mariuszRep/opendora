#!/usr/bin/env python3
"""
PyAutoGUI bridge for opendora tools.
Reads a JSON command from argv[1], executes it, prints JSON result to stdout.
Exit 0 on success, exit 1 on failure (error JSON to stderr).

WSLg behaviour notes:
- Clicks:      XTest events (pyautogui/xdotool default) don't reach XWayland
               apps. We use `xdotool mousemove X Y click N` which does.
- Screenshot:  scrot works; pyscreeze's gnome-screenshot path fails in WSLg
               because WAYLAND_DISPLAY is set. We call scrot directly.
- mouseinfo:   Opens a Display at import time → mocked to avoid auth failure.
               All other Xlib ops work without XAUTHORITY on WSLg.
"""

import sys
import json
import os
import subprocess
import tempfile
import time
from unittest.mock import MagicMock

# Redirect BOTH Python-level and C-level stdout to /dev/null for the entire
# module load so that Xlib warnings ("Xlib.xauth: warning, no xauthority
# details available") — whether written via Python's print() or via C-level
# libX11 fprintf — do not pollute the JSON stdout stream that the runner
# parses. The real stdout fd is restored in main() just before we write the
# JSON result.
_real_stdout_fd = os.dup(1)                      # save real fd 1
_devnull_fd = os.open(os.devnull, os.O_WRONLY)
os.dup2(_devnull_fd, 1)                          # fd 1 → /dev/null
os.close(_devnull_fd)
_real_stdout = sys.stdout
sys.stdout = sys.stderr                          # Python-level: also → stderr

sys.modules["mouseinfo"] = MagicMock()

import pyautogui  # noqa: E402

pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.0

import shutil

DISPLAY = os.environ.get("DISPLAY", ":0")
ENV = {**os.environ, "DISPLAY": DISPLAY}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _has(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def _xdotool(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["xdotool", *args], env=ENV, check=True, capture_output=True, text=True)


def _click(x: int, y: int, button: int = 1, double: bool = False) -> None:
    """Deliver a click via xdotool — the only path that reaches XWayland apps."""
    if double:
        subprocess.run(["xdotool", "mousemove", str(x), str(y), "click", "--repeat", "2", str(button)], env=ENV, check=True)
    else:
        subprocess.run(["xdotool", "mousemove", str(x), str(y), "click", str(button)], env=ENV, check=True)


def _scrot(path: str) -> None:
    subprocess.run(["scrot", "-z", path], env=ENV, check=True)


def _composite_screenshot() -> str:
    """WSLg-safe full-desktop screenshot via per-window captures.

    scrot full-screen returns black on WSLg because the compositor does not
    expose the XShm framebuffer. Composite individual window captures instead,
    identical to the snapshot action.
    """
    import pyautogui
    from PIL import Image

    windows = _get_windows()
    sz = pyautogui.size()
    canvas = Image.new("RGB", (sz.width, sz.height), (0, 0, 0))

    if windows:
        for w in windows:
            win_ss = tempfile.mktemp(suffix=".png")
            try:
                subprocess.run(["import", "-window", str(w["wid"]), win_ss],
                               env=ENV, check=True, capture_output=True)
                wimg = Image.open(win_ss)
                canvas.paste(wimg.resize((max(w["width"], 1), max(w["height"], 1))),
                             (w["x"], w["y"]))
                os.unlink(win_ss)
            except Exception:
                pass

    out = tempfile.mktemp(suffix=".png")
    canvas.save(out)
    return out


def _get_windows() -> list[dict]:
    """Return visible named top-level windows with geometry."""
    r = subprocess.run(["xdotool", "search", "--onlyvisible", "--name", ""],
                       env=ENV, capture_output=True, text=True)
    windows = []
    for wid_str in r.stdout.strip().splitlines():
        wid_str = wid_str.strip()
        if not wid_str:
            continue
        try:
            wid = int(wid_str)
        except ValueError:
            continue
        name_r = subprocess.run(["xdotool", "getwindowname", str(wid)],
                                 env=ENV, capture_output=True, text=True)
        name = name_r.stdout.strip()
        if not name:
            continue
        geom_r = subprocess.run(["xdotool", "getwindowgeometry", str(wid)],
                                  env=ENV, capture_output=True, text=True)
        geom = geom_r.stdout
        try:
            pos_line = next(l for l in geom.splitlines() if "Position" in l)
            geo_line = next(l for l in geom.splitlines() if "Geometry" in l)
            xy = pos_line.split(":")[1].split("(")[0].strip().split(",")
            wh = geo_line.split(":")[1].strip().split("x")
            x, y, w, h = int(xy[0]), int(xy[1]), int(wh[0]), int(wh[1])
        except (StopIteration, IndexError, ValueError):
            continue
        if w < 20 or h < 20 or (w > 7000 and h > 3000):
            continue
        windows.append({"wid": wid, "title": name, "x": x, "y": y, "width": w, "height": h})
    return windows


def _annotate_screenshot(img_path: str, elements: list[dict]) -> str:
    """Draw numbered circles on the screenshot at each element center."""
    from PIL import Image, ImageDraw, ImageFont
    img = Image.open(img_path).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    radius = 18
    for el in elements:
        cx = el["x"] + el["width"] // 2
        cy = el["y"] + el["height"] // 2
        label = str(el["label"])
        # Circle
        draw.ellipse([(cx - radius, cy - radius), (cx + radius, cy + radius)],
                     fill=(255, 80, 0, 220), outline=(255, 255, 255, 255), width=2)
        # Text — centre it
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 16)
        except OSError:
            font = ImageFont.load_default()
        bbox = draw.textbbox((0, 0), label, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.text((cx - tw // 2, cy - th // 2), label, fill=(255, 255, 255, 255), font=font)

    combined = Image.alpha_composite(img, overlay).convert("RGB")
    out_path = tempfile.mktemp(suffix="_annotated.png")
    combined.save(out_path)
    return out_path


# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------

def run(cmd: dict) -> dict:
    action = cmd["action"]

    # --- Mouse ---

    if action == "move":
        pyautogui.moveTo(cmd["x"], cmd["y"], duration=cmd.get("duration", 0.15))
        pos = pyautogui.position()
        return {"x": pos.x, "y": pos.y}

    elif action == "click":
        x, y = cmd.get("x"), cmd.get("y")
        btn_map = {"left": 1, "middle": 2, "right": 3}
        button = btn_map.get(cmd.get("button", "left"), 1)
        if x is None or y is None:
            pos = pyautogui.position()
            x, y = pos.x, pos.y
        _click(x, y, button=button, double=bool(cmd.get("double")))
        pos = pyautogui.position()
        return {"x": pos.x, "y": pos.y}

    elif action == "move_rel":
        pyautogui.moveRel(cmd["dx"], cmd["dy"], duration=cmd.get("duration", 0.15))
        pos = pyautogui.position()
        return {"x": pos.x, "y": pos.y}

    elif action == "mouse_down":
        x, y = cmd.get("x"), cmd.get("y")
        btn = {"left": 1, "middle": 2, "right": 3}.get(cmd.get("button", "left"), 1)
        if x is None or y is None:
            pos = pyautogui.position()
            x, y = pos.x, pos.y
        subprocess.run(["xdotool", "mousemove", str(x), str(y), "mousedown", str(btn)], env=ENV, check=True)
        return {"x": x, "y": y}

    elif action == "mouse_up":
        x, y = cmd.get("x"), cmd.get("y")
        btn = {"left": 1, "middle": 2, "right": 3}.get(cmd.get("button", "left"), 1)
        if x is None or y is None:
            pos = pyautogui.position()
            x, y = pos.x, pos.y
        subprocess.run(["xdotool", "mousemove", str(x), str(y), "mouseup", str(btn)], env=ENV, check=True)
        return {"x": x, "y": y}

    elif action == "drag":
        src_x, src_y = cmd.get("from_x"), cmd.get("from_y")
        dst_x, dst_y = cmd["x"], cmd["y"]
        if src_x is not None and src_y is not None:
            pyautogui.moveTo(src_x, src_y, duration=0.1)
        pyautogui.dragTo(dst_x, dst_y, duration=cmd.get("duration", 0.4), button=cmd.get("button", "left"))
        pos = pyautogui.position()
        return {"x": pos.x, "y": pos.y}

    elif action == "drag_rel":
        pyautogui.dragRel(cmd["dx"], cmd["dy"], duration=cmd.get("duration", 0.4), button=cmd.get("button", "left"))
        pos = pyautogui.position()
        return {"x": pos.x, "y": pos.y}

    elif action == "scroll":
        x, y = cmd.get("x"), cmd.get("y")
        clicks = cmd["clicks"]
        scroll_btn = 4 if clicks > 0 else 5
        move_args = (["mousemove", str(x), str(y)] if x is not None and y is not None else [])
        for _ in range(abs(clicks)):
            subprocess.run(["xdotool"] + move_args + ["click", str(scroll_btn)], env=ENV, check=True)
        return {}

    elif action == "hscroll":
        x, y = cmd.get("x"), cmd.get("y")
        clicks = cmd["clicks"]
        # Button 7 = scroll right, 6 = scroll left
        scroll_btn = 7 if clicks > 0 else 6
        move_args = (["mousemove", str(x), str(y)] if x is not None and y is not None else [])
        for _ in range(abs(clicks)):
            subprocess.run(["xdotool"] + move_args + ["click", str(scroll_btn)], env=ENV, check=True)
        return {}

    elif action == "position":
        pos = pyautogui.position()
        return {"x": pos.x, "y": pos.y}

    elif action == "size":
        sz = pyautogui.size()
        return {"width": sz.width, "height": sz.height}

    elif action == "multi_click":
        results = []
        delay = cmd.get("delay_ms", 100) / 1000
        hold_ctrl = cmd.get("hold_ctrl", False)
        if hold_ctrl:
            subprocess.run(["xdotool", "keydown", "ctrl"], env=ENV, check=True)
        try:
            for pt in cmd["points"]:
                x, y = pt["x"], pt["y"]
                button = {"left": 1, "middle": 2, "right": 3}.get(pt.get("button", "left"), 1)
                _click(x, y, button=button)
                results.append({"x": x, "y": y})
                if delay:
                    time.sleep(delay)
        finally:
            if hold_ctrl:
                subprocess.run(["xdotool", "keyup", "ctrl"], env=ENV, check=True)
        return {"clicks": results}

    # --- Keyboard ---

    elif action == "type":
        # Under XWayland the compositor may not honour xdotool windowfocus.
        # --window <wid> uses XSendEvent to deliver directly to the window.
        wid = cmd.get("window_id")
        win_args = ["--window", str(wid)] if wid else []
        subprocess.run(
            ["xdotool", "type", *win_args, "--clearmodifiers", "--delay", "20", "--", cmd["text"]],
            env=ENV, check=True,
        )
        return {}

    elif action == "press":
        keys = cmd["keys"]
        presses = cmd.get("presses", 1)
        if isinstance(keys, str):
            keys = [keys]
        key_str = "+".join(keys)
        wid = cmd.get("window_id")
        win_args = ["--window", str(wid)] if wid else []
        for _ in range(presses):
            subprocess.run(["xdotool", "key", *win_args, "--clearmodifiers", key_str], env=ENV, check=True)
        return {}

    elif action == "key_down":
        key = cmd["key"]
        wid = cmd.get("window_id")
        win_args = ["--window", str(wid)] if wid else []
        subprocess.run(["xdotool", "keydown", *win_args, key], env=ENV, check=True)
        return {}

    elif action == "key_up":
        key = cmd["key"]
        wid = cmd.get("window_id")
        win_args = ["--window", str(wid)] if wid else []
        subprocess.run(["xdotool", "keyup", *win_args, key], env=ENV, check=True)
        return {}

    # --- Screen ---

    elif action == "screenshot":
        out = cmd.get("path") or None
        ss = _composite_screenshot()
        if out:
            import shutil
            shutil.move(ss, out)
        else:
            out = ss
        from PIL import Image
        img = Image.open(out)
        return {"path": out, "width": img.width, "height": img.height}

    elif action == "screenshot_window":
        wid = cmd["window_id"]
        out = cmd.get("path") or tempfile.mktemp(suffix=".png")
        subprocess.run(["import", "-window", str(wid), out], env=ENV, check=True)
        from PIL import Image
        img = Image.open(out)
        return {"path": out, "width": img.width, "height": img.height}

    elif action == "pixel":
        x, y = cmd["x"], cmd["y"]
        ss = _composite_screenshot()
        from PIL import Image
        img = Image.open(ss).convert("RGB")
        os.unlink(ss)
        r, g, b = img.getpixel((x, y))
        return {"r": r, "g": g, "b": b, "hex": f"#{r:02x}{g:02x}{b:02x}"}

    elif action == "locate":
        import cv2
        import numpy as np
        from PIL import Image
        ss = _composite_screenshot()
        haystack = np.array(Image.open(ss).convert("RGB"))
        needle = np.array(Image.open(cmd["image"]).convert("RGB"))
        os.unlink(ss)
        confidence = cmd.get("confidence", 0.9)
        result = cv2.matchTemplate(haystack, needle, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, max_loc = cv2.minMaxLoc(result)
        if max_val < confidence:
            return {"found": False, "confidence": float(max_val)}
        nh, nw = needle.shape[:2]
        return {
            "found": True,
            "x": max_loc[0] + nw // 2,
            "y": max_loc[1] + nh // 2,
            "left": max_loc[0], "top": max_loc[1],
            "width": nw, "height": nh,
            "confidence": float(max_val),
        }

    elif action == "locate_all":
        import cv2
        import numpy as np
        from PIL import Image
        ss = _composite_screenshot()
        haystack = np.array(Image.open(ss).convert("RGB"))
        needle = np.array(Image.open(cmd["image"]).convert("RGB"))
        os.unlink(ss)
        confidence = cmd.get("confidence", 0.9)
        nh, nw = needle.shape[:2]
        result = cv2.matchTemplate(haystack, needle, cv2.TM_CCOEFF_NORMED)
        locs = np.where(result >= confidence)
        matches = []
        for pt in zip(*locs[::-1]):  # (x, y)
            matches.append({
                "x": int(pt[0]) + nw // 2,
                "y": int(pt[1]) + nh // 2,
                "left": int(pt[0]), "top": int(pt[1]),
                "width": nw, "height": nh,
                "confidence": float(result[pt[1], pt[0]]),
            })
        # Deduplicate nearby matches (non-maximum suppression)
        deduped = []
        for m in sorted(matches, key=lambda x: -x["confidence"]):
            if not any(abs(m["x"] - d["x"]) < nw // 2 and abs(m["y"] - d["y"]) < nh // 2 for d in deduped):
                deduped.append(m)
        return {"matches": deduped, "count": len(deduped)}

    # --- Snapshot ---

    elif action == "snapshot":
        from PIL import Image

        windows = _get_windows()
        if not windows:
            # Fallback: plain scrot (will be black on WSLg but at least something)
            ss = tempfile.mktemp(suffix=".png")
            _scrot(ss)
            return {"path": ss, "elements": []}

        # WSLg: scrot full-screen is black. Composite per-window captures instead.
        sz = pyautogui.size()
        # Scale down for manageable output (4K → 1080p equivalent)
        scale = min(1.0, 1920 / sz.width)
        canvas_w = int(sz.width * scale)
        canvas_h = int(sz.height * scale)
        canvas = Image.new("RGB", (canvas_w, canvas_h), (30, 30, 30))

        elements = []
        for i, w in enumerate(windows):
            win_ss = tempfile.mktemp(suffix=".png")
            try:
                subprocess.run(["import", "-window", str(w["wid"]), win_ss],
                               env=ENV, check=True, capture_output=True)
                wimg = Image.open(win_ss)
                px = int(w["x"] * scale)
                py = int(w["y"] * scale)
                pw = int(w["width"] * scale)
                ph = int(w["height"] * scale)
                wimg_resized = wimg.resize((max(pw, 1), max(ph, 1)), Image.LANCZOS)
                canvas.paste(wimg_resized, (px, py))
                os.unlink(win_ss)
            except Exception:
                pass
            elements.append({"label": i + 1, **w})

        # Annotate with labels at scaled positions
        scaled_elements = [
            {**e, "x": int(e["x"] * scale), "y": int(e["y"] * scale),
             "width": int(e["width"] * scale), "height": int(e["height"] * scale)}
            for e in elements
        ]
        canvas_path = tempfile.mktemp(suffix=".png")
        canvas.save(canvas_path)
        annotated = _annotate_screenshot(canvas_path, scaled_elements)
        os.unlink(canvas_path)
        return {"path": annotated, "elements": elements, "scale": scale}

    elif action == "snapshot_window":
        wid = cmd["window_id"]
        ss = tempfile.mktemp(suffix=".png")
        subprocess.run(["import", "-window", str(wid), ss], env=ENV, check=True)
        # Enumerate child windows of this window to find interactive elements
        r = subprocess.run(["xdotool", "search", "--onlyvisible", "--name", ""],
                            env=ENV, capture_output=True, text=True)
        all_wids = [int(w) for w in r.stdout.strip().splitlines() if w.strip()]
        # Get window position as origin
        geom_r = subprocess.run(["xdotool", "getwindowgeometry", str(wid)],
                                  env=ENV, capture_output=True, text=True)
        geom = geom_r.stdout
        try:
            pos_line = next(l for l in geom.splitlines() if "Position" in l)
            xy = pos_line.split(":")[1].split("(")[0].strip().split(",")
            win_x, win_y = int(xy[0]), int(xy[1])
        except (StopIteration, IndexError, ValueError):
            win_x, win_y = 0, 0

        from PIL import Image
        win_img = Image.open(ss)
        win_w, win_h = win_img.size

        # Filter to subwindows within this window's bounds
        elements = []
        label = 1
        for child_wid in all_wids:
            if child_wid == wid:
                continue
            geom2 = subprocess.run(["xdotool", "getwindowgeometry", str(child_wid)],
                                     env=ENV, capture_output=True, text=True).stdout
            try:
                pl = next(l for l in geom2.splitlines() if "Position" in l)
                gl = next(l for l in geom2.splitlines() if "Geometry" in l)
                cxy = pl.split(":")[1].split("(")[0].strip().split(",")
                cwh = gl.split(":")[1].strip().split("x")
                cx, cy, cw, ch = int(cxy[0]), int(cxy[1]), int(cwh[0]), int(cwh[1])
            except (StopIteration, IndexError, ValueError):
                continue
            # Must be inside parent window
            if cx < win_x or cy < win_y or cx + cw > win_x + win_w or cy + ch > win_y + win_h:
                continue
            if cw < 10 or ch < 10:
                continue
            # Convert to window-relative for annotation
            rel_x = cx - win_x
            rel_y = cy - win_y
            elements.append({
                "label": label,
                "wid": child_wid,
                "x": rel_x, "y": rel_y,
                "abs_x": cx, "abs_y": cy,
                "width": cw, "height": ch,
            })
            label += 1

        # Annotate using absolute coords mapped to window-relative
        abs_elements = [{"label": e["label"], "x": e["abs_x"], "y": e["abs_y"],
                          "width": e["width"], "height": e["height"]} for e in elements]
        # Re-root to window coords for annotation
        win_elements = [{"label": e["label"], "x": e["x"], "y": e["y"],
                          "width": e["width"], "height": e["height"]} for e in elements]
        if win_elements:
            annotated = _annotate_screenshot(ss, win_elements)
            os.unlink(ss)
        else:
            annotated = ss

        return {"path": annotated, "elements": elements, "window_id": wid}

    # --- App management ---

    elif action == "app_list":
        windows = _get_windows()
        return {"windows": windows}

    elif action == "app_launch":
        app = cmd["name"]
        subprocess.Popen(app.split(), env=ENV, start_new_session=True,
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(cmd.get("wait", 1.5))
        windows = _get_windows()
        return {"launched": app, "windows": windows}

    elif action == "app_focus":
        wid = cmd["window_id"]
        subprocess.run(["xdotool", "windowraise", str(wid)], env=ENV, check=False)
        subprocess.run(["xdotool", "windowfocus", "--sync", str(wid)], env=ENV, check=False)
        return {"focused": wid}

    elif action == "app_move":
        wid = cmd["window_id"]
        subprocess.run(["xdotool", "windowmove", str(wid), str(cmd["x"]), str(cmd["y"])], env=ENV, check=True)
        return {"moved": wid}

    elif action == "app_resize":
        wid = cmd["window_id"]
        subprocess.run(["xdotool", "windowsize", str(wid), str(cmd["width"]), str(cmd["height"])], env=ENV, check=True)
        return {"resized": wid}

    # --- Clipboard ---
    # xsel is preferred: it daemonizes and holds the clipboard after the process exits.
    # xclip also works but may lose content once the spawning process exits on some setups.

    elif action == "clipboard_get":
        if _has("xsel"):
            r = subprocess.run(["xsel", "--clipboard", "--output"], env=ENV, capture_output=True, text=True)
        elif _has("xclip"):
            r = subprocess.run(["xclip", "-selection", "clipboard", "-o"], env=ENV, capture_output=True, text=True)
        else:
            raise RuntimeError("No clipboard tool found — install xsel or xclip")
        return {"text": r.stdout}

    elif action == "clipboard_set":
        text = cmd["text"]
        if _has("xsel"):
            subprocess.run(["xsel", "--clipboard", "--input"], input=text, env=ENV, text=True, check=True)
        elif _has("xclip"):
            subprocess.run(["xclip", "-selection", "clipboard", "-i"], input=text, env=ENV, text=True, check=True)
        else:
            raise RuntimeError("No clipboard tool found — install xsel or xclip")
        return {}

    # --- Wait ---

    elif action == "wait":
        time.sleep(cmd["duration"])
        return {"slept": cmd["duration"]}

    # --- Notify ---

    elif action == "notify":
        title = cmd["title"]
        message = cmd.get("message", "")
        urgency = cmd.get("urgency", "normal")
        timeout_ms = cmd.get("timeout_ms", 3000)
        timeout_s = max(1, timeout_ms // 1000)

        if _has("notify-send"):
            args = ["notify-send", "--urgency", urgency, "--expire-time", str(timeout_ms), title]
            if message:
                args.append(message)
            subprocess.run(args, env=ENV, check=False)
        elif _has("zenity"):
            text = f"{title}\n{message}" if message else title
            subprocess.Popen(
                ["zenity", "--info", "--title", title, "--text", text, "--timeout", str(timeout_s)],
                env=ENV, start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
        elif _has("xmessage"):
            text = f"{title}\n{message}" if message else title
            subprocess.Popen(
                ["xmessage", "-timeout", str(timeout_s), text],
                env=ENV, start_new_session=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
        else:
            # No notification daemon available — write to stderr so agent logs see it.
            print(f"[notify] {title}: {message}", file=sys.stderr)
        return {}

    else:
        raise ValueError(f"Unknown action: {action!r}")


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command"}), file=sys.stderr)
        sys.exit(1)
    cmd = json.loads(sys.argv[1])
    result = run(cmd)
    # Restore real stdout at C level (fd 1 → real tty/pipe) then Python level,
    # so the JSON is the only thing written there.
    os.dup2(_real_stdout_fd, 1)
    os.close(_real_stdout_fd)
    out = open(1, "w", closefd=False)
    print(json.dumps({"ok": True, **result}), file=out, flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}), file=sys.stderr)
        sys.exit(1)
