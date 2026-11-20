# Site sharing and discoverability – plan

Make https://yotasage.github.io/ effortless to share with colleagues, students, and engineering communities, and easy to
discover through search — while keeping every core principle intact: **no server, no ads, no tracking, self-hosted
assets only, built for the owner's own use and published as-is**.

Drafted 2026-11-20. Where this plan and [CLAUDE.md](../../CLAUDE.md) or [agent-workflow.md](../agent-workflow.md)
disagree, those two win.

---

## Goal

Today the site assumes the visitor is the owner: someone who already knows what each tool does and already has a Gerber
ZIP, KiCad board, or STEP file ready to drop in. When a link is pasted into Discord, Slack, Teams, Reddit, Hacker News,
or a university forum, it unfurls as a bare text link with no preview image (and often no description), and file-driven
tools open to an empty drop zone.

After this project:

1. **Rich link previews everywhere.** Every page has a descriptive `<title>`, accurate `<meta name="description">`,
   `<link rel="canonical">`, Open Graph (`og:*`), and Twitter/X Card tags backed by crisp static `1200×630` preview
   images under `public/og/`.
2. **One-click live demos for file-driven tools.** The PCB viewer and 3D viewer offer a subtle *"Try an example…"* button
   inside their drop zone that loads a tiny, self-hosted, 100%-original sample file so visitors on a phone or without a
   file on hand can try the tool immediately.
3. **Search engine discoverability.** `public/robots.txt` and `public/sitemap.xml` expose every static route with clean,
   accurate titles and descriptions.
4. **Scannable landing page and visual README.** [pages/index.tsx](../../pages/index.tsx) has tight, balanced card copy
   and clear grouping; [README.md](../../README.md) shows the flagship tools visually near the top.
5. **Low-pressure feedback channel.** [components/SiteFooter.tsx](../../components/SiteFooter.tsx) links to GitHub Issues
   with lightweight templates so outside users can report edge-case bugs without creating support expectations.
6. **Practical sharing playbook.** A short, non-spammy guide (`docs/sharing/channels.md`) covers pre-share checks and
   where each flagship tool fits best (Show HN, subreddits, engineering forums, search consoles).

---

## Ground rules

- **All hard constraints of [CLAUDE.md](../../CLAUDE.md) apply:** static export only, no API routes, no server-side
  dynamic OG image generation, no CDN fonts/scripts/images, no analytics or tracking.
- **Never break existing URLs.** Keep all current routes (`/pcb-viewer/main`, `/smith-chart/main`, `/em-sim/main`, etc.)
  and all URL-encoded tool state query strings intact.
- **Zero private files or licence risk.** Sample files in `public/samples/` and screenshots in `public/og/` must be
  **100% synthetic / self-made** (or demonstrably CC0/MIT with notices on `/licenses`). Never copy or screenshot any of
  the owner's private boards, 3D models, or eSIMs from OneDrive or `Downloads`.
- **Zero extra bytes on initial load for samples.** Built-in sample files are fetched from `/samples/...` only when the
  user clicks the example button.
- **Keep the site's honest tone.** Friendly, plain, brief, no marketing superlatives, and never quoting or paraphrasing
  the owner's private remarks ([CLAUDE.md](../../CLAUDE.md)).
- **Phone width (320 px+) and keyboard/touch access** work for every UI addition.
- **No new runtime dependencies** in `package.json`.

---

## Current state (audited 2026-11-20)

### 1. Page `<Head>` metadata

| Route | Source file | Current `<title>` | Current `<meta name="description">` | OG / Canonical |
| --- | --- | --- | --- | --- |
| `/` | `pages/index.tsx` | `Tools · yotasage` | Short generic line | None |
| `/licenses` | `pages/licenses.tsx` | `Licenses` | Missing | None |
| `/simsetup/main` | `pages/simsetup/main.tsx` | `Simulator setup tool` | Missing | None |
| `/qrcode/main` | `pages/qrcode/main.tsx` | `QR code generator` | Missing | None |
| `/qr-reader/main` | `pages/qr-reader/main.tsx` | `QR code reader` | Present (short) | None |
| `/pdf/main` | `pages/pdf/main.tsx` (via `components/PdfTools/ToolPage.tsx`) | `PDF tools` | Missing | None |
| `/pdf/merge` | `pages/pdf/merge.tsx` (via `ToolPage.tsx`) | `Merge PDF` | Missing | None |
| `/pdf/compress` | `pages/pdf/compress.tsx` (via `ToolPage.tsx`) | `Compress PDF` | Missing | None |
| `/pdf/images-to-pdf` | `pages/pdf/images-to-pdf.tsx` (via `ToolPage.tsx`) | `Images to PDF` | Missing | None |
| `/pdf/remove-metadata` | `pages/pdf/remove-metadata.tsx` (via `ToolPage.tsx`) | `Remove metadata` | Missing | None |
| `/base64-image/main` | `pages/base64-image/main.tsx` | `Base64 image converter` | Missing | None |
| `/text-case/main` | `pages/text-case/main.tsx` | `Text case converter` | Missing | None |
| `/3d-viewer/main` | `pages/3d-viewer/main.tsx` | `3D viewer` | Missing | None |
| `/pcb-viewer/main` | `pages/pcb-viewer/main.tsx` | `PCB viewer` | Missing | None |
| `/resistor/main` | `pages/resistor/main.tsx` | `Resistor lookup` | Present (good, slightly long) | None |
| `/smith-chart/main` | `pages/smith-chart/main.tsx` | `Smith chart` | Present (long, ~480 chars) | None |
| `/em-sim/main` | `pages/em-sim/main.tsx` | `EM simulation` | **Stale** (early phase 1 text; omits 2D field solver, vias, 3D, WebGPU FDTD) | None |

### 2. Static public assets & entry points

- `public/` currently contains only `favicon.ico`, `home.svg`, and the git-ignored tool asset folders (`pdfjs/`, `3d/`,
  `qr/`). There is no `robots.txt`, no `sitemap.xml`, no `og/` images, and no `samples/`.
- **Drop zones without built-in samples:**
  - PCB viewer: `components/PcbViewer/PcbViewer.tsx` (`<DropZone onFiles={setFiles} ...>`)
  - 3D viewer: `components/Viewer3D/Viewer3D.tsx` (`<DropTarget onFiles={setFiles} ...>`)
  - (Smith chart, EM simulation, Resistor lookup, QR generator, Simulation setup, and Text case already open in a live
    working state.)
- **Home page (`pages/index.tsx`):** Flat list of 11 cards. Older cards have 1-sentence descriptions and 3–6 tags;
  newer cards (PCB viewer, Resistor lookup, Smith chart, EM simulation) have multi-sentence paragraphs and up to 12 tags.
- **Footer (`components/SiteFooter.tsx`):** Currently renders `Licenses · GitHub`.
- **README (`README.md`):** Text-only; no screenshots of any tool.

---

## Decisions to confirm before starting

Ask the owner quickly at the start of the session (or proceed with the recommended defaults if the owner says "go"):

| # | Question | Recommended default |
| --- | --- | --- |
| D1 | Branch name and merge strategy? | Branch `sharing` off `main`, one commit per step, merge to `main` when ready (do not push until asked). |
| D2 | Source of built-in sample files for PCB viewer and 3D viewer? | Generate small, clean, 100%-original synthetic files (a 4-layer `.kicad_pcb` with components/pours/cutout, and a mechanical `.stl` or `.step` bracket/enclosure) — zero licence or privacy risk, < 150 kB each. |
| D3 | Home page layout in `pages/index.tsx`? | Tighten descriptions to 1–2 sentences and group into clear categories (*Electronics & RF*, *3D & Documents*, *Codes & Utilities*) with balanced tag counts. |
| D4 | Issue templates & footer feedback link? | Add `Report an issue` to `SiteFooter.tsx` + one short `.github/ISSUE_TEMPLATE/feedback.md` reminding users not to attach private files and stating the site is provided as-is. |

---

## Steps

Sized so each step fits comfortably in a single agent under ~200k tokens ([agent-workflow.md](../agent-workflow.md)).

Status: ✅ done · 🔄 in progress · 📋 planned

| Step | Scope | Status | Commit |
| --- | --- | :-: | --- |
| S1 | Shared `PageHead` metadata, canonical URLs, `robots.txt` and `sitemap.xml` | 📋 | — |
| S2 | Static `1200×630` Open Graph preview images (`public/og/`) wired into every page | 📋 | — |
| S3 | One-click built-in sample files for PCB viewer and 3D viewer (`public/samples/`) | 📋 | — |
| S4 | Home page scannability, `SiteFooter` feedback link, and GitHub issue template | 📋 | — |
| S5 | Visual `README.md` and `docs/sharing/channels.md` sharing playbook | 📋 | — |

---

### S1 – Shared `PageHead`, canonical URLs, `robots.txt` and `sitemap.xml`

**Files to create / edit:**
- Create `components/PageHead.tsx` — shared `<Head>` wrapper taking:
  - `title`: page title (formats `<title>{title} · yotasage</title>` or exact title for home)
  - `description`: concise 110–160 char meta description (accurate for search snippets & social cards)
  - `path`: route path starting with `/` (e.g. `/pcb-viewer/main`), used to build canonical and `og:url` against
    `const SITE_ORIGIN = 'https://yotasage.github.io'`
  - `ogImage?`: relative path under `/og/...` (defaults to `/og/home.png`; wired to real images in S2)
  - `ogAlt?`: alt text for `og:image:alt`
  - `themeColor?`: optional `<meta name="theme-color">`
  - `noIndex?`: optional `<meta name="robots" content="noindex">` (not needed for tools; optional for `/licenses`)
  - Emits: `<title>`, `<meta name="description">`, `<link rel="canonical">`, `<link rel="icon" href="/favicon.ico">`,
    `og:site_name` (`yotasage.github.io`), `og:type` (`website`), `og:title`, `og:description`, `og:url`, `og:image`,
    `og:image:width` (`1200`), `og:image:height` (`630`), `og:image:alt`, `twitter:card` (`summary_large_image`),
    `twitter:title`, `twitter:description`, `twitter:image`.
- Update every page in `pages/` and `components/PdfTools/ToolPage.tsx` (passing `description` and `path` props) to use
  `PageHead`. Specifically update:
  - `pages/em-sim/main.tsx` — replace stale stackup-only description with accurate 2D field solver + via 3D + WebGPU FDTD
    description.
  - `pages/pcb-viewer/main.tsx`, `pages/3d-viewer/main.tsx`, `pages/qrcode/main.tsx`, `pages/base64-image/main.tsx`,
    `pages/text-case/main.tsx`, `pages/simsetup/main.tsx`, `pages/licenses.tsx`, and all 5 PDF pages — add crisp,
    accurate descriptions and descriptive titles.
  - `pages/smith-chart/main.tsx` and `pages/resistor/main.tsx` — trim meta descriptions to ~150–160 chars so search
    engines and social cards do not truncate mid-sentence.
- Create `public/robots.txt`:
  ```text
  User-agent: *
  Allow: /

  Sitemap: https://yotasage.github.io/sitemap.xml
  ```
- Create `scripts/generate-sitemap.mjs` and wire it into `package.json` `postinstall` (or run on demand and commit
  `public/sitemap.xml`; **prefer `postinstall` + `.gitignore` entry for `/public/sitemap.xml`**, matching
  `collect-licenses.mjs`, so CI always builds a fresh sitemap whenever a new page is added under `pages/`). Exclude
  `_app.tsx`, `_document.tsx`, `404.tsx`.

**Done when:**
- `npx tsc --noEmit` and `npm run build` pass cleanly (`git checkout -- next-env.d.ts` after).
- Running `node scripts/generate-sitemap.mjs` produces valid XML listing all 17 routes under `https://yotasage.github.io`.
- Built HTML (or live `next start` output) for `/`, `/pcb-viewer/main`, `/em-sim/main`, `/smith-chart/main`, and
  `/pdf/merge` contains expected `<title>`, `<meta name="description">`, `<link rel="canonical">`, `og:*`, and
  `twitter:card` tags with no duplicates.

---

### S2 – Static Open Graph preview images (`public/og/`)

**Scope:**
Create crisp, readable `1200×630` PNG social preview cards under `public/og/` (committed to git — they are static site
assets, not generated from `node_modules`):

| File | What it shows | Used by |
| --- | --- | --- |
| `public/og/home.png` | Clean shot of the landing page header + top tool cards | `/`, `/licenses`, and fallback |
| `public/og/pcb-viewer.png` | Realistic board render of the synthetic sample PCB (can use S3's sample or run S3 before S2!) | `/pcb-viewer/main` |
| `public/og/em-sim.png` | Cross-section field map + impedance readout (or 3D via / FDTD wave slice) on a clean preset | `/em-sim/main` |
| `public/og/smith-chart.png` | Matching network arcs + markers + live readout on the Smith chart | `/smith-chart/main` |
| `public/og/resistor.png` | Axial / SMD resistor drawing + E-series table or divider design view | `/resistor/main` |
| `public/og/3d-viewer.png` | Synthetic 3D sample model rendered in the viewer (with section plane or dimensions) | `/3d-viewer/main` |
| `public/og/qr-tools.png` | QR code generator/reader showing a clean decoded symbol | `/qrcode/main`, `/qr-reader/main` |
| `public/og/pdf-tools.png` | PDF tools hub tiles | `/pdf/*` |

*(Note: Running **S3 before S2** makes capturing `pcb-viewer.png` and `3d-viewer.png` trivial because the built-in
example buttons already exist! Feel free to swap S2 and S3 order when executing.)*

**How to produce them:**
- Start `next start` locally and capture via headless Edge/Playwright (already available in the existing harnesses under
  `scripts/harness/`) at `1200×630` viewport (or `2400×1260` downscaled cleanly to `1200×630`).
- Keep text legible even when scaled down to a 400 px Discord/Slack embed; avoid tiny dense tables as the main focal
  point — **make the visual (PCB, chart, fields, 3D model) the hero**.
- Optimize PNG size (target ≤ 200 kB per image; ≤ 1.5 MB total across `public/og/`).
- Wire each `ogImage` and `ogAlt` into `PageHead` on its respective page.
- Visually inspect every generated PNG before committing.

**Done when:**
- Every `ogImage` referenced by any page exists in `public/og/`, is exactly `1200×630`, is visually verified, and contains
  zero private user data.
- `npx tsc --noEmit` and `npm run build` pass.

---

### S3 – One-click built-in sample files for PCB viewer and 3D viewer

**Scope:**
Let first-time visitors try the two file-driven viewers in one click without needing their own files.

1. **Create clean, self-made sample files in `public/samples/`:**
   - `public/samples/example-board.kicad_pcb` (target < 150 kB): A clean, valid KiCad 9 `.kicad_pcb` designed from scratch
     (e.g., a small 4-layer USB-C / sensor breakout or RF filter demo board) containing:
     - Board outline with rounded corners + one internal slot/cutout and 4 mounting holes
     - Recognizable footprints (IC/QFN, SMD resistors/capacitors, pin header, test points) with clean silkscreen
     - Named nets (e.g. `GND`, `+3V3`, `SIG_P`, `SIG_N`) with routed tracks, vias, and filled copper zones on inner/outer
       layers
     - Stackup colours (green or dark solder mask, ENIG finish, white silkscreen) so both layer view and realistic view
       look great
     - Validated by loading into the PCB viewer (and `kicad-cli` if available on the machine) with zero parser errors.
   - `public/samples/example-part.stl` or `example-part.glb` / `example-part.step` (target < 150 kB): A clean, watertight,
     self-generated 3D mechanical part (e.g., a small flanged mounting bracket or vented enclosure half with bolt holes,
     ribs, and chamfers) so Orbit, Section view, Measure, and Size/Area/Volume stats all produce meaningful, clean results.
2. **Wire the buttons into the drop zones:**
   - In `components/PcbViewer/PcbViewer.tsx`: add a secondary button inside `<DropZone>` (e.g. `Try an example board`)
     next to or directly below the file/folder pickers. Clicking fetches `/samples/example-board.kicad_pcb`, constructs a
     `File` (`new File([buf], 'example-board.kicad_pcb', { type: 'text/plain' })`), and passes `[file]` to `setFiles`.
   - In `components/Viewer3D/Viewer3D.tsx`: add a secondary button inside `<DropTarget>` (e.g. `Try an example model`)
     that fetches `/samples/example-part.<ext>`, wraps it as a `File`, and passes `[file]` to `setFiles`.
   - Handle loading state (`Loading example…`, disabled while fetching) and fetch errors gracefully.
   - Stop propagation if needed so clicking the example button never triggers a drop-zone click handler twice.

**Done when:**
- Neither sample file is fetched on initial page load (verify in browser network tab: 0 requests to `/samples/` until
  clicked).
- Clicking *"Try an example board"* in `/pcb-viewer/main` loads the board cleanly in both layer view and realistic view,
  with inspectable nets/components and zero console errors (checked at desktop and 390 px width).
- Clicking *"Try an example model"* in `/3d-viewer/main` renders the model cleanly with valid bounding box / surface
  area / volume stats and zero console errors (checked at desktop and 390 px width).
- `npx tsc --noEmit` and `npm run build` pass.

---

### S4 – Home page scannability, footer feedback link & GitHub issue template

**Scope:**
1. **Home page ([pages/index.tsx](../../pages/index.tsx) & `styles/Home.module.css`):**
   - Tighten card descriptions so every card has a crisp 1–2 sentence summary (currently PCB viewer, Resistor lookup,
     Smith chart, and EM simulation are 60–110 words each while other cards are 12–20 words). Keep accurate detail in
     each tool's own lead paragraph and `README.md`.
   - Cap tag chips per card to ~4–6 high-signal keywords so cards stay visually balanced.
   - Group cards under clear section headings (e.g. **Electronics & RF**, **3D & Documents**, **Codes & Utilities**) while
     keeping the exact same card visual style, accent colours, and responsive grid down to 320 px.
2. **Footer ([components/SiteFooter.tsx](../../components/SiteFooter.tsx)):**
   - Add a `Report an issue` link pointing to `https://github.com/yotasage/yotasage.github.io/issues` (`target="_blank"
     rel="noopener noreferrer"`, matching the existing `GitHub` link so active tool state is preserved).
3. **GitHub issue template (`.github/ISSUE_TEMPLATE/feedback.md`):**
   - One short, friendly template asking for: tool name / URL, browser & device, what happened vs. expected, and a
     clear reminder **not to upload confidential boards, documents, or personal data** to public GitHub issues.

**Done when:**
- Every tool remains reachable from a card on `/` (no placeholder cards; [CLAUDE.md](../../CLAUDE.md)).
- Visual check at 1440 px and 390 px confirms clean spacing, alignment, contrast, and keyboard tab order.
- `npx tsc --noEmit` and `npm run build` pass.

---

### S5 – Visual `README.md` and sharing playbook

**Scope:**
1. **Update [README.md](../../README.md):**
   - Add a compact visual gallery right below the intro (2×2 table or clean image rows referencing `public/og/pcb-viewer.png`,
     `public/og/em-sim.png`, `public/og/smith-chart.png`, `public/og/resistor.png` — or `public/og/3d-viewer.png`) so
     GitHub visitors see the tools immediately without duplicating image files.
   - Keep the tools table accurate and update it if any wording changed.
2. **Create `docs/sharing/channels.md`:**
   - **Pre-share checklist:**
     - Push to `main` and wait for `.github/workflows/nextjs.yml` to deploy cleanly.
     - Test unfurl cards for `/`, `/pcb-viewer/main`, `/em-sim/main`, and `/smith-chart/main` (e.g., via Discord/Slack
       private channel or an Open Graph preview checker).
     - Submit `https://yotasage.github.io/sitemap.xml` once in Google Search Console and Bing Webmaster Tools.
   - **Suggested standalone angles (one focused post per flagship tool, spaced out rather than all at once):**
     - *PCB viewer:* Show HN, `r/PrintedCircuitBoard`, `r/KiCad`, EEVblog forum, KiCad forum — highlight multi-CAD
       client-side rendering (Gerber, KiCad, Altium, PADS, EAGLE), zero uploads, 1:1 PDF/DXF & `.kicad_pcb` export,
       with the built-in example board button.
     - *EM simulation:* Show HN, `r/PrintedCircuitBoard`, `r/rfelectronics`, `r/ElectricalEngineering` — highlight 2D
       boundary-element field solver, 3D vias, WebGPU FDTD waves, JLCPCB/KiCad stackups, and openEMS validation.
     - *Smith chart:* `r/rfelectronics`, `r/ElectricalEngineering`, `r/amateurradio` — highlight interactive drag/snap,
       multi-unknown solver with construction circles, step-by-step derivations, TikZ export, and 16 worked lessons.
     - *Resistor lookup:* `r/ElectricalEngineering`, `r/AskElectronics` — highlight E-series/SMD/colour decoding,
       1–4 resistor combinations from your own parts drawer, and tolerance/temperature circuit design.
     - *3D viewer:* `r/3Dprinting`, `r/CAD` — highlight client-side STEP/IGES/BREP via Open CASCADE + mesh formats,
       multi-file compare, and sectioning.
   - **Healthy boundaries note:** Keep the honest *"built for my own use, published as-is, no guarantees"* framing in
     posts; never feel obligated to take feature requests or act as a support desk.
3. **Update [CLAUDE.md](../../CLAUDE.md):**
   - Document `PageHead.tsx`, `scripts/generate-sitemap.mjs`, `public/og/`, and `public/samples/` briefly under
     `## Build and deploy` / `## Layout and conventions` and list `docs/sharing/plan.md` under `## Docs`.

**Done when:**
- All links and embedded images in `README.md` and `docs/sharing/channels.md` resolve properly.
- `npx tsc --noEmit` and `npm run build` pass (`git checkout -- next-env.d.ts` after).

---

## Out of scope

- Analytics, cookies, telemetry, or any third-party script.
- Server-side or edge-function dynamic OG image generation (incompatible with GitHub Pages static export).
- Custom domain setup (can be done independently later; `SITE_ORIGIN` in `PageHead.tsx` and `generate-sitemap.mjs`
  keeps it a single-constant change if ever needed).
- Rewriting or changing tool internals beyond the two drop-zone example buttons and `<Head>` wrappers.
- PWA / offline service worker (worth its own separate plan so caching of large WASM assets in `public/3d/`,
  `public/pdfjs/`, and `public/qr/` is designed carefully).

---

## Running this plan in a new session

To kick this off in a fresh session, point it at this file:

> Read `CLAUDE.md` and `docs/sharing/plan.md`. Confirm decisions D1–D4 with me (or use the recommended defaults), then
> execute steps S1 through S5 in order (doing S3 before S2 so the sample board and 3D model can be used for the OG
> preview screenshots). Commit once per step on the `sharing` branch, restore `next-env.d.ts` after builds, and do not
> push.
