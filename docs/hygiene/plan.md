# Engineering hygiene and guardrails – plan

Keep the repository fast, clean, predictable across Windows development and Ubuntu CI, and easy for both humans and
coding agents to work in as the site grows — without slowing down development or adding heavy tooling.

Drafted 2026-11-20. Excludes sharing/discoverability work (covered in [docs/sharing/plan.md](../sharing/plan.md)).
Where this plan and [CLAUDE.md](../../CLAUDE.md) or [agent-workflow.md](../agent-workflow.md) disagree, those two win.

---

## Goal

The repo has grown rapidly across 11 tools (~50k+ lines of TypeScript/CSS and extensive docs/harnesses). A few
structural papercuts have accumulated:

1. **Local build ≠ CI static export.** Because `output: 'export'` is injected only in CI by `actions/configure-pages`
   ([.github/workflows/nextjs.yml](../../.github/workflows/nextjs.yml#L57-L63)), a local `npm run build` does not catch
   static-export violations — and every local `next build` dirties `next-env.d.ts`.
2. **Large files exceed the repo's 40 kB guideline.** [CLAUDE.md](../../CLAUDE.md#L199-L204) sets a 40 kB ceiling so
   docs and source files stay cheap to read in context, yet [docs/BACKLOG.md](../BACKLOG.md) is **88.8 kB** and 15
   hand-written code/style files are now 40–78 kB.
3. **No automated guardrail script.** Static-export constraints, Windows/Linux import-case mismatches, forbidden CDN
   URLs, oversized files, and licence-list drift are currently checked only by reading code.
4. **Line-ending drift, dead files, and merged branches.** Git reports LF/CRLF warnings on Windows (`CLAUDE.md`,
   `docs/BACKLOG.md`); `styles/globals.css` is unused; 7 finished feature branches remain locally after merging into
   `main`; `tsconfig.json` has `"strict": false`.
5. **Tracked routine maintenance items.** `BL203` (pending minor dependency updates for `pdfjs-dist`, `three`,
   `zxing-wasm`) and `BL201` (reproducible local fetch cache for KiCad 5–8 demo boards in `em-sim` rechecks).

After this project, one fast command (`npm run verify`) catches static-export, case-sensitivity, licence, and size
regressions locally before anything is pushed, the repo and backlog stay under the 40 kB ceiling, and the git tree is
clean.

---

## Ground rules

- **All hard constraints of [CLAUDE.md](../../CLAUDE.md) apply:** no server, static export, self-hosted assets only,
  no new runtime dependencies.
- **Do NOT touch or push the `breadboard` branch** (waiting on Fritzing GmbH's reply; see
  [CLAUDE.md](../../CLAUDE.md#L175-L185)). Never delete unmerged branches or untracked `public/breadboard/` without
  explicit owner confirmation.
- **No behavioural changes to tools.** Refactoring large files (H4) must be pure module splits preserving identical
  exports and passing every existing harness.
- **Do not break GitHub Pages CI.** Any change touching `next.config` or build scripts must be verified against
  [.github/workflows/nextjs.yml](../../.github/workflows/nextjs.yml) (`actions/configure-pages@v6`).
- **Keep tooling lightweight.** Prefer tiny zero-dependency Node `.mjs` scripts under `scripts/` over adding ESLint,
  Prettier, or heavyweight test frameworks unless the owner explicitly asks for them.

---

## Current state (audited 2026-11-20)

### 1. Workspace & branches
- **Uncommitted changes on current branch (`em-sim`):** dependency cleanup (`package.json`, `package-lock.json`,
  `CLAUDE.md`, `docs/BACKLOG.md`), plus untracked `.cache/` and `public/breadboard/`.
- **Local branches already merged into `main` (7):** `em-sim`, `pcb-viewer`, `pdf-tools`, `qr-code-generator`,
  `resistor-lookup`, `simsetup-redo`, `smith-chart`.
- **Unmerged local branch (1):** `breadboard` (**do not touch / do not push**).
- **Unused file:** `styles/globals.css` (524 bytes, imported nowhere).
- **Line endings:** No `.gitattributes` — Windows git emits LF→CRLF warnings on `CLAUDE.md` and `docs/BACKLOG.md`.

### 2. Hand-written files over 40 kB

*(Excludes generated/data files: `lib/emsim/jlcpcbStackups.json`, `lib/generated/third-party-licenses.json`,
`lib/pcb/font/newstroke-glyphs.ts`, `package-lock.json`, `tsconfig.tsbuildinfo`.)*

| File | Size (kB) | Category / Backlog ref |
| --- | --: | --- |
| `docs/BACKLOG.md` | 88.8 | Docs (158 open rows + long "Done and removed" block) |
| `lib/pcb/export/kicad.ts` | 78.0 | PCB viewer (`BL29`) |
| `lib/smith/solve.ts` | 77.2 | Smith chart |
| `lib/pcb/pads/board.ts` | 72.4 | PCB viewer (`BL29`) |
| `lib/pcb/kicad/board.ts` | 61.9 | PCB viewer (`BL29`) |
| `lib/emsim/viamodel.ts` | 56.3 | EM simulation |
| `components/Smith/Theory.tsx` | 54.7 | Smith chart |
| `components/Smith/pathLayer.ts` | 53.4 | Smith chart |
| `lib/smith/equations.ts` | 51.5 | Smith chart |
| `components/Smith/SolvePanel.tsx` | 45.2 | Smith chart |
| `pages/smith-chart/main.tsx` | 45.0 | Smith chart |
| `lib/smith/grid.ts` | 44.8 | Smith chart |
| `lib/smith/state.ts` | 43.9 | Smith chart |
| `lib/pcb/altium/board.ts` | 43.6 | PCB viewer (`BL29`) |
| `styles/Smith.module.css` | 40.6 | Smith chart |
| `styles/Resistor.module.css` | 40.1 | Resistor lookup |

### 3. Build, config & TypeScript
- `tsconfig.json`: `"strict": false`, `"forceConsistentCasingInFileNames": true`.
- `package.json`: only `dev`, `build`, `start`, `postinstall` — no `typecheck`, `check`, or `build:export` scripts.
- No `next.config.*` in repo; CI generates one via `actions/configure-pages`.

---

## Decisions to confirm before starting

| # | Question | Recommended default |
| --- | --- | --- |
| D1 | Commit the pending dependency-cleanup diff first and delete the 7 merged local branches? | Yes: commit pending cleanup on `main` (never touching `public/breadboard/` or `breadboard`), delete the 7 already-merged local branches, then run H1–H6 on branch `hygiene`. |
| D2 | How to test static export locally without interfering with CI's `actions/configure-pages`? | Add `scripts/build-export.mjs` (`npm run build:export`) that writes a temporary `next.config.mjs` (`output: 'export'`, `images: { unoptimized: true }`), runs `next build`, verifies `out/` exists, and cleans up both `next.config.mjs` and `next-env.d.ts` in a `finally` block — zero risk to CI! |
| D3 | Split all 15 oversized code files now, or only PCB `BL29` + `BACKLOG.md` first? | Split `docs/BACKLOG.md` in H3 and PCB `BL29` (4 files) + top 2 solver files (`solve.ts`, `viamodel.ts`) in H4; leave borderline 40–45 kB files on a tracked allowlist in `check-repo.mjs` so they don't grow further. |
| D4 | TypeScript strictness scope? | Audit `strictNullChecks` / `noImplicitAny` counts first; enable what is clean (`noUnusedLocals` or per-folder checks) without risky mass rewrites of verified math/solver files. |

---

## Steps

Sized so each step stays under ~200k tokens ([agent-workflow.md](../agent-workflow.md)).

Status: ✅ done · 🔄 in progress · 📋 planned

| Step | Scope | Status | Commit |
| --- | --- | :-: | --- |
| H1 | Repo housekeeping: `.gitattributes`, remove dead `styles/globals.css`, clean merged branches & ignore rules | 📋 | — |
| H2 | Local static-export check (`build:export`) + automated repo guardrails (`scripts/check-repo.mjs`, `npm run verify`) | 📋 | — |
| H3 | Split `docs/BACKLOG.md` (88.8 kB) into index + per-tool files under `docs/backlog/` | 📋 | — |
| H4 | Split oversized code files (`BL29` PCB parsers/exporter; optionally `solve.ts` / `viamodel.ts`) with full harness checks | 📋 | — |
| H5 | TypeScript strictness audit & incremental tightening | 📋 | — |
| H6 | Pending maintenance: `BL201` (KiCad 5–8 test cache script) and `BL203` (staged dependency updates with per-tool checks) | 📋 | — |

---

### H1 – Repo housekeeping (`.gitattributes`, dead files, branches)

**Scope:**
- Review and (with owner's OK) commit any pending dependency-cleanup edits cleanly on `main`; keep `public/breadboard/`
  and `.cache/` untouched (add `/.cache/` to `.gitignore` if not already ignored — verify first!).
- Add `.gitattributes` enforcing `* text=auto eol=lf` for code/docs/JSON/CSS (keeping binary extensions binary) so
  Windows and Ubuntu CI stop fighting over LF vs. CRLF.
- Delete unused `styles/globals.css` (confirm zero imports across the repo first) and update `CLAUDE.md` to remove the
  note about it.
- With owner confirmation, delete the 7 local branches already fully merged into `main` (`em-sim`, `pcb-viewer`,
  `pdf-tools`, `qr-code-generator`, `resistor-lookup`, `simsetup-redo`, `smith-chart`). **Never touch `breadboard`.**

**Done when:**
- `git status` is clean (except intentional local-only folders if kept), `npx tsc --noEmit` and `npm run build` pass.

---

### H2 – Local static-export verification & `scripts/check-repo.mjs`

**Scope:**
- Create `scripts/build-export.mjs` (`npm run build:export`):
  - Refuses to overwrite an existing `next.config.*` if one exists.
  - Temporarily writes `next.config.mjs` with `output: 'export'` and `images: { unoptimized: true }`.
  - Runs `next build`, verifies `out/index.html` and every tool's `out/<tool>/main.html` (or `/index.html`) were emitted.
  - Removes the temporary `next.config.mjs` and restores `next-env.d.ts` (`git checkout -- next-env.d.ts`) in `finally`.
- Create `scripts/check-repo.mjs` (`npm run check:repo`), a fast zero-dependency Node script (< 2 seconds) checking:
  1. **Static-export bans:** fails if `pages/api/` exists, or any file in `pages/` exports `getServerSideProps` or uses
     `next/image` without `unoptimized`, or any runtime file references external CDN `<script>`/`<link>`/WASM URLs
     (`unpkg.com`, `jsdelivr.net`, `cdnjs.cloudflare.com`, `fonts.googleapis.com`).
  2. **Case-sensitive import check:** resolves relative imports in `pages/`, `components/`, `lib/` against actual on-disk
     filenames so Windows never passes an import that breaks on Ubuntu CI.
  3. **File-size budget (40 kB):** flags any file under `docs/`, `pages/`, `components/`, `lib/`, `styles/` over 40 kB
     unless explicitly listed in a small `KNOWN_LARGE` allowlist (with its current size cap so it cannot silently grow).
  4. **Generated-licence freshness check:** verifies every third-party import in `pages/`, `components/`, `lib/` appears
     in `lib/generated/third-party-licenses.json`.
  5. **Tool-card consistency:** verifies every `pages/<tool>/main.tsx` is linked from `pages/index.tsx` (matching
     `CLAUDE.md`'s hard constraint).
- Add convenience scripts to `package.json`:
  - `"typecheck": "tsc --noEmit"`
  - `"check:repo": "node scripts/check-repo.mjs"`
  - `"build:export": "node scripts/build-export.mjs"`
  - `"verify": "npm run typecheck && npm run check:repo && npm run build:export"`

**Done when:**
- `npm run verify` runs end-to-end on Windows, produces `out/`, leaves `git status` clean (no leftover `next.config.mjs`
  or modified `next-env.d.ts`), and exits 0.
- Spot-test that `check-repo.mjs` actually catches a bad-case import or forbidden `getServerSideProps` (temporarily,
  then revert).

---

### H3 – Split `docs/BACKLOG.md` under 40 kB

**Scope:**
- Split the 88.8 kB [docs/BACKLOG.md](../BACKLOG.md) into:
  - `docs/BACKLOG.md` (< 5 kB): concise index with the **next free ID (`BL204`)**, rules, summary counts, and links to
    each sub-file.
  - `docs/backlog/done.md`: the "Done and removed" history log.
  - `docs/backlog/em-sim.md`: EM simulation open items (`BL69–BL75` phase 2 + phase 1 open items).
  - `docs/backlog/smith-chart.md`: Smith chart open items.
  - `docs/backlog/pcb-viewer.md`: PCB viewer open items (`BL1–BL29`, etc.).
  - `docs/backlog/other.md`: Site, Resistor lookup, QR reader, 3D viewer, PDF tools, etc.
- Ensure **zero items are lost or renumbered** (verify total ID count before and after with a quick script) and every
  sub-file stays comfortably under 40 kB.
- Update links to `BACKLOG.md` in `CLAUDE.md` and note the split layout.

**Done when:**
- Every file under `docs/` is under 40 kB (verified by `npm run check:repo`).
- Exact count of open `BL<n>` IDs matches the pre-split file (158 open rows).

---

### H4 – Split oversized code files (`BL29` and top offenders)

**Scope (split into sub-steps if needed — one tool per sub-step/commit!):**
- **H4a – PCB viewer (`BL29`):** Split the 4 largest PCB files cleanly along natural boundaries while preserving public
  entry points:
  - `lib/pcb/export/kicad.ts` (78 kB) → e.g. `kicad.ts` (orchestrator), `kicadFootprints.ts`, `kicadZones.ts`,
    `kicadSexpr.ts`
  - `lib/pcb/pads/board.ts` (72 kB) → e.g. `board.ts`, `decals.ts`, `routes.ts`, `pours.ts`
  - `lib/pcb/kicad/board.ts` (62 kB) → e.g. `board.ts`, `footprints.ts`, `zones.ts`, `graphics.ts`
  - `lib/pcb/altium/board.ts` (44 kB) → e.g. `board.ts`, `primitives.ts`
  - Verify against the PCB test files listed in `docs/pcb-viewer/test-files.md` (and `kicad-cli` for KiCad export).
  - Mark `BL29` done in `docs/backlog/`.
- **H4b (optional) – Top Smith chart & EM sim files:** Split `lib/smith/solve.ts` (77 kB) and `lib/emsim/viamodel.ts`
  (56 kB) only if worth the churn, and re-run `scripts/harness/smith/` (`npm run check`) and `scripts/harness/emsim/`
  (`npm run check`) afterwards. Update `docs/smith-chart/modules.md` and `docs/em-sim/modules.md` to stay accurate.

**Done when:**
- Every split file is under 40 kB, `npm run verify` passes, and the corresponding tool harness / sample checks produce
  bit-identical or tolerance-identical results.

---

### H5 – TypeScript strictness audit & incremental tightening

**Scope:**
- Run a diagnostic check (`npx tsc --noEmit --strictNullChecks`, `--noImplicitAny`, `--noUnusedLocals`) and record
  error counts per directory (`lib/`, `components/`, `pages/`) in `docs/hygiene/notes-H5.md`.
- Enable any flags that are already clean (or require minimal, safe fixes — e.g. unused locals/imports, accidental
  implicit `any` in newer modules).
- If full `strict: true` would touch hundreds of verified solver lines, do **not** force a risky mass rewrite — instead
  add a strict `tsconfig.strict.json` covering clean/new directories (or document the exact remaining count) so new
  code stays strict going forward.

**Done when:**
- `npm run verify` passes with the tightened compiler flags and zero regressions in existing harnesses.

---

### H6 – Routine maintenance (`BL201` and `BL203`)

**Scope:**
- **`BL201` (EM sim KiCad 5–8 demo cache):** Add a small fetch script in `scripts/harness/emsim/` that caches the
  KiCad 5–8 demo boards (`pic_programmer`, `video`) into `.cache/kicad-old/` so `check-kicad` and `npm run recheck` no
  longer report that part as skipped.
- **`BL203` (Staged minor dependency updates):** Only when ready (note `zxing-wasm` 3.1.7 reaches two weeks old on
  2026-11-29), update one package per commit with full tool verification and `npm install` (so `postinstall` refreshes
  assets and `third-party-licenses.json`):
  1. `pdfjs-dist` (`6.4.299` → latest `6.5.x`): verify PDF tools + QR reader PDF scanning.
  2. `three` & `@types/three` (`0.186` → `0.187`): verify `tsc`, 3D viewer (STEP, glTF, WRL), and EM sim 3D views.
  3. `zxing-wasm` (`3.1.6` → `3.1.7`, pinned exact): run `scripts/harness/qr-reader/` `npm run check` and `npm run ui`.
- Update `docs/backlog/` (`BL201`, `BL203` done) and `CLAUDE.md` (`## Docs` entry for `docs/hygiene/plan.md`).

**Done when:**
- Each updated package passes its tool's verification and `npm run verify` passes cleanly.

---

## Out of scope

- SEO / Open Graph previews, sample files, home page copy, README showcase, or sharing playbook (covered in
  [docs/sharing/plan.md](../sharing/plan.md)).
- Visual/theme unification across older tools (covered in [docs/ux-polish/plan.md](../ux-polish/plan.md)).
- Installing heavy linters/formatters (ESLint/Prettier) unless the owner specifically requests them.
- Modifying, merging, or pushing the `breadboard` branch.

---

## Running this plan in a new session

To start this in a fresh session, point it at this file:

> Read `CLAUDE.md` and `docs/hygiene/plan.md`. Confirm decisions D1–D4 with me (especially before deleting merged local
> branches or committing pending edits on `main`), then execute steps H1 through H6 in order, committing once per step,
> keeping `breadboard` untouched, and not pushing.
