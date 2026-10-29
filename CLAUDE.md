# CLAUDE.md

A personal collection of browser tools (simulation setup calculator, QR code generator, PDF tools, Base64 image
converter), so the owner does not have to use other people's sites with ads and bad design. Next.js 16 Pages Router,
React 19, TypeScript 7, deployed to GitHub Pages at https://yotasage.github.io/.

## Hard constraints

- **No server, ever.** The site is a static export. Everything runs client-side (JS or WebAssembly). Not allowed:
  API routes (`pages/api`), `getServerSideProps`, middleware, ISR/`revalidate`, rewrites/redirects/headers in config,
  the default `next/image` loader, dynamic routes without `getStaticPaths`, or features that need a backend service.
  `getStaticProps` is fine (runs at build time).
- **Every tool is reachable from a button on the main page** ([pages/index.tsx](pages/index.tsx), a `<Link>` with
  `styles.card` + `styles.w45`). Don't add placeholder cards for tools that don't exist.
- **Self-hosted assets only.** No CDN scripts, fonts, workers or wasm. pdf.js files are copied into `public/pdfjs/`
  on install.
- **Files the user gives a tool never leave the device.** No uploads, no analytics, no third-party requests.
- **Check the licence of a new dependency.** MIT/BSD/Apache-2.0/ISC are fine; GPL/AGPL needs the owner's decision.

## Build and deploy

- There is **no `next.config` in the repo**. In CI, `actions/configure-pages` (`static_site_generator: next`) creates
  one with `output: 'export'` and `images.unoptimized`, then `next build` writes `out/`. So a local `npm run build`
  is *not* a static export: something that breaks the export (see constraints above) passes locally and fails only
  in CI. Check new code against the constraints by reading it, not just by building.
- CI runs on Ubuntu with Node 22 (`npm ci`); development is on Windows with a newer Node. Import paths must match
  file name case exactly.
- `postinstall` runs [scripts/copy-pdfjs-assets.mjs](scripts/copy-pdfjs-assets.mjs) (→ `public/pdfjs/`) and
  [scripts/collect-licenses.mjs](scripts/collect-licenses.mjs) (→ `lib/generated/third-party-licenses.json`, shown by
  `/licenses`; the list is found by scanning imports in `pages/`, `components/`, `lib/`). Both outputs are
  git-ignored. After adding or removing a dependency, run `npm install` so the licence list follows.

## Verifying changes

- `npx tsc --noEmit`: type-check, under a second.
- `npm run build`: full build, also renders every page. Run it before saying a change is done.
- `npm run dev`: dev server on port 3000 bound to `0.0.0.0` (the owner tests on a phone).
- There are no tests and no lint script. `tsconfig` has `strict: false`.
- `npm run build` rewrites the import paths in `next-env.d.ts` (`next dev` writes them back). Restore it with
  `git checkout -- next-env.d.ts` rather than committing the change.

## Layout and conventions

- Tool entry pages are `pages/<tool>/main.tsx`. **Every file under `pages/` becomes a route**, so helpers go in
  `lib/<tool>/` (framework-free logic) and `components/<Tool>/` (React). Styles are CSS modules in
  `styles/<Tool>.module.css`.
- Each page sets its own `<Head>` (title, `/favicon.ico`), a home link with `components/icons/home.tsx` at the top,
  and `html, body` styles in `<style jsx global>`. The dark background is `#2b2b2b`. `styles/globals.css` is not
  imported anywhere. [pages/_app.tsx](pages/_app.tsx) adds `SiteFooter` (links to `/licenses` and the GitHub repo) to every page.
- Layouts must work at phone width.
- PDF tools: register each tool in [lib/pdf/tools.ts](lib/pdf/tools.ts) (hub tiles on `/pdf/main`), use the shared
  frame in `components/PdfTools/`, and update the status table in
  [docs/pdf-tools-plan.md](docs/pdf-tools-plan.md). Form fields are shared from `components/QrGen/fields.tsx`.
- Citations: entries live in [references.bib](references.bib). Load them with `loadReferences()` from
  `lib/references.ts` **only in `getStaticProps`** (it uses `node:fs`), then cite with the `Bibliography` class in
  `components/Bibliography.tsx` (IEEE style, numbered by first citation). An unknown key stops the build.
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
