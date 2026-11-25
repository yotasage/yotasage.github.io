"""Interactive REPL built on pyodide.console.PyodideConsole sharing the last run's namespace."""

import asyncio
import builtins
import sys

from pyodide.console import PyodideConsole

from .runner import ack_interrupt, format_exception_info, get_last_namespace, set_interrupts

_console: PyodideConsole | None = None


class _Console(PyodideConsole):
    """PyodideConsole whose line notices Stop (SIGINT) only while the user's code runs.

    A line runs through several web-loop callbacks (this task, the done callback that formats an error, the
    wrapper awaiting the result). An interrupt noticed between them, before a callback's guarded part, would
    lose that callback and leave the line hanging, so repl_push turns noticing off and only the user's code
    turns it on. Same steps as PyodideConsole.runcode and Console.runcode."""

    async def runcode(self, source, code):
        from pyodide_js import loadPackagesFromImports

        await loadPackagesFromImports(source)
        with self.redirect_streams():
            try:
                try:
                    set_interrupts(True)
                    return await code.run_async(self.globals)
                finally:
                    set_interrupts(False)
            except KeyboardInterrupt:
                # Stop re-asserting SIGINT: the line is ending.
                ack_interrupt()
                raise
            finally:
                sys.stdout.flush()
                sys.stderr.flush()


def _write_stdout(text: str) -> None:
    sys.stdout.write(text)
    sys.stdout.flush()


def _write_stderr(text: str) -> None:
    sys.stderr.write(text)
    sys.stderr.flush()


def set_namespace(namespace: dict) -> None:
    """Bind the REPL console to the given globals dictionary."""
    global _console
    # Do not pass stdout_callback/stderr_callback pointing at sys.stdout/sys.stderr:
    # PyodideConsole redirects sys.stdout to a wrapper calling stdout_callback, which would
    # recurse infinitely on print(). Leaving them None writes directly to Pyodide's live streams.
    _console = _Console(
        namespace,
        filename="<console>",
    )


def reset_console() -> None:
    set_namespace(get_last_namespace())


def _get_console() -> PyodideConsole:
    if _console is None:
        reset_console()
    assert _console is not None
    return _console


_INTERRUPTED_INFO = {
    "type": "KeyboardInterrupt",
    "message": "",
    "formatted": "KeyboardInterrupt\n",
    "frames": [],
}


def _escaped_interrupt() -> None:
    pass


def _ignore_escaped_interrupt(loop=None) -> None:
    """Stop raises KeyboardInterrupt in the console's asyncio task. The task records it (so the line's future
    gets it), then re-raises it out of the web loop's callback, where Pyodide would report it as an uncaught
    error. A handler on the loop takes that re-raise; the interrupt itself is handled where the line awaits it."""
    loop = loop or asyncio.get_running_loop()
    if getattr(loop, "_keyboard_interrupt_handler", False) is None:
        loop._keyboard_interrupt_handler = _escaped_interrupt


try:
    _ignore_escaped_interrupt(asyncio.get_event_loop())
except Exception:
    pass


def _interrupted() -> dict:
    set_interrupts(False)
    ack_interrupt()
    try:
        _write_stderr("KeyboardInterrupt\n")
    except KeyboardInterrupt:
        pass
    return {"status": "error", "error": dict(_INTERRUPTED_INFO)}


async def repl_push(line: str) -> dict:
    """Push one line to PyodideConsole; supports multi-line input and expression display.

    A line starting with ETX (Ctrl+C at the prompt, never typed as input) first drops an unfinished statement.
    Stop (SIGINT) is noticed only in the user's code (_Console); one that lands in this wrapper before noticing
    is off is a clean KeyboardInterrupt too. Either way the console and its namespace stay usable."""
    try:
        set_interrupts(False)
        _ignore_escaped_interrupt()
        return await _push(line)
    except KeyboardInterrupt:
        return _interrupted()


async def _push(line: str) -> dict:
    console = _get_console()
    if line.startswith("\x03"):
        console.buffer = []
        line = line[1:]
    fut = console.push(line)
    syntax_check = getattr(fut, "syntax_check", "complete")
    if syntax_check == "incomplete":
        return {"status": "incomplete"}
    if syntax_check == "syntax-error":
        formatted = getattr(fut, "formatted_error", "") or "SyntaxError\n"
        _write_stderr(formatted)
        return {
            "status": "syntax-error",
            "error": {
                "type": "SyntaxError",
                "message": formatted.strip().splitlines()[-1] if formatted.strip() else "SyntaxError",
                "formatted": formatted,
                "frames": [],
            },
        }

    try:
        result = await fut
        if result is not None:
            builtins._ = result
            _write_stdout(f"{result!r}\n")
        return {"status": "complete"}
    except KeyboardInterrupt:
        return _interrupted()
    except BaseException as exc:
        info = format_exception_info(exc)
        _write_stderr(info["formatted"])
        return {"status": "error", "error": info}


def repl_complete(source: str) -> dict:
    """Return tab-completion candidates and start offset for the current REPL input."""
    console = _get_console()
    completions, start = console.complete(source)
    return {
        "completions": [str(item) for item in completions[:500]],
        "start": int(start),
    }
