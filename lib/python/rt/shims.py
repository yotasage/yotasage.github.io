"""Browser Python shims: interruptible sleep, YotaSyncEventLoop, webbrowser, subprocess."""

import asyncio
import io
import math
import os
import selectors
import subprocess
import sys
import time
import urllib.parse
import webbrowser

import pyodide.ffi
import yotasage_host

_ORIG_SLEEP = time.sleep
_ORIG_ASYNCIO_RUN = asyncio.run
_plot_counter = 0
_MAX_PLOT_TITLE_CHARS = 256


def next_plot_id() -> str:
    """Return a session-monotonic plot identifier shared across Matplotlib and Pillow."""
    global _plot_counter
    _plot_counter += 1
    return f"plot-{_plot_counter}"


def emit_plot_png(
    plot_id: str,
    title: str,
    width: int,
    height: int,
    png_bytes: bytes,
    can_export_vector: bool,
    source: str,
) -> None:
    """Transfer rendered PNG bytes to the JS worker host as a plot.new event."""
    js_bytes = pyodide.ffi.to_js(png_bytes)
    yotasage_host.emit_plot(
        str(plot_id),
        str(title)[:_MAX_PLOT_TITLE_CHARS],
        int(width),
        int(height),
        js_bytes,
        bool(can_export_vector),
        str(source),
    )


def _patch_pil_image(image_mod) -> None:
    img_cls = getattr(image_mod, "Image", None)
    if img_cls is None or getattr(img_cls, "_yotasage_show_patched", False):
        return

    def _yotasage_pil_show(self, title=None) -> None:
        buf = io.BytesIO()
        try:
            self.save(buf, format="PNG")
        except (OSError, ValueError):
            buf.seek(0)
            buf.truncate(0)
            self.convert("RGBA").save(buf, format="PNG")
        png_bytes = buf.getvalue()
        buf.close()
        width, height = self.size
        clean_title = str(title).strip() if title is not None else ""
        plot_title = (clean_title or "Image")[:_MAX_PLOT_TITLE_CHARS]
        emit_plot_png(
            next_plot_id(),
            plot_title,
            int(width),
            int(height),
            png_bytes,
            False,
            "pillow",
        )

    img_cls.show = _yotasage_pil_show
    img_cls._yotasage_show_patched = True


class _PilImageLoader:
    """Wraps PIL.Image's real loader to patch Image.show immediately after execution."""

    def __init__(self, wrapped) -> None:
        self._wrapped = wrapped

    def create_module(self, spec):
        if hasattr(self._wrapped, "create_module"):
            return self._wrapped.create_module(spec)
        return None

    def exec_module(self, module) -> None:
        self._wrapped.exec_module(module)
        _patch_pil_image(module)

    def __getattr__(self, name: str):
        return getattr(self._wrapped, name)


class _PilImageFinder:
    """Zero-overhead meta_path hook that patches PIL.Image lazily on first import."""

    def find_spec(self, fullname: str, path, target=None):
        if fullname != "PIL.Image":
            return None
        for finder in list(sys.meta_path):
            if finder is self:
                continue
            find_spec = getattr(finder, "find_spec", None)
            if find_spec is None:
                continue
            spec = find_spec(fullname, path, target)
            if (
                spec is not None
                and spec.loader is not None
                and hasattr(spec.loader, "exec_module")
            ):
                spec.loader = _PilImageLoader(spec.loader)
                return spec
        return None


def install_pil_hook() -> None:
    """Hook PIL.Image.Image.show lazily without importing Pillow at boot."""
    existing = sys.modules.get("PIL.Image")
    if existing is not None:
        _patch_pil_image(existing)
        return
    for finder in sys.meta_path:
        if isinstance(finder, _PilImageFinder):
            return
    sys.meta_path.insert(0, _PilImageFinder())


class _InterruptibleSelector(selectors.BaseSelector):
    """Minimal selector whose select() sleeps via Atomics.wait and checks SIGINT."""

    def __init__(self) -> None:
        self._map = {}

    def register(self, fileobj, events, data=None):
        raise NotImplementedError("OS file descriptor polling is not supported in browser WASM")

    def unregister(self, fileobj):
        raise KeyError(fileobj)

    def select(self, timeout=None):
        if timeout is None:
            yotasage_host.sleep_interruptible(0.05)
        elif timeout > 0:
            yotasage_host.sleep_interruptible(float(timeout))
        else:
            yotasage_host.check_interrupt()
        return []

    def get_map(self):
        return self._map

    def close(self) -> None:
        self._map.clear()


class YotaSyncEventLoop(asyncio.BaseEventLoop):
    """Synchronous, Soft-Stoppable asyncio event loop for Tier 1 runpy execution."""

    def __init__(self) -> None:
        super().__init__()
        self._selector = _InterruptibleSelector()

    def _write_to_self(self) -> None:
        pass

    def _process_events(self, event_list) -> None:
        pass

    def close(self) -> None:
        super().close()
        if self._selector is not None:
            self._selector.close()
            self._selector = None


def _shim_asyncio_run(main, *, debug=None, loop_factory=None):
    prev_running = asyncio._get_running_loop()
    suspend_ambient = prev_running is not None and not isinstance(
        prev_running, YotaSyncEventLoop
    )
    if suspend_ambient:
        asyncio._set_running_loop(None)
    try:
        factory = loop_factory if loop_factory is not None else YotaSyncEventLoop
        with asyncio.Runner(debug=debug, loop_factory=factory) as runner:
            return runner.run(main)
    finally:
        if suspend_ambient:
            asyncio._set_running_loop(prev_running)


def _sleep_tier1(seconds: float) -> None:
    secs = float(seconds)
    if math.isnan(secs) or secs < 0:
        raise ValueError("sleep length must be non-negative")
    if secs == 0:
        yotasage_host.check_interrupt()
        return
    yotasage_host.sleep_interruptible(secs)


def _sleep_tier2(seconds: float) -> None:
    secs = float(seconds)
    if math.isnan(secs) or secs < 0:
        raise ValueError("sleep length must be non-negative")
    if secs == 0:
        return
    pyodide.ffi.run_sync(yotasage_host.sleep_async_promise(secs))


def _webbrowser_open(url: str, new: int = 0, autoraise: bool = True) -> bool:
    del new, autoraise
    mode = str(yotasage_host.network_mode)
    if mode == "off":
        raise RuntimeError(
            "webbrowser.open() is disabled while network access is Off."
        )
    parsed = urllib.parse.urlparse(str(url))
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("webbrowser.open() only accepts http:// or https:// URLs.")
    yotasage_host.emit_link_request(str(url))
    return True


def _unsupported_process(*args, **kwargs):
    del args, kwargs
    raise OSError(
        "Not supported in browser Python: subprocesses and shell commands cannot be started in WebAssembly."
    )


class _UnsupportedPopen:
    def __init__(self, *args, **kwargs) -> None:
        _unsupported_process(*args, **kwargs)


def install_shims(tier: int, network_mode: str) -> None:
    """Install time.sleep, asyncio.run (Tier 1), webbrowser, os.system, and subprocess shims."""
    del network_mode
    if tier == 1:
        time.sleep = _sleep_tier1
        asyncio.run = _shim_asyncio_run
    elif tier == 2:
        time.sleep = _sleep_tier2
        asyncio.run = _ORIG_ASYNCIO_RUN
    else:
        time.sleep = _ORIG_SLEEP
        asyncio.run = _ORIG_ASYNCIO_RUN

    webbrowser.open = _webbrowser_open
    webbrowser.open_new = lambda url: _webbrowser_open(url, new=1)
    webbrowser.open_new_tab = lambda url: _webbrowser_open(url, new=2)

    os.system = _unsupported_process
    subprocess.Popen = _UnsupportedPopen
    subprocess.run = _unsupported_process
    subprocess.call = _unsupported_process
    subprocess.check_call = _unsupported_process
    subprocess.check_output = _unsupported_process

    install_pil_hook()
