# Engineering hygiene and guardrails – plan

Keep the repository fast, clean, predictable across Windows development and Ubuntu CI, and easy for both humans and
coding agents to work in as the site grows — without slowing down development or adding heavy tooling.

Drafted 2026-11-20; **revised 2026-11-22** after PDF tools Phases 3–4, Design System v2 (`ui-redesign` +
`ux-polish-followup`), and Sharing S1–S5 landed on `main`. Excludes sharing/discoverability work (completed in
[docs/sharing/plan.md](../sharing/plan.md)). Where this plan and [CLAUDE.md](../../CLAUDE.md) or
[agent-workflow.md](../agent-workflow.md) disagree, those two win.

---

## Goal

The repo now spans 11 tools, 46+ static routes (34 under `/pdf/`), 517 `.ts`/`.tsx` files, 7 `postinstall` asset/generator
scripts, and full EN/NB i18n. A few structural papercuts remain:

1. **Local build ≠ CI static export.** Because `output: 'export'` is injected only in CI by `actions/configure-pages`
   ([.github/workflows/nextjs.yml](../../.github/workflows/nextjs.yml#L57-L63)), a local `npm run build` does not catch
   static-export violations — and every local `next build` dirties `next-env.d.ts`.
2. **No automated guardrail script.** Static-export constraints, Windows/Linux import-case mismatches, forbidden CDN
   URLs, oversized files, licence-list drift, PDF tool registration, `PageHead`/OG image wiring, and EN/NB translation
   parity are currently checked only by hand.
3. **High-churn files exceed the 40 kB ceiling.** [CLAUDE.md](../../CLAUDE.md#L210-L215) sets a 40 kB ceiling so docs
   and source files stay cheap to read in context, yet [lib/ui/translations.ts](../../lib/ui/translations.ts) is
   **94.2 kB**, [docs/BACKLOG.md](../BACKLOG.md) is **88.9 kB**, [docs/pdf-tools-plan.md](../pdf-tools-plan.md) is
   **42.7 kB**, and 23 other code/style files are 41–79 kB.
4. **Housekeeping & doc drift.** 10 finished feature branches remain locally after merging into `main`; `/.cache/` is
   untracked; there is no `.gitattributes`; `CLAUDE.md` still references deleted `styles/globals.css`, old PDF Phase 1–2
   counts, and omits `copy-pdf-wasm-assets.mjs`; `tsconfig.json` has `"strict": false`.

After this plan, one fast command (`npm run verify`) catches static-export, case-sensitivity, licence, i18n, OG/route,
and file-size regressions locally (and in CI), the high-churn files and all docs stay under 40 kB, dormant large code
files are frozen in a ratcheted allowlist until touched, and the git tree and docs are clean.

---

## Ground rules

- **All hard constraints of [CLAUDE.md](../../CLAUDE.md) apply:** no server, static export, self-hosted assets only,
  no new runtime dependencies.
- **Do NOT touch or push the `breadboard` branch** (waiting on Fritzing GmbH's reply; see
  [CLAUDE.md](../../CLAUDE.md#L186-L195)). Never delete unmerged branches or untracked `public/breadboard/`.
- **No behavioural changes to tools.** Refactoring `lib/ui/translations.ts` (H3) must preserve identical exports and
  runtime values.
- **Do not break GitHub Pages CI.** Any change touching `next.config`, build scripts, or
  [.github/workflows/nextjs.yml](../../.github/workflows/nextjs.yml) must stay compatible with
  `actions/configure-pages@v6`.
- **Keep tooling lightweight.** Tiny zero-dependency Node `.mjs` scripts under `scripts/` — no ESLint, Prettier, or
  heavyweight test frameworks.

---

## Current state (re-audited 2026-11-22)

### 1. Workspace, branches & doc drift
- **Clean `main`** except untracked `.cache/` (holds `fritzing-parts`) and `public/breadboard/`.
- **Already done since Nov 20:** pending dependency cleanup committed/merged; unused `styles/globals.css` deleted (`29f834d`).
- **Local branches already merged into `main` (10):** `em-sim`, `pcb-viewer`, `pdf-tools`, `qr-code-generator`,
  `resistor-lookup`, `sharing`, `simsetup-redo`, `smith-chart`, `ui-redesign`, `ux-polish-followup`.
- **Unmerged local branch (1):** `breadboard` (**do not touch / do not push**).
- **Line endings:** `git ls-files --eol` shows 0 CRLF files in the index (`core.autocrlf=true` normalizes them), but no
  `.gitattributes` exists to enforce LF across machines/editors.
- **Stale docs:** `CLAUDE.md` still mentions deleted `styles/globals.css`, lists PDF tools as "11 client-side tools
  (Phase 1 & 2 complete)", omits `scripts/copy-pdf-wasm-assets.mjs` from `postinstall`, and only lists 5 large code
  files; `docs/pdf-tools-plan.md` still references removed `components/QrGen/fields.tsx`.

### 2. Hand-written files ≥ 40 kB (26 files)

*(Excludes generated/data/fixture files: `lib/emsim/jlcpcbStackups.json`, `lib/generated/third-party-licenses.json`,
`lib/pcb/font/newstroke-glyphs.ts`, `scripts/harness/*`, `package-lock.json`, `tsconfig.tsbuildinfo`.)*

- **Split in H3 (high-churn or docs):** `lib/ui/translations.ts` (94.2 kB), `docs/BACKLOG.md` (88.9 kB),
  `docs/pdf-tools-plan.md` (42.7 kB).
- **Frozen in `check-repo.mjs` ratcheted allowlist (split only when next touched for real work):**
  `styles/PdfTools.module.css` (78.6 kB), `lib/pcb/export/kicad.ts` (78.0 kB), `lib/smith/solve.ts` (77.2 kB),
  `lib/pcb/pads/board.ts` (72.4 kB), `lib/pcb/kicad/board.ts` (61.9 kB), `lib/emsim/viamodel.ts` (56.3 kB),
  `components/Smith/Theory.tsx` (55.6 kB), `pages/smith-chart/main.tsx` (54.3 kB), `components/Smith/pathLayer.ts`
  (53.4 kB), `components/PdfTools/PdfReader.tsx` (52.8 kB), `lib/smith/equations.ts` (51.5 kB),
  `components/PdfTools/PdfCompareView.tsx` (51.3 kB), `pages/pdf/edit.tsx` (50.2 kB),
  `components/PdfTools/PdfEditor.tsx` (49.6 kB), `components/Smith/SolvePanel.tsx` (45.2 kB), `lib/smith/grid.ts`
  (44.8 kB), `components/PdfTools/FormFiller.tsx` (44.3 kB), `styles/Resistor.module.css` (44.0 kB),
  `lib/smith/state.ts` (43.9 kB), `lib/pcb/altium/board.ts` (43.6 kB), `pages/qrcode/main.tsx` (43.5 kB),
  `styles/Smith.module.css` (42.9 kB), `lib/pdf/pdfToSvg.ts` (42.6 kB), `pages/pdf/extract-images.tsx` (41.0 kB).

---

## Confirmed decisions

- **D1 (Housekeeping):** Run on branch `hygiene`; delete the 10 merged local branches, never touch `breadboard` or
  `public/breadboard/`; add `/.cache/` to `.gitignore`, add `.gitattributes`, and refresh stale notes in `CLAUDE.md` and
  `docs/pdf-tools-plan.md`.
- **D2 (Local static export + CI checks):** Add `scripts/build-export.mjs` (`npm run build:export`) that writes a
  temporary `next.config.mjs`, runs `next build`, verifies `out/` exists, and cleans up `next.config.mjs` and
  `next-env.d.ts` in `finally`. Also run `npm run typecheck && npm run check:repo` in `.github/workflows/nextjs.yml`
  before `next build`.
- **D3 (File splits):** Split the 3 high-churn / doc offenders in H3 (`docs/BACKLOG.md`, `docs/pdf-tools-plan.md`,
  `lib/ui/translations.ts`). Defer `BL29` (no `scripts/harness/pcb/` regression harness yet) and dormant tool files by
  freezing all 23 remaining ≥ 40 kB code/style files at their current size cap in `scripts/check-repo.mjs`.
- **D4 (TypeScript strictness):** Timeboxed audit + `tsconfig.strict.json` covering clean shared/new folders
  (`lib/ui/`, `components/UI/`, `lib/equations/`, `components/Equations/`, etc.) wired into verification — no risky
  mass rewrites of verified math/parser engines.

---

## Steps

Sized so each step stays under ~200k tokens ([agent-workflow.md](../agent-workflow.md)), run one step subagent at a
time on branch `hygiene`, one commit per step, no push.

Status: ✅ done · 🔄 in progress · 📋 planned · ⏸️ deferred

| Step | Scope | Status | Commit |
| --- | --- | :-: | --- |
| H1 | Repo housekeeping: `.gitattributes`, `.gitignore` (`/.cache/`), delete 10 merged local branches, sync stale facts in `CLAUDE.md` & `docs/pdf-tools-plan.md` | ✅ | `0c61bc5` |
| H2 | Local static-export check (`scripts/build-export.mjs`), automated repo guardrails (`scripts/check-repo.mjs`), `npm run verify`, and CI pre-build check | ✅ | `776ff71` |
| H3 | Split high-churn / doc files over 40 kB (`docs/BACKLOG.md`, `docs/pdf-tools-plan.md`, `lib/ui/translations.ts`) and tighten `check-repo.mjs` allowlist | ✅ | — |
| H4 | Light TypeScript strictness audit (`docs/hygiene/notes-H4.md`) + `tsconfig.strict.json` for clean shared/new folders + final `CLAUDE.md` updates | 📋 | — |
| — | Deferred: `BL29` PCB splits (needs `scripts/harness/pcb/` first), dormant solver/PDF splits (ratcheted in allowlist), `BL201` (before EM sim Phase 2), `BL203` (after 2026-11-29) | ⏸️ | — |

---

### H1 – Repo housekeeping & doc sync

**Scope:**
- Ensure branch `hygiene` is checked out from `main`.
- Add `.gitattributes` enforcing `* text=auto eol=lf` for text/code/docs/JSON/CSS and `binary` for images, fonts, wasm,
  archives, PDFs, STL/STEP/WRL, and `.ico`.
- Add `/.cache/` to `.gitignore` (leave `public/breadboard/` untouched).
- Delete the 10 local branches already fully merged into `main` (`em-sim`, `pcb-viewer`, `pdf-tools`,
  `qr-code-generator`, `resistor-lookup`, `sharing`, `simsetup-redo`, `smith-chart`, `ui-redesign`,
  `ux-polish-followup`). **Never touch `breadboard`.**
- Refresh stale notes in `CLAUDE.md`:
  - Remove the stale `styles/globals.css` remark.
  - Add `scripts/copy-pdf-wasm-assets.mjs` (→ `public/pdf-wasm/`, `public/ocr/`) to `postinstall`.
  - Update the PDF tools summary (Phase 1–4 complete, 33 tools / 34 routes under `pages/pdf/`, QPDF/Ghostscript WASM,
    Tesseract.js OCR, AGPL-3.0 licence note).
  - Update the large-file note to point to the current `≥ 40 kB` files / allowlist.
- Fix the stale `components/QrGen/fields.tsx` reference in `docs/pdf-tools-plan.md` line 39 (`components/UI/Fields.tsx`
  and `styles/Fields.module.css`).
- Update the H1 status row in `docs/hygiene/plan.md`.

**Done when:**
- `git status` is clean (except untracked `public/breadboard/`), `breadboard` is untouched, only `main`, `hygiene`, and
  `breadboard` remain as local branches, and `npx tsc --noEmit` + `npm run build` pass (with `next-env.d.ts` restored).

---

### H2 – Local static-export check & `scripts/check-repo.mjs`

**Scope:**
- Create `scripts/build-export.mjs` (`npm run build:export`):
  - Refuses to overwrite an existing `next.config.*` if one exists.
  - Temporarily writes `next.config.mjs` with `output: 'export'` and `images: { unoptimized: true }`.
  - Runs `next build`, verifies `out/index.html` and every `pages/<tool>/main.tsx` + `pages/pdf/*.tsx` emitted an HTML
    file in `out/`.
  - Removes temporary `next.config.mjs` and restores `next-env.d.ts` (`git checkout -- next-env.d.ts`) in `finally`.
- Create `scripts/check-repo.mjs` (`npm run check:repo`), a fast zero-dependency Node script (< 3 seconds) checking:
  1. **Static-export & self-hosted bans:** fails if `pages/api/` exists, any file under `pages/` exports
     `getServerSideProps`, uses `next/image` without `unoptimized`, or runtime code (`pages/`, `components/`, `lib/`,
     `styles/`) loads external CDN `<script>`/`<link>`/WASM URLs (`unpkg.com`, `jsdelivr.net`, `cdnjs.cloudflare.com`,
     `fonts.googleapis.com`).
  2. **Case-sensitive relative imports:** resolves relative imports in `pages/`, `components/`, `lib/` against actual
     on-disk filenames so Windows never passes an import that fails on Ubuntu CI.
  3. **File-size budget (40 kB):** flags any file under `docs/`, `pages/`, `components/`, `lib/`, `styles/` ≥ 40,960
     bytes (40 KiB) unless listed in `KNOWN_LARGE` with a ratcheted byte ceiling (current size + small buffer, e.g.
     +512 B or exact current bytes) so it cannot silently grow. (Excludes generated/data files:
     `lib/generated/*`, `lib/pcb/font/newstroke-glyphs.ts`, `lib/emsim/jlcpcbStackups.json`.)
  4. **Generated-licence freshness:** verifies every third-party package imported in `pages/`, `components/`, `lib/`
     (excluding `next/*`, `react`, `react-dom`, `node:*`, `@types/*`) is covered in
     `lib/generated/third-party-licenses.json`.
  5. **Route, tool-card, PDF registry & `PageHead`/OG consistency:**
     - Every `pages/<tool>/main.tsx` is linked from `pages/index.tsx`.
     - Every `pages/pdf/<slug>.tsx` (except `main.tsx`) is registered in `lib/pdf/tools.ts`.
     - Every non-`_app`/`_document` page under `pages/` uses `PageHead` (directly or via `PdfPage`/`ToolPage`), and
       every `ogImage` path referenced exists under `public/`.
  6. **EN/NB translation parity:** verifies `en` and `nb` in `lib/ui/translations.ts` (and after H3, the split i18n
     modules) have identical key sets with no missing or extra keys.
- Add convenience scripts to `package.json`:
  - `"typecheck": "tsc --noEmit"`
  - `"check:repo": "node scripts/check-repo.mjs"`
  - `"build:export": "node scripts/build-export.mjs"`
  - `"verify": "npm run typecheck && npm run check:repo && npm run build:export"`
- Wire `npm run typecheck && npm run check:repo` into `.github/workflows/nextjs.yml` right after `Install dependencies`
  and before `Build with Next.js`.
- Update the H2 status row in `docs/hygiene/plan.md`.

**Done when:**
- `npm run verify` exits 0 on Windows, produces `out/`, and leaves `git status` clean (no leftover `next.config.mjs` or
  modified `next-env.d.ts`).
- Spot-test that `check-repo.mjs` catches a deliberate violation (e.g., wrong-case import and missing `nb` key), then
  revert the test edit cleanly.

---

### H3 – Split high-churn / doc files over 40 kB

**Scope:**
- **Split `docs/BACKLOG.md` (88.9 kB):**
  - Keep `docs/BACKLOG.md` (< 5 kB) as a concise index with the **next free ID (`BL204`)**, rules, summary counts, and
    links to sub-files under `docs/backlog/`:
    - `docs/backlog/done.md` ("Done and removed" history)
    - `docs/backlog/em-sim.md`
    - `docs/backlog/smith-chart.md`
    - `docs/backlog/pcb-viewer.md`
    - `docs/backlog/other.md` (Site, Resistor lookup, QR reader, 3D viewer, PDF tools, etc.)
  - Verify programmatically that **zero `BL<n>` IDs are lost, duplicated, or renumbered** and every file under `docs/`
    is under 40 kB.
- **Trim/split `docs/pdf-tools-plan.md` (42.7 kB):**
  - Keep `docs/pdf-tools-plan.md` under 35 kB (so all existing links to it keep working) by extracting the completed
    phase execution logs / detailed module map into `docs/pdf-tools-modules.md` (linked from `docs/pdf-tools-plan.md`).
- **Split `lib/ui/translations.ts` (94.2 kB):**
  - Split into clean domain modules under `lib/ui/i18n/` (each well under 30 kB, holding matching `en` and `nb`
    objects per domain, e.g., `common.ts`, `home.ts`, `ee.ts`, `utilities.ts`, `viewers.ts`, `pdf.ts`), and re-export
    the exact same `Locale`, `LOCALES`, `en`, `nb`, `TranslationKey`, `translations` symbols from `lib/ui/translations.ts`
    so zero call sites change.
  - Ensure `scripts/check-repo.mjs`'s EN/NB parity check works cleanly with the split structure.
- Remove `docs/BACKLOG.md`, `docs/pdf-tools-plan.md`, and `lib/ui/translations.ts` from `KNOWN_LARGE` in
  `scripts/check-repo.mjs`.
- Update `CLAUDE.md` to document the split `docs/backlog/` layout and update H3 status in `docs/hygiene/plan.md`.

**Done when:**
- Every file under `docs/` and `lib/ui/` is comfortably under 40 kB.
- Automated verification proves exact `BL<n>` ID preservation and byte-identical runtime `en`/`nb` translation maps.
- `npm run verify` exits 0.

---

### H4 – Light TypeScript strictness audit & incremental tightening

**Scope:**
- Run diagnostic checks (`npx tsc --noEmit --noImplicitAny`, `--strictNullChecks`, `--noUnusedLocals`) and record error
  counts per top-level folder (`lib/<tool>/`, `components/<Tool>/`, `pages/`) in `docs/hygiene/notes-H4.md`.
- Create `tsconfig.strict.json` (extending `tsconfig.json` with `"strict": true`, `"noUnusedLocals": true`) covering
  clean shared and UI foundation folders (`lib/ui/**`, `components/UI/**`, `lib/equations/**`, `components/Equations/**`,
  plus any other folder with 0 or trivial `<10` clean fixes). Do **not** rewrite verified math/solver/parser engines.
- Wire `tsc -p tsconfig.strict.json --noEmit` into `npm run typecheck` (so both `npm run verify` and CI enforce strict
  typing on shared/new code going forward).
- Add `docs/hygiene/plan.md` to `CLAUDE.md` (`## Docs`) and document `npm run verify` in `CLAUDE.md`
  (`## Verifying changes`).
- Update the H4 status row in `docs/hygiene/plan.md`.

**Done when:**
- `npm run verify` passes cleanly with zero regressions and `docs/hygiene/notes-H4.md` records the full baseline audit.

---

## Deferred (intentionally out of this pass)

- **`BL29` (PCB parser/exporter splits):** Needs a repo-side PCB regression harness (`scripts/harness/pcb/`) first;
  files stay frozen in `check-repo.mjs`'s `KNOWN_LARGE` allowlist until next touched.
- **Dormant large code/style files (`solve.ts`, `viamodel.ts`, `PdfTools.module.css`, etc.):** Ratcheted in
  `KNOWN_LARGE` so they cannot grow; split opportunistically when next opened for feature/bug work.
- **`BL201` (EM sim KiCad 5–8 cache script):** Defer until EM sim Phase 2 or the next edit to `lib/emsim/kicad.ts`.
- **`BL203` (Minor dependency bumps: `pdfjs-dist`, `three`, `zxing-wasm`):** Wait until ≥ 2026-11-29 (`zxing-wasm` 3.1.7
  two-week maturity mark), then update one package per commit with full tool harness runs.
- **Modifying, merging, or pushing `breadboard`.**
