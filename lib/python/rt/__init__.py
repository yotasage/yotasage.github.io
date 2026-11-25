"""yotasage_rt: browser Python runtime helpers installed at Pyodide worker boot."""

import os
import sys

from .repl import repl_complete, repl_push, reset_console, set_namespace
from .runner import WORKSPACE_ROOT, ensure_workspace, get_last_namespace, run_script
from .shims import YotaSyncEventLoop, install_shims
from .stdio import async_input, install_stdio

__all__ = [
    "WORKSPACE_ROOT",
    "YotaSyncEventLoop",
    "async_input",
    "ensure_workspace",
    "export_live_plot",
    "get_last_namespace",
    "get_live_figure_count",
    "install_runtime",
    "repl_complete",
    "repl_push",
    "reset_console",
    "run_script",
    "set_namespace",
]


def install_runtime(tier: int, network_mode: str) -> None:
    """Install MPLBACKEND, stdio, shims (incl. lazy PIL hook), workspace, and REPL."""
    # Set custom matplotlib backend BEFORE matplotlib is ever imported (architecture.md §8).
    os.environ["MPLBACKEND"] = "module://yotasage_rt.mpl_backend"
    ensure_workspace()
    install_stdio(tier)
    install_shims(tier, network_mode)
    set_namespace(get_last_namespace())


def get_live_figure_count() -> int:
    """Return retained live matplotlib figure count without eagerly importing matplotlib."""
    mod = sys.modules.get("yotasage_rt.mpl_backend")
    if mod is None:
        return 0
    return int(mod.get_live_figure_count())


def export_live_plot(plot_id: str, fmt: str) -> dict:
    """Export a live matplotlib figure as SVG or PDF without eagerly importing matplotlib."""
    mod = sys.modules.get("yotasage_rt.mpl_backend")
    if mod is None:
        return {
            "ok": False,
            "reason": "evicted",
            "error": f"Plot {plot_id!r} is not available (no live matplotlib figures).",
        }
    return mod.export_live_plot(plot_id, fmt)
