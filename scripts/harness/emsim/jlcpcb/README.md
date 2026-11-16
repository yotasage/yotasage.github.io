# JLCPCB stackup templates

Our own scripts that read JLCPCB's impedance stackup templates from the data behind its public impedance calculator
(https://jlcpcb.com/pcb-impedance-calculator) and turn them into one dated data file, `lib/emsim/jlcpcbStackups.json`.

## What is fetched

Two POST endpoints of the calculator, with only the calculator's own query parameters (no login, no cookies):

- `https://jlcpcb.com/api/jlcTools/impedance/getLayerThickness` (`{}`): the menu's layer counts and board thicknesses.
- `https://jlcpcb.com/api/jlcTools/impedance/selectPageImpedanceDefaultTemplate`: the stackup templates with every
  layer (material, thickness, εr). The page sends layers, thickness, outer and inner copper; left out, the answer holds
  every template of that layer count.

Mode `layers` (default): one request per layer count for rigid boards and one for all `boardType` 2 templates (flexible boards, M1.8b; not HDI as first assumed),
33 requests with the menu read once. Mode `combos` (`JLC_MODE=combos`): one request per menu combination as the page
makes them (layers × thickness × outer 1/2 oz × inner ½/1/2 oz), 1068 requests, about 7 h; a fallback if the short
form ever stops working.

## Rate

24 s ± 6 s between requests (2–3 a minute), doubled after a 429, a 5xx, a network error or an unusable answer, at most
5 tries per request (failures go to `failures.jsonl`), a hard limit of 8 h. A progress line every 10 requests.

## Run, resume, convert

From `scripts/harness/emsim`:

```
npm run jlcpcb:fetch               # fetch (JLC_DRY=1 prints the plan only)
npm run jlcpcb:convert             # cache → lib/emsim/jlcpcbStackups.json
```

Every answer is saved gzipped as it arrives in `scripts/harness/emsim/.cache/jlcpcb/` (git-ignored) with a
`.meta.json` (URL, body, time). A rerun skips what is cached, so stopping and starting again resumes; delete the
folder for a fresh fetch. `convert.mjs [cache] [output]` takes other folders.

Other settings: `JLC_INTERVAL` and `JLC_JITTER` (s, at least 10 s apart), `JLC_LIMIT` (requests this run),
`JLC_HOURS`, `JLC_CACHE`.
