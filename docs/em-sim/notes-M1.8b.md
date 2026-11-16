# Notes of M1.8b – JLCPCB's stackups as data (2026-11-16)

## The data (`lib/emsim/jlcpcbStackups.json`, committed)

From the 33 cached answers of the M1.8a fetch (all of 2026-11-16): 1577 templates → **1203 rigid stackups**:
2L 22, 4L 222, 6L 299, 8L 192, 10L 114, 12L 78, 14L 45, 16L 39, 18L 28, 20L 14, 22L 12, 24L 10, 26L 13, 28L 12,
30L 13, 32L 17, 34L 10, 36L 8, 38L 8, 40L 7, 42L 7, 44L 7, 46L 5, 48L 4, 50L 4, 52–58L 2–3 each, 60/62/64L 1 each.
Offer: special 734, standard 98, free 77, none named 294; 90 are a "No requirement" choice; 63 hold a core etched bare;
117 materials.

Skipped: 219 custom placeholders, 90 "No requirement" rows (folded into their twin as `noReq`), **34 flexible
templates**, 25 heavy-copper templates (4 oz: the 106 prepreg next to the copper is −0.0185 mm after JLCPCB's fill
accounting; BL97). **No HDI**: `boardType` 2, which M1.8a took for HDI, is flex (FPC…, polyimide, adhesive, coverlay:
material types 4–6); the model has no coverlay yet (BL96). The fetch found no request for HDI templates.

Converter fixes: flex left out by board type (was "unknown material type 6" ×34); a finished thickness without "mm"
("成品板厚2.98") read; ids with a bracketed remark ("JLC18302H-2116B(通用推荐)" → offer standard,
"JLC30401H1-2313A(内层铜不一致)" → note "inner copper weights differ") cleaned, so every id is `[A-Za-z0-9.-]`;
6 twins (same key and layers) merged.

**Size: 891 952 bytes, 49 kB gzipped**; one stackup per line, no shortening needed (limit about 3 MB).

## `lib/emsim/jlcpcb.ts` and the conventions

`jlcStackup(entry, data)` builds with the same functions as presets.ts (`jlcCopper`, `jlcDielectric`, `jlcMask`,
`jlcFinish`, exported from presets.ts so the two cannot drift): thicknesses as pressed and εr from the entry (ref
**A**, `https://jlcpcb.com/pcb-impedance-calculator`, date = `fetched.to`), mask 1.2/0.6/1.2 mil at εr 3.8 (U1), etch
0.35 mil per side for every weight (U2 says top = base − 0.7 mil, independent of thickness), cores etched bare
as cores.

**Copper rule:** `t` is the API's thickness as pressed for every weight (outer 1 oz 0.035, 2 oz 0.07, 3 oz 0.103,
1.5 oz 0.0525; inner ½ oz 0.0152, 1 oz 0.03, 2 oz 0.061, 3 oz 0.103; 2-layer boards 0.03 for 1 oz). `calc` (the
calculator's own thickness) only where U2 states one: outer 1 oz 1.6 mil, inner 0.0152 → 0.6 mil, 0.03 → 1.2 mil;
null otherwise (U2 states none for 2 oz and up; facts-fab.md §1.6: "not supported by the calculator").

## Hand presets moved onto the API (old → new)

| Preset | Change |
|---|---|
| JLC061611-3313A | centre 0.865: prepreg "not named" εr 4.43 → core etched bare (0.9 mm H/H) εr **4.55** |
| JLC04161H-7628 | core 1.065 εr 4.43 → **4.38** |
| JLC04161H-3313/-1080/-2116 | core 1.265 εr 4.43 → **4.42** |
| JLC06161H-3313A | centre 2116 0.1164 → **0.1088**; name says JLCPCB marks it to be withdrawn, yet it is the "No requirement" choice |
| JLC06161H-7628/-1080 | centre 7628 0.2104 → **0.2028** |
| JLC06161H-2116A | centre 0.7: prepreg "not named" → core etched bare (εr 4.53 unchanged) |
| JLC-2L-1.6 | now JLCPCB's JLC0216: copper 0.035 → **0.03**, core 1.53 εr 4.5 (U3) → **1.43 εr 4.42**; id kept for old links |

Pressed sums: 06161H-3313A 1.546 → 1.5384, -7628 1.562 → 1.5544, -1080 1.594 → 1.5864, 2L 1.6 → 1.49 (check-stackup's
`PRESSED`, the only old expectations changed; also its 3313A layer string and the centre-layer note, `coreEr` removed
with the guide's tables, no longer used). Every thickness and εr cites A; `refUrl('G', id)` still gives the former
GsuberlandStackups file for old links. `PRESET_KEYS` names each preset's entry.

**Cases:** C39/C40 (51.50 Ω) and C41/C42 (103.36 Ω) do not move (outer prepreg unchanged). The via cases do (the
barrel crosses the 0.865 centre, εr 4.43 → 4.55): C44 barrel 60.51 → 59.71 Ω, section 50.49 → 50.23 Ω; C45 barrel
Zdiff 93.47 → 92.23 Ω, section 83.99 → 83.49 Ω, and a 100 Ω section is now out of the antipad's range (99.88 Ω at
Ø3.27; was Ø3.14). Rows C38, C44, C45 of facts-cases.md updated with the old values.

## Checks (`check-jlcpcb.mjs`, 11 172 checks; `npm run check` 18 564 in all, all pass; `npm run ui` 117, first load 151.2 kB gzip)

Every entry: no `stackupIssues`, copper count = layers, positive thicknesses, εr 3.5–5 (FR-4 family; data 3.88–4.59),
every number cites JLCPCB with the fetch date, keys unique and link-safe, mirror symmetry kept where the data is
symmetric (31 entries are not: mixed copper weights, special structures); every hand preset equal layer by layer
(kind, id, name, role, material, t to 1e-9, εr, calc, etch, mask, refs).

**Pressed sum vs finished ± tol:** all 1181 stackups of 4 layers and more within (a failure otherwise). 15 of the 22
2-layer templates miss, against the nominal ±10 % since they state no finished thickness: JLCPCB keeps one 1.43/1.36
/1.63 mm core for several board thicknesses (JLC0232A, 3.2 mm, 2 oz: 1.482 mm; JLC0204A, 0.4 mm: 1.5 mm). That is
JLCPCB's data, not the conversion; the 2-layer board's core is not what its impedance depends on most, but M1.8c
should show the sum next to the nominal for these.

## For M1.8c

- Load with `const data = (await import('../../lib/emsim/jlcpcbStackups.json')).default as unknown as JlcData` only when
  the picker opens (tsconfig has `resolveJsonModule`; a `// @ts-expect-error` may still be needed as for our own dynamic
  imports). Expect a chunk of about 0.85 MB, **~50 kB gzipped**; jlcpcb.ts itself is ~2 kB and may be in the
  first load.
- Key: `jlcKey(e)` = `board_id_thickness_outer[_inner]`, e.g. `rigid_JLC061611-3313A_1.6_1_1`, `rigid_JLC0216_1.6_1`;
  `jlcStackup` sets `Stackup.id` and every source's `id` to the key, so the link can carry a list stackup by its key
  (`jlcFind`) and tell it from a hand preset (hand ids have no `_`).
- Helpers: `jlcFilter`/`jlcMatch` (board, layers, thickness, outer, inner, offer incl. `'none'`, `withdrawn: false`),
  `jlcValues` (menu values), `jlcGroup`, `jlcSort` (hand presets first via `PRESET_KEYS`, stable), `jlcName`.
- Show `offer`, `noReq`, `note` (withdrawn, special structure, inner copper weights differ) and `finished ± tol`.
