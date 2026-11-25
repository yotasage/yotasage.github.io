# Python playground: P5a notes (install engine), for P5b and P6

What P5a built is in [modules.md](modules.md) (`rt/packages.py`, `packageProtocol.ts`, the worker's `pkg.*`, the
client's `installPackages`/`listPackages`) and checked by `scripts/harness/python/packages-checks.mjs`
(`PYTHON_PARTS=packages`). The design is [notes-P5.md](notes-P5.md); D20–D24 are in [plan.md](plan.md).

## What P5b can rely on

- **Item shapes** (`PackageInstallItem`, checked by `checkInstallRequest` before sending):
  - `{ kind: 'bundled', name }`: installed by name from our lock in every mode.
  - `{ kind: 'pypi', requirement }`: Package index mode only (Off → `network-off`, other modes →
    `needs-package-index`). Each requirement is its own micropip call, so each failure names one requirement.
  - `{ kind: 'pypi', requirement, url, sha256 }`: **restore by URL** (Package index mode only): the worker fetches the
    `files.pythonhosted.org` URL, checks the SHA-256 itself (micropip does not for URLs), then installs from MEMFS.
  - `{ kind: 'wheel', fileName, sha256, bytes, url? }`: written to `/tmp/yotasage-wheels/`, file-name tag checked
    (`incompatible-wheel`), SHA-256 checked (`hash-mismatch`), all wheels of one request installed in one micropip call
    so they satisfy each other, files removed afterwards. With a `files.pythonhosted.org` `url` the package is reported
    as source `pypi` with that URL: this is the **D20 saved copy** path (send the stored bytes as a wheel item with the
    original URL; it works in Off and fetches nothing).
- **Results**: `installed` lists every package that is new after the call plus the requested ones already present,
  with `source`, `sha256`, `fileName`, `depends`, `imports` (and `url` only on `files.pythonhosted.org`). Dependencies
  pulled in by a page install get the source of where they came from (PyPI → `pypi`, the lock → `bundled`). `failed`
  entries carry `kind`, `requirement`, a friendly EN `message`, the raw `detail` and a kind-specific `info` (available
  versions, missing dependency, blocked host, wheel platform tag).
- **Refusal**: while a run is active the client returns `{ refused: 'run-active' }` without sending (in Tier 1 the
  worker could not read the message until the run ends anyway); the worker refuses as well. Runs and console lines
  wait for a package operation in progress, so restore-then-run can be sent back to back.
- **Sessions**: everything (including which packages the page installed) is per worker. After `restart()`,
  `forceStop()` or a crash the worker has none of the session's packages; restore again after each `ready`.
  `restart()`/`forceStop()` now work when idle (finding 8), which removal-by-restart needs.
- `ready.abiVersion` / `ready.platform` (`2026_0`, `emscripten_5_0_3`) come from the lock, for the version-change rules
  of notes-P5.md §8.

## Left for later

- The wrapper pre-checks hosts only in Off and Package index mode. In Selected hosts and Everything the CSP decides,
  so in WebKit a `micropip.install` from a host the Selected-hosts CSP blocks can still hang (BL205).
- User code can bypass the wrapper (`micropip._package_manager_singleton.install`) or change `yotasage_rt.packages`;
  the CSP still applies, and nothing from the worker can keep or restore a package (the page validates
  `pkg.result` and writes the manifest itself). The WebKit harness relies on this: it points micropip at the
  same-origin mock index with `micropip.set_index_urls` from the console.
- The page ignores `status.phase: 'installing'` and `run.end.missingPackages` until P6, and translates the failure
  kinds there (EN texts are in `MESSAGES` in `packages.py`; the `in-script` text mentions the Packages panel).
- PEP 723 blocks (BL204); the `script-header` install reason is already accepted.
