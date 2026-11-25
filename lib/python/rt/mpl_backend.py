"""Custom Matplotlib Agg backend streaming PNGs to the browser Plots gallery.

Maintains a bounded ring of live Figure objects (MAX_LIVE_FIGURES = 16) in Python
memory so on-demand SVG/PDF vector re-export works for recent figures while older
figures are explicitly cleared and closed to keep WASM RAM bounded across 100+ plots.
"""

from __future__ import annotations

from collections import OrderedDict
import gc
import io
import struct

import matplotlib.pyplot as plt
from matplotlib._pylab_helpers import Gcf
from matplotlib.backend_bases import FigureManagerBase, _Backend
from matplotlib.backends.backend_agg import FigureCanvasAgg
import pyodide.ffi

from .shims import emit_plot_png, next_plot_id

MAX_LIVE_FIGURES = 16
_PNG_SIG = b"\x89PNG\r\n\x1a\n"
_MAX_TITLE_CHARS = 256

_live_figures: OrderedDict[str, object] = OrderedDict()
_eviction_count = 0


def _extract_png_dims(png_bytes: bytes, fig, dpi: float) -> tuple[int, int]:
    if len(png_bytes) >= 24 and png_bytes[:8] == _PNG_SIG:
        w, h = struct.unpack(">II", png_bytes[16:24])
        if w > 0 and h > 0:
            return int(w), int(h)
    w = max(1, int(round(float(fig.get_figwidth()) * dpi)))
    h = max(1, int(round(float(fig.get_figheight()) * dpi)))
    return w, h


def _extract_title(fig, num) -> str:
    suptitle = getattr(fig, "_suptitle", None)
    if suptitle is not None:
        text = str(suptitle.get_text() or "").strip()
        if text:
            return text[:_MAX_TITLE_CHARS]
    for ax in getattr(fig, "axes", ()):
        title = str(ax.get_title() or "").strip()
        if title:
            return title[:_MAX_TITLE_CHARS]
    return f"Figure {num}"[:_MAX_TITLE_CHARS]


def _evict_figure(fig) -> None:
    global _eviction_count
    try:
        plt.close(fig)
    except Exception:
        pass
    try:
        fig.clf()
    except Exception:
        pass
    try:
        canvas = getattr(fig, "canvas", None)
        if canvas is not None and hasattr(canvas, "renderer"):
            canvas.renderer = None
    except Exception:
        pass
    _eviction_count += 1
    if _eviction_count % MAX_LIVE_FIGURES == 0:
        gc.collect()


def _emit_figure(fig, num=1) -> str:
    dpi = float(fig.get_dpi() or 100.0)
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches=None)
    png_bytes = buf.getvalue()
    buf.close()

    width, height = _extract_png_dims(png_bytes, fig, dpi)
    title = _extract_title(fig, num)
    plot_id = next_plot_id()

    _live_figures[plot_id] = fig
    while len(_live_figures) > MAX_LIVE_FIGURES:
        _, old_fig = _live_figures.popitem(last=False)
        _evict_figure(old_fig)

    emit_plot_png(plot_id, title, width, height, png_bytes, True, "matplotlib")
    return plot_id


class YotaFigureManager(FigureManagerBase):
    """Minimal figure manager whose show() emits the figure and detaches from Gcf."""

    def show(self) -> None:
        fig = self.canvas.figure
        num = self.num
        Gcf.destroy(num)
        _emit_figure(fig, num)


class YotaFigureCanvas(FigureCanvasAgg):
    """Agg canvas paired with YotaFigureManager for live PNG emission and disk savefig."""

    manager_class = YotaFigureManager


def _show_all(*args, **kwargs) -> None:
    del args, kwargs
    managers = list(Gcf.get_all_fig_managers())
    for manager in managers:
        fig = manager.canvas.figure
        num = manager.num
        Gcf.destroy(num)
        _emit_figure(fig, num)


@_Backend.export
class _BackendYota(_Backend):
    FigureCanvas = YotaFigureCanvas
    FigureManager = YotaFigureManager
    show = staticmethod(_show_all)


def get_live_figure_count() -> int:
    """Return the number of matplotlib Figure objects currently retained in memory."""
    return len(_live_figures)


def export_live_plot(plot_id: str, fmt: str) -> dict:
    """Re-render a retained live matplotlib figure as SVG or PDF bytes."""
    fmt_norm = str(fmt or "").lower()
    if fmt_norm not in ("svg", "pdf"):
        return {
            "ok": False,
            "reason": "invalid_format",
            "error": f"Unsupported plot export format: {fmt!r}",
        }
    fig = _live_figures.get(str(plot_id))
    if fig is None:
        return {
            "ok": False,
            "reason": "evicted",
            "error": f"Plot {plot_id!r} is no longer live in Python memory (evicted or unknown).",
        }
    buf = io.BytesIO()
    try:
        fig.savefig(buf, format=fmt_norm, bbox_inches=None)
        data = buf.getvalue()
    except Exception as exc:
        return {
            "ok": False,
            "reason": "render_error",
            "error": f"Failed to export {plot_id} as {fmt_norm}: {exc}",
        }
    finally:
        buf.close()
    return {
        "ok": True,
        "bytes": pyodide.ffi.to_js(data),
    }
