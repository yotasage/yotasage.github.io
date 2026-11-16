# Notes of step M2.5 – release (2026-11-16)

## What changed

- **Card** on the main page (`TOOLS` in `pages/index.tsx`, category Electronics, after the Smith chart, colour
  `#2fb3a0`) with the new icon `emsim` in `components/Home/ToolIcon.tsx`: a microstrip in cross-section (plane,
  dielectric, trace) with two equipotentials around the trace ending on the plane.
- **Status note** `components/EmSim/Status.tsx` (texts in `statusText.ts`, so the harness reads them without the
  styles) replaces the status line at the top of the page, in the pattern of the Smith chart's: what works, how it is
  checked, and behind "More" what it assumes (quasi-static; the tolerances are placeholders) and what is not done yet
  (vias, 3D, full-wave, export and report). The `status` short line of whys.ts stays under it.
- **README** row, **CLAUDE.md** (the tool in the first paragraph; the EM bullet says it is released and names the
  module map files and `statusText.ts`), **modules-page.md** rows for the two files and `ui-release.mjs`.
- **Harness:** `scripts/harness/emsim/ui-release.mjs` in `npm run ui` (35 checks): the card (one link,
  title, category, description, tags, every icon shape drawn in the card's colour, after the Smith chart), followed
  to the page; the note's texts equal `statusText.ts`, "More" closed then open, above the Stackup section; no
  horizontal scroll on `/` at 320/390/1440 and on the page at 320/390, both themes. Screenshots
  `emsim-release-home-{390,1440}-{light,dark}` and `emsim-release-status-390-{light,dark}` (the main page is dark in
  both schemes). The page's `[data-status]` is also used by result readouts (`data-status="regular"`), so the note is
  `aside[data-status]`.

## Checks

`npm run check` 19 221; `npm run ui` 702 in all (667 before and ui-release's 35); first load 175.4 kB gzip (174.8 before: the note and its texts).
The drag and field budget NOTEs at 4× CPU are the known ones (BL99, BL101), not new.

## For the main session: what to try first (owner checkpoint 1)

1. The card on `/` on the phone, then the status note's "More".
2. The owner's own boards: open `ARTI-CARRIER-PICO2.kicad_pcb` and `.kicad_pro` (OneDrive, `ULDAC/PCB`) and check
   `50R_SE` (about 51.4 Ω on the board's own stackup) and `LVDS_100R` (Zdiff about 103.6 Ω), notes-M2.1b.md.
3. The same classes on the JLCPCB stackup the board is ordered on (the picker), against JLCPCB's online calculator
   with "as JLCPCB's calculator" in the Calculators tool.
4. Type real tolerances for the board house before trusting the Tolerance tool's band (BL81).
