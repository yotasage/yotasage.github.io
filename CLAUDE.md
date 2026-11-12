# CLAUDE.md

A personal collection of browser tools (simulation setup calculator, QR code generator, PDF tools, Base64 image
converter, text case converter, 3D viewer, PCB viewer, resistor lookup, Smith chart), so the owner does not have to use other people's sites with ads and bad design. Next.js 16 Pages Router,
React 19, TypeScript 7, deployed to GitHub Pages at https://yotasage.github.io/.

## Hard constraints

- **No server, ever.** The site is a static export. Everything runs client-side (JS or WebAssembly). Not allowed:
  API routes (`pages/api`), `getServerSideProps`, middleware, ISR/`revalidate`, rewrites/redirects/headers in config,
  the default `next/image` loader, dynamic routes without `getStaticPaths`, or features that need a backend service.
  `getStaticProps` is fine (runs at build time).
- **Every tool is reachable from a card on the main page** ([pages/index.tsx](pages/index.tsx): an entry in `TOOLS`,
  with an icon in `components/Home/ToolIcon.tsx`). Don't add placeholder cards for tools that don't exist.
- **Self-hosted assets only.** No CDN scripts, fonts, workers or wasm. pdf.js files are copied into `public/pdfjs/`
  and the 3D viewer's readers and decoders (Open CASCADE, Draco, Basis Universal) into `public/3d/` on install.
- **Files the user gives a tool never leave the device.** No uploads, no analytics, no third-party requests.
- **Check the licence of a new dependency.** MIT/BSD/Apache-2.0/ISC are fine; GPL/LGPL/AGPL needs the owner's decision.
  The owner approved `occt-import-js` (LGPL-2.1, Open CASCADE) for the 3D viewer, on the condition that it is served
  unmodified as separate files from `public/3d/occt/` and listed on `/licenses` with a link to its source.

## Build and deploy

- There is **no `next.config` in the repo**. In CI, `actions/configure-pages` (`static_site_generator: next`) creates
  one with `output: 'export'` and `images.unoptimized`, then `next build` writes `out/`. So a local `npm run build`
  is *not* a static export: something that breaks the export (see constraints above) passes locally and fails only
  in CI. Check new code against the constraints by reading it, not just by building.
- The Pages source (Settings → Pages → Build and deployment) must be **GitHub Actions**. With "Deploy from a branch",
  GitHub also runs its own Jekyll build on every push, and whichever deploy finishes last wins, so the site can end
  up showing README.md instead of the app.
- CI runs on Ubuntu with Node 22 (`npm ci`); development is on Windows with a newer Node. Import paths must match
  file name case exactly.
- `postinstall` runs [scripts/copy-pdfjs-assets.mjs](scripts/copy-pdfjs-assets.mjs) (→ `public/pdfjs/`),
  [scripts/copy-3d-assets.mjs](scripts/copy-3d-assets.mjs) (→ `public/3d/`) and
  [scripts/collect-licenses.mjs](scripts/collect-licenses.mjs) (→ `lib/generated/third-party-licenses.json`, shown by
  `/licenses`; the list is found by scanning imports in `pages/`, `components/`, `lib/`). All three outputs are
  git-ignored. After adding or removing a dependency, run `npm install` so the licence list follows.

## Verifying changes

- `npx tsc --noEmit`: type-check, under a second.
- `npm run build`: full build, also renders every page. Run it before saying a change is done.
- `npm run dev`: dev server on port 3020 bound to `0.0.0.0` (the owner tests on a phone). Not 3000: the Live Preview
  extension of VS Code serves on `127.0.0.1:3000`, which wins over `0.0.0.0:3000` for `localhost`.
- There are no tests and no lint script. `tsconfig` has `strict: false`.
- `npm run build` rewrites the import paths in `next-env.d.ts` (`next dev` writes them back). Restore it with
  `git checkout -- next-env.d.ts` rather than committing the change.

## Layout and conventions

- Tool entry pages are `pages/<tool>/main.tsx`. **Every file under `pages/` becomes a route**, so helpers go in
  `lib/<tool>/` (framework-free logic) and `components/<Tool>/` (React). Styles are CSS modules in
  `styles/<Tool>.module.css`.
- Each page sets its own `<Head>` (title, `/favicon.ico`), a home link with `components/icons/home.tsx` at the top,
  and `html, body` styles in `<style jsx global>`. The dark background is `#2b2b2b`. `styles/globals.css` is not
  imported anywhere. [pages/_app.tsx](pages/_app.tsx) adds `SiteFooter` (links to `/licenses` and the GitHub repo)
  to every page; on the main page only it is fixed to the bottom of the screen.
- Layouts must work at phone width.
- PDF tools: register each tool in [lib/pdf/tools.ts](lib/pdf/tools.ts) (hub tiles on `/pdf/main`), use the shared
  frame in `components/PdfTools/`, and update the status table in
  [docs/pdf-tools-plan.md](docs/pdf-tools-plan.md). Form fields are shared from `components/QrGen/fields.tsx`.
- Citations: entries live in [references.bib](references.bib). Load them with `loadReferences()` from
  `lib/references.ts` **only in `getStaticProps`** (it uses `node:fs`), then cite with the `Bibliography` class in
  `components/Bibliography.tsx` (IEEE style, numbered by first citation). An unknown key stops the build.
- 3D viewer: formats are listed in [lib/viewer3d/formats.ts](lib/viewer3d/formats.ts) and read in
  [lib/viewer3d/load.ts](lib/viewer3d/load.ts) (STEP/IGES/BREP in a worker, [lib/viewer3d/occt.ts](lib/viewer3d/occt.ts));
  the scene is [lib/viewer3d/viewer.ts](lib/viewer3d/viewer.ts). Files a model refers to are matched by name among the
  opened files and never fetched from elsewhere. The page loads three.js only when a file is opened. With several
  files, each is in a group that the Positions panel can move apart; that offset is for the view only, so statistics
  (`withoutOffsets` in `lib/viewer3d/stats.ts`) and saved files (`exportCopy` in `lib/viewer3d/export.ts`) leave it out.
- PCB viewer: built in steps by [docs/pcb-viewer/plan.md](docs/pcb-viewer/plan.md), whose [model.md](docs/pcb-viewer/model.md) must match
  [lib/pcb/model.ts](lib/pcb/model.ts) (millimetres, Y up). Files are recognised by content in
  [lib/pcb/detect.ts](lib/pcb/detect.ts), read and made into a `Board` in [lib/pcb/load.ts](lib/pcb/load.ts) (ZIPs
  expanded with fflate), Gerber in `lib/pcb/gerber/`, Excellon in `lib/pcb/excellon.ts` (read once, plotted with a
  format; files without one are fitted to the pads in `lib/pcb/drill.ts`), the board shape in `lib/pcb/outline.ts`,
  layer kinds and order in [lib/pcb/identify.ts](lib/pcb/identify.ts). Design files (KiCad: `lib/pcb/kicad/`, an
  S-expression reader read one top-level item at a time; Altium: `lib/pcb/altium/`, on the records of `altiumts`, which
  `altium/board.ts` loads with `await import('altiumts')` only when an Altium file is opened, so it stays a chunk of its
  own; `package.json` overrides its `typescript ^5` peer dependency; PADS ASCII: `lib/pcb/pads/`, where `ascii.ts` reads
  the header, units, sections and what each version writes differently, and `planes.ts` makes the plane areas whose
  flood is not saved and the CAM planes; EAGLE XML boards and libraries: `lib/pcb/eagle/`, with an XML reader of its own,
  the design rules in `rules.ts` and the polygons, whose copper EAGLE does not store, drawn from their outlines by
  `pours.ts`) become a `Design`, which `lib/pcb/design/build.ts` turns into layers for every design format (pads as
  flashes, openings from `design/pads.ts`, planes from `Design.planes`: negative, or plane areas under the layer's
  copper, with what they keep clear of cut out; text with the Newstroke stroke font in `lib/pcb/font/`: layout adapted
  from KiCanvas, MIT; glyphs generated from the font author's own CC0 release, never from KiCad's GPL
  `newstroke_font.cpp`; notices in `lib/pcb/font/LICENSE.*.txt`); `design/open.ts` is loaded with `await import` only
  when a design file is opened.
  Text metrics are checked against `kicad-cli` plots and, for Altium, PADS and EAGLE, their prints and Gerber files.
  The view is Canvas 2D in `lib/pcb/render/`: paths are built once per layer (`prepare.ts`; never call
  `closePath()` on a `Path2D`, it is very slow in Chromium), each layer of the picture is drawn into its own canvas
  (`paint.ts`, shared with the PNG export) and composited by `view.ts`: stacked in the layer view, as the board looks
  in the realistic view (chosen by layer kind and side only); gestures move the last frame until they pause.
  Measuring snaps with the grid index of `lib/pcb/points.ts`; exports are in `lib/pcb/export/`. A click is looked up
  with the per-layer item index of `lib/pcb/hits.ts` and described by `lib/pcb/inspect.ts`, which also makes the
  component and net lists and the highlights only from `Board.objects`, `Board.placements` and the layers (so every
  format gets them); the BOM and pick-and-place CSVs (`export/csv.ts`) follow KiCad's position files. PDF
  (`export/pdf.ts`, with `@cantoo/pdf-lib` loaded by `await import`) and DXF (`export/dxf.ts`) are vectors in board
  millimetres; layers with clear items are first flattened with polygon booleans in `export/flatten.ts` (`clipper2-ts`,
  BSL-1.0, also loaded by `await import`). Pick-and-place files over Gerber sets are read by `lib/pcb/pnp.ts` (formats
  recognised by content, column mapping, fitting units and origin to the pads) and drawn as a marker layer per side by
  `lib/pcb/markers.ts`, which `load.ts` loads with the stroke font only when such a file is opened. The KiCad export
  (`export/kicad.ts`, loaded by `await import` when the save card saves a KiCad board) writes an Altium, PADS or EAGLE
  `Board.design` as a `.kicad_pcb` in KiCad 9's format (version 20241229); the warning the card shows before saving
  comes from `export/kicadnotes.ts`. Check a change to it with `kicad-cli` (`pcb export gerbers|svg`, `pcb drc` must
  read the file) and by comparing kicad-cli's Gerbers with the viewer's own layers, as the plan's notes from S9 describe.
- Resistor lookup: built in steps by [docs/resistor/plan.md](docs/resistor/plan.md) (module map, design direction,
  `notes-S<n>.md`; `facts.md` has the tables). Framework-free logic in `lib/resistor/` (E-series, colour code, SMD
  markings, `draw.ts` for the self-contained SVG drawings with the stroke font of `glyphs.ts`, `tikz.ts` for the same shapes as
  TikZ, `export.ts`; the combination search `combine.ts` in a worker through `combineClient.ts`, networks in `network.ts` and
  `analyse.ts`, pasted value lists in `values.ts`, their form in the link and in `localStorage` in `lists.ts`; the design mode: parts in
  `technology.ts`, circuits in `circuits.ts`, worst case and RSS over temperature in `design.ts`, suggestions in `suggest.ts`,
  asked for in a second instance of the same worker through `designClient.ts`), the page in
  `components/Resistor/` (`ResistorTool.tsx` holds the state and the link, `view.ts` resolves what is drawn; `Combinations.tsx` with
  `combo.ts` for its link state and `ValueLists.tsx` for the visitor's lists; `DesignSection.tsx` with `design.ts` for its link
  state, the reading of its fields and its sentences, `DesignDetails.tsx` for an opened suggestion with the range chart and
  `Schematic.tsx`; `Theory.tsx` with `TheoryFigures.tsx` for the theory; the page cites from `references.bib`, loaded in
  `getStaticProps` of `pages/resistor/main.tsx` into one `Bibliography` that `ResistorTool.tsx` hands to the sections, and
  `docs/resistor/sources.md` says what each source may be cited for), styles and theme variables in
  `styles/Resistor.module.css` (the Combinations section in `styles/ResistorCombos.module.css`, the Design section in
  `styles/ResistorDesign.module.css`, the theory in `styles/ResistorTheory.module.css`), checks in `scripts/harness/resistor/` (`npm run check`, `npm run ui`).
- Smith chart: built in steps by [docs/smith-chart/plan.md](docs/smith-chart/plan.md) (decisions, milestones and status;
  the module map in `modules.md`; `notes-<step>.md` per step). Framework-free logic in `lib/smith/` (engine, network, geometry, grid, the
  circuit and its link in `state.ts`, the solver in `goal.ts`, `solve.ts`, `search.ts`, value lists in `values.ts`), the page in `components/Smith/` (chart, path layer and drag outside React in
  `chartView.ts`, `pathLayer.ts`, `live.ts`; the circuit panel `Strip.tsx`; the Theory section `Theory.tsx` with `TheoryFigures.tsx` and the solver's topics in `TheorySolver.tsx` (content in
  `docs/smith-chart/theory.md` and `theory-solver.md`), equations by id from
  `lib/smith/equations.ts`, citations from `references.bib` loaded in `getStaticProps` of the page, styles in
  `styles/SmithTheory.module.css`; the short line and "→ theory" link beside every control in `Why.tsx` with the texts
  in `whys.ts`; every claim's source in `docs/smith-chart/claims.md`), state and undo history in
  `pages/smith-chart/main.tsx`, styles in `styles/Smith.module.css`, checks in `scripts/harness/smith/` (`npm run check`
  for the engine, `npm run ui` drives the page in Edge or Chrome and starts the dev server if none runs).
- `tsconfig` uses `"module": "node16"`, so our own files count as CommonJS and the ES-module-only add-ons of three.js
  (`three/examples/jsm/...`) can only be loaded with `await import(...)`, or imported as types with
  `import type ... with { 'resolution-mode': 'import' }`. A dynamic import of one of our own files needs
  `// @ts-expect-error` (TypeScript wants a `.js` extension, which Turbopack does not resolve); see
  `components/Viewer3D/Viewer3D.tsx`.
- Math is rendered with `components/KatexSpan.tsx`. `lib/useReplayHighlight.ts` replays the highlight on elements a
  `#link` jumps to.
- Unused leftovers in package.json: `peerjs`, `socket.io`, `socket.io-client`, `@jaames/iro`, `clsx`,
  `@testing-library/*`, `@types/jest`, and Tailwind/PostCSS/autoprefixer (no PostCSS config, so Tailwind is not
  active). Don't take them as a sign that a server or Tailwind is in use.

## Working with Claude

- **The owner does not review code or diffs.** Write the code the best way possible and never trade performance for
  readability; quality comes from harness checks against independent computations and measured budgets.
- **The tools are made for the owner's own use** and are published as they are. A tool may go live before the owner
  has tried it, with an honest note at the top of its page on what works, what is checked and how, and what is not
  done yet. Any text about how others use a tool (accuracy, no guarantees) is written in the site's own friendly words:
  never quote or paraphrase the owner's remarks about it, and keep it kind and brief.
- **Lasting knowledge goes in this repo** (CLAUDE.md or `docs/`), not only in Claude's local memory, so it follows the
  repo to other machines: the owner's preferences, lessons learnt, where test files are.
- **Large work in steps by agents** follows [docs/agent-workflow.md](docs/agent-workflow.md): steps sized so one agent
  stays under about 200k tokens of context, heavy steps split into research, code and check, briefs that name the
  files to read and a verification bar, and a watchdog that resumes agents stopped by usage limits or lost connections.
- **No file over 40 kB is read whole.** Docs are split into parts with an index before they reach 40 kB (as
  `docs/pcb-viewer/`). For a large code file, list its outline first (`grep -n` for top-level declarations or methods),
  then read only the range needed (`offset`/`limit`). Large code files now: `lib/pcb/export/kicad.ts`,
  `lib/pcb/pads/board.ts`, `lib/pcb/kicad/board.ts`, `lib/pcb/altium/board.ts` (splitting them is BL29),
  `lib/smith/solve.ts`. Never read
  `package-lock.json` or the generated glyph data `lib/pcb/font/newstroke-glyphs.ts`.
- **Test files** are on the owner's machines; read them where they are and never copy them into the repo. PCB samples
  are listed in [docs/pcb-viewer/test-files.md](docs/pcb-viewer/test-files.md). Real 3D models for the
  3D viewer (JLC/EasyEDA component models, STEP and WRL) are in
  `E:\OneDrive - NTNU\ULDAC\PCB\models\jlc-export\libraries\JLC\3dmodels`. Paths under OneDrive may exist on other
  machines; paths under `Downloads` or `Program Files` may not.

## Docs

- [README.md](README.md): what the site is, tools, getting started, how to add a tool.
- [docs/npm-and-node.md](docs/npm-and-node.md): npm, NVM for Windows and Next.js commands explained.
- [docs/pdf-tools-plan.md](docs/pdf-tools-plan.md): PDF tools roadmap, libraries and licence notes.
- [docs/pcb-viewer/](docs/pcb-viewer/plan.md): PCB viewer plan, in parts: `plan.md` (index: goal, formats, step
  status, how a step is run and verified), `test-files.md`, `architecture.md`, `model.md`, and `s1.md`–`s9.md` (each
  step's scope and the notes it left for later steps).
- [docs/smith-chart/](docs/smith-chart/plan.md): Smith chart plan (built in steps on the branch `smith-chart`), in
  parts: `plan.md` (index: goal, decisions, milestones and status, how a step is run), `modules.md` (module map), `engine.md`,
  `solver.md`, `learning.md`, `milestones.md`, and the `notes-<step>.md` each step leaves.
- [docs/agent-workflow.md](docs/agent-workflow.md): how to run large work with Claude agents cheaply and safely, with
  the measured cost of the PCB viewer build.
- [docs/BACKLOG.md](docs/BACKLOG.md): wanted but not scheduled, for every tool (ids `BL<n>`, never reused). Work left out
  of a step goes here.

## Commits

Commit only when asked. Messages are one paragraph of tagged, user-facing changes in past tense or present state:
`ADDED: …`, `CHANGED: …`, `FIXED: …`, `REMOVED: …`, `UPDATED: …` (several tags per message, each a full sentence
describing what is visible on the site or in the repo). See `git log` for examples.

Work done in steps is committed after every step without asking again, on a branch named after the tool: the owner
wants to see the progress in the history and to go back to a single feature without a large jump.
