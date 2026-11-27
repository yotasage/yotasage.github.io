"""Packages: micropip wrapper, install executor, installed list, error kinds, missed-import finder.

The page starts installs as a `pkg.install` worker operation between runs (`install`); user code
calls micropip itself, through the wrapper installed here. Both refuse what the network mode cannot
reach before any fetch, because in WebKit a fetch the worker CSP blocks never settles.
"""

import asyncio
import hashlib
import importlib
import importlib.machinery
import importlib.metadata
import json
import os
import re
import sys
from urllib.parse import urlparse

import pyodide_js

PYPI_HOSTS = ("pypi.org", "files.pythonhosted.org")
WHEEL_DIR = "/tmp/yotasage-wheels"
_PRECHECK_TIMEOUT_S = 15.0
_MAX_DETAIL = 8000
_NAME_RE = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
_IMPORT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_.]{0,127}$")
_WHEEL_RE = re.compile(r"^[A-Za-z0-9._+-]{1,251}\.whl$")

MESSAGES = {
    "network-off": "Network access is off, so only bundled packages and wheel files you upload can be "
    "installed. To install {name} from PyPI, reload with Package index mode.",
    "needs-package-index": "Installing {name} from PyPI needs Package index mode. Reload the page in "
    "that mode to install it.",
    "not-found": "PyPI has no package called {name}. Check the spelling: the name you install can "
    "differ from the name you import.",
    "offline": "PyPI could not be reached. Check your connection and try again.",
    "version-not-found": "{name} has no version matching {spec}. Available: {info}.",
    "no-browser-wheel": "{name} only has wheels for Windows, macOS or Linux (compiled code), which "
    "can't run in the browser. Only pure-Python wheels and wheels built for Pyodide work here.",
    "incompatible-wheel": "This wheel is built for {info} and can't run here. Use a py3-none-any "
    "wheel or one built for Pyodide {pyodide} ({tag}).",
    "missing-dependency": "{name} needs {info}, which isn't bundled. Upload a wheel for {info} as "
    "well, or install in Package index mode.",
    "hash-mismatch": "The file doesn't match the SHA-256 hash it should have, so it wasn't installed.",
    "host-blocked": "{info} can't be reached in this network mode. Package index mode allows only "
    "pypi.org and files.pythonhosted.org.",
    "in-script": "Packages can't be installed while a script runs here. Install them before the "
    "run: with the Packages panel, or with `await micropip.install(...)` in the console.",
    "invalid-request": "{name} isn't something that can be installed here.",
    "other": "{name} couldn't be installed.",
}

_tier = 3
_mode = "off"
_origin = ""
_run_active = False
_orig_install = None
_page_sources: dict = {}  # canonical name -> 'bundled' | 'pypi' | 'wheel' (installed by the page)
_page_urls: dict = {}  # canonical name -> files.pythonhosted.org URL of a page-installed wheel
_missing: list = []
_lock_cache = None
_import_map_cache = None


class PackageInstallError(ValueError):
    """An install failure with a `kind` code; the text is the friendly message."""

    def __init__(self, kind: str, message: str, detail: str = "", info: str = "") -> None:
        super().__init__(message)
        self.kind = kind
        self.detail = detail
        self.info = info


def canonical(name: str) -> str:
    return re.sub(r"[-_.]+", "-", str(name)).lower()


def _lock() -> dict:
    global _lock_cache
    if _lock_cache is None:
        _lock_cache = {canonical(k): v for k, v in pyodide_js._api.lockfile_packages.to_py().items()}
    return _lock_cache


def _import_map() -> dict:
    global _import_map_cache
    if _import_map_cache is None:
        out = {}
        for name, pkg in _lock().items():
            for mod in pkg.get("imports") or []:
                out.setdefault(str(mod), name)
        _import_map_cache = out
    return _import_map_cache


def _loaded() -> dict:
    try:
        return {canonical(k): str(v) for k, v in pyodide_js.loadedPackages.to_py().items()}
    except Exception:  # noqa: BLE001
        return {}


def runtime_info() -> dict:
    info = pyodide_js._api.lockfile_info.to_py()
    return {"abiVersion": str(info.get("abi_version", "")), "platform": str(info.get("platform", ""))}


def _message(kind: str, name: str = "", spec: str = "", info: str = "") -> str:
    abi = runtime_info()["abiVersion"]
    return MESSAGES.get(kind, MESSAGES["other"]).format(
        name=name or "This package",
        spec=spec,
        info=info,
        pyodide=str(getattr(pyodide_js, "version", "")),
        tag=f"pyemscripten_{abi}_wasm32",
    )


def _fail(kind: str, requirement: str, detail: str = "", name: str = "", spec: str = "", info: str = "") -> dict:
    return {
        "requirement": str(requirement)[:512],
        "kind": kind,
        "message": _message(kind, name or requirement, spec, info)[:2000],
        "detail": str(detail)[:_MAX_DETAIL],
        **({"info": str(info)[:512]} if info else {}),
    }


def _host_allowed(url: str) -> bool:
    """Hosts micropip may fetch from in the current mode without a CSP block (never in Off)."""
    if _mode == "off":
        return False
    parsed = urlparse(url)
    if parsed.scheme in ("emfs", "file"):
        return True
    host = (parsed.hostname or "").lower()
    if _origin and f"{parsed.scheme}://{parsed.netloc}" == _origin:
        return True
    if _mode == "pkg":
        return parsed.scheme == "https" and host in PYPI_HOSTS
    return True  # Selected hosts / Everything: the CSP decides


def _url_of(requirement: str) -> str | None:
    text = str(requirement).strip()
    if text.startswith(("emfs:", "file:")):
        return text
    if "@" in text and "://" in text.split("@", 1)[1]:
        return text.split("@", 1)[1].split(";", 1)[0].strip()
    if "://" in text:
        return text.split(";", 1)[0].strip()
    return None


def _req_name(requirement: str) -> tuple[str, str]:
    """(name, specifier text) of a PEP 508 requirement; ('', '') if it can't be parsed."""
    text = str(requirement).strip()
    url = _url_of(text)
    if url and "@" not in text:
        base = os.path.basename(urlparse(url).path)
        return (base.split("-", 1)[0] if base.endswith(".whl") else base), ""
    if text.endswith(".whl"):
        return os.path.basename(text).split("-", 1)[0], ""
    try:
        from micropip._vendored.packaging.src.packaging.requirements import Requirement

        req = Requirement(str(requirement))
        return req.name, str(req.specifier)
    except Exception:  # noqa: BLE001
        match = re.match(r"\s*([A-Za-z0-9._-]+)", str(requirement))
        return (match.group(1) if match else ""), ""


async def _ensure_micropip():
    if "micropip" not in sys.modules:
        await pyodide_js.loadPackage("micropip")
    import micropip

    _patch_micropip(micropip)
    return micropip


def _index_urls(micropip_mod, override=None) -> list:
    if _mode == "off":
        return []
    if override is not None:
        return [override] if isinstance(override, str) else list(override)
    return list(micropip_mod._package_manager_singleton.index_urls)


def _index_page(index_url: str, name: str) -> str:
    if index_url in ("PYPI", "https://pypi.org/simple"):
        index_url = "https://pypi.org/simple"
    if "{package_name}" in index_url:
        return index_url.replace("{package_name}", name)
    return f"{index_url.rstrip('/')}/{name}/"


async def _query_index(index_urls: list, name: str):
    """('missing' | 'unreachable' | 'ok', versions, compatible versions) from the first index."""
    from pyodide.http import pyfetch

    if not index_urls:
        return "unreachable", [], []
    url = _index_page(index_urls[0], name)
    if not _host_allowed(url):
        return "unreachable", [], []
    try:
        resp = await asyncio.wait_for(
            pyfetch(url, headers={"accept": "application/vnd.pypi.simple.v1+json, */*;q=0.01"}),
            _PRECHECK_TIMEOUT_S,
        )
        if resp.status == 404:
            return "missing", [], []
        if not resp.ok:
            return "unreachable", [], []
        text = await resp.string()
        from micropip.package_index import _select_parser

        parser = _select_parser(resp.headers.get("content-type", ""), name, index_base_url=url)
        project = parser(text)
    except Exception:  # noqa: BLE001
        return "unreachable", [], []
    versions, compatible = [], []
    for version, wheels in project.releases.items():
        versions.append(version)
        if any(True for _ in wheels):
            compatible.append(version)
    return "ok", versions, compatible


async def classify(
    exc: BaseException, requirement: str, index_urls: list, wheel_install: bool = False, display: str = ""
) -> dict:
    """Turn a micropip failure into a failure entry with a kind and the raw text."""
    raw = "".join(f"{type(e).__name__}: {e}\n" for e in _chain(exc))
    text = str(exc)
    name, spec = _req_name(requirement)
    name = display or name
    if isinstance(exc, PackageInstallError):
        return _fail(exc.kind, requirement, exc.detail or raw, name, spec, exc.info)
    if "Invalid checksum" in text:
        return _fail("hash-mismatch", requirement, raw, name)
    if text.startswith(("Wheel platform", "Wheel was built with", "Wheel abi", "Wheel interpreter", "Wheel filename")):
        return _fail("incompatible-wheel", requirement, raw, name, info=_wheel_platform(requirement))
    if "Can't fetch wheel" in text or "non-remote location" in text:
        url = _url_of(requirement) or ""
        if url and not _host_allowed(url):
            return _fail("host-blocked", requirement, raw, name, info=urlparse(url).hostname or url)
        return _fail("offline", requirement, raw, name)
    match = re.search(r"Can't fetch metadata for '([^']+)'", text)
    if match:
        missing = match.group(1)
        if _mode == "off":
            if wheel_install or canonical(missing) != canonical(name):
                return _fail("missing-dependency", requirement, raw, name, info=missing)
            return _fail("network-off", requirement, raw, missing)
        state, _, _ = await _query_index(index_urls, missing)
        if state == "missing":
            return _fail("not-found", requirement, raw, missing)
        return _fail("offline", requirement, raw, missing)
    match = re.search(r"Can't find a pure Python 3 wheel for:? '([^']+)'", text)
    if match:
        failed_req = match.group(1)
        failed_name, failed_spec = _req_name(failed_req)
        state, versions, compatible = await _query_index(index_urls, failed_name or name)
        if state == "ok" and failed_spec:
            try:
                from micropip._vendored.packaging.src.packaging.specifiers import SpecifierSet

                spec_set = SpecifierSet(failed_spec)
                if not any(spec_set.contains(v, prereleases=True) for v in versions):
                    shown = ", ".join(str(v) for v in sorted(versions)[-10:]) or "none"
                    return _fail("version-not-found", requirement, raw, failed_name, failed_spec, shown)
            except Exception:  # noqa: BLE001
                pass
        if state == "ok" and compatible and not failed_spec:
            return _fail("other", requirement, raw, failed_name or name)
        return _fail("no-browser-wheel", requirement, raw, failed_name or name)
    return _fail("other", requirement, raw, name)


def _chain(exc: BaseException):
    seen = 0
    while exc is not None and seen < 5:
        yield exc
        exc = exc.__cause__ or exc.__context__
        seen += 1


def _wheel_platform(file_name: str) -> str:
    base = os.path.basename(str(file_name))
    parts = base[:-4].split("-") if base.endswith(".whl") else []
    return parts[-1] if len(parts) >= 5 else base


# --- Installed packages ---------------------------------------------------------------------------


def _dist_info(dist) -> dict | None:
    name = str(dist.metadata.get("Name") or "")
    if not _NAME_RE.match(name):
        return None
    key = canonical(name)
    source_txt = (dist.read_text("PYODIDE_SOURCE") or "").strip()
    url = (dist.read_text("PYODIDE_URL") or "").strip()
    sha = (dist.read_text("PYODIDE_SHA256") or "").strip().lower()
    lock = _lock().get(key)
    if key in _page_sources:
        source = _page_sources[key]
    elif (
        lock is not None
        and str(dist.version) == str(lock.get("version"))
        and source_txt != "pypi"
        and not url.startswith("emfs:")
    ):
        source = "bundled"
    elif not source_txt:
        return None
    else:
        source = "code"
    info = {"name": name, "version": str(dist.version)[:64], "source": source}
    if source == "bundled" and lock is not None:
        info["depends"] = [d for d in (lock.get("depends") or []) if _NAME_RE.match(str(d))][:200]
        info["imports"] = [m for m in (lock.get("imports") or []) if _IMPORT_RE.match(str(m))][:200]
        return info
    page_url = _page_urls.get(key, "")
    if page_url:
        info["url"] = page_url
    elif url.startswith("https://files.pythonhosted.org/"):
        info["url"] = url[:2048]
    file_name = os.path.basename(urlparse(url).path) if url else ""
    if _WHEEL_RE.match(file_name):
        info["fileName"] = file_name
    if re.fullmatch(r"[0-9a-f]{64}", sha):
        info["sha256"] = sha
    try:
        depends = json.loads(dist.read_text("PYODIDE_REQUIRES") or "[]")
    except ValueError:
        depends = []
    if not depends:
        depends = [_req_name(r)[0] for r in (dist.requires or []) if "extra ==" not in r]
    info["depends"] = sorted({canonical(d) for d in depends if _NAME_RE.match(str(d))})[:200]
    top = (dist.read_text("top_level.txt") or "").split()
    info["imports"] = [m for m in top if _IMPORT_RE.match(m)][:200]
    return info


def list_installed() -> list:
    """Every package installed in this session: bundled (lock), page-installed and code-installed."""
    out = {}
    for dist in importlib.metadata.distributions():
        try:
            info = _dist_info(dist)
        except Exception:  # noqa: BLE001
            info = None
        if info is not None:
            out.setdefault(canonical(info["name"]), info)
    for key in _loaded():
        lock = _lock().get(key)
        if lock is None or key in out:
            continue
        out[key] = {
            "name": str(lock.get("name", key)),
            "version": str(lock.get("version", ""))[:64],
            "source": "bundled",
            "depends": [str(d) for d in (lock.get("depends") or [])][:200],
            "imports": [str(m) for m in (lock.get("imports") or [])][:200],
        }
    return [out[k] for k in sorted(out)][:500]


# --- Page-started installs (pkg.install) ----------------------------------------------------------


def _check_wheel_file(item: dict) -> dict | None:
    file_name = str(item.get("fileName", ""))
    path = f"{WHEEL_DIR}/{file_name}"
    if not _WHEEL_RE.match(file_name) or not os.path.isfile(path):
        return _fail("invalid-request", file_name, "wheel file missing", file_name)
    from micropip._utils import check_compatible

    try:
        check_compatible(file_name)
    except ValueError as exc:
        return _fail("incompatible-wheel", file_name, f"ValueError: {exc}", file_name, info=_wheel_platform(file_name))
    with open(path, "rb") as fh:
        digest = hashlib.sha256(fh.read()).hexdigest()
    if digest != str(item.get("sha256", "")):
        return _fail("hash-mismatch", file_name, f"expected {item.get('sha256')}, got {digest}", file_name)
    return None


async def _fetch_restore(item: dict) -> dict | None:
    """A restore of a kept PyPI wheel by URL: fetch, check the SHA-256, then install from MEMFS."""
    from pyodide.http import pyfetch

    url = str(item["url"])
    file_name = os.path.basename(urlparse(url).path)
    if urlparse(url).hostname != "files.pythonhosted.org" or not _WHEEL_RE.match(file_name):
        return _fail("host-blocked", item.get("requirement", url), "", file_name, info=urlparse(url).hostname or url)
    try:
        resp = await asyncio.wait_for(pyfetch(url), 60.0)
        data = await resp.bytes()
    except Exception as exc:  # noqa: BLE001
        return _fail("offline", item.get("requirement", url), f"{type(exc).__name__}: {exc}", file_name)
    if hashlib.sha256(data).hexdigest() != str(item.get("sha256", "")):
        return _fail("hash-mismatch", item.get("requirement", url), "", file_name)
    os.makedirs(WHEEL_DIR, exist_ok=True)
    with open(f"{WHEEL_DIR}/{file_name}", "wb") as fh:
        fh.write(data)
    item["fileName"] = file_name
    return None


async def _fetch_hashed_pypi(item: dict, index_urls: list) -> dict | None:
    """Resolve and fetch a PyPI requirement with --hash=sha256:..., checking SHA-256 before install."""
    from micropip._utils import check_compatible
    from micropip._vendored.packaging.src.packaging.requirements import Requirement
    from micropip._vendored.packaging.src.packaging.specifiers import SpecifierSet
    from micropip._vendored.packaging.src.packaging.version import Version
    from pyodide.http import pyfetch

    requirement = str(item.get("requirement", ""))
    expected = {str(h).lower() for h in (item.get("hashes") or []) if re.fullmatch(r"[0-9a-fA-F]{64}", str(h))}
    if not expected:
        return _fail("invalid-request", requirement, "no valid sha256 hashes provided", requirement)
    try:
        req = Requirement(requirement)
    except Exception as exc:  # noqa: BLE001
        return _fail("invalid-request", requirement, f"{type(exc).__name__}: {exc}", requirement)
    if not index_urls:
        return _fail("offline", requirement, "no package index URLs", req.name)
    url = _index_page(index_urls[0], canonical(req.name))
    if not _host_allowed(url):
        return _fail("host-blocked", requirement, "", req.name, info=urlparse(url).hostname or url)
    try:
        resp = await asyncio.wait_for(
            pyfetch(url, headers={"accept": "application/vnd.pypi.simple.v1+json"}),
            _PRECHECK_TIMEOUT_S,
        )
        if resp.status == 404:
            return _fail("not-found", requirement, "", req.name)
        if not resp.ok:
            return _fail("offline", requirement, f"HTTP {resp.status}", req.name)
        data_json = json.loads(await resp.string())
    except Exception as exc:  # noqa: BLE001
        return _fail("offline", requirement, f"{type(exc).__name__}: {exc}", req.name)

    spec_set = SpecifierSet(str(req.specifier)) if str(req.specifier) else SpecifierSet()
    candidates = []
    for entry in data_json.get("files") or []:
        fname = str(entry.get("filename") or "")
        if not _WHEEL_RE.match(fname) or entry.get("yanked"):
            continue
        parts = fname[:-4].split("-")
        if len(parts) < 5:
            continue
        try:
            ver = Version(parts[1])
        except Exception:  # noqa: BLE001
            continue
        if not spec_set.contains(ver, prereleases=True):
            continue
        try:
            check_compatible(fname)
        except ValueError:
            continue
        adv_sha = str((entry.get("hashes") or {}).get("sha256") or "").lower()
        wheel_url = str(entry.get("url") or "")
        candidates.append((ver, adv_sha in expected, adv_sha, fname, wheel_url))

    if not candidates:
        return _fail("no-browser-wheel", requirement, "no compatible wheel found on PyPI", req.name)
    candidates.sort(key=lambda c: (c[1], c[0]), reverse=True)
    matched = [c for c in candidates if not c[2] or c[1]]
    if not matched:
        return _fail("hash-mismatch", requirement, f"no compatible wheel matched --hash for {req.name}", req.name)

    _, _, _, file_name, wheel_url = matched[0]
    if not wheel_url or urlparse(wheel_url).hostname != "files.pythonhosted.org" or not _host_allowed(wheel_url):
        return _fail("host-blocked", requirement, "", req.name, info=urlparse(wheel_url).hostname or wheel_url)
    try:
        wresp = await asyncio.wait_for(pyfetch(wheel_url), 60.0)
        if not wresp.ok:
            return _fail("offline", requirement, f"HTTP {wresp.status}", req.name)
        wbytes = await wresp.bytes()
    except Exception as exc:  # noqa: BLE001
        return _fail("offline", requirement, f"{type(exc).__name__}: {exc}", req.name)

    actual_sha = hashlib.sha256(wbytes).hexdigest()
    if actual_sha not in expected:
        return _fail("hash-mismatch", requirement, f"got {actual_sha}, not in --hash list", req.name)

    os.makedirs(WHEEL_DIR, exist_ok=True)
    with open(f"{WHEEL_DIR}/{file_name}", "wb") as fh:
        fh.write(wbytes)
    item["fileName"] = file_name
    item["sha256"] = actual_sha
    item["url"] = wheel_url
    return None


def _installed_keys() -> set:
    keys = set(_loaded())
    for dist in importlib.metadata.distributions():
        name = dist.metadata.get("Name")
        if name:
            keys.add(canonical(name))
    return keys


async def install(items_json: str) -> dict:
    """Install bundled names, PyPI requirements and wheels written to WHEEL_DIR, in that order."""
    items = json.loads(items_json)
    micropip = await _ensure_micropip()
    orig = _orig_install
    before = _installed_keys()
    failed: list = []
    requested: dict = {}  # canonical name -> source
    wheel_files: list = []

    bundled = []
    for item in items:
        if item.get("kind") != "bundled":
            continue
        name = str(item.get("name", ""))
        if canonical(name) in _lock():
            bundled.append(name)
            requested[canonical(name)] = "bundled"
        else:
            failed.append(_fail("not-found" if _mode == "pkg" else "invalid-request", name, "not in the bundled set", name))
    if bundled:
        try:
            await orig(bundled, index_urls=[])
        except Exception as exc:  # noqa: BLE001
            failed.append(await classify(exc, ", ".join(bundled), []))

    for item in items:
        if item.get("kind") == "pypi" and item.get("url"):
            if _mode != "pkg":
                failed.append(_fail("network-off" if _mode == "off" else "needs-package-index", item["requirement"], "", _req_name(item["requirement"])[0]))
                continue
            problem = await _fetch_restore(item)
            if problem:
                failed.append(problem)
                continue
            item["kind"] = "wheel"
        elif item.get("kind") == "pypi" and item.get("hashes"):
            if _mode != "pkg":
                failed.append(_fail("network-off" if _mode == "off" else "needs-package-index", item["requirement"], "", _req_name(item["requirement"])[0]))
                continue
            problem = await _fetch_hashed_pypi(item, _index_urls(micropip))
            if problem:
                failed.append(problem)
                continue
            item["kind"] = "wheel"
        if item.get("kind") != "wheel":
            continue
        problem = _check_wheel_file(item)
        if problem:
            failed.append(problem)
            continue
        wheel_files.append(item)
    if wheel_files:
        try:
            await orig([f"emfs:{WHEEL_DIR}/{w['fileName']}" for w in wheel_files], index_urls=_index_urls(micropip))
            for w in wheel_files:
                key = canonical(w["fileName"].split("-", 1)[0])
                url = str(w.get("url") or "")
                from_pypi = url.startswith("https://files.pythonhosted.org/")
                requested[key] = "pypi" if from_pypi else "wheel"
                if from_pypi:
                    _page_urls[key] = url
        except Exception as exc:  # noqa: BLE001
            files = ", ".join(w["fileName"] for w in wheel_files)
            names = ", ".join(w["fileName"].split("-", 1)[0] for w in wheel_files)
            failed.append(await classify(exc, files, _index_urls(micropip), wheel_install=True, display=names))
    for w in wheel_files:
        try:
            os.remove(f"{WHEEL_DIR}/{w['fileName']}")
        except OSError:
            pass

    for item in items:
        if item.get("kind") != "pypi" or item.get("url") or item.get("hashes"):
            continue
        requirement = str(item.get("requirement", ""))
        name, _ = _req_name(requirement)
        if not name:
            failed.append(_fail("invalid-request", requirement, "", requirement))
            continue
        if _mode != "pkg":
            failed.append(_fail("network-off" if _mode == "off" else "needs-package-index", requirement, "", name))
            continue
        url = _url_of(requirement)
        if url and not _host_allowed(url):
            failed.append(_fail("host-blocked", requirement, "", name, info=urlparse(url).hostname or url))
            continue
        try:
            await orig(requirement, index_urls=_index_urls(micropip))
            requested.setdefault(canonical(name), "pypi")
        except Exception as exc:  # noqa: BLE001
            failed.append(await classify(exc, requirement, _index_urls(micropip)))

    new_keys = _installed_keys() - before
    for key in new_keys:
        _page_sources.setdefault(key, requested.get(key) or _dep_source(key, requested))
    present = _installed_keys()
    for key, source in requested.items():
        if key in present:
            _page_sources.setdefault(key, source)
    importlib.invalidate_caches()
    listed = list_installed()
    wanted = new_keys | set(requested)
    installed = [p for p in listed if canonical(p["name"]) in wanted]
    return {"installed": installed, "failed": failed[:500]}


def _dep_source(key: str, requested: dict) -> str:
    """A dependency pulled in from PyPI by a page install counts as PyPI; one from a wheel as wheel."""
    for dist in importlib.metadata.distributions():
        if canonical(dist.metadata.get("Name") or "") == key:
            src = (dist.read_text("PYODIDE_SOURCE") or "").strip()
            return "pypi" if src == "pypi" else ("wheel" if src.startswith("emfs:") else "bundled")
    return "pypi" if "pypi" in requested.values() else "wheel"


# --- micropip wrapper for user code ---------------------------------------------------------------


_INSTALL_ARGS = ("keep_going", "deps", "credentials", "pre", "index_urls")


def _raise(kind: str, requirement: str = "", info: str = "", detail: str = "") -> None:
    name, spec = _req_name(requirement) if requirement else ("", "")
    raise PackageInstallError(kind, _message(kind, name or requirement, spec, info), detail, info)


def _make_wrapper(orig):
    def install(requirements, *args, **kwargs):
        if _tier == 1 and _run_active:
            _raise("in-script")
        return _wrapped_install(orig, requirements, args, kwargs)

    install.__doc__ = orig.__doc__
    install.__wrapped__ = orig
    install._yotasage_wrapped = True
    return install


async def _wrapped_install(orig, requirements, args, kwargs):
    from .shims import YotaSyncEventLoop

    if isinstance(asyncio.get_running_loop(), YotaSyncEventLoop):
        _raise("in-script")
    if len(args) > len(_INSTALL_ARGS):
        raise TypeError("micropip.install() got too many positional arguments")
    kwargs = {**dict(zip(_INSTALL_ARGS, args)), **kwargs}
    reqs = [requirements] if isinstance(requirements, str) else [str(r) for r in requirements]
    import micropip

    for req in reqs:
        url = _url_of(req)
        if url and urlparse(url).scheme not in ("emfs", "file") and not _host_allowed(url):
            _raise("host-blocked", req, urlparse(url).hostname or url)
    if _mode == "off":
        kwargs["index_urls"] = []
    else:
        for index in _index_urls(micropip, kwargs.get("index_urls")):
            if not _host_allowed(_index_page(index, "x")):
                _raise("host-blocked", reqs[0] if reqs else "", urlparse(_index_page(index, "x")).hostname or index)
    index_urls = _index_urls(micropip, kwargs.get("index_urls"))
    try:
        return await orig(reqs, **kwargs)
    except Exception as exc:  # noqa: BLE001
        wheel_install = any(r.startswith(("emfs:", "file:")) or r.endswith(".whl") for r in reqs)
        names = ", ".join(_req_name(r)[0] for r in reqs)
        info = await classify(exc, ", ".join(reqs), index_urls, wheel_install=wheel_install, display=names)
        raise PackageInstallError(info["kind"], info["message"], info["detail"], info.get("info", "")) from exc


def _patch_micropip(module) -> None:
    global _orig_install
    current = getattr(module, "install", None)
    if current is None or getattr(current, "_yotasage_wrapped", False):
        return
    _orig_install = current
    module.install = _make_wrapper(current)


class _MicropipLoader:
    def __init__(self, wrapped) -> None:
        self._wrapped = wrapped

    def create_module(self, spec):
        return self._wrapped.create_module(spec) if hasattr(self._wrapped, "create_module") else None

    def exec_module(self, module) -> None:
        self._wrapped.exec_module(module)
        _patch_micropip(module)

    def __getattr__(self, name: str):
        return getattr(self._wrapped, name)


class _MicropipFinder:
    """Patches micropip.install as micropip is first imported (micropip is not loaded at boot)."""

    def find_spec(self, fullname: str, path, target=None):
        if fullname != "micropip":
            return None
        for finder in list(sys.meta_path):
            if finder is self or not hasattr(finder, "find_spec"):
                continue
            spec = finder.find_spec(fullname, path, target)
            if spec is not None and spec.loader is not None and hasattr(spec.loader, "exec_module"):
                spec.loader = _MicropipLoader(spec.loader)
                return spec
        return None


# --- Imports the pre-run scan could not see -------------------------------------------------------


class _MissedImportFinder:
    """Last on sys.meta_path: sees only imports no other finder resolved. For a top-level module of
    a bundled package that isn't loaded, it loads the package where the run can wait for it (Tier 2),
    otherwise records it for run.end and raises a clear ModuleNotFoundError."""

    def find_spec(self, fullname: str, path, target=None):
        if path is not None or "." in fullname:
            return None
        pkg = _import_map().get(fullname)
        if pkg is None or pkg in _loaded():
            return None
        try:
            from pyodide.ffi import can_run_sync, run_sync

            if can_run_sync():
                run_sync(pyodide_js.loadPackage(pkg))
                importlib.invalidate_caches()
                spec = importlib.machinery.PathFinder.find_spec(fullname)
                if spec is not None:
                    return spec
        except Exception:  # noqa: BLE001
            pass
        if pkg not in _missing and len(_missing) < 64:
            _missing.append(pkg)
        raise ModuleNotFoundError(
            f"No module named '{fullname}'. {pkg} is bundled with this playground but wasn't loaded, "
            f"because the import couldn't be seen before the run (a dynamic or optional import). Add "
            f"`import {fullname}` at the top of your file, or load {pkg} and run again.",
            name=fullname,
        )


def take_missing() -> list:
    out = list(_missing)
    _missing.clear()
    return out


def set_run_active(active: bool) -> None:
    global _run_active
    _run_active = bool(active)
    if active:
        _missing.clear()


def install_packages(tier: int, network_mode: str, origin: str) -> None:
    """Install the micropip wrapper hook and the missed-import finder."""
    global _tier, _mode, _origin
    _tier = int(tier)
    _mode = str(network_mode)
    _origin = str(origin)
    if "micropip" in sys.modules:
        _patch_micropip(sys.modules["micropip"])
    elif not any(isinstance(f, _MicropipFinder) for f in sys.meta_path):
        sys.meta_path.insert(0, _MicropipFinder())
    if not any(isinstance(f, _MissedImportFinder) for f in sys.meta_path):
        sys.meta_path.append(_MissedImportFinder())
