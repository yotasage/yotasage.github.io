"""Interactive REPL built on pyodide.console.PyodideConsole sharing the last run's namespace."""

import builtins
import sys

from pyodide.console import PyodideConsole

from .runner import format_exception_info, get_last_namespace

_console: PyodideConsole | None = None


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
    _console = PyodideConsole(
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


async def repl_push(line: str) -> dict:
    """Push one line to PyodideConsole; supports multi-line input and expression display."""
    console = _get_console()
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
