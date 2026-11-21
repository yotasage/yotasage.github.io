import React from 'react';

import { ToolIconName } from '../../lib/pdf/tools';

// A document outline with a folded corner, drawn at (x, y) in a 48 × 48 view box.
function Doc({ x, y, w = 18, h = 24 }: { x: number; y: number; w?: number; h?: number }) {
  const fold = 6;
  return <path d={`M${x} ${y}h${w - fold}l${fold} ${fold}v${h - fold}h${-w}z M${x + w - fold} ${y}v${fold}h${fold}`} />;
}

const ICONS: Record<ToolIconName, React.ReactNode> = {
  reader: (
    <>
      <path d="M24 12c-4.5-3.2-10.5-4-18-3.5v28.5c7.5-.5 13.5.3 18 3.5 4.5-3.2 10.5-4 18-3.5V8.5C34.5 8 28.5 8.8 24 12z" />
      <path d="M24 12v28.5" />
      <path d="M11 16.5h8M11 22.5h8M11 28.5h6M29 16.5h8M29 22.5h8M29 28.5h6" />
    </>
  ),
  compare: (
    <>
      <Doc x={4} y={6} w={18} h={30} />
      <Doc x={26} y={12} w={18} h={30} />
      <path d="M9 18h8M9 24h6M9 30h8" />
      <path d="M31 24h8M31 30h8M35 20v8" />
      <path d="M20 10h6m-2-2 2 2-2 2" />
    </>
  ),
  merge: (
    <>
      <Doc x={4} y={4} w={16} h={20} />
      <Doc x={28} y={4} w={16} h={20} />
      <path d="M12 26v4l12 6 12-6v-4" />
      <Doc x={16} y={30} w={16} h={14} />
    </>
  ),
  split: (
    <>
      <Doc x={15} y={4} w={18} h={16} />
      <path d="M24 20v4M12 30v-3l12-3 12 3v3" />
      <Doc x={4} y={30} w={16} h={14} />
      <Doc x={28} y={30} w={16} h={14} />
    </>
  ),
  compress: (
    <>
      <Doc x={13} y={10} w={22} h={28} />
      <path d="M24 2v7m-4-4 4 4 4-4M24 46v-7m-4 4 4-4 4 4" />
      <path d="M18 22h12M18 27h12M18 32h8" />
    </>
  ),
  linearize: (
    <>
      <Doc x={6} y={4} w={26} h={36} />
      <path d="M12 16h12M12 22h9M12 28h7" />
      <path d="M35 16l-8 13h7l-3 13 11-16h-7l4-10z" />
    </>
  ),
  repair: (
    <>
      <Doc x={5} y={4} w={26} h={36} />
      <path d="M11 16h12M11 22h8" />
      <path d="M39 23a6.5 6.5 0 0 1-8.4 6.2L22 37.8a2.5 2.5 0 0 1-3.5-3.5l8.6-8.6A6.5 6.5 0 0 1 35.5 18l-3.3 3.3 2.5 2.5L38 20.5A6.5 6.5 0 0 1 39 23z" />
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
  'pdf-to-images': (
    <>
      <Doc x={4} y={4} w={20} h={26} />
      <path d="M9 17h10m-4-4 4 4-4 4" />
      <rect x={18} y={20} width={26} height={22} rx={2} />
      <circle cx={25} cy={27} r={2.5} />
      <path d="M18 39l8-7 6 5 5-4 7 6" />
    </>
  ),
  'extract-images': (
    <>
      <Doc x={5} y={6} w={24} h={32} />
      <rect x={21} y={16} width={22} height={18} rx={2} />
      <circle cx={27} cy={22} r={2} />
      <path d="M21 31l6-5 5 4 4-3 7 5" />
      <path d="M32 39v5m-3-3 3 3 3-3" />
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
  protect: (
    <>
      <Doc x={5} y={4} w={24} h={32} />
      <path d="M11 16h12M11 22h8" />
      <rect x={25} y={26} width={18} height={16} rx={2.5} />
      <path d="M29 26v-5a5 5 0 0 1 10 0v5" />
      <circle cx={34} cy={34} r={1.8} />
    </>
  ),
  unlock: (
    <>
      <Doc x={5} y={4} w={24} h={32} />
      <path d="M11 16h12M11 22h8" />
      <rect x={25} y={26} width={18} height={16} rx={2.5} />
      <path d="M29 26v-5a5 5 0 0 1 9.8-1.5" />
      <circle cx={34} cy={34} r={1.8} />
    </>
  ),
  'edit-metadata': (
    <>
      <Doc x={5} y={4} w={24} h={32} />
      <path d="M11 16h12M11 22h8M11 28h6" />
      <path d="M25 39l2-7 12-12 5 5-12 12-7 2z" />
      <path d="M36 23l5 5" />
    </>
  ),
  'remove-annotations': (
    <>
      <Doc x={4} y={4} w={24} h={32} />
      <path d="M10 16h12M10 22h10" />
      <path d="M23 24h19a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H31l-5 4v-4h-3a2 2 0 0 1-2-2V26a2 2 0 0 1 2-2z" />
      <path d="M29 29l7 6M36 29l-7 6" />
    </>
  ),
  flatten: (
    <>
      <path d="M24 5v10m-4-4 4 4 4-4" />
      <path d="M8 22l16-6 16 6-16 6z" />
      <path d="M8 31l16 6 16-6" />
      <path d="M8 38h32" />
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
  organize: (
    <>
      <rect x={5} y={5} width={15} height={17} rx={2} />
      <rect x={28} y={5} width={15} height={17} rx={2} />
      <rect x={5} y={26} width={15} height={17} rx={2} />
      <rect x={28} y={26} width={15} height={17} rx={2} strokeDasharray="3 3" />
      <path d="M21 13h6m-2-2 2 2-2 2" />
    </>
  ),
  'page-numbers': (
    <>
      <Doc x={7} y={4} w={26} h={34} />
      <path d="M13 15h14M13 21h10" />
      <rect x={24} y={28} width={18} height={15} rx={3} />
      <path d="M33 32v7m-2-5.5L33 32m-2 7h4" />
    </>
  ),
  watermark: (
    <>
      <Doc x={8} y={4} w={32} h={40} />
      <circle cx={24} cy={26} r={9} strokeDasharray="3 3" />
      <path d="M15 33l18-14M19 36l14-11" />
    </>
  ),
  crop: (
    <>
      <path d="M13 5v28a2 2 0 0 0 2 2h28" />
      <path d="M5 13h28a2 2 0 0 1 2 2v28" />
      <rect x={19} y={19} width={10} height={10} rx={1} strokeDasharray="3 3" />
    </>
  ),
  resize: (
    <>
      <rect x={6} y={6} width={36} height={36} rx={3} />
      <rect x={6} y={23} width={19} height={19} rx={2} />
      <path d="M28 20l9-9M31 11h6v6M34 20h-6v-6" />
    </>
  ),
  nup: (
    <>
      <rect x={4} y={9} width={40} height={30} rx={3} />
      <rect x={9} y={14} width={12} height={8} rx={1} />
      <rect x={27} y={14} width={12} height={8} rx={1} />
      <rect x={9} y={26} width={12} height={8} rx={1} />
      <rect x={27} y={26} width={12} height={8} rx={1} />
    </>
  ),
  grayscale: (
    <>
      <Doc x={8} y={4} w={32} h={40} />
      <circle cx={24} cy={27} r={9} />
      <path d="M24 18v18M24 21.5h6.6M24 25h8.6M24 28.5h8.8M24 32h7.2" />
    </>
  ),
  invert: (
    <>
      <Doc x={8} y={4} w={32} h={40} />
      <path d="M24 18a9 9 0 1 0 9 9 7.4 7.4 0 0 1-9-9z" />
      <path d="M31 18.5v3M29.5 20h3" />
    </>
  ),
  'fill-forms': (
    <>
      <Doc x={6} y={4} w={30} h={40} />
      <rect x={12} y={14} width={18} height={6} rx={1.5} />
      <rect x={12} y={24} width={6} height={6} rx={1} />
      <path d="M13.5 27l1.3 1.4 2.4-2.8" />
      <path d="M22 27h8" />
      <rect x={12} y={34} width={18} height={5} rx={1.5} />
      <path d="M35 31l7-7 3 3-7 7-4 1z" />
    </>
  ),
  sign: (
    <>
      <Doc x={5} y={4} w={29} h={40} />
      <path d="M11 15h14M11 21h10" />
      <path d="M10 34c2.5-6 5.5-6 6.5-1.5s3.5 3 5.5-2.5c1-2.5 2.5 2.5 5 2" />
      <path d="M10 38h19" />
      <path d="M32 33l10-10 3 3-10 10-4.5 1.5z" />
    </>
  ),
  edit: (
    <>
      <Doc x={5} y={4} w={28} h={40} />
      <path d="M11 14h12M11 20h14" />
      <rect x={11} y={26} width={11} height={8} rx={1.5} />
      <path d="M27 36l2.5-8.5L40 17l5 5-10.5 10.5L27 36z" />
      <path d="M37 20l5 5" />
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
