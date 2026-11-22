# H4 – TypeScript strictness audit baseline

Recorded 2026-11-22 on branch `hygiene` (TypeScript `7.0.2`, `next` `16.4.6`) after adding `"out"` to `tsconfig.json` `exclude` so static-export worker assets (`out/_next/static/media/*.worker.*.ts`) are never scanned by `tsc`.

## Repo-wide diagnostic totals (pre-H4 fixes)

| Check | Command | Errors |
| --- | --- | ---: |
| Baseline | `npx tsc --noEmit` | 0 |
| Implicit `any` | `npx tsc --noEmit --noImplicitAny` | 219 |
| Strict null checks | `npx tsc --noEmit --strictNullChecks` | 962 |
| Unused locals | `npx tsc --noEmit --noUnusedLocals` | 62 |
| Combined strict + unused | `npx tsc --noEmit --strict --noUnusedLocals` | 1,167 |

*Note:* Some files (notably `pages/pdf/` and `components/PdfTools/`) report more `--noImplicitAny` errors in isolation than under `--strict --noUnusedLocals` because TypeScript's control-flow inference narrows `null`/`[]` differently when `strictNullChecks` is disabled.

## Error counts by directory (pre-H4 fixes)

| Directory | Files | `--noImplicitAny` | `--strictNullChecks` | `--noUnusedLocals` | `--strict --noUnusedLocals` |
| --- | ---: | ---: | ---: | ---: | ---: |
| `lib/` (root) | 5 | 0 | 0 | 0 | 0 |
| `lib/ui/` | 11 | 0 | 0 | 0 | 0 |
| `lib/simsetup/` | 4 | 0 | 0 | 0 | 0 |
| `lib/equations/` | 4 | 0 | 4 | 0 | 4 |
| `lib/base64image/` | 4 | 0 | 4 | 0 | 4 |
| `lib/textcase/` | 4 | 0 | 4 | 0 | 4 |
| `lib/pdf/` | 48 | 9 | 16 | 1 | 20 |
| `lib/qrread/` | 13 | 1 | 29 | 0 | 30 |
| `lib/viewer3d/` | 9 | 0 | 33 | 0 | 34 |
| `lib/smith/` | 31 | 0 | 36 | 1 | 37 |
| `lib/qr/` | 8 | 0 | 45 | 0 | 41 |
| `lib/resistor/` | 23 | 0 | 69 | 0 | 69 |
| `lib/pcb/` | 58 | 3 | 241 | 2 | 242 |
| `lib/emsim/` | 75 | 151 | 184 | 0 | 326 |
| `components/UI/` | 4 | 0 | 0 | 0 | 0 |
| `components/Equations/` | 3 | 0 | 0 | 0 | 0 |
| `components/Home/` | 1 | 0 | 0 | 0 | 0 |
| `components/SimSetup/` | 5 | 0 | 0 | 0 | 0 |
| `components/PdfTools/` | 16 | 5 | 0 | 1 | 1 |
| `components/` (root) | 4 | 0 | 1 | 2 | 3 |
| `components/TextCase/` | 1 | 0 | 3 | 0 | 3 |
| `components/QrGen/` | 5 | 0 | 1 | 3 | 4 |
| `components/icons/` | 1 | 2 | 0 | 2 | 4 |
| `components/QrRead/` | 8 | 1 | 5 | 1 | 6 |
| `components/Viewer3D/` | 4 | 0 | 7 | 0 | 7 |
| `components/Base64Image/` | 2 | 2 | 8 | 0 | 8 |
| `components/PcbViewer/` | 10 | 0 | 9 | 2 | 11 |
| `components/Smith/` | 36 | 1 | 24 | 13 | 37 |
| `components/EmSim/` | 60 | 6 | 78 | 18 | 96 |
| `components/Resistor/` | 19 | 0 | 137 | 9 | 146 |
| `pages/3d-viewer/` | 1 | 0 | 0 | 0 | 0 |
| `pages/base64-image/` | 1 | 0 | 0 | 0 | 0 |
| `pages/pcb-viewer/` | 1 | 0 | 0 | 0 | 0 |
| `pages/simsetup/` | 1 | 0 | 0 | 0 | 0 |
| `pages/text-case/` | 1 | 0 | 0 | 0 | 0 |
| `pages/em-sim/` | 1 | 0 | 0 | 1 | 1 |
| `pages/resistor/` | 1 | 0 | 0 | 1 | 1 |
| `pages/` (root) | 4 | 0 | 0 | 2 | 2 |
| `pages/smith-chart/` | 1 | 0 | 2 | 1 | 3 |
| `pages/pdf/` | 34 | 38 | 3 | 2 | 5 |
| `pages/qr-reader/` | 1 | 0 | 8 | 0 | 8 |
| `pages/qrcode/` | 1 | 0 | 11 | 0 | 10 |

## Already clean under `--strict --noUnusedLocals`

- `lib/` (root: `bibtex.ts`, `complex.ts`, `quantity.ts`, `references.ts`, `useReplayHighlight.ts`)
- `lib/ui/` (11 files, including `lib/ui/i18n/*`)
- `lib/simsetup/` (4 files)
- `components/UI/` (4 files)
- `components/Equations/` (3 files)
- `components/Home/` (1 file)
- `components/SimSetup/` (5 files)
- `pages/3d-viewer/`, `pages/base64-image/`, `pages/pcb-viewer/`, `pages/simsetup/`, `pages/text-case/` (note: page routes transitively import non-strict tool modules, so they are not included in `tsconfig.strict.json` yet)

## `tsconfig.strict.json` coverage (enforced in `npm run typecheck` and CI)

`tsconfig.strict.json` extends `tsconfig.json` with `"strict": true`, `"noUnusedLocals": true`, `"noEmit": true`, `"incremental": false`, and `"exclude": ["node_modules", "out"]`. It enforces strict checking across **42 shared/foundation files**:

- `lib/ui/**/*`, `components/UI/**/*`
- `lib/equations/**/*`, `components/Equations/**/*`
- `lib/simsetup/**/*`, `components/SimSetup/**/*`
- `components/Home/**/*`, `components/icons/**/*`
- `components/PageHead.tsx`, `components/SiteFooter.tsx`, `components/KatexSpan.tsx`, `components/Bibliography.tsx`
- `lib/bibtex.ts`, `lib/complex.ts`, `lib/quantity.ts`, `lib/references.ts`, `lib/useReplayHighlight.ts`

### Trivial fixes applied in H4 to make shared modules strict-clean

1. `components/PageHead.tsx` & `components/SiteFooter.tsx`: removed unused `import React from 'react'`.
2. `components/Bibliography.tsx`: narrowed `citedEntries()` lookup via `flatMap` instead of returning `(BibEntry | undefined)[]`.
3. `components/icons/home.tsx`: typed `props: SVGProps<SVGSVGElement>` and removed unused `React` import.
4. `lib/equations/compile.ts`: added a safe `if (o === undefined)` guard in `bind()` before indexing `program.regs`.

## Suggested future opt-in order (opportunistic, when next touched)

1. **Easy (< 10 errors each, self-contained):** `lib/base64image/` (4), `lib/textcase/` (4), `components/TextCase/` (3), `components/Base64Image/` (8), `pages/` root (2).
2. **Medium (small error surface, high leverage):** `components/PdfTools/` (1) + `lib/pdf/` (20) + `pages/pdf/` (5).
3. **Heavy engines (leave untouched unless actively working on them with harnesses):** `lib/smith/`, `lib/resistor/`, `lib/pcb/`, `lib/emsim/` and their corresponding `components/` trees.
