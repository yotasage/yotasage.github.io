"""Script execution via runpy, workspace file sync, module purging, and traceback filtering."""

import importlib
import os
import posixpath
import runpy
import sys
import traceback

WORKSPACE_ROOT = "/workspace"

_INTERNAL_FRAME_PREFIXES = (
    "<frozen runpy>",
    "<frozen importlib",
    "/lib/python314.zip/_pyodide/",
    "/lib/python314.zip/pyodide/",
    "/yotasage_rt/",
)

_last_main_namespace: dict = {"__name__": "__main__"}
_script_dir_on_path: str | None = None


def get_last_namespace() -> dict:
    return _last_main_namespace


def ensure_workspace() -> str:
    os.makedirs(WORKSPACE_ROOT, exist_ok=True)
    if WORKSPACE_ROOT not in sys.path:
        sys.path.insert(0, WORKSPACE_ROOT)
    elif sys.path[0] != WORKSPACE_ROOT:
        sys.path.remove(WORKSPACE_ROOT)
        sys.path.insert(0, WORKSPACE_ROOT)
    if os.getcwd() != WORKSPACE_ROOT:
        os.chdir(WORKSPACE_ROOT)
    return WORKSPACE_ROOT


def _resolve_workspace_path(rel_path: str) -> str:
    raw = str(rel_path or "main.py").replace("\\", "/")
    if raw.startswith(WORKSPACE_ROOT + "/"):
        raw = raw[len(WORKSPACE_ROOT) + 1 :]
    clean = raw.lstrip("/")
    norm = posixpath.normpath(clean)
    if norm in ("", ".") or norm.startswith("..") or "/../" in f"/{norm}/":
        raise ValueError(f"Invalid workspace path: {rel_path!r}")
    return posixpath.join(WORKSPACE_ROOT, norm)


def _set_script_dir(script_path: str) -> None:
    """Put the script's own folder first on sys.path, as `python dir/main.py` does, so a script in a
    workspace folder can import its sibling modules. /workspace stays on the path after it."""
    global _script_dir_on_path
    if _script_dir_on_path is not None:
        while _script_dir_on_path in sys.path:
            sys.path.remove(_script_dir_on_path)
        _script_dir_on_path = None
    script_dir = posixpath.dirname(script_path)
    if script_dir and script_dir != WORKSPACE_ROOT and script_dir not in sys.path:
        sys.path.insert(0, script_dir)
        _script_dir_on_path = script_dir


def sync_workspace_files(files: dict | None) -> None:
    if not files:
        return
    for rel, content in files.items():
        full = _resolve_workspace_path(rel)
        parent = posixpath.dirname(full)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(full, "w", encoding="utf-8", newline="") as fh:
            fh.write(str(content))


def purge_user_modules() -> None:
    """Drop previously imported user modules under /workspace while keeping stdlib & third-party cached."""
    prefix = WORKSPACE_ROOT + "/"
    to_remove = []
    for name, mod in list(sys.modules.items()):
        mod_file = getattr(mod, "__file__", None)
        if isinstance(mod_file, str) and mod_file.startswith(prefix):
            to_remove.append(name)
            continue
        spec = getattr(mod, "__spec__", None)
        origin = getattr(spec, "origin", None) if spec is not None else None
        if isinstance(origin, str) and origin.startswith(prefix):
            to_remove.append(name)
            continue
        locs = getattr(spec, "submodule_search_locations", None) if spec is not None else None
        if locs:
            for loc in locs:
                if isinstance(loc, str) and (loc == WORKSPACE_ROOT or loc.startswith(prefix)):
                    to_remove.append(name)
                    break
    for name in to_remove:
        sys.modules.pop(name, None)
    importlib.invalidate_caches()


def _is_internal_frame(filename: str) -> bool:
    if filename in ("<exec>", "<string>", "<frozen runpy>"):
        return True
    for prefix in _INTERNAL_FRAME_PREFIXES:
        if filename.startswith(prefix) or "/yotasage_rt/" in filename:
            return True
    return False


def format_exception_info(exc: BaseException) -> dict:
    """Format an exception with internal Pyodide/runpy/yotasage_rt leading frames stripped."""
    tb = exc.__traceback__
    extracted = traceback.extract_tb(tb) if tb is not None else []

    # Strip leading internal runner frames until user code begins.
    start = 0
    while start < len(extracted) and _is_internal_frame(extracted[start].filename):
        start += 1
    user_frames = extracted[start:]

    frames_out = []
    for fr in user_frames:
        item = {
            "file": fr.filename,
            "line": int(fr.lineno or 0),
            "fn": fr.name or "<module>",
        }
        col = getattr(fr, "colno", None)
        if col is not None:
            item["column"] = int(col)
        if fr.line:
            item["text"] = fr.line
        frames_out.append(item)

    if isinstance(exc, SyntaxError) and exc.lineno is not None:
        syn_frame = {
            "file": exc.filename or "<unknown>",
            "line": int(exc.lineno),
            "fn": "<module>",
        }
        if exc.offset is not None:
            syn_frame["column"] = max(0, int(exc.offset) - 1)
        if exc.text:
            syn_frame["text"] = exc.text.rstrip("\r\n")
        frames_out.append(syn_frame)

    lines = []
    if user_frames:
        lines.append("Traceback (most recent call last):\n")
        lines.extend(traceback.format_list(user_frames))
    lines.extend(traceback.format_exception_only(type(exc), exc))
    formatted = "".join(lines)

    return {
        "type": type(exc).__name__,
        "message": str(exc),
        "formatted": formatted,
        "frames": frames_out,
    }


def run_script(code: str | None = None, filename: str = "main.py", files: dict | None = None) -> dict:
    """Write script (if provided) to /workspace, purge stale user modules, run via runpy, and save __main__."""
    from .repl import set_namespace

    ensure_workspace()
    sync_workspace_files(files)

    script_path = _resolve_workspace_path(filename)
    if code is not None:
        parent = posixpath.dirname(script_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(script_path, "w", encoding="utf-8", newline="") as fh:
            fh.write(code)
    elif not os.path.isfile(script_path):
        raise FileNotFoundError(f"Workspace file not found: {script_path}")

    purge_user_modules()
    _set_script_dir(script_path)

    try:
        ns = runpy.run_path(script_path, run_name="__main__")
        _last_main_namespace.clear()
        _last_main_namespace.update(ns)
        set_namespace(_last_main_namespace)
        sys.stdout.flush()
        sys.stderr.flush()
        return {"ok": True, "exitCode": 0, "interrupted": False}
    except SystemExit as exc:
        code_val = exc.code
        if code_val is None:
            exit_code = 0
        elif isinstance(code_val, int):
            exit_code = int(code_val)
        else:
            sys.stderr.write(f"{code_val}\n")
            sys.stderr.flush()
            exit_code = 1
        sys.stdout.flush()
        sys.stderr.flush()
        return {"ok": exit_code == 0, "exitCode": exit_code, "interrupted": False}
    except KeyboardInterrupt as exc:
        try:
            info = format_exception_info(exc)
        except KeyboardInterrupt:
            info = {
                "type": "KeyboardInterrupt",
                "message": str(exc),
                "formatted": "KeyboardInterrupt\n",
                "frames": [],
            }
        try:
            sys.stderr.write(info["formatted"])
            sys.stderr.flush()
        except KeyboardInterrupt:
            pass
        return {"ok": False, "exitCode": 130, "interrupted": True, "error": info}
    except BaseException as exc:
        info = format_exception_info(exc)
        sys.stderr.write(info["formatted"])
        sys.stderr.flush()
        return {"ok": False, "exitCode": 1, "interrupted": False, "error": info}
