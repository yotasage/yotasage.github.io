"""yotasage_rt: browser Python runtime helpers installed at Pyodide worker boot."""

from .repl import repl_complete, repl_push, reset_console, set_namespace
from .runner import WORKSPACE_ROOT, ensure_workspace, get_last_namespace, run_script
from .shims import YotaSyncEventLoop, install_shims
from .stdio import async_input, install_stdio

__all__ = [
    "WORKSPACE_ROOT",
    "YotaSyncEventLoop",
    "async_input",
    "ensure_workspace",
    "get_last_namespace",
    "install_runtime",
    "repl_complete",
    "repl_push",
    "reset_console",
    "run_script",
    "set_namespace",
]


def install_runtime(tier: int, network_mode: str) -> None:
    """Install stdio, sleep/asyncio/webbrowser/subprocess shims, and workspace."""
    ensure_workspace()
    install_stdio(tier)
    install_shims(tier, network_mode)
    set_namespace(get_last_namespace())
