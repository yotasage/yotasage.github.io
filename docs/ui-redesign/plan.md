# UI/UX Redesign — Modern High-Polish SaaS Design System & Flagship Pilot

Establish a cohesive, award-grade UI/UX standard across https://yotasage.github.io/ that makes the project immediately recognizable, welcoming to outside visitors as well as the owner, accessible across themes and experience levels, and easy to adopt across all remaining tools in future sessions.

Created 2026-11-21 on branch `ui-redesign`. Where this plan and [CLAUDE.md](../../CLAUDE.md) or [agent-workflow.md](../agent-workflow.md) disagree, those two win.

---

## Owner-Confirmed Design Direction

1. **Visual Aesthetic — Modern High-Polish SaaS (Vercel / Apple / Supabase / Figma-inspired):**
   - Crisp layered surfaces (`--ds-bg`, `--ds-surface`, `--ds-surface-elevated`, `--ds-well`), subtle ambient top radial glow keyed to each tool's signature accent, frosted translucent sticky header (`backdrop-filter: blur(14px)`), generous rounded geometry (`16px` cards, `10px–12px` controls, `999px` pill segmented controls), refined hairline borders, smooth tactile hover/focus micro-interactions (`prefers-reduced-motion` respected).
   - **Per-tool signature accent (`--ds-accent`)**: Each tool keeps its recognizable accent identity from the home page (`#3b82f6` Home, `#3cc4dc` SimSetup, `#5aa2f0` Resistor, `#e0679a` Smith chart) while sharing identical neutral surface tokens, spacing, typography, header chrome, and component anatomy.
2. **Layout Architecture — Hybrid Split + Non-Destructive Mode Tabs:**
   - Top bar switches major non-destructive workspaces (e.g., **Workbench** · **Examples / Learn** · **Theory & Reference**).
   - Inside **Workbench**, the primary interactive hero (calculator/input/visual/chart) stays anchored in a sticky left column on desktop while secondary sub-tools switch non-destructively via crisp pill tabs on the right (no endless scrolling, zero lost state when switching tabs, collapses cleanly down to 320 px phones).
   - Deep hash links (`#lookup`, `#drawing`, `#combinations`, `#design`, `#theory`, `#references`, `#learn`, `#export`, etc.) automatically activate the matching workspace/tab and scroll to the target element.
3. **Experience Modes (`Quick` · `Standard` · `Teaching`):**
   - Persisted globally via a pill segmented control in the shared header (`site.mode`).
   - **Quick:** Streamlined to the fastest everyday workflow (essential controls & core output only).
   - **Standard:** Complete engineering workbench (all sub-tools, precision/export controls, advanced panels).
   - **Teaching:** Surfaces inline contextual tips, live formula callouts, "why" annotations, and direct jumps into Theory & worked examples.
4. **Theme Palette (`Light` · `Dark` · `High Contrast AAA`):**
   - Persisted globally (`site.theme`), defaulting to OS `prefers-color-scheme`, exposed as a clean pill control in the shared header.
   - High Contrast mode enforces WCAG AAA contrast (`#000000` canvas, `#ffffff` ink, `2px` crisp borders, `#ffe600` focus/active accents) across every redesigned page and footer.
5. **Typography — Self-Hosted Modern Pairing:**
   - **Inter** (variable sans-serif, Latin + Latin-Ext for `æ ø å` and European glyphs) + **JetBrains Mono** (variable monospace with `tabular-nums`) copied from `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono` into `public/fonts/` on `postinstall` (`scripts/copy-fonts.mjs`), served locally with zero CDN requests, and attributed on `/licenses`.
6. **i18n Foundation (`EN` + `NB`):**
   - Lightweight React context (`lib/ui/i18n.tsx`, persisted in `site.lang`) with typed translation keys, automatic fallback to English, and a crisp `EN / NB` toggle in the shared header. Designed so adding a new language is adding one dictionary object.
7. **Flagship Scope:**
   - Shared Design System Foundation (`U1`)
   - Home Page `/` (`U2`)
   - Simulation Setup `/simsetup/main` (`U3`)
   - Resistor Lookup `/resistor/main` (`U4`)
   - Smith Chart `/smith-chart/main` (`U5`)
   - Verification, Harness Alignment & Docs (`U6`)

---

## Hard Constraints & Compatibility

- **All [CLAUDE.md](../../CLAUDE.md) constraints hold:** Static export only, zero server/API routes, zero CDN assets, zero analytics/tracking, phone-width responsive (320 px+), exact filename casing for Ubuntu CI.
- **Zero regressions on untouched legacy tools:** All v2 global resets/tokens are scoped via `[data-ds="v2"]` and CSS custom properties `--ds-*`. Untouched tools (`/pcb-viewer/main`, `/3d-viewer/main`, `/pdf/*`, `/em-sim/main`, `/qrcode/main`, `/qr-reader/main`, `/base64-image/main`, `/text-case/main`) keep their exact existing appearance and behavior.
- **Preserve all tool URL query state & engines:** Existing `?q=...` Resistor links and Smith chart circuit links decode and update identically; Smith chart's imperative 60 fps drag engine (`chartView.ts`, `pathLayer.ts`, `live.ts`) stays outside React.
- **No leftover processes:** Every step stops any dev server/browser it starts and restores `next-env.d.ts` after `npm run build`.

---

## Steps & Status

Status: ✅ done · 🔄 in progress · 📋 planned

| Step | Scope | Status | Commit |
| --- | --- | :-: | --- |
| U1 | Self-hosted fonts (`public/fonts/`), `styles/design-system.css`, `lib/ui/` (theme, mode, i18n), shared `components/UI/` (`ToolHeader`, `PillTabs`, `TeachingCallout`), themed `SiteFooter`, `_app.tsx` & `_document.tsx` FOUC guard | ✅ | `36e3760` |
| U2 | Home page (`/`) redesign with Modern High-Polish SaaS header, ambient hero, live search + category filter pills, scannable cards, Light/Dark/HC & EN/NB | ✅ | `3719999` |
| U3 | Simulation setup (`/simsetup/main`) redesign: Hybrid Split + Mode Tabs (`Workbench` / `Examples & Guide` / `Theory`), Quick/Standard/Teaching modes, presets, EN/NB | ✅ | `bd5d504` |
| U4 | Resistor lookup (`/resistor/main`) redesign: Hybrid Split + Mode Tabs (`Workbench` with sticky left hero + tabbed right `Lookup` / `Bands & SMD` / `Combinations` / `Design`, plus `Examples` and `Theory & Reference`), Quick/Standard/Teaching, EN/NB, harness update | ✅ | `523956a` |
| U5 | Smith chart (`/smith-chart/main`) redesign: Hybrid Split + Mode Tabs (`Workbench` with sticky chart + tabbed right `Circuit` / `Solver` / `Sweep` / `Equations` / `Export`, plus `Learn & Challenges` and `Theory & References`), Quick/Standard/Teaching, EN/NB, preserving 60 fps drag engine | ✅ | `0e12806` |
| U6 | Full verification (`npx tsc --noEmit`, `npm run build`, engine checks, Playwright desktop & 390 px visual audit across Light/Dark/HC/Modes/EN/NB), `CLAUDE.md` & plan status update | ✅ | pending |

---

## Shared Module Map (Target after U1)

- `scripts/copy-fonts.mjs` — `postinstall` script copying Inter & JetBrains Mono variable `.woff2` (latin + latin-ext) into `public/fonts/`
- `styles/design-system.css` — `@font-face` declarations, `--ds-*` design tokens for `light`, `dark`, `hc`, frosted header & SaaS primitives scoped to `[data-ds="v2"]`
- `lib/ui/theme.tsx` — `ThemeProvider`, `useTheme()` (`light | dark | hc`, OS default, `localStorage` `'site.theme'`, syncs `data-ds-theme` on `<html>` + `<meta name="theme-color">`)
- `lib/ui/mode.tsx` — `ModeProvider`, `useExperienceMode()` (`quick | standard | teaching`, `localStorage` `'site.mode'`)
- `lib/ui/i18n.tsx` — `I18nProvider`, `useI18n()` (`en | nb`, `localStorage` `'site.lang'`, `t(key)` with fallback) + `lib/ui/translations.ts`
- `components/UI/ToolHeader.tsx` — Unified frosted SaaS sticky header: Home pill, tool badge + title, center workspace mode tabs, right Quick/Standard/Teaching + Light/Dark/HC + EN/NB + optional action slot
- `components/UI/PillTabs.tsx` — Accessible non-destructive pill tab bar (`role="tablist"`, keyboard Left/Right/Home/End)
- `components/UI/TeachingCallout.tsx` — Contextual explanation card shown only in `teaching` mode (with optional formula & Theory jump link)
- `pages/_document.tsx` — Tiny synchronous inline script applying saved `site.theme` before first paint so Light/Dark/HC never flashes
