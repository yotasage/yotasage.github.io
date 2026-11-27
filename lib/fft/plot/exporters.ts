// Publication figure exporters for the FFT / Spectrum Analyzer:
// SVG (XML-escaped), PNG (HiDPI Canvas), Vector PDF (lazy @cantoo/pdf-lib),
// TikZ / pgfplots (LaTeX-escaped), and Matplotlib .py + .csv ZIP (fflate).

import { zipSync, strToU8 } from 'fflate';
import {
  layoutPlot,
  renderPlotToCanvas,
  type PlotSpec,
} from './engine';

export function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function escapeLatex(text: string): string {
  return text
    .replaceAll('\\', '\\textbackslash{}')
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}')
    .replaceAll('$', '\\$')
    .replaceAll('%', '\\%')
    .replaceAll('&', '\\&')
    .replaceAll('#', '\\#')
    .replaceAll('_', '\\_')
    .replaceAll('^', '\\textasciicircum{}')
    .replaceAll('~', '\\textasciitilde{}');
}

/** Guard CSV text cells against spreadsheet formula injection (=, +, -, @, tab, CR). */
export function sanitizeCsvCell(value: string): string {
  const cleaned = value.replace(/\r?\n/g, ' ');
  const prefixed = /^[=+\-@\t\r]/.test(cleaned) ? `'${cleaned}` : cleaned;
  if (/[",]/.test(prefixed)) {
    return `"${prefixed.replaceAll('"', '""')}"`;
  }
  return prefixed;
}

/** Safe Python string literal using JSON.stringify + ASCII control stripping. */
export function pyStringLiteral(value: string): string {
  const safe = value.replace(/[\u0000-\u001f\u007f]/g, ' ');
  return JSON.stringify(safe);
}

/** Generate standalone vector SVG with matplotlib 6.4x4.8 inch proportions. */
export function exportPlotSvg(
  spec: PlotSpec,
  width = 768,
  height = 576,
  transparentBg = false,
): string {
  const layout = layoutPlot(spec, width, height);
  const { axes, theme, xTicks, yTicks } = layout;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="DejaVu Sans, -apple-system, BlinkMacSystemFont, sans-serif">`,
  );
  parts.push(
    `<defs><clipPath id="axes-clip"><rect x="${axes.x}" y="${axes.y}" width="${axes.w}" height="${axes.h}"/></clipPath></defs>`,
  );
  if (!transparentBg) {
    parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(theme.bg)}"/>`);
    parts.push(
      `<rect x="${axes.x}" y="${axes.y}" width="${axes.w}" height="${axes.h}" fill="${escapeXml(theme.axesBg)}"/>`,
    );
  }

  parts.push('<g clip-path="url(#axes-clip)">');

  for (const span of spec.vSpans) {
    const sx0 = Math.max(axes.x, layout.xToPx(span.x0));
    const sx1 = Math.min(axes.x + axes.w, layout.xToPx(span.x1));
    if (sx1 > sx0) {
      parts.push(
        `<rect x="${sx0.toFixed(2)}" y="${axes.y}" width="${(sx1 - sx0).toFixed(2)}" height="${axes.h}" fill="${escapeXml(span.color)}"/>`,
      );
    }
  }

  if (theme.showGrid) {
    for (const t of xTicks) {
      if (t.pos < axes.x || t.pos > axes.x + axes.w) continue;
      parts.push(
        `<line x1="${t.pos.toFixed(2)}" y1="${axes.y}" x2="${t.pos.toFixed(2)}" y2="${axes.y + axes.h}" stroke="${escapeXml(theme.grid)}" stroke-width="0.75"/>`,
      );
    }
    for (const t of yTicks) {
      if (t.pos < axes.y || t.pos > axes.y + axes.h) continue;
      parts.push(
        `<line x1="${axes.x}" y1="${t.pos.toFixed(2)}" x2="${axes.x + axes.w}" y2="${t.pos.toFixed(2)}" stroke="${escapeXml(theme.grid)}" stroke-width="0.75"/>`,
      );
    }
  }

  for (const hl of spec.hLines) {
    const py = layout.yToPx(hl.y);
    if (py < axes.y || py > axes.y + axes.h) continue;
    const dash = (hl.dash ?? [5, 4]).join(',');
    parts.push(
      `<line x1="${axes.x}" y1="${py.toFixed(2)}" x2="${axes.x + axes.w}" y2="${py.toFixed(2)}" stroke="${escapeXml(hl.color)}" stroke-width="1.1" stroke-dasharray="${dash}"/>`,
    );
  }

  for (const s of layout.decimatedSeries) {
    if (s.kind === 'bar') {
      for (const b of s.bars) {
        parts.push(
          `<rect x="${b.x.toFixed(2)}" y="${b.y.toFixed(2)}" width="${b.w.toFixed(2)}" height="${b.h.toFixed(2)}" fill="${escapeXml(s.color)}"/>`,
        );
      }
    } else if (s.points.length > 0) {
      const d = s.points
        .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`)
        .join(' ');
      const dashAttr = s.dash.length ? ` stroke-dasharray="${s.dash.join(',')}"` : '';
      parts.push(
        `<path d="${d}" fill="none" stroke="${escapeXml(s.color)}" stroke-width="${s.lineWidth}" stroke-linejoin="round"${dashAttr}/>`,
      );
    }
  }

  for (const m of spec.markers) {
    if (spec.xScale === 'log' && m.x <= 0) continue;
    const px = layout.xToPx(m.x);
    const py = layout.yToPx(m.y);
    if (px < axes.x || px > axes.x + axes.w || py < axes.y - 2 || py > axes.y + axes.h + 2) continue;
    if (m.shape === 'circle') {
      parts.push(
        `<circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="4" fill="${escapeXml(m.color)}" stroke="${escapeXml(theme.axesBg)}" stroke-width="1"/>`,
      );
    } else if (m.shape === 'triangle') {
      parts.push(
        `<polygon points="${px.toFixed(1)},${(py - 4.5).toFixed(1)} ${(px + 4).toFixed(1)},${(py + 3.5).toFixed(1)} ${(px - 4).toFixed(1)},${(py + 3.5).toFixed(1)}" fill="${escapeXml(m.color)}"/>`,
      );
    } else {
      parts.push(
        `<polygon points="${px.toFixed(1)},${(py - 4.5).toFixed(1)} ${(px + 4).toFixed(1)},${py.toFixed(1)} ${px.toFixed(1)},${(py + 4.5).toFixed(1)} ${(px - 4).toFixed(1)},${py.toFixed(1)}" fill="${escapeXml(m.color)}"/>`,
      );
    }
    parts.push(
      `<text x="${px.toFixed(1)}" y="${Math.max(axes.y + 11, py - 7).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="600" fill="${escapeXml(m.color)}">${escapeXml(m.label)}</text>`,
    );
  }

  parts.push('</g>');

  // Four spines
  parts.push(
    `<rect x="${axes.x}" y="${axes.y}" width="${axes.w}" height="${axes.h}" fill="none" stroke="${escapeXml(theme.spine)}" stroke-width="0.9"/>`,
  );

  // Ticks
  for (const t of xTicks) {
    if (t.pos < axes.x - 1 || t.pos > axes.x + axes.w + 1) continue;
    parts.push(
      `<line x1="${t.pos.toFixed(2)}" y1="${axes.y + axes.h}" x2="${t.pos.toFixed(2)}" y2="${axes.y + axes.h + 4}" stroke="${escapeXml(theme.spine)}" stroke-width="0.9"/>`,
    );
    parts.push(
      `<text x="${t.pos.toFixed(2)}" y="${axes.y + axes.h + 16}" text-anchor="middle" font-size="11" fill="${escapeXml(theme.fg)}">${escapeXml(t.label)}</text>`,
    );
  }
  for (const t of yTicks) {
    if (t.pos < axes.y - 1 || t.pos > axes.y + axes.h + 1) continue;
    parts.push(
      `<line x1="${axes.x}" y1="${t.pos.toFixed(2)}" x2="${axes.x - 4}" y2="${t.pos.toFixed(2)}" stroke="${escapeXml(theme.spine)}" stroke-width="0.9"/>`,
    );
    parts.push(
      `<text x="${axes.x - 8}" y="${(t.pos + 3.5).toFixed(2)}" text-anchor="end" font-size="11" fill="${escapeXml(theme.fg)}">${escapeXml(t.label)}</text>`,
    );
  }

  // Title & axis labels
  parts.push(
    `<text x="${(axes.x + axes.w / 2).toFixed(1)}" y="${(axes.y - 12).toFixed(1)}" text-anchor="middle" font-size="12.5" font-weight="600" fill="${escapeXml(theme.fg)}">${escapeXml(spec.title)}</text>`,
  );
  parts.push(
    `<text x="${(axes.x + axes.w / 2).toFixed(1)}" y="${height - 8}" text-anchor="middle" font-size="12" fill="${escapeXml(theme.fg)}">${escapeXml(spec.xLabel)}</text>`,
  );
  parts.push(
    `<text transform="translate(17,${(axes.y + axes.h / 2).toFixed(1)}) rotate(-90)" text-anchor="middle" font-size="12" fill="${escapeXml(theme.fg)}">${escapeXml(spec.yLabel)}</text>`,
  );

  // Legend
  if (spec.showLegend) {
    const items = [
      ...spec.series.map((s) => ({ label: s.label, color: s.color, dash: s.dash ?? [] })),
      ...spec.hLines.map((h) => ({ label: h.label, color: h.color, dash: h.dash ?? [5, 4] })),
    ];
    if (items.length > 0) {
      const boxW = Math.min(axes.w * 0.5, 220);
      const rowH = 15;
      const boxH = items.length * rowH + 10;
      const bx = axes.x + axes.w - boxW - 8;
      const by = axes.y + 8;
      parts.push(
        `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${boxW.toFixed(1)}" height="${boxH}" fill="${escapeXml(theme.axesBg)}" fill-opacity="0.9" stroke="${escapeXml(theme.grid)}" stroke-width="0.8"/>`,
      );
      items.forEach((it, idx) => {
        const ry = by + 5 + rowH * (idx + 0.5);
        const dashAttr = it.dash.length ? ` stroke-dasharray="${it.dash.join(',')}"` : '';
        parts.push(
          `<line x1="${(bx + 7).toFixed(1)}" y1="${ry.toFixed(1)}" x2="${(bx + 21).toFixed(1)}" y2="${ry.toFixed(1)}" stroke="${escapeXml(it.color)}" stroke-width="1.6"${dashAttr}/>`,
        );
        parts.push(
          `<text x="${(bx + 26).toFixed(1)}" y="${(ry + 3.5).toFixed(1)}" font-size="10.5" fill="${escapeXml(theme.fg)}">${escapeXml(it.label)}</text>`,
        );
      });
    }
  }

  parts.push('</svg>');
  return parts.join('\n');
}

/** Export plot as PNG Blob at requested DPI (default 300 dpi for 6.4x4.8 in). */
export async function exportPlotPng(
  spec: PlotSpec,
  dpi = 300,
  transparentBg = false,
): Promise<Blob> {
  const baseW = 640;
  const baseH = 480;
  const scale = Math.min(4, Math.max(1, dpi / 100));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(baseW * scale);
  canvas.height = Math.round(baseH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  const layout = layoutPlot(spec, baseW, baseH);
  renderPlotToCanvas(ctx, layout, scale, { transparentBg });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG encoding failed'));
    }, 'image/png');
  });
}

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16) / 255,
      parseInt(clean.slice(2, 4), 16) / 255,
      parseInt(clean.slice(4, 6), 16) / 255,
    ];
  }
  return [0.12, 0.47, 0.71];
}

function asciiSafe(s: string): string {
  // Standard PDF WinAnsi fonts (Helvetica) don't encode Greek/math symbols cleanly
  return s
    .replaceAll('—', '-')
    .replaceAll('–', '-')
    .replaceAll('Ω', 'Ohm')
    .replaceAll('√', 'sqrt')
    .replaceAll('µ', 'u')
    .replaceAll('μ', 'u')
    .replace(/[^\x20-\x7E]/g, '?');
}

/** Export vector PDF (6.4 x 4.8 in = 460.8 x 345.6 pt) via lazy-loaded @cantoo/pdf-lib. */
export async function exportPlotPdf(spec: PlotSpec): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('@cantoo/pdf-lib');
  const widthPt = 460.8;
  const heightPt = 345.6;
  const layout = layoutPlot(spec, widthPt, heightPt);
  const { axes, theme, xTicks, yTicks } = layout;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([widthPt, heightPt]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pdfY = (py: number) => heightPt - py;
  const [bgR, bgG, bgB] = hexToRgb01(theme.bg);
  const [fgR, fgG, fgB] = hexToRgb01(theme.fg);
  const [spR, spG, spB] = hexToRgb01(theme.spine);
  const [grR, grG, grB] = hexToRgb01(theme.grid);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: widthPt,
    height: heightPt,
    color: rgb(bgR, bgG, bgB),
  });

  if (theme.showGrid) {
    for (const t of xTicks) {
      if (t.pos < axes.x || t.pos > axes.x + axes.w) continue;
      page.drawLine({
        start: { x: t.pos, y: pdfY(axes.y) },
        end: { x: t.pos, y: pdfY(axes.y + axes.h) },
        thickness: 0.5,
        color: rgb(grR, grG, grB),
      });
    }
    for (const t of yTicks) {
      if (t.pos < axes.y || t.pos > axes.y + axes.h) continue;
      page.drawLine({
        start: { x: axes.x, y: pdfY(t.pos) },
        end: { x: axes.x + axes.w, y: pdfY(t.pos) },
        thickness: 0.5,
        color: rgb(grR, grG, grB),
      });
    }
  }

  for (const hl of spec.hLines) {
    const py = layout.yToPx(hl.y);
    if (py < axes.y || py > axes.y + axes.h) continue;
    const [r, g, b] = hexToRgb01(hl.color);
    page.drawLine({
      start: { x: axes.x, y: pdfY(py) },
      end: { x: axes.x + axes.w, y: pdfY(py) },
      thickness: 0.8,
      dashArray: [4, 3],
      color: rgb(r, g, b),
    });
  }

  for (const s of layout.decimatedSeries) {
    const [r, g, b] = hexToRgb01(s.color);
    if (s.kind === 'bar') {
      for (const bar of s.bars) {
        page.drawRectangle({
          x: bar.x,
          y: pdfY(bar.y + bar.h),
          width: bar.w,
          height: bar.h,
          color: rgb(r, g, b),
        });
      }
    } else if (s.points.length > 1) {
      for (let i = 1; i < s.points.length; i++) {
        const [x0, y0] = s.points[i - 1];
        const [x1, y1] = s.points[i];
        const cx0 = Math.min(axes.x + axes.w, Math.max(axes.x, x0));
        const cx1 = Math.min(axes.x + axes.w, Math.max(axes.x, x1));
        const cy0 = Math.min(axes.y + axes.h, Math.max(axes.y, y0));
        const cy1 = Math.min(axes.y + axes.h, Math.max(axes.y, y1));
        page.drawLine({
          start: { x: cx0, y: pdfY(cy0) },
          end: { x: cx1, y: pdfY(cy1) },
          thickness: s.lineWidth * 0.8,
          color: rgb(r, g, b),
        });
      }
    }
  }

  // Spines
  page.drawRectangle({
    x: axes.x,
    y: pdfY(axes.y + axes.h),
    width: axes.w,
    height: axes.h,
    borderColor: rgb(spR, spG, spB),
    borderWidth: 0.75,
  });

  // Ticks
  for (const t of xTicks) {
    if (t.pos < axes.x - 1 || t.pos > axes.x + axes.w + 1) continue;
    page.drawLine({
      start: { x: t.pos, y: pdfY(axes.y + axes.h) },
      end: { x: t.pos, y: pdfY(axes.y + axes.h + 3.5) },
      thickness: 0.7,
      color: rgb(spR, spG, spB),
    });
    const lbl = asciiSafe(t.label);
    const tw = font.widthOfTextAtSize(lbl, 8);
    page.drawText(lbl, {
      x: t.pos - tw / 2,
      y: pdfY(axes.y + axes.h + 13),
      size: 8,
      font,
      color: rgb(fgR, fgG, fgB),
    });
  }
  for (const t of yTicks) {
    if (t.pos < axes.y - 1 || t.pos > axes.y + axes.h + 1) continue;
    page.drawLine({
      start: { x: axes.x, y: pdfY(t.pos) },
      end: { x: axes.x - 3.5, y: pdfY(t.pos) },
      thickness: 0.7,
      color: rgb(spR, spG, spB),
    });
    const lbl = asciiSafe(t.label);
    const tw = font.widthOfTextAtSize(lbl, 8);
    page.drawText(lbl, {
      x: axes.x - 6 - tw,
      y: pdfY(t.pos + 2.5),
      size: 8,
      font,
      color: rgb(fgR, fgG, fgB),
    });
  }

  const title = asciiSafe(spec.title);
  const titleW = fontBold.widthOfTextAtSize(title, 9.5);
  page.drawText(title, {
    x: axes.x + (axes.w - titleW) / 2,
    y: pdfY(axes.y - 9),
    size: 9.5,
    font: fontBold,
    color: rgb(fgR, fgG, fgB),
  });

  const xLbl = asciiSafe(spec.xLabel);
  const xLblW = font.widthOfTextAtSize(xLbl, 9);
  page.drawText(xLbl, {
    x: axes.x + (axes.w - xLblW) / 2,
    y: 8,
    size: 9,
    font,
    color: rgb(fgR, fgG, fgB),
  });

  return pdfDoc.save();
}

/** Downsample a series into data coordinates for TikZ / CSV export (at most maxPts). */
function downsampleDataCoords(
  x: number[] | Float64Array,
  y: number[] | Float64Array,
  maxPts: number,
): [number, number][] {
  const n = Math.min(x.length, y.length);
  if (n <= maxPts) {
    const out: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      if (Number.isFinite(x[i]) && Number.isFinite(y[i])) out.push([x[i], y[i]]);
    }
    return out;
  }
  const stride = n / (maxPts / 2);
  const out: [number, number][] = [];
  for (let b = 0; b < maxPts / 2; b++) {
    const s = Math.floor(b * stride);
    const e = Math.min(n, Math.floor((b + 1) * stride));
    let minIdx = s;
    let maxIdx = s;
    for (let i = s; i < e; i++) {
      if (y[i] < y[minIdx]) minIdx = i;
      if (y[i] > y[maxIdx]) maxIdx = i;
    }
    if (minIdx <= maxIdx) {
      out.push([x[minIdx], y[minIdx]]);
      if (maxIdx !== minIdx) out.push([x[maxIdx], y[maxIdx]]);
    } else {
      out.push([x[maxIdx], y[maxIdx]]);
      if (maxIdx !== minIdx) out.push([x[minIdx], y[minIdx]]);
    }
  }
  return out;
}

/** Export a compilable standalone pgfplots / TikZ `.tex` file (all text LaTeX-escaped). */
export function exportPlotTikz(spec: PlotSpec): string {
  const axisType = spec.xScale === 'log' ? 'semilogxaxis' : 'axis';
  const lines: string[] = [
    '% Generated by FFT / Spectrum Analyzer (client-side)',
    '\\documentclass[tikz,border=4pt]{standalone}',
    '\\usepackage{pgfplots}',
    '\\pgfplotsset{compat=1.18}',
    '\\begin{document}',
    '\\begin{tikzpicture}',
    `\\begin{${axisType}}[`,
    '  width=12cm, height=8.5cm,',
    `  title={${escapeLatex(spec.title)}},`,
    `  xlabel={${escapeLatex(spec.xLabel)}},`,
    `  ylabel={${escapeLatex(spec.yLabel)}},`,
    `  xmin=${spec.xLim[0].toPrecision(6)}, xmax=${spec.xLim[1].toPrecision(6)},`,
    `  ymin=${spec.yLim[0].toPrecision(6)}, ymax=${spec.yLim[1].toPrecision(6)},`,
    '  grid=major,',
    '  legend pos=north east,',
    ']',
  ];

  const pgfColors = ['blue', 'orange', 'green!60!black', 'red', 'violet'];
  spec.series.forEach((s, idx) => {
    const pts = downsampleDataCoords(s.x, s.y, 1200);
    const color = pgfColors[idx % pgfColors.length];
    const plotOpts = s.kind === 'bar' ? `ybar, fill=${color}` : `color=${color}, line width=0.8pt`;
    lines.push(`\\addplot[${plotOpts}] coordinates {`);
    for (const [xv, yv] of pts) {
      if (spec.xScale === 'log' && xv <= 0) continue;
      lines.push(`  (${xv.toPrecision(7)},${yv.toPrecision(6)})`);
    }
    lines.push('};');
    if (spec.showLegend) {
      lines.push(`\\addlegendentry{${escapeLatex(s.label)}}`);
    }
  });

  lines.push(`\\end{${axisType}}`);
  lines.push('\\end{tikzpicture}');
  lines.push('\\end{document}');
  return lines.join('\n');
}

/** Export a reproducible Matplotlib bundle (`plot_spectrum.py` + CSV data) as a ZIP archive. */
export function exportPlotMatplotlibZip(spec: PlotSpec): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const seriesFiles: { filename: string; label: string; color: string; kind: 'line' | 'bar' }[] = [];

  spec.series.forEach((s, idx) => {
    const filename = `series_${idx + 1}.csv`;
    const rows: string[] = [
      `${sanitizeCsvCell(spec.xLabel)},${sanitizeCsvCell(spec.yLabel)}`,
    ];
    const n = Math.min(s.x.length, s.y.length);
    for (let i = 0; i < n; i++) {
      rows.push(`${s.x[i]},${s.y[i]}`);
    }
    files[filename] = strToU8(rows.join('\n') + '\n');
    seriesFiles.push({
      filename,
      label: s.label,
      color: s.color,
      kind: s.kind ?? 'line',
    });
  });

  const pyLines: string[] = [
    '#!/usr/bin/env python3',
    '# Reproducible Matplotlib figure generated by FFT / Spectrum Analyzer.',
    'import csv',
    'import matplotlib.pyplot as plt',
    '',
    'def load_csv(path):',
    '    xs, ys = [], []',
    '    with open(path, newline="", encoding="utf-8") as f:',
    '        reader = csv.reader(f)',
    '        next(reader, None)',
    '        for row in reader:',
    '            if len(row) >= 2:',
    '                xs.append(float(row[0]))',
    '                ys.append(float(row[1]))',
    '    return xs, ys',
    '',
    'fig, ax = plt.subplots(figsize=(6.4, 4.8), dpi=150)',
  ];

  for (const sf of seriesFiles) {
    pyLines.push(`x, y = load_csv(${pyStringLiteral(sf.filename)})`);
    if (sf.kind === 'bar') {
      pyLines.push(
        `ax.bar(x, y, width=0.6, color=${pyStringLiteral(sf.color)}, label=${pyStringLiteral(sf.label)})`,
      );
    } else {
      pyLines.push(
        `ax.plot(x, y, linewidth=1.2, color=${pyStringLiteral(sf.color)}, label=${pyStringLiteral(sf.label)})`,
      );
    }
  }

  for (const hl of spec.hLines) {
    pyLines.push(
      `ax.axhline(${hl.y.toFixed(6)}, linestyle="--", linewidth=1.0, color=${pyStringLiteral(hl.color)}, label=${pyStringLiteral(hl.label)})`,
    );
  }

  if (spec.xScale === 'log') {
    pyLines.push('ax.set_xscale("log")');
  }
  pyLines.push(`ax.set_xlim(${spec.xLim[0]}, ${spec.xLim[1]})`);
  pyLines.push(`ax.set_ylim(${spec.yLim[0]}, ${spec.yLim[1]})`);
  pyLines.push(`ax.set_title(${pyStringLiteral(spec.title)})`);
  pyLines.push(`ax.set_xlabel(${pyStringLiteral(spec.xLabel)})`);
  pyLines.push(`ax.set_ylabel(${pyStringLiteral(spec.yLabel)})`);
  pyLines.push('ax.grid(True, alpha=0.35)');
  if (spec.showLegend) {
    pyLines.push('ax.legend(loc="upper right", fontsize=8.5)');
  }
  pyLines.push('fig.tight_layout()');
  pyLines.push('fig.savefig("figure.pdf")');
  pyLines.push('fig.savefig("figure.png", dpi=300)');
  pyLines.push('plt.show()');

  files['plot_spectrum.py'] = strToU8(pyLines.join('\n') + '\n');
  return zipSync(files, { level: 6 });
}
