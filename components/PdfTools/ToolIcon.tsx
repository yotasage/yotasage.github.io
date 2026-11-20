import React from 'react';

import { ToolIconName } from '../../lib/pdf/tools';

// A document outline with a folded corner, drawn at (x, y) in a 48 × 48 view box.
function Doc({ x, y, w = 18, h = 24 }: { x: number; y: number; w?: number; h?: number }) {
  const fold = 6;
  return <path d={`M${x} ${y}h${w - fold}l${fold} ${fold}v${h - fold}h${-w}z M${x + w - fold} ${y}v${fold}h${fold}`} />;
}

const ICONS: Record<ToolIconName, React.ReactNode> = {
  merge: (
    <>
      <Doc x={4} y={4} w={16} h={20} />
      <Doc x={28} y={4} w={16} h={20} />
      <path d="M12 26v4l12 6 12-6v-4" />
      <Doc x={16} y={30} w={16} h={14} />
    </>
  ),
  compress: (
    <>
      <Doc x={13} y={10} w={22} h={28} />
      <path d="M24 2v7m-4-4 4 4 4-4M24 46v-7m-4 4 4-4 4 4" />
      <path d="M18 22h12M18 27h12M18 32h8" />
    </>
  ),
  images: (
    <>
      <rect x={4} y={8} width={26} height={22} rx={2} />
      <circle cx={11} cy={15} r={2.5} />
      <path d="M4 27l8-7 6 5 5-4 7 6" />
      <Doc x={24} y={18} w={20} h={26} />
      <path d="M29 33h10m-4-4 4 4-4 4" />
    </>
  ),
  sanitize: (
    <>
      <Doc x={4} y={4} w={24} h={32} />
      <path d="M10 16h12M10 22h8" />
      <path d="M35 21l9 3.5v7c0 6-4 9.5-9 12-5-2.5-9-6-9-12v-7z" />
      <path d="M31 32l3 3 5-6" />
    </>
  ),
  rotate: (
    <>
      <Doc x={11} y={12} w={22} h={28} />
      <path d="M34 14a13 13 0 0 0-21-5" />
      <path d="M34 7v7h-7" />
    </>
  ),
  'remove-pages': (
    <>
      <Doc x={8} y={6} w={24} h={32} />
      <path d="M14 18h12M14 24h8" />
      <circle cx={34} cy={34} r={9} />
      <path d="M30 34h8" />
    </>
  ),
  'extract-pages': (
    <>
      <Doc x={6} y={10} w={22} h={30} />
      <Doc x={22} y={4} w={20} h={26} />
      <path d="M30 18h8m-3-3 3 3-3 3" />
    </>
  ),
};

export default function ToolIcon({ name, color, size = 48 }: { name: ToolIconName; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}
