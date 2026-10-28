# PDF tools – plan

A collection of PDF tools at [`/pdf/main`](../pages/pdf/main.tsx) that run entirely in the browser, so the site keeps
working as a static export on GitHub Pages. Files never leave the user's device, and there are no ads, accounts or
limits other than the device's memory.

The goal is to cover the useful parts of [PDF24 Tools](https://tools.pdf24.org/en/) and
[iLovePDF](https://www.ilovepdf.com/) over time, starting with a small set and adding tools in phases.

## Ground rules

- **No server.** Everything is client-side JavaScript or WebAssembly. Tools that need a server (fetching web pages,
  AI services, cloud storage) are out of scope unless they can be done with a direct browser-to-service connection.
- **Self-hosted assets.** Libraries, workers, fonts and wasm files are served from this site and not from a CDN.
  The pdf.js worker and data files are copied into `public/pdfjs/` by `scripts/copy-pdfjs-assets.mjs` on
  `npm install` / `npm ci` (git ignores the folder). QuickJS is left out, since scripts in PDFs are never run.
- **Licences are shown on the site.** `scripts/collect-licenses.mjs` runs on install and gathers the licence of every
  package the site imports, with their runtime dependencies and the pdf.js data files, into
  `lib/generated/third-party-licenses.json`. The `/licenses` page, linked from the footer of every page, shows it.
  Check the licence of a new dependency before adding it: permissive licences (MIT, BSD, Apache-2.0, ISC) are fine;
  copyleft ones (GPL, AGPL) need a decision first.
- **Same layout for every tool** (as on the reference sites): the hub shows a button (tile) per tool; each tool opens
  with a large drop zone, then shows the files as thumbnail cards next to an options sidebar with one big action
  button and a download button for the result.
- **Lossless by default.** Change only what the tool is about. For example, images are embedded without re-encoding and
  compression keeps text selectable unless the user asks for rasterizing.

## Architecture

| Part | Location | Notes |
| --- | --- | --- |
| Tool registry (hub tiles) | `lib/pdf/tools.ts` | Add a `PdfTool` entry here for each new tool. |
| Hub page | `pages/pdf/main.tsx` | Grid of tool buttons. |
| Tool pages | `pages/pdf/<tool>.tsx` | One static page per tool. |
| Shared UI | `components/PdfTools/` | `PdfPage` (frame), `ToolWorkspace` (drop zone → files + sidebar), `FileGrid`/`FileCard` (sortable thumbnail cards), `ToolIcon`. |
| Styles | `styles/PdfTools.module.css` | Form fields reuse `components/QrGen/fields.tsx` and `styles/QrGen.module.css`. |
| PDF logic | `lib/pdf/` | Framework-free functions, one module per tool, plus `files.ts` (download, ZIP, names) and `pdfjs.ts` (lazy pdf.js, page rendering, thumbnails). |

Libraries:

| Library | Use | Licence |
| --- | --- | --- |
| [`@cantoo/pdf-lib`](https://github.com/cantoo-scribe/pdf-lib) | Read, modify and write PDFs. A maintained fork of pdf-lib with the same API, plus encryption and decryption (needed for Protect/Unlock). | MIT |
| [`pdfjs-dist`](https://github.com/mozilla/pdf.js) | Render pages (thumbnails, rasterizing, PDF to image), extract text. | Apache-2.0 |
| [`fflate`](https://github.com/101arrowz/fflate) | ZIP downloads, deflate/inflate of PDF streams. | MIT |

Candidates for later phases: `tesseract.js` (OCR, Apache-2.0), a Ghostscript wasm build (PDF/A, stronger
compression), `docx` (writing Word files, MIT), LibreOffice wasm (Office to PDF; very large download, research needed;
MPL-2.0).

**Ghostscript is AGPL-3.0** (or a paid commercial licence from Artifex). Serving it from the site counts as conveying
it, so its complete corresponding source must be offered to every user. Whether the page code that loads it then
counts as a combined work that must also be AGPL is not settled for wasm loaded by a web page. Before adopting it,
decide whether the site's own code may be released under AGPL, and keep Ghostscript as an optional, separately loaded
module with a link to its source. qpdf (Apache-2.0) avoids the question for linearization and repair.

## Feature list

Status: ✅ done · 🔜 next phase · 📋 planned · 🔬 needs research · ❌ not possible without a server

### Phase 1 – first tools (done)

| Tool | PDF24 | iLovePDF | Status | How |
| --- | :-: | :-: | :-: | --- |
| Merge PDF | ✔ | ✔ | ✅ | pdf-lib `copyPages`. Drag-and-drop ordering, sorting by name, page ranges per file (`1-3, 5, 8-`, reversed `5-1`). |
| Compress PDF | ✔ | ✔ | ✅ | Four levels (lossless / recommended / strong / custom DPI and quality). Removes unreachable objects, re-deflates streams at level 9, writes object streams, downsamples and re-encodes RGB/grey images as JPEG, and keeps the original if the result is not smaller. Optional: rasterize every page, remove metadata. Several files at once, ZIP download. |
| Images to PDF (JPG/PNG/WebP/GIF/BMP/SVG/AVIF to PDF) | ✔ | ✔ | ✅ | JPEG and PNG are embedded unchanged; other formats go through a canvas. EXIF orientation is honoured without re-encoding. Page size (image, A3–A5, Letter, Legal), orientation, margin, fit or actual size at a DPI, per-image rotation, one PDF or one PDF per image (ZIP). |
| Remove metadata / anonymize | ✔ (remove metadata) | – | ✅ | `lib/pdf/sanitize.ts`. Inspects each file and lists what it found: document properties, XMP, document ID, photo EXIF/GPS/XMP/IPTC inside JPEGs, comment authors and dates, digital signatures, page thumbnails, application private data (PieceInfo), JavaScript and risky actions, attachments, comments, form values, earlier revisions and unused objects. Presets *Metadata only*, *Anonymize* (everything except visible content) and *Maximum* (also attachments, comments, form values), or custom. JPEG metadata is removed without re-encoding (`lib/pdf/jpeg.ts`). The cleaned file is inspected again to confirm. Optional neutral output file names. |

### Phase 2 – organize pages (pdf-lib and pdf.js only)

| Tool | PDF24 | iLovePDF | Status | How |
| --- | :-: | :-: | :-: | --- |
| Split PDF | ✔ | ✔ | 🔜 | By ranges, every N pages, by size, or by top-level bookmarks. Results as a ZIP. |
| Remove pages | ✔ | ✔ | 🔜 | Page thumbnail grid; click to mark pages, or type ranges. |
| Extract pages | ✔ | ✔ | 🔜 | Same UI as Remove pages with the selection inverted. One PDF or one PDF per page. |
| Organize / rearrange pages | ✔ | ✔ | 🔜 | Grid of every page from one or more PDFs; drag to reorder, rotate, delete, duplicate, insert blank pages. This grid is a shared component for Remove, Extract and Rotate. |
| Rotate PDF | ✔ | ✔ | 🔜 | Set `/Rotate` per page or for all pages. |
| PDF to images (JPG/PNG) | ✔ | ✔ | 🔜 | Render with pdf.js at a chosen DPI; ZIP of images. |
| Extract images | ✔ | ✔ (as PDF to JPG option) | 🔜 | Walk image XObjects; JPEGs are saved as they are, others are re-encoded as PNG. Reuses the image decoding in `lib/pdf/compress.ts`. |
| Add blank pages / insert PDF into PDF | ✔ | – | 📋 | Part of Organize. |

### Phase 3 – edit and annotate

| Tool | PDF24 | iLovePDF | Status | How |
| --- | :-: | :-: | :-: | --- |
| Add page numbers | ✔ | ✔ | 📋 | Position, format (`1`, `Page 1 of N`), font, size, first number, page range, skip first page. |
| Add watermark | ✔ | ✔ | 📋 | Text or image, opacity, rotation, position or tiled, over or under the content. |
| Crop PDF | ✔ | ✔ | 📋 | Set CropBox, drawn on a preview; per page or all pages. |
| Resize pages / scale to paper size | ✔ | – | 📋 | Embed each page into a new page of the target size. |
| Pages per sheet (N-up) and booklet | ✔ | – | 📋 | `embedPage` several pages on one sheet; booklet ordering for duplex printing. |
| Edit metadata | ✔ | – | 📋 | Edit title, author, subject, keywords and dates (removing is done by *Remove metadata*). |
| Protect PDF (password) | ✔ | ✔ | 📋 | `@cantoo/pdf-lib` encryption with user and owner passwords and permissions. |
| Unlock PDF | ✔ | ✔ | 📋 | Load with the password and save without encryption. Also lets the other tools accept encrypted files, with a password prompt. |
| Flatten PDF (forms and annotations) | ✔ | – | 📋 | pdf-lib `form.flatten()`; annotations through their appearance streams. |
| Fill PDF forms | ✔ | – | 📋 | Render with the pdf.js annotation layer, write values with pdf-lib. |
| Sign PDF (visual signature) | ✔ | ✔ | 📋 | Draw, type or upload a signature, place it on pages. |
| Edit PDF (add text, shapes, images, highlights) | ✔ | ✔ | 📋 | Use the pdf.js annotation editor (FreeText, Ink, Highlight, Stamp) and `saveDocument()`. |
| Remove annotations | ✔ | – | 📋 | Drop `/Annots` (optionally by type). |
| Grayscale PDF | ✔ | – | 📋 | Convert images to grey and rewrite colour operators in content streams; rasterizing as a fallback. |
| Invert colours / dark mode PDF | ✔ | – | 📋 | Rasterize with inverted colours. |

### Phase 4 – heavier processing (WebAssembly)

| Tool | PDF24 | iLovePDF | Status | How |
| --- | :-: | :-: | :-: | --- |
| OCR (searchable PDF) | ✔ | ✔ | 📋 | `tesseract.js` with self-hosted language data; invisible text layer on top of each page image. Download each language only when the user selects it. |
| Redact PDF | ✔ | ✔ | 📋 | Draw boxes or search for text; real removal by rasterizing the affected pages (content stream editing later). |
| Compare PDFs | ✔ | ✔ | 📋 | Text diff from pdf.js text content plus a visual overlay or pixel diff per page. |
| Repair PDF | ✔ | ✔ | 📋 | Re-save through the tolerant pdf-lib parser; rebuild from pdf.js rendering as a fallback. |
| PDF to PDF/A | ✔ | ✔ | 🔬 | Needs an output intent, XMP metadata and embedded fonts. Ghostscript wasm is the most realistic route. |
| Optimize for web (linearize) | ✔ | – | 🔬 | No JS library linearizes; would need qpdf or Ghostscript wasm. |
| Stronger compression | ✔ | ✔ | 📋 | See [Compression improvements](#compression-improvements). |

### Phase 5 – conversions to and from other formats

| Tool | PDF24 | iLovePDF | Status | How |
| --- | :-: | :-: | :-: | --- |
| PDF to text | ✔ | – | 📋 | pdf.js `getTextContent`, with lines reassembled from positions. |
| PDF to Word (.docx) | ✔ | ✔ | 🔬 | Text and images with positions from pdf.js, written with `docx`. Good for text-heavy documents, weak for complex layouts. |
| PDF to Excel | ✔ | ✔ | 🔬 | Table detection from text positions; output with a small XLSX writer. |
| PDF to PowerPoint | ✔ | ✔ | 🔬 | A slide per page with the page as an image (plus text boxes later). |
| PDF to HTML / ePub | ✔ | ✔ (HTML) | 🔬 | – |
| Word / Excel / PowerPoint to PDF | ✔ | ✔ | 🔬 | Only LibreOffice in wasm gives good fidelity (tens of MB). Check size and load time before committing. |
| Text / Markdown to PDF | ✔ | – | 📋 | Lay out with pdf-lib and embedded fonts. |
| HTML file to PDF | ✔ | ✔ | 🔬 | Possible for local HTML files through an iframe and the browser's print dialog only. |
| Scan to PDF (camera) | – | ✔ | 📋 | `getUserMedia` capture, edge detection and perspective correction, then Images to PDF. |

### Not planned (need a server)

| Tool | Why |
| --- | --- |
| Web page (URL) to PDF | Browsers cannot fetch arbitrary sites (CORS). |
| AI summarize / chat with PDF / translate | Needs an external AI service and API key. |
| Google Drive / Dropbox import and export | Needs registered app keys; possible client-side later if wanted. |

## Cross-cutting improvements

- **Web Worker for heavy work.** pdf-lib parsing and saving runs on the main thread today. Move compress and merge into a
  worker so the page stays responsive with large files.
- **Encrypted input.** Ask for the password and decrypt with `@cantoo/pdf-lib` / pdf.js instead of rejecting the file.
- **Chain tools.** "Continue with…" buttons on a result (as iLovePDF does), passing the bytes to the next tool in memory.
- **Merge:** keep the sources' bookmarks and add a bookmark per file; allow images in the merge list.
- **Touch reordering.** HTML drag and drop does not work on most phones; the arrow buttons cover that for now.
- **Remember options** per tool in `localStorage`.
- **Offline use / PWA.** A service worker would make every tool work offline once loaded.
- **Tests.** Unit tests for `lib/pdf/*` (page ranges, EXIF orientation, predictors, compression round-trips) and a
  browser smoke test of each tool.

### Remove metadata improvements

- Hidden content that is still drawn but invisible: text outside the page box, white text, hidden optional content
  layers, objects covered by other objects. Reporting these is possible; removing them changes content.
- Metadata inside other image formats (JPEG 2000 XML boxes) and in embedded fonts' names.
- Searching the visible text for e-mail addresses, phone numbers and names, as a lead-in to the Redact tool.

### Compression improvements

- Work out each image's real on-page size from the content streams (`cm` before `Do`) instead of assuming it covers the
  largest page, so small images are downsampled further.
- Merge identical objects (fonts and images that are repeated after merging).
- Unembed or subset duplicate fonts.
- Greyscale and 1-bit (CCITT/JBIG2) options for scanned documents.
- Recompress CMYK, indexed and 16-bit images (skipped today).
- Ghostscript wasm as an optional "maximum" level.
