from fastmcp import FastMCP
from .tools import register_all

mcp = FastMCP(
    "pyautogui",
    instructions=(
        "GUI automation for Linux/WSLg X11 apps via PyAutoGUI + xdotool.\n"
        "Workflow: 1) snapshot() to see the desktop with labeled windows. "
        "2) snapshot_window(wid) to see a specific app's interactive elements with labels. "
        "3) mouse_click_at(abs_x, abs_y) to click any labeled element. "
        "4) screenshot_window(wid) to verify results.\n"
        "Note: clicks use xdotool internally (XTest doesn't reach XWayland apps on WSLg)."
    ),
)

register_all(mcp)
