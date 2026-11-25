"""Standard I/O shims for Tier 1 (SAB), Tier 2 (JSPI), and Tier 3 (async helper)."""

import builtins
import io
import sys

import pyodide.ffi
import yotasage_host


def _is_eof_sentinel(val) -> bool:
    return val is None or val is pyodide.ffi.jsnull


def _tier1_input(prompt="") -> str:
    if prompt:
        sys.stdout.write(str(prompt))
        sys.stdout.flush()
    line = sys.stdin.readline()
    if not line:
        raise EOFError("EOF when reading a line")
    return line.rstrip("\r\n")


class _JspiStdin(io.TextIOBase):
    """Line-oriented stdin backed by JSPI Promise.run_sync() for Tier 2."""

    def __init__(self) -> None:
        self._buf = ""

    def readable(self) -> bool:
        return True

    def isatty(self) -> bool:
        return True

    def readline(self, size: int = -1) -> str:
        if not self._buf:
            val = pyodide.ffi.run_sync(yotasage_host.request_stdin_jspi())
            if _is_eof_sentinel(val):
                return ""
            text = str(val)
            self._buf = text if text.endswith("\n") else f"{text}\n"
        if size is not None and size >= 0 and size < len(self._buf):
            chunk = self._buf[:size]
            self._buf = self._buf[size:]
            return chunk
        chunk = self._buf
        self._buf = ""
        return chunk

    def read(self, size: int = -1) -> str:
        if size is not None and size >= 0:
            out = []
            remaining = size
            while remaining > 0:
                piece = self.readline(remaining)
                if not piece:
                    break
                out.append(piece)
                remaining -= len(piece)
            return "".join(out)
        chunks = []
        while True:
            piece = self.readline()
            if not piece:
                break
            chunks.append(piece)
        return "".join(chunks)


def _tier2_input(prompt="") -> str:
    if prompt:
        sys.stdout.write(str(prompt))
        sys.stdout.flush()
    line = sys.stdin.readline()
    if not line:
        raise EOFError("EOF when reading a line")
    return line.rstrip("\r\n")


def _tier3_input(prompt="") -> str:
    if prompt:
        sys.stdout.write(str(prompt))
        sys.stdout.flush()
    raise RuntimeError(
        "Blocking input() is unavailable without cross-origin isolation or WebAssembly JSPI. "
        "Use 'await yotasage_rt.async_input(prompt)' instead."
    )


async def async_input(prompt="") -> str:
    """Async stdin helper usable in Tier 3 (or inside top-level await)."""
    if prompt:
        sys.stdout.write(str(prompt))
        sys.stdout.flush()
    val = await yotasage_host.request_stdin_jspi()
    if _is_eof_sentinel(val):
        raise EOFError("EOF when reading a line")
    return str(val).rstrip("\r\n")


def install_stdio(tier: int) -> None:
    """Install builtins.input (and Tier 2 JSPI sys.stdin) matching the active tier."""
    if tier == 1:
        builtins.input = _tier1_input
    elif tier == 2:
        sys.stdin = _JspiStdin()
        builtins.input = _tier2_input
    else:
        builtins.input = _tier3_input
