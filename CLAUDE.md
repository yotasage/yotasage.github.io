# CLAUDE.md

A personal collection of browser tools (simulation setup calculator, QR code generator, PDF tools, Base64 image
converter, text case converter, 3D viewer), so the owner does not have to use other people's sites with ads and bad design. Next.js 16 Pages Router,
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

## Docs

- [README.md](README.md): what the site is, tools, getting started, how to add a tool.
- [docs/npm-and-node.md](docs/npm-and-node.md): npm, NVM for Windows and Next.js commands explained.
- [docs/pdf-tools-plan.md](docs/pdf-tools-plan.md): PDF tools roadmap, libraries and licence notes.

## Commits

Commit only when asked. Messages are one paragraph of tagged, user-facing changes in past tense or present state:
`ADDED: …`, `CHANGED: …`, `FIXED: …`, `REMOVED: …`, `UPDATED: …` (several tags per message, each a full sentence
describing what is visible on the site or in the repo). See `git log` for examples.
