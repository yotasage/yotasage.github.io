> [!NOTE]
> **Superseded (2026-11-21):** This plan has been superseded by the site-wide Modern High-Polish SaaS Design System v2 redesign in [docs/ui-redesign/plan.md](../ui-redesign/plan.md) (all 48 routes migrated) plus the follow-up cleanup pass (`ux-polish-followup`). Do not execute this plan or revert `--ds-*` v2 tokens; it is kept only as historical context.

# Site-wide UX polish and theme unification – plan

Bring the older tools and site shell up to the visual, theme, and accessibility baseline established by the newer
tools (`resistor`, `smith-chart`, `em-sim`), so every page on https://yotasage.github.io/ feels like one cohesive,
calm, fast toolkit in both light and dark themes and on phones.

Drafted 2026-11-20. Where this plan and [CLAUDE.md](../../CLAUDE.md) or [agent-workflow.md](../agent-workflow.md)
disagree, those two win.

---

## Goal

Over time the site developed two distinct UI generations:

- **Newer tools (`resistor`, `smith-chart`, `em-sim`):** Light and dark themes following `prefers-color-scheme` with a
  manual toggle stored in `localStorage`, warm paper light palette (`#f6f4ee`) and site dark palette (`#2b2b2b`),
  semantic CSS variables (`--bg`, `--field`, `--raise`, `--ink`, `--ink-2`, `--rule`, `--accent`, etc.), slim sticky
  top bar, tabular numerals, WCAG 2.2 AA contrast, 24 px+ touch targets, `prefers-reduced-motion` support, and calm
  status notes.
- **Older tools & site shell (`/`, `/licenses`, `simsetup`, `qrcode`, `qr-reader`, `pdf/*`, `base64-image`,
  `text-case`, `3d-viewer`, `pcb-viewer`):** Hardcoded `#2b2b2b` dark-only styling, white text, `#0070f3`/`#4da3ff`
  links, oversized 2.4 rem header with a bordered `HomeIcon`, no theme switch, and several unrelated pages importing
  `styles/QrGen.module.css` directly for their page frame and form inputs. Meanwhile, each themed page duplicates
  `#__next > footer` inline `<style jsx global>` overrides just to colour the footer.

After this project:

1. **One shared design-token and theme system** powers the entire site (including `SiteFooter`), with a single
   site-wide theme preference (`localStorage`) so switching theme on one page carries across all pages.
2. **One shared page shell (`ToolShell`) and shared form-field styles** replace the ad-hoc reuse of
   `styles/QrGen.module.css` across `base64-image`, `text-case`, `3d-viewer`, `pcb-viewer`, and `pdf/*`.
3. **Every tool supports light and dark themes cleanly**, keeping special visual surfaces usable in both (e.g., white
   quiet-zone plate under QR codes; high-contrast canvas options for PCB and 3D viewers).
4. **Baseline polish everywhere:** consistent keyboard `:focus-visible` rings, ≥ 24 px touch targets,
   `prefers-reduced-motion`, clean 320 px phone layouts, and zero regressions in the existing `resistor`, `smith-chart`,
   and `em-sim` harnesses.

---

## Ground rules

- **All hard constraints of [CLAUDE.md](../../CLAUDE.md) apply:** static export, no server, self-hosted assets only, no
  new runtime dependencies, no Tailwind.
- **No flash of wrong theme.** System `prefers-color-scheme` works purely in CSS on first paint (the exact pattern in
  `styles/EmSim.module.css` and `pages/em-sim/main.tsx`), and an explicit user override in `localStorage` applies
  cleanly after mount (or via a tiny inline script in `_document.tsx` if chosen — keep static export safe).
- **Do not regress the flagship tools.** `resistor`, `smith-chart`, and `em-sim` already have strict accessibility,
  layout, and performance budgets checked by their harnesses (`scripts/harness/`). Keep their token names compatible
  and re-run their checks if any shared file they touch changes.
- **Respect domain-specific canvases.** Switching the page chrome to light mode must never wash out a dark PCB layer
  view, a dark 3D viewport, or a QR code quiet zone. Canvases keep sensible defaults (with an optional canvas-background
  toggle where appropriate).
- **Phone width (320 px+)** and touch interactions are verified on every migrated page.

---

## Current state (audited 2026-11-20)

| Area / Page | Stylesheet(s) | Theme | Notable coupling / gaps |
| --- | --- | --- | --- |
| `/` (Home) | `Home.module.css` | Dark only | Hardcoded `#2b2b2b` / white; no theme toggle. |
| `/licenses` | `Licenses.module.css` | Dark only | Also holds `SiteFooter` styles. |
| `SiteFooter` | `Licenses.module.css` | Dark only | Overridden via `#__next > footer` in `resistor`, `smith-chart`, `em-sim`. |
| `simsetup` | `SimSetup.module.css` | Dark only | Uses `Bibliography` + KaTeX; custom layout; no theme switch. |
| `qrcode` | `QrGen.module.css` | Dark only | Exports `components/QrGen/fields.tsx` reused by PDF tools. |
| `qr-reader` | `QrRead.module.css` | Dark only | Already has `Status.tsx` and built-in example image; lacks light theme. |
| `pdf/*` (5 pages) | `PdfTools.module.css`, `QrGen.module.css` | Dark only | `components/PdfTools/ToolPage.tsx` frames all 5 pages; borrows `QrGen` form fields. |
| `base64-image` | `QrGen.module.css`, `Base64Image.module.css` | Dark only | Uses `QrGen.module.css` for page shell & `.layout`. |
| `text-case` | `QrGen.module.css`, `TextCase.module.css` | Dark only | Uses `QrGen.module.css` for page shell. |
| `3d-viewer` | `QrGen.module.css`, `Viewer3D.module.css` | Dark only | Uses `QrGen.module.css` for page shell and `PdfTools/ToolPage` `DropTarget`/`FilePickerButton`. |
| `pcb-viewer` | `QrGen.module.css`, `PcbViewer.module.css` | Dark only | Uses `QrGen.module.css` for page shell. |
| `resistor` | `Resistor*.module.css` | Light + dark | Owns `MoonIcon`/`SunIcon` in `components/Resistor/parts.tsx` (imported by `smith-chart`!). |
| `smith-chart` | `Smith*.module.css` | Light + dark | Shares base token names with `EmSim.module.css`. |
| `em-sim` | `EmSim*.module.css` | Light + dark | Reference token table in `styles/EmSim.module.css` lines 6–80. |
| *(Unused)* | `styles/globals.css` | — | 524-byte leftover, imported nowhere. |

---

## Decisions to confirm before starting

| # | Question | Recommended default |
| --- | --- | --- |
| D1 | Branch name? | `ux-polish` off `main`, one commit per step, do not push until asked. |
| D2 | Default theme for visitors with no saved preference? | Follow OS `prefers-color-scheme` everywhere (matching `resistor`, `smith-chart`, `em-sim`), with a manual toggle saved in `localStorage` under one site-wide key `site.theme` (migrating any existing `resistor.theme` / `smith.theme` / `emsim.theme` on first read). |
| D3 | Anti-flash inline script in `pages/_document.tsx`? | Optional: a 6-line inline script setting `document.documentElement.dataset.theme` from `localStorage.getItem('site.theme')` before first paint avoids a light↔dark flash when a user overrides their OS theme. Confirm with owner (still 100% static-export safe). |
| D4 | Canvas background in `pcb-viewer` and `3d-viewer` under light theme? | Keep PCB canvas dark by default (copper/silkscreen read best on dark; optional light/dark canvas toggle in toolbar); give 3D viewer a clean neutral studio backdrop matching the active theme. |

---

## Steps

Sized so each step stays under ~200k tokens ([agent-workflow.md](../agent-workflow.md)).

Status: ✅ done · 🔄 in progress · 📋 planned

| Step | Scope | Status | Commit |
| --- | --- | :-: | --- |
| U1 | Shared theme tokens, `useTheme` hook, `icons/theme.tsx`, and themed `SiteFooter` | 📋 | — |
| U2 | Shared `ToolShell` + `Fields` primitives; migrate `/` (Home) and `/licenses` | 📋 | — |
| U3 | Migrate lightweight tools: `text-case`, `base64-image`, `simsetup` | 📋 | — |
| U4 | Migrate code tools: `qrcode` and `qr-reader` | 📋 | — |
| U5 | Migrate `pdf/*` hub and all 4 PDF sub-tools | 📋 | — |
| U6 | Migrate heavy viewers: `3d-viewer` and `pcb-viewer` | 📋 | — |
| U7 | Cross-tool verification pass (light/dark, 320 px, WCAG AA contrast, keyboard, flagship harnesses) | 📋 | — |

---

### U1 – Shared theme tokens, `useTheme`, theme icons, and `SiteFooter`

**Scope:**
- Create `components/icons/theme.tsx` containing `MoonIcon` and `SunIcon` (re-export from `components/Resistor/parts.tsx`
  temporarily or update imports in `pages/smith-chart/main.tsx` and `components/EmSim/` so nothing reaches across tool
  folders).
- Create `lib/theme.ts` with `useTheme()` (`'light' | 'dark' | null`, persisted to `localStorage` under `site.theme`,
  reading legacy `resistor.theme` / `smith.theme` / `emsim.theme` as fallback if `site.theme` is unset, and syncing
  `data-theme` on `document.documentElement` so `SiteFooter` and `html, body` follow automatically).
- Create `styles/theme.css` (imported once in `pages/_app.tsx`) defining the canonical light and dark CSS custom
  properties on `:root` (`--bg`, `--field`, `--raise`, `--ink`, `--ink-2`, `--ink-3`, `--ink-4`, `--rule`,
  `--rule-strong`, `--edge`, `--accent`, `--accent-ink`, `--accent-soft`, `--warn`, `--error`, `--font-ui`,
  `--font-num`, `--radius`, `--quick`) matching `styles/EmSim.module.css` lines 6–80, plus base `html, body` reset and
  `SiteFooter` colours.
- Remove the unused `styles/globals.css` (unless handled first in `docs/hygiene/plan.md`).
- Update `pages/resistor/main.tsx`, `pages/smith-chart/main.tsx`, and `pages/em-sim/main.tsx` to read/write the shared
  `site.theme` key so switching theme on any page stays consistent across the whole site (keep their local token
  overrides intact so nothing shifts visually).

**Done when:**
- `npx tsc --noEmit` and `npm run build` pass.
- Toggling theme on `resistor`, `smith-chart`, or `em-sim` persists when navigating between them.
- `SiteFooter` renders cleanly in both light and dark themes without per-page `#__next > footer` hacks.

---

### U2 – Shared `ToolShell` + form primitives; migrate `/` and `/licenses`

**Scope:**
- Create `components/ToolShell.tsx` + `styles/ToolShell.module.css`:
  - Slim top bar (`HomeIcon` link, page `<h1>`, optional right-side slot, and `ThemeToggle` button) matching the calm
    proportions of `resistor`/`smith-chart`/`em-sim`, collapsing cleanly down to 320 px.
  - Consistent `:focus-visible` ring (`2px solid var(--accent)`, offset `2px`), `prefers-reduced-motion` guard, and
    optional lead paragraph slot.
- Extract generic form controls (`Field`, `NumberField`, `SelectField`, etc.) from `components/QrGen/fields.tsx` into
  `components/ui/Fields.tsx` + `styles/Fields.module.css` using the shared CSS tokens (keep a thin re-export in
  `components/QrGen/fields.tsx` until U4/U5 finish, then remove it).
- Migrate [pages/index.tsx](../../pages/index.tsx) (`styles/Home.module.css`) and
  [pages/licenses.tsx](../../pages/licenses.tsx) (`styles/Licenses.module.css`) to the shared light + dark tokens and
  add a theme toggle in the top right of both pages. Ensure card accent colours keep ≥ 3:1 / 4.5:1 contrast on both
  `#f6f4ee` (light) and `#2b2b2b` (dark).

**Done when:**
- `/` and `/licenses` look crisp in both light and dark themes at 1440 px and 390 px, with no horizontal overflow at
  320 px.
- `npx tsc --noEmit` and `npm run build` pass.

---

### U3 – Migrate lightweight tools (`text-case`, `base64-image`, `simsetup`)

**Scope:**
- `pages/text-case/main.tsx` & `styles/TextCase.module.css`: switch from `QrGen.module.css` to `ToolShell`, convert all
  hardcoded colours to shared tokens, ensure copy buttons and stat counters have tabular numerals and clear feedback.
- `pages/base64-image/main.tsx` & `styles/Base64Image.module.css`: switch to `ToolShell`, convert colours to shared
  tokens, add a neutral checkerboard behind transparent PNG/WebP previews that reads cleanly in both themes.
- `pages/simsetup/main.tsx` & `styles/SimSetup.module.css`: adopt `ToolShell` (or slim bar + theme toggle), convert
  colours to shared tokens, verify KaTeX formulas, `Bibliography` (`styles/Bibliography.module.css`), and coherent
  sampling pass/fail badges have accessible contrast in both light and dark themes.

**Done when:**
- All three pages work in light and dark themes at desktop and 390 px width, with working interactive checks.
- `npx tsc --noEmit` and `npm run build` pass.

---

### U4 – Migrate code tools (`qrcode`, `qr-reader`)

**Scope:**
- `pages/qrcode/main.tsx` & `styles/QrGen.module.css`: adopt `ToolShell` and `components/ui/Fields.tsx`, convert colours
  to shared tokens. Keep the rendered QR code preview inside a subtle framed plate so white quiet zones stay visible
  on the light `#f6f4ee` background.
- `pages/qr-reader/main.tsx` & `styles/QrRead.module.css`: adopt `ToolShell`, convert colours to shared tokens (cards,
  raw hex dump, symbol redraw, safety warnings for look-alike URLs, `Status.tsx`).
- Remove the transitional re-export in `components/QrGen/fields.tsx` once U5 no longer imports it (or right after U5).

**Done when:**
- Both pages pass visual checks in light and dark themes at desktop and 390 px.
- Existing QR reader harness (`scripts/harness/qr-reader/` `npm run check` and `npm run ui`) passes.
- `npx tsc --noEmit` and `npm run build` pass.

---

### U5 – Migrate `pdf/*` hub and sub-tools

**Scope:**
- Update `components/PdfTools/ToolPage.tsx`, `FileGrid.tsx`, and `styles/PdfTools.module.css` to wrap with `ToolShell`,
  use `components/ui/Fields.tsx`, and replace hardcoded dark colours with the shared tokens.
- Verify all 5 pages (`/pdf/main`, `/pdf/merge`, `/pdf/compress`, `/pdf/images-to-pdf`, `/pdf/remove-metadata`) share
  the upgrade automatically through `ToolPage.tsx`.
- Ensure PDF page thumbnails keep a subtle border/shadow in light mode so white PDF pages stand out against `#fffefb`
  cards.
- Remove any remaining imports of `styles/QrGen.module.css` from PDF tools.

**Done when:**
- All 5 PDF routes look clean in both themes at desktop and 390 px, and merge/compress/images-to-pdf/remove-metadata
  flows work without console errors.
- `npx tsc --noEmit` and `npm run build` pass.

---

### U6 – Migrate heavy viewers (`3d-viewer`, `pcb-viewer`)

**Scope:**
- `pages/3d-viewer/main.tsx`, `components/Viewer3D/`, `styles/Viewer3D.module.css`:
  - Replace `QrGen.module.css` shell with `ToolShell`; extract shared drop-zone button styling cleanly instead of
    borrowing from `PdfTools/ToolPage` if needed (or move `DropTarget`/`FilePickerButton` into `components/ui/`).
  - Theme sidebar panels, parts tree, measurement readouts, and export controls with shared tokens.
  - Adapt Three.js viewport clear colour / grid colour cleanly to light vs. dark theme (or offer a viewport backdrop
    toggle).
- `pages/pcb-viewer/main.tsx`, `components/PcbViewer/`, `styles/PcbViewer.module.css`:
  - Replace `QrGen.module.css` shell with `ToolShell`.
  - Theme layer list, properties/inspect panel, search/highlight lists, measurement bar, and export modals with shared
    tokens.
  - Keep the PCB canvas background dark by default (high contrast for copper, silkscreen, and solder mask) with an
    optional light/dark canvas switch if helpful.

**Done when:**
- Both viewers open and render test files cleanly in light and dark themes at desktop and 390 px width, with no
  performance regression and zero console errors.
- `npx tsc --noEmit` and `npm run build` pass.

---

### U7 – Cross-tool verification pass

**Scope:**
- Scripted headless browser sweep across all routes in both light and dark themes at 1440 px and 390 px (plus 320 px
  horizontal-overflow check):
  - Zero console errors, zero uncaught exceptions.
  - Zero horizontal overflow at 320 px.
  - All interactive controls have visible focus rings and ≥ 24 px touch targets.
  - Contrast spot-check (WCAG 2.2 AA: 4.5:1 text, 3:1 UI borders/icons) in both themes.
- Re-run flagship regression checks (`scripts/harness/resistor/`, `scripts/harness/smith/`, `scripts/harness/emsim/`
  relevant UI/theme checks) to prove nothing regressed.
- Update [CLAUDE.md](../../CLAUDE.md) `## Layout and conventions` to document `styles/theme.css`, `lib/theme.ts`,
  `components/ToolShell.tsx`, and `components/ui/Fields.tsx`.

**Done when:**
- Sweep passes across all routes in both themes, flagship checks pass, and `npx tsc --noEmit` + `npm run build` pass
  (`git checkout -- next-env.d.ts` after).

---

## Out of scope

- Changing core calculation engines or adding new tool features (handled in each tool's own plan).
- Rewriting `resistor`, `smith-chart`, or `em-sim` layouts — they are the reference design, only aligned on the shared
  `site.theme` key and shared theme icons/footer.
- SEO / Open Graph metadata, sample files, or README visuals (handled separately in [docs/sharing/plan.md](../sharing/plan.md)).

---

## Running this plan in a new session

To start this in a fresh session, point it at this file:

> Read `CLAUDE.md` and `docs/ux-polish/plan.md`. Confirm decisions D1–D4 with me (or use the recommended defaults), then
> execute steps U1 through U7 one step at a time, committing once per step on the `ux-polish` branch, restoring
> `next-env.d.ts` after builds, and not pushing.
