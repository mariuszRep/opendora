"""Entry point: python -m pyautogui.mcp_server [--transport stdio|sse|streamable-http]"""

from . import mcp

if __name__ == "__main__":
    mcp.run()
