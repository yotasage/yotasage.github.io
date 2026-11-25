"""Browser Python shims: interruptible sleep, YotaSyncEventLoop, webbrowser, subprocess."""

import asyncio
import math
import os
import selectors
import subprocess
import time
import urllib.parse
import webbrowser

import yotasage_host

_ORIG_SLEEP = time.sleep
_ORIG_ASYNCIO_RUN = asyncio.run


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
    factory = loop_factory if loop_factory is not None else YotaSyncEventLoop
    with asyncio.Runner(debug=debug, loop_factory=factory) as runner:
        return runner.run(main)


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
    yotasage_host.sleep_async_promise(secs).run_sync()


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
