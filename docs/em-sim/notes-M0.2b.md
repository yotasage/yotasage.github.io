# Notes from M0.2b – JLCPCB, KiCad fields, the owner's cases (2026-11-16)

## What was done

- [facts-fab.md](facts-fab.md) (new; facts.md §10–§11 point to it, facts.md would have passed 40 kB): JLCPCB's stackup
  naming, JLC061611-3313A from JLCPCB's own API data, common 2/4/6-layer stackups, εr per prepreg and by core
  thickness, copper, mask, trapezoid, spacing, sheet form, tolerance, what is not documented; KiCad's board file
  versions per release, the `(stackup …)` tokens by version, KiCad's default εr, the `.kicad_pro` net-class fields and
  schema versions. Every JLCPCB number with its URL, read 2026-11-16.
- [facts-cases.md](facts-cases.md): C38–C45 (stackup vs 3313A, `50R_SE` on F.Cu and B.Cu, `LVDS_100R` on F.Cu and B.Cu,
  the default pair, the carrier's via, the mezzanine's via pair with its six GND vias), JLCPCB's numbers for them, the
  validation table (rows for C39–C45 and the exact stripline and CPW cases) and the inputs for the owner. 45 cases.
- facts.md: §5 says what JLCPCB reports; §9 restated with JLCPCB's numbers; §10–§11 point to facts-fab.md.
- [sources.md](sources.md) "JLCPCB and KiCad"; 9 new `references.bib` entries (70 in all, parsed by `lib/bibtex.ts`, no
  duplicate keys).

## How

Boards read where they are with a scratch Python script (venv in the session's scratch folder, nothing kept): stackup
and setup by line ranges, net classes from the `.kicad_pro` JSON, tracks, vias, footprint pads and filled zones parsed
from the `.kicad_pcb` top-level items. The xlsx sheets with openpyxl, the `.msg` emails with extract-msg (only the
engineering sentences were printed). JLCPCB's pages through a page-reading tool and two Haiku sub-agents; JLCPCB's API
data from the public GitHub repository `GsuberlandStackups`; KiCad's source files downloaded per release branch and
searched with grep. Hammerstad–Jensen values from a short script that reproduces C37 to 10 digits.

## Findings later steps must know

- **The owner's KiCad stackup is JLC061611-3313A**, layer for layer (KiCad merges 1080 + 0.865 + 1080 into one
  1.003 "prepreg"); JLCPCB's email says **3313G**, which no reachable source lists. All 3313 variants A–D have 0.092 mm
  of 3313 (εr 4.1) between L1 and L2, so the owner's microstrips are the same on any of them.
- **JLCPCB's εr have no stated frequency** and no loss tangent. M1.1's presets store them as JLCPCB states them, with a
  "frequency not stated" flag, not as 1 GHz values.
- **Two outer copper numbers:** 0.035 mm in the stackup, 1.6 mil (0.0406 mm) in the calculator's parameter table
  (0.5 Ω on C39). The preset keeps both (finished thickness for the stackup, the calculator's for a "JLCPCB calculator"
  comparison mode).
- **Trapezoid:** top = base − 0.7 mil, a fixed offset, not an etch factor: engine.md §2's "etch offset per side" fits
  (0.35 mil per side); widths in the sheet are taken as the base width.
- **Mask:** 1.2 mil on laminate, 0.6 mil over copper, 1.2 mil between traces, εr 3.8: D8's three thicknesses exactly.
- **Zdiff:** JLCPCB documents no definition, but only symmetric pairs are offered, so all definitions agree.
- **KiCad reader (M1.1):** accept 6.0–10.0 tokens and ignore unknown ones (`spec_frequency`, `dielectric_model` in 11.0
  development); a mask has no εr unless it has a material; εr 4.5 or 4.3 with tanδ 0.02 and "FR4" on every layer is a
  placeholder; net classes from `.kicad_pro` (schema 2–5), fields of non-default classes fall back to `Default`;
  membership by `netclass_patterns` (regular expressions allowed). Antipads and pour clearances come from `.kicad_dru`
  custom rules on the owner's boards (0.6 mm to GND for `50R_SE` nets, 0.5 mm from the hole for the LVDS via pads),
  which phase 1 does not read: the via editor must let the visitor type them.
- **The owner's LVDS vias are a footprint** (`LVDS:Via_100R`: two pads plus six GND vias and keep-out zones), not
  board vias: a phase-2 board import must read footprint pads as vias.

## Not reached (two or three tries each, then stopped)

- JLCPCB's online calculator (a JavaScript app; nothing to fetch).
- Any page listing JLC061611-3313G.
- **JLCPCB's engineers' tables** in both order emails: images on JLCPCB's server under order-specific addresses; not
  fetched, to keep order details off outside requests.
- Frequency of JLCPCB's εr; the NP-155F datasheet was not read.

## Open questions for the owner

1. Run JLCPCB's calculator and Saturn with the inputs in facts-cases.md ("Inputs for the owner") and type the numbers
   into the validation table (or send them to a later step).
2. Open the two JLCPCB replies and note their tables: the carrier's adjusted width (and spacing, impedance) per row;
   for the mezzanine, which numbers differed from the online calculator although the email said "unchanged".
3. Is 3313G the same as 3313A? The order page or the calculator shows 3313G's layer table.
4. Do JLCPCB's sheet widths mean the base (bottom) width? (Assumed yes.)
5. 8.7 mm of `50R_SE` track on B.Cu has GND pour nearer than 0.6 mm (down to 0.2 mm): intended (at pads)?
