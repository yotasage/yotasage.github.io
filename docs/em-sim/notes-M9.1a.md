# Notes from step M9.1a – access in Edge

Done 2026-11-17. M9.1 was split (milestones.md): this step is access in Edge (keyboard, touch, names and roles,
contrast, reduced motion, 200 % zoom); M9.1b is the page in Firefox and WebKit. The check is
`scripts/harness/emsim/ui-access.mjs` in `npm run ui` (206 checks, about 2 minutes; `EMSIM_ACCESS_ONLY=` with
`audit,tab,keys,live,touch,motion,layout,shots` runs parts). It follows the Smith chart's `ui-a11y.mjs`
(docs/smith-chart/notes-M9.1.md): the same token table, page scan, accessibility-tree audit, Tab cycle, reduced-motion
and layout checks, adapted; no new dependency (axe-core is not in the repo; the checks are our own).

## Findings and fixes

| Kind | Found | Fix |
| --- | --- | --- |
| Contrast, field edges | Text fields and selects outlined in `--rule-strong` (1.55:1 light, 1.86:1 dark), the tolerance fields in `--rule` (1.21 / 1.30). `--edge` was on hover only, and 2.77 / 2.67 on `--raise`. | `.input`, `.select` and the stackup's `.tol` are outlined in `--edge` (hover `--ink-3`); `--edge` `#8c8169` light (3.17 on raise), `#888880` dark (3.19). Buttons keep `--rule-strong` (their text names them), as on the Smith chart. |
| Contrast, text token | `--air-ink` light 4.29 on `--air`, 4.10 on `--raise` (the stackup drawing's "air" labels). | `#596a79` (4.81 on air). |
| Contrast, drawing | Dark theme: the copper's edge `--copper-edge` 1.91:1 on prepreg, 2.77 on core, so a trace's outline was lost in the laminate. | Dark laminate darker: `--prepreg` `#716745`, `--core` `#625836` (copper edge 3.13 / 3.93), `--laminate-edge` `#8a7d52` so layers still part. The 3D view takes the same tokens. |
| Contrast, handles | Light: a drawing handle's dot (accent with a white edge) 2.85:1 where it sits on copper seen through laminate (the pair's top antipad handle). | A token `--handle` (`#08574e` light, the accent in dark) for `.handleDot`'s fill: ≥ 3:1 on every surface the handles sit on. |
| Keyboard | The via's 3D view could be turned only by a pointer. | `[data-via3d-host]` is a Tab stop: arrows turn, + and − zoom, Home or 0 resets (as the Waves section's 3D view). |
| Keyboard, focus | Cancel of a full-wave run disappears when the run is cancelled or ends: the focus fell to the page's body. | The focus goes to Run (cancel, and an effect when the phase leaves running while Cancel had it). |
| Keyboard, focus | At 390 px and at 200 % zoom the bar has two rows (88 px) but anchors and focused controls scrolled to 52 + 8 px, under the bar (WCAG 2.4.11). | `html { scroll-padding-top }` 52 px, 88 px below 860 px (pages/em-sim/main.tsx); the sections', topics' and examples' `scroll-margin-top` is 8 px on top of it; `--bar-h` is 88 px there. |
| Keyboard, focus | At 390 px the focused section link in the bar lost its ring's top and bottom (the scrolling row clips it). | Below 860 px the bar links' ring is drawn inside the link (`outline-offset: -2px`). |
| 200 % zoom | At 1440 px with 200 % zoom (720 CSS px) the bar was 825 px wide: the page scrolled sideways and the theme switch was off screen. | The section links go to the bar's second row below 860 px (was 480 px). |
| Names | The Theory and References regions were named by headings inside a `content-visibility: auto` section (unnamed while off screen, as the Smith chart found). | `aria-label` "Theory", "References". |
| Live regions | The plots' readouts and the probes were `aria-live` on the visible text, so a hover or a drag read a value per move; the results' "Updating…" flipped on every drag frame; a full-wave run's progress line ("Excitation 1 of 2, step …") was live and changed with every message; the JLCPCB count per keystroke; the sweep's "Sweeping: n of N". The results themselves were not announced at all. | `Calm.tsx`: a hidden `role="status"` that speaks once its owner has rested for 800 ms, never its first text, and with `within` only when the visitor acted inside that section. The results (Z0, εeff, delay of the trace; the via's first values) are spoken once after an edit; a run says "Running on the GPU." (when a pause lets it settle) and "Done in …"; the visible texts are no longer live. |
| Touch targets | The theory's contents links were 19 px lines touching each other; the numbers that open an equation 19–22 px tall, one (a matrix value) beside a "→ theory" link; the player's time slider 16 px. | Contents links 3 px padding (25 px), equation numbers 3 px padding with −3 px margin (25 px, the same line box; `button.eqNum[data-eq-open]` to beat `.root button`), the slider 24 px. |
| Reduced motion | The 3D views glided on after a drag (OrbitControls damping). | No damping under `prefers-reduced-motion: reduce` (via3dRender.ts, both views). The existing rule already stopped transitions, the `:target` flashes and the player's autoplay. |

Kept as they were, after checking: every Tab stop showed its focus already (the page's `:focus-visible` ring; the
handles' ring and the outline around the handle with its label); the bar's section links work as skip links (Enter,
then Tab is in the section); the derivation is a native modal `<dialog>` (Tab stays in it, Escape gives the focus back
to Derivation, a second Escape closes the panel back to the number); toggles had `aria-pressed`, handles and sliders
their value text; headings one h1, no level skipped; landmarks banner, navigation, main, contentinfo.

## The contrast table (after)

| Kind (need) | Light | Dark |
| --- | --- | --- |
| text on bg, field, raise (4.5) | `--ink-3` on raise 4.56 | `--ink-3` on raise 4.57 |
| text on accent-soft (4.5) | `--accent` 5.10 | `--ink-2` 5.51 |
| pressed toggle (4.5) | `--accent-ink` on accent 6.48 | 8.04 |
| drawing labels on air (4.5) | `--air-ink` 4.81 | 5.50 |
| plot series and marks (3) | `--copper` on field 3.38 | `--mask` on field 3.55 |
| focus ring (3) | `--accent` on raise 5.34 | 6.29 |
| form-field edge (3) | `--edge` on raise 3.17 | 3.19 |
| copper edge on laminate (3) | on core 3.88 | on prepreg 3.13 |

On the page: about 34,000 visible texts (both setups, both themes, every section loaded and every `<details>` open,
SVG text over the shapes under it), 594 field edges, 80 plot lines and handles, all at AA. Colour maps are exempt;
their labels carry a halo and are scanned over it.

## Touch targets (390 px)

None under 24 px and crowded after the fixes (1,236 targets counted in two states). Under 24 px but spaced (allowed by 2.5.8), 7 of 599, listed by the script: the
status note's "More" (49 × 21), the via's ΣΔC number "90" (15 × 22), five example step links (20 px tall); inline links in
sentences ("→ theory", citations) are exempt.

## Tasks × keyboard / touch

21 tasks, each by keys alone (Tab, Enter, Space, arrows, Escape, typing) at 1440 px and by touch at 390 px (taps and
CDP touch drags), all pass: the switches (theme, short lines), More, units, a stackup value (typed, undo and redo by
the buttons and Ctrl+Z), a JLCPCB pick, the trace's kind and width with the results, a trace handle, the fields and
the probe, an equation and its derivation dialog, a sweep and its plot cursor, a short line's link and Back, a via
handle, a return via added, moved and deleted, both 3D views opened and turned, a full-wave run cancelled and run, the
player (play, pause, End, Home, a tap at ¾), a figure, a data file and Print report, an example and undo, a citation,
the bar's section link. The deeper checks of each stay in their scripts (ui-viadrag, ui-player, ui-equations, …).

## Live regions (what is said)

A width dragged for a second: once (the trace's results); a key step: once; a probe swept: once; a via pad dragged:
once or twice (the via's results); a plot's cursor swept: once per plot sharing it (TDR and TDT); a full-wave run:
one or two ("Running…", "Done in …"); the player playing two seconds: nothing.

## Budgets

First load 187.2 kB gzip (186.7 before; Calm.tsx). The changes are CSS values, one hidden region per result and a
timer per render of its owner, none on a drag's per-frame path (no new work per pointer move beyond restarting a
`setTimeout`). ui-drag at 1× (microstrip work p95 0.70 ms, pair 0.80, cpw 0.90; no dropped frames) and ui-viadrag at 1× (p95 1.0–1.1 ms, budget 8) pass as before; ui-player and ui-waves3d keep theirs. `npm run ui`: 25 of 25 scripts pass; Tab cycles of 604 (1440 px) and 603 (390 px) stops.

## For M9.1b and later

- Firefox and WebKit: run `ui-access.mjs` there too (its parts take a `browser`; Playwright's `firefox` and `webkit`
  need their own downloads). `Calm`'s `innerText` and `:focus-visible` on SVG `g` elements are the places to watch;
  the CDP touch helper and `Accessibility.getFullAXTree` are Chromium only (use `page.touchscreen` and
  `page.accessibility.snapshot()` there).
- Not tried with a real screen reader (BL190). No "↩ Back" link after a short line's link (BL191).
- docs/em-sim/modules-page.md is at 39.7 kB: split before the next row (BL192).
