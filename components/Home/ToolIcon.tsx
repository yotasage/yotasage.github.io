import React from 'react';

// Icons for the tool cards on the main page, in the style of components/PdfTools/ToolIcon.tsx. Filled shapes use
// currentColor, which the <svg> sets to the tool's colour.
export type HomeIconName = 'calculator' | 'integral' | 'derivative' | 'simsetup' | 'qrcode' | 'qrreader' | 'pdf' | 'base64' | 'paint' | 'notepad' | 'textcase' | 'viewer3d' | 'pcb' | 'resistor' | 'smith' | 'emsim';

const SAMPLES: [number, number][] = [[6, 24], [12, 12], [18, 12], [24, 24], [30, 36], [36, 36], [42, 24]];

const QR_MODULES: [number, number][] = [
  [22, 5], [22, 13], [5, 22], [13, 22], [22, 22], [35, 22], [22, 31], [31, 31], [39, 35], [22, 39], [31, 39],
];

const ICONS: Record<HomeIconName, React.ReactNode> = {
  // Engineering calculator: display screen, grid of keys, and equals bar.
  calculator: (
    <>
      <rect x={8} y={4} width={32} height={40} rx={4} />
      <rect x={13} y={9} width={22} height={9} rx={1.5} opacity={0.75} />
      <path d="M15 24h4M23 24h4M31 24h2M15 31h4M23 31h4M15 38h4M23 38h4" />
      <rect x={30} y={30} width={5} height={9.5} rx={1.2} fill="currentColor" stroke="none" />
    </>
  ),
  // Integral solver: tall integral sign next to a curve and shaded area between bounds.
  integral: (
    <>
      <path d="M16 9c-2.5 0-4 2-4 5.5v19c0 3.5-1.5 5.5-4 5.5" />
      <circle cx={16.5} cy={9} r={1.6} fill="currentColor" stroke="none" />
      <circle cx={7.5} cy={39} r={1.6} fill="currentColor" stroke="none" />
      <path d="M21 36h22" opacity={0.55} />
      <path d="M23 36V26c4-9 12-9 18-2v12" fill="currentColor" fillOpacity={0.18} stroke="none" />
      <path d="M21 29c4-11 13-12 22-4" />
      <path d="M24 25v11M40 24v12" opacity={0.7} />
    </>
  ),
  // Derivative solver: smooth curve with a tangent line, point of tangency, and slope triangle.
  derivative: (
    <>
      <path d="M6 39h36" opacity={0.45} />
      <path d="M8 35C15 34 21 29 27 19S36 10 42 10" />
      <path d="M11 33L39 9" opacity={0.75} />
      <path d="M24 22h11V12.5" opacity={0.5} strokeDasharray="2.5 2.5" />
      <circle cx={24} cy={22} r={2.8} fill="currentColor" stroke="none" />
    </>
  ),
  // A sampled sine wave: the signal, and the samples as a stem plot.
  simsetup: (
    <>
      <path d="M4 24h40M6 24C12 5 18 5 24 24S36 43 42 24" opacity={0.45} />
      <path d="M12 24V12M18 24V12M30 24v12M36 24v12" />
      {SAMPLES.map(([x, y]) => <circle key={x} cx={x} cy={y} r={2.6} fill="currentColor" stroke="none" />)}
    </>
  ),
  qrcode: (
    <>
      {[[5, 5], [31, 5], [5, 31]].map(([x, y]) => (
        <React.Fragment key={`${x},${y}`}>
          <rect x={x} y={y} width={12} height={12} rx={1.5} />
          <rect x={x + 4} y={y + 4} width={4} height={4} fill="currentColor" stroke="none" />
        </React.Fragment>
      ))}
      {QR_MODULES.map(([x, y]) => (
        <rect key={`${x},${y}`} x={x} y={y} width={4} height={4} rx={0.5} fill="currentColor" stroke="none" />
      ))}
    </>
  ),
  // A viewfinder's corners around a small code, with the scan line across it.
  qrreader: (
    <>
      <path d="M4 14V7a3 3 0 0 1 3-3h7M34 4h7a3 3 0 0 1 3 3v7M44 34v7a3 3 0 0 1-3 3h-7M14 44H7a3 3 0 0 1-3-3v-7" />
      <rect x={13} y={13} width={9} height={9} rx={1.2} />
      <rect x={26} y={13} width={9} height={9} rx={1.2} />
      <rect x={13} y={26} width={9} height={9} rx={1.2} />
      <rect x={27} y={27} width={3.5} height={3.5} fill="currentColor" stroke="none" />
      <rect x={31.5} y={31.5} width={3.5} height={3.5} fill="currentColor" stroke="none" />
      <path d="M8 24h32" opacity={0.6} />
    </>
  ),
  // Two documents, the front one with lines of text.
  pdf: (
    <>
      <path d="M16 12V4h18l6 6v26h-8M34 4v6h6" />
      <path d="M8 12h18l6 6v26H8zM26 12v6h6" />
      <path d="M14 26h12M14 32h12M14 38h7" />
    </>
  ),
  // An image and a block of text, with arrows both ways.
  base64: (
    <>
      <rect x={4} y={4} width={24} height={18} rx={2} />
      <circle cx={11} cy={10.5} r={2.2} />
      <path d="M5 20l7-6 5 4 4-3 6 5" />
      <path d="M10 26v7a4 4 0 0 0 4 4h2M13 34l3 3-3 3" />
      <path d="M38 26V15a4 4 0 0 0-4-4h-2M35 8l-3 3 3 3" />
      <path d="M20 30h7M31 30h13M20 37h13M37 37h7M20 44h9M33 44h5" />
    </>
  ),
  // Stacked layers with a tilted paintbrush across them.
  paint: (
    <>
      <path d="M6 31l18 9 18-9" opacity={0.55} />
      <path d="M6 24l18 9 18-9" opacity={0.75} />
      <path d="M24 8L6 17l18 9 18-9-18-9z" />
      <path d="M31 15l8-8a2.5 2.5 0 0 1 3.5 3.5l-8 8" />
      <circle cx={29} cy={17} r={2.2} fill="currentColor" stroke="none" />
    </>
  ),
  // Split text editor & diff view: two side-by-side panes with highlighted matching lines.
  notepad: (
    <>
      <rect x={5} y={7} width={38} height={34} rx={3.5} />
      <path d="M5 15h38" />
      <path d="M24 15v26" opacity={0.6} />
      <circle cx={10} cy={11} r={1.3} fill="currentColor" stroke="none" />
      <circle cx={15} cy={11} r={1.3} fill="currentColor" stroke="none" />
      <path d="M10 22h9M10 28h7M10 34h9" />
      <path d="M29 22h9M29 28h9M29 34h6" opacity={0.75} />
    </>
  ),
  textcase: (
    <>
      <path d="M3 40 13 10l10 30M6.3 30h13.4" />
      <circle cx={34} cy={33} r={7} />
      <path d="M41 26v14" />
    </>
  ),
  // A cube seen from a corner, with an orbit around it.
  viewer3d: (
    <>
      <path d="M24 9l13 7.5v15L24 39l-13-7.5v-15z" />
      <path d="M11 16.5L24 24l13-7.5M24 24v15" />
      <path d="M8.5 37.5C3 34 2.5 29.5 6 26M39.5 10.5C45 14 45.5 18.5 42 22" opacity={0.6} />
      <path d="M4 25.5l2 .5.5-2M44 22.5l-2-.5-.5 2" opacity={0.6} />
    </>
  ),
  // A board with a chip, its pins and two traces ending in vias.
  pcb: (
    <>
      <rect x={4} y={4} width={40} height={40} rx={4} />
      <rect x={17} y={17} width={14} height={14} rx={1.5} />
      <path d="M21 17v-4M27 17v-4M21 31v4M27 31v4M17 21h-4M17 27h-4M31 21h4M31 27h4" />
      <path d="M27 13l5-5h4M21 35l-5 5" opacity={0.6} />
      <circle cx={38} cy={8} r={2} fill="currentColor" stroke="none" />
      <circle cx={14.5} cy={40.5} r={2} fill="currentColor" stroke="none" />
    </>
  ),
  // An axial resistor: leads, body and bands, the tolerance band set apart.
  resistor: (
    <>
      <path d="M2 24h8M38 24h8" />
      <rect x={10} y={15} width={28} height={18} rx={5} />
      <path d="M17 15v18M22 15v18M27 15v18" opacity={0.6} />
      <path d="M33 16v16" />
    </>
  ),
  // A Smith chart: the unit circle and the real axis, the r = 1 circle and the x = ±1 arcs, the match in the centre.
  smith: (
    <>
      <circle cx={24} cy={24} r={20} />
      <path d="M4 24h40" />
      <circle cx={34} cy={24} r={10} opacity={0.6} />
      <path d="M44 24A20 20 0 0 1 24 4M44 24A20 20 0 0 0 24 44" opacity={0.6} />
      <circle cx={24} cy={24} r={2.6} fill="currentColor" stroke="none" />
    </>
  ),
  // A microstrip in cross-section: the trace on the dielectric over the ground plane, and two of the field's
  // equipotentials around it, ending on the plane.
  emsim: (
    <>
      <path d="M3 42h42" />
      <path d="M3 33h42" opacity={0.6} />
      <path d="M12 42C12 21 36 21 36 42" opacity={0.6} />
      <path d="M5 42C5 8 43 8 43 42" opacity={0.35} />
      <rect x={18} y={28} width={12} height={5} rx={1.2} fill="currentColor" />
    </>
  ),
};

export default function ToolIcon({ name, color, size = 48 }: { name: HomeIconName; color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      color={color}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[name]}
    </svg>
  );
}
