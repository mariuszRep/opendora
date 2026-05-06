from fastmcp import FastMCP
from . import input, screen, snapshot, app, system


def register_all(mcp: FastMCP) -> None:
    input.register(mcp)
    screen.register(mcp)
    snapshot.register(mcp)
    app.register(mcp)
    system.register(mcp)
