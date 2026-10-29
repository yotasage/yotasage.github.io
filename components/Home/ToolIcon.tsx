import React from 'react';

// Icons for the tool cards on the main page, in the style of components/PdfTools/ToolIcon.tsx. Filled shapes use
// currentColor, which the <svg> sets to the tool's colour.
export type HomeIconName = 'simsetup' | 'qrcode' | 'pdf' | 'base64' | 'textcase';

const SAMPLES: [number, number][] = [[6, 24], [12, 12], [18, 12], [24, 24], [30, 36], [36, 36], [42, 24]];

const QR_MODULES: [number, number][] = [
  [22, 5], [22, 13], [5, 22], [13, 22], [22, 22], [35, 22], [22, 31], [31, 31], [39, 35], [22, 39], [31, 39],
];

const ICONS: Record<HomeIconName, React.ReactNode> = {
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
  textcase: (
    <>
      <path d="M3 40 13 10l10 30M6.3 30h13.4" />
      <circle cx={34} cy={33} r={7} />
      <path d="M41 26v14" />
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
