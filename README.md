# yotasage.github.io

My own collection of tools, so I don't have to search other people's websites for one that is good enough, without
ads and bad design.

**Site:** https://yotasage.github.io/

Every tool runs entirely in the browser. There is no server: the site is a static export hosted on GitHub Pages, and
files given to a tool never leave the device.

## Tools

Every tool has a button on the main page ([pages/index.tsx](pages/index.tsx)).

| Tool | Page | What it does |
| --- | --- | --- |
| Simulation setup | [/simsetup/main](https://yotasage.github.io/simsetup/main) | Calculates sampling parameters for FFTs and simulations (f0, FS, Ncyc, Npts and what follows from them), with checks for coherent sampling. |
| QR code generator | [/qrcode/main](https://yotasage.github.io/qrcode/main) | QR Code Model 1 and 2, Micro QR and rMQR with control over every parameter. Exports PNG, JPG, SVG and PDF. |
| PDF tools | [/pdf/main](https://yotasage.github.io/pdf/main) | Merge, compress, images to PDF and remove metadata. Planned tools are in [docs/pdf-tools-plan.md](docs/pdf-tools-plan.md). |
| Base64 image converter | [/base64-image/main](https://yotasage.github.io/base64-image/main) | Image to Base64, a data URL or an HTML, CSS or Markdown snippet (optionally converted to PNG, JPEG or WebP first), and Base64 back to an image to view, download or copy. |

The [/licenses](https://yotasage.github.io/licenses) page, linked from the footer of every page, lists the licences
of the packages the site uses.

## Getting started

Needs Node 22 or newer (GitHub builds with Node 22).

```
npm install      # also copies the pdf.js files and generates the licence list
npm run dev      # http://localhost:3000, also reachable from a phone on the same network
npm run build    # run before pushing; GitHub runs the same build
```

What these commands do, NVM for Windows and keeping packages up to date: [docs/npm-and-node.md](docs/npm-and-node.md).

## Deployment

Pushing to `main` runs [.github/workflows/nextjs.yml](.github/workflows/nextjs.yml), which builds the site as static
files and publishes them to GitHub Pages. The workflow adds the `output: 'export'` setting itself; the repo has no
`next.config` file. If the build fails, nothing is deployed and the previous version stays online.

## Adding a tool

1. Add the page as `pages/<tool>/main.tsx`, with a link back to the main page (`components/icons/home.tsx`).
2. Add a button (card) for it in [pages/index.tsx](pages/index.tsx).
3. Keep the logic in `lib/<tool>/`, components in `components/<Tool>/` and styles in `styles/<Tool>.module.css`.
   Every file under `pages/` becomes a page on the site, so nothing else goes there.
4. Only use what works without a server: no API routes, no `getServerSideProps`, and no libraries, fonts or files
   loaded from a CDN. `getStaticProps` is fine, since it runs when the site is built.
5. Check the licence of any new package (MIT, BSD, Apache-2.0 and ISC are fine; GPL and AGPL need a decision first).

## Project layout

| Folder | Contents |
| --- | --- |
| `pages/` | One file per page (Next.js Pages Router). `_app.tsx` adds the footer to every page. |
| `components/` | React components, one folder per tool. |
| `lib/` | Logic without React, one folder per tool. `bibtex.ts` and `references.ts` read [references.bib](references.bib). |
| `styles/` | CSS modules, one per tool. |
| `scripts/` | Scripts that run on `npm install`. |
| `public/` | Files served as they are (favicon, icons). |
| `docs/` | Notes and plans. |

Sources cited on the site are in [references.bib](references.bib); the comment at the top of the file explains how
to cite them from a page.
