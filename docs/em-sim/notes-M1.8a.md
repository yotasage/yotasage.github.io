# Notes of M1.8a – the JLCPCB stackup fetcher (2026-11-16)

## Requests found (headless Edge, fresh profile, then plain `fetch` from Node: no session needed)

- `POST https://jlcpcb.com/api/jlcTools/impedance/getLayerThickness` `{}` → `body`: layer count → board thicknesses.
  32 layer counts (2–64), 184 (layers, thickness) pairs.
- `POST …/impedance/selectPageImpedanceDefaultTemplate` `{pageNum, pageSize, plateLayerNumber, plateThickness,
  cuprumThickness, innerCopperThickness, boardType, usePurpose: 1}` → `body.list` of templates **with their layers
  inline** (`basicDataList`, top to bottom: `materialType` 1 copper foil, 0 prepreg, 2 core with its copper, 3 core
  etched bare; `dielectricThick`, `top/botConductorThick`, `dielectricConstant`, glass, resin, brand). Menu: Rigid
  (`boardType` 1) / HDI (2, assumed), outer 1/2 oz, inner ½/1/2 oz. **Leaving out thickness and copper** returns every
  template of the layer count (6 layers: 359, a superset of the 38 of 1.6 mm 1/1 oz), including weights not on the
  menu (1.5, 2.5, 3, 4 oz).

## Option space, count, duration

Mode `layers` (default): 1 + 32 + 1 (all HDI) = **34 requests, about 14 min at 2.5/min** (answers up to ~7 MB,
~160 kB gzipped). Mode `combos` (as the page): 1 + 9 × 2 + 175 × 6 = 1068, about 7 h; kept as the fallback.
Test: 6 real requests (by hand: the menu, 6 layers at 1.6 mm 1/1 oz and 6 layers in all; by fetch.mjs at 12 s: 2, 4,
8 layers): 882 templates.

## Data format (`lib/emsim/jlcpcbStackups.json`, not committed: written from the full fetch in M1.8b)

Head: `source`, `api`, `fetched` {from, to}, `converted`, `note`, `files`; `materials` by JLCPCB's key (`kind`,
`name` in English, `glass`, `resin`, `brand`, `supplier`, `cu`); `stackups` one per line: `id`, `board`, `layers`,
`thickness`, `outer`, `inner` (oz, null for 2 layers), `finished` and `tol` (from the display name), `offer`
(free/standard/special), `tg`, `note` (withdrawn, …), `noReq` (JLCPCB's "No requirement" choice), `code`,
`created`, `updated`, `stack`: `["cu", t]` or `[pp|core|bare, t, εr, material key, prepreg t before the copper fill
is counted]`. Skipped: custom placeholders, templates with a zero or negative layer (heavy copper). An id is unique
only with board, thickness, outer and inner (JLC0208 exists for 1 and 2 oz).

## 3313A and the other presets against today's API

- **JLC061611-3313A: every thickness the same** as presets.ts. εr: the centre 0.865 mm is a 0.9 mm H/H core etched
  bare with **εr 4.55** (presets.ts: 4.43 from the guide's core table, as a nameless prepreg).
- JLC06161H-3313A/-7628/-1080: centre prepreg **0.1088 / 0.2028 / 0.2028** (presets.ts 0.1164 / 0.2104 / 0.2104):
  the API now counts the fill of both inner layers next to it (before: 0.124, 0.218); the outer ones agree.
  JLC06161H-3313A is marked "duplicate stackup, do not use, to be cancelled", yet it is the "No requirement" choice.
- JLC04161H-*: thicknesses the same; core εr 4.38 (7628) and 4.42 (others), presets.ts 4.43. 06161H-2116A the same.

## For M1.8b

1. Run `npm run jlcpcb:convert` after the fetch; read its warnings (unknown material types, Chinese left, twins).
2. Check every stackup: copper count = layers, mirror symmetry where expected, pressed sum against `finished` ± `tol`,
   positive thicknesses, εr in a sane range, HDI types (none seen yet: the HDI answer is not fetched).
3. Decide the εr and centre-prepreg differences above for the 10 hand presets (JLCPCB's API is the newer source).
4. Load the file with `await import` only when the preset list opens; key by (board, id, thickness, outer, inner);
   keep the first-load budget.
