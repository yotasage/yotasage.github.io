# Notes from M2.1a – page shell and stackup (2026-11-16)

The first page at `/em-sim/main` (no card yet: M2.5). Files in [modules-page.md](modules-page.md). Checks:
`npm run ui` in `scripts/harness/emsim/` (build, `size.mjs`, `next start` on 3022, `ui-stackup.mjs`: 52 checks).

## Design record (for later page steps)

- **Tokens** on `.root` of `styles/EmSim.module.css`, names and values from Smith's (notes-M0.5.md item 5). Light /
  dark: `--bg` #f6f4ee / #2b2b2b, `--field` #fffefb / #313130, `--raise` #ece9e0 / #3a3a38, `--ink` #1d1c19 / #edebe5,
  `--ink-2` #55524b / #bdbab1, `--ink-3` #6c6861 / #a6a49c, `--ink-4` #8d897f / #7f7d76 (decoration only, not text),
  `--rule` #e3dfd5 / #3d3d3a, `--rule-strong` #cbc6ba / #54544f, `--edge` #968b73 / #7b7b73, `--accent` #0b6a5f /
  #72d1c0, `--accent-ink` (text on accent) #fff / #0f2e29, `--accent-soft` 10 % / 13 % of the accent, `--warn` #8a4b08 /
  #f0b26b, `--error` #b3261e / #ff8a80. Smith had no `--ink-4` and `--accent-ink`: new here, same names for
  `components/Equations/` later. Dark by the system with `:not([data-theme='light'])`, or by `data-theme='dark'`.
- **Materials** (the drawing; light / dark): `--copper` #c8773a / #d98f4e, `--copper-edge` #8e4b16 / #f2b57c, `--core`
  #d6c688 / #7c6f45, `--prepreg` #e9dfb2 / #978a5c (core darker than prepreg in both), `--laminate-edge` #ad9d62 /
  #5d5435 (between two dielectrics), `--mask` #2f7d4f / #3b9660, `--mask-edge` #1f5a37 / #6cc493, `--air` #e8eff4 /
  #313a43, `--air-ink` #5f7282 / #a4b5c4. The field colour maps stay in `lib/emsim/colormap.ts` (M1.5).
- **Type:** `--font-ui` system UI at 0.9375rem / 1.45, tabular numerals on the root; inputs and class values in
  `--font-num` (monospace). Headings 650 weight: h1 0.9375rem in the bar, h2 1.125rem, h3 0.9375rem; small text 0.75–0.8125rem.
- **Spacing:** `--page-w` 1280 px, `--gutter` 32 px (16 px up to 600 px), `--bar-h` 52 px, `--radius` 10 px (cards,
  drawing; controls 6–8 px), touch targets ≥ 34 px (inputs, segments) and 36 px (buttons, icon buttons). Sections are
  separated by a rule and 20 px; `scroll-margin-top` clears the sticky bar.
- **Nav:** the bar holds home, title, the section links (`SECTIONS` in `EmSimTool.tsx`: only sections that exist;
  add each as its step lands), undo, redo, theme. Up to 480 px the links wrap to a second row. Preferences (units mm /
  mil / µm, digits 3–6) and Copy link sit in a row under the status line.
- **Motion:** colour fades on hover at `--quick` 120 ms only; none with reduced motion (one rule on `.root *`).
- **Layout:** from 960 px the drawing (sticky) beside the table; from 720 px a layer's name beside its fields; under
  400 px two fields a line. Nothing exists only on hover; all controls are buttons, selects or inputs.

## State, link and undo (API for M2.1b)

- `commit(next | (cur) => next, group)` in `EmSimTool.tsx` is the one way to change the setup; give each field a
  group (`"<layer>.<key>.v"` / `".tol"` here) so typing is one undo step. Undo/redo restore whole setups.
- `withStackup(prev, s)` (StackupSection) refits trace and via when the copper ids change (a preset or KiCad file):
  the default microstrip (0.1377) and via presets. **M2.1b** should keep the user's trace kind and widths where the
  new stackup allows it.
- The link is `encodeLink(setup)` plus the page's own `u=` (shown unit, only when not mm), stripped before `decodeLink`
  (whose issues are shown). The link is written only after it was read (`data-ready`) and `router.isReady`.
- `KicadState` (board file info, project classes) is page state, not in the link or undo (BL94). M2.1b's trace editor
  takes a `NetClass` from `kicad.project.classes`.
- Field pattern for M2.1b: `ValField` for any `Val` (value, tolerance, source), `NumInput` for other numbers.

## Size (`size.mjs`, gzip -9)

First load of `/em-sim/main`: JS 140.7 kB in 10 chunks (438 kB raw; framework about 122 kB), CSS 4.0 kB; budget 200 /
30. The KiCad reader loads later (3 chunks, 7.2 kB). `_buildManifest.js` is not followed when listing later chunks (it
names every route's chunks). The prerendered HTML carries `references.bib` for later citations.

## Checked

The owner's carrier board shows 13 layers, 6 copper, 1.657 mm, KiCad's template εr / tanδ and the masks' missing εr as
warnings; classes `50R_SE` 0.1377 and Default 0.2 / 0.25 (clearance 0.2); the mezzanine's `LVDS_100R` 0.11 / 0.2 and
Default clearance 0.1 (C38–C43). Link round trips in a fresh context (preset, typed value, tolerance, unit; KiCad
stackup). Screenshots at 320, 390, 1440 px in both themes looked at: no overflow, labels legible, drawing to scale.

## Open questions

1. Should the unit and digits be in the link at all? The unit is (a shared link shows the same numbers); digits are not.
2. Mask εr frequency and tanδ show "not stated" for every preset; whether to offer a default frequency (1 GHz) is a
   decision for M2.1b with the results' digits.
3. The drawing is a sketch across; M2.1b's cross-section editor draws the real trace to scale both ways and may
   replace the outer-copper sketch with the chosen structure.
