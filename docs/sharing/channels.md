# Sharing playbook

Practical checklist and channel notes for sharing tools from [yotasage.github.io](https://yotasage.github.io/) without burning out or turning a personal project into a support desk. See [plan.md](plan.md) for the metadata, preview image, and sample-file work behind this.

## Pre-share checklist

1. **Merge and deploy:** Merge `sharing` into `main`, push when ready, and wait for [.github/workflows/nextjs.yml](../../.github/workflows/nextjs.yml) to finish deploying to GitHub Pages.
2. **Verify unfurl cards and crawl files:**
   - Check Open Graph / social link previews for `/`, `/pcb-viewer/main`, `/em-sim/main`, and `/smith-chart/main` (paste each URL into a private Discord or Slack channel, or run them through an Open Graph preview checker).
   - Confirm `https://yotasage.github.io/robots.txt` and `https://yotasage.github.io/sitemap.xml` both return HTTP 200 and list the live URLs.
3. **Submit the sitemap once:** Add `https://yotasage.github.io/sitemap.xml` in Google Search Console and Bing Webmaster Tools so search engines index all 46 static routes cleanly.

## Suggested standalone angles

Share **one focused post per flagship tool**, spaced out over weeks rather than announcing the whole site at once. Each community cares deeply about its own workflow and responds much better to a direct link to the relevant tool than to a generic portfolio link.

| Tool | Direct URL | Suggested communities | Key points to highlight |
| --- | --- | --- | --- |
| **PCB viewer** | `https://yotasage.github.io/pcb-viewer/main` | Show HN, `r/PrintedCircuitBoard`, `r/KiCad`, EEVblog forum, KiCad forum | Multi-CAD client-side rendering (Gerber RS-274X/X2, Excellon, KiCad, Altium, PADS ASCII, EAGLE), zero uploads, realistic & layer views, net/component highlight, 1:1 vector PDF/DXF and `.kicad_pcb` export, and a one-click built-in example board so visitors can try it immediately. |
| **EM simulation** | `https://yotasage.github.io/em-sim/main` | Show HN, `r/PrintedCircuitBoard`, `r/rfelectronics`, `r/ElectricalEngineering` | 2D boundary-element trace field solver, 3D via impedance and S-parameters, full-wave WebGPU/CPU FDTD wave visualization, built-in JLCPCB and KiCad stackup imports, live derivations, and validation against closed-form models and openEMS. |
| **Smith chart** | `https://yotasage.github.io/smith-chart/main` | `r/rfelectronics`, `r/ElectricalEngineering`, `r/amateurradio` | Interactive drag/snap matching networks (up to 24 parts), multi-unknown solver with construction circles, step-by-step derivations, publication-ready TikZ/SVG/PNG & Touchstone export, shareable URLs, and 16 worked interactive lessons. |
| **Resistor lookup** | `https://yotasage.github.io/resistor/main` | `r/ElectricalEngineering`, `r/AskElectronics` | E3–E192, SMD (3/4-digit, EIA-96) and 3–6 band colour decoding from either end, 1–4 resistor series/parallel combinations from your own pasted parts drawer, and worst-case / RSS tolerance + temperature circuit design. |
| **3D viewer** | `https://yotasage.github.io/3d-viewer/main` | `r/3Dprinting`, `r/CAD` | Client-side STEP, IGES and BREP via self-hosted Open CASCADE plus mesh formats (STL, 3MF, OBJ, glTF/GLB, etc.), multi-file side-by-side comparison, sectioning, measuring, and a one-click built-in example model. |
| **PDF tools** *(optional)* | `https://yotasage.github.io/pdf/main` | Privacy/self-hosted or general utility threads where relevant | 33 client-side PDF tools (read, compare, merge, split, compress, OCR, sign, redact, forms, convert, remove metadata) with zero uploads and no ads. |

## Healthy boundaries

- **Keep the honest framing:** Mention upfront that the tools were built for your own use and are published as-is, with no server, no ads, and no guarantees. People appreciate plain honesty and respect it.
- **Channel bug reports without taking on support:** Point people to GitHub Issues (which uses [.github/ISSUE_TEMPLATE/feedback.md](../../.github/ISSUE_TEMPLATE/feedback.md)) if they hit an edge case or rendering bug, and remind them not to attach confidential or proprietary files.
- **No obligation on feature requests:** You do not owe anyone a roadmap, SLA, or feature support. Pick up what is genuinely useful to you, log interesting ideas in [docs/BACKLOG.md](../BACKLOG.md) if you want, and feel completely fine saying no or leaving an issue closed.
