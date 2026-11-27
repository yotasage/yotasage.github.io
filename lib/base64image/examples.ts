export type Base64ImageExampleId =
  | 'encode-svg-badge'
  | 'encode-png-chart'
  | 'encode-pixel-icon'
  | 'decode-svg-datauri'
  | 'decode-png-datauri'
  | 'decode-raw-base64';

export interface Base64ImageExamplePreset {
  readonly id: Base64ImageExampleId;
  readonly direction: 'encode' | 'decode';
  readonly tagKey: string;
  readonly code: string;
  readonly titleKey: string;
  readonly descKey: string;
}

export const BASE64_IMAGE_EXAMPLES: readonly Base64ImageExamplePreset[] = [
  {
    id: 'encode-svg-badge',
    direction: 'encode',
    tagKey: 'ex.b64.svgBadge.tag',
    code: 'SVG · Vector',
    titleKey: 'ex.b64.svgBadge.title',
    descKey: 'ex.b64.svgBadge.desc',
  },
  {
    id: 'encode-png-chart',
    direction: 'encode',
    tagKey: 'ex.b64.pngChart.tag',
    code: 'PNG · 320×180',
    titleKey: 'ex.b64.pngChart.title',
    descKey: 'ex.b64.pngChart.desc',
  },
  {
    id: 'encode-pixel-icon',
    direction: 'encode',
    tagKey: 'ex.b64.pixelIcon.tag',
    code: 'PNG · 64×64',
    titleKey: 'ex.b64.pixelIcon.title',
    descKey: 'ex.b64.pixelIcon.desc',
  },
  {
    id: 'decode-svg-datauri',
    direction: 'decode',
    tagKey: 'ex.b64.decSvg.tag',
    code: 'data:image/svg+xml',
    titleKey: 'ex.b64.decSvg.title',
    descKey: 'ex.b64.decSvg.desc',
  },
  {
    id: 'decode-png-datauri',
    direction: 'decode',
    tagKey: 'ex.b64.decPng.tag',
    code: 'data:image/png;base64',
    titleKey: 'ex.b64.decPng.title',
    descKey: 'ex.b64.decPng.desc',
  },
  {
    id: 'decode-raw-base64',
    direction: 'decode',
    tagKey: 'ex.b64.decRaw.tag',
    code: 'Raw Base64 · PNG',
    titleKey: 'ex.b64.decRaw.title',
    descKey: 'ex.b64.decRaw.desc',
  },
];

const SAMPLE_BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="72" viewBox="0 0 240 72">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d9488"/>
      <stop offset="100%" stop-color="#2563eb"/>
    </linearGradient>
  </defs>
  <rect width="240" height="72" rx="14" fill="url(#g)"/>
  <circle cx="38" cy="36" r="18" fill="rgba(255,255,255,0.2)"/>
  <path d="M30 36l6 6 12-14" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="70" y="32" fill="#fff" font-family="system-ui,sans-serif" font-size="16" font-weight="700">BUILD PASSING</text>
  <text x="70" y="51" fill="rgba(255,255,255,0.88)" font-family="ui-monospace,monospace" font-size="12">v2.4.0 · static</text>
</svg>`;

const SAMPLE_DECODE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="140" viewBox="0 0 220 140">
  <rect width="220" height="140" rx="12" fill="#0f172a"/>
  <circle cx="72" cy="70" r="36" fill="#38bdf8" opacity="0.88"/>
  <circle cx="116" cy="70" r="36" fill="#f472b6" opacity="0.82"/>
  <circle cx="152" cy="70" r="24" fill="#fbbf24" opacity="0.9"/>
  <text x="110" y="124" text-anchor="middle" fill="#e2e8f0" font-family="system-ui,sans-serif" font-size="12" font-weight="600">Decoded Vector Graphic</text>
</svg>`;

function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function renderCanvasToPngBlob(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  draw(ctx);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png');
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function buildBase64EncodeFile(
  id: 'encode-svg-badge' | 'encode-png-chart' | 'encode-pixel-icon',
): Promise<File> {
  if (id === 'encode-svg-badge') {
    return new File([SAMPLE_BADGE_SVG], 'status-badge.svg', { type: 'image/svg+xml' });
  }
  if (id === 'encode-png-chart') {
    const blob = await renderCanvasToPngBlob(320, 180, (ctx) => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 320, 180);
      ctx.strokeStyle = 'rgba(148,163,184,0.22)';
      for (let y = 30; y < 150; y += 30) {
        ctx.beginPath();
        ctx.moveTo(24, y);
        ctx.lineTo(296, y);
        ctx.stroke();
      }
      const bars = [48, 86, 118, 74, 132, 98, 144];
      bars.forEach((h, i) => {
        ctx.fillStyle = i % 2 === 0 ? '#38bdf8' : '#2dd4bf';
        ctx.fillRect(36 + i * 36, 152 - h, 24, h);
      });
    });
    return new File([blob], 'signal-bars.png', { type: 'image/png' });
  }
  const blob = await renderCanvasToPngBlob(64, 64, (ctx) => {
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(16, 12, 32, 40);
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(22, 18, 20, 14);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(22, 38, 8, 8);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(34, 38, 8, 8);
  });
  return new File([blob], 'chip-icon.png', { type: 'image/png' });
}

export async function buildBase64DecodePayload(
  id: 'decode-svg-datauri' | 'decode-png-datauri' | 'decode-raw-base64',
): Promise<{ text: string; fileName: string }> {
  if (id === 'decode-svg-datauri') {
    return {
      text: `data:image/svg+xml;base64,${toBase64Utf8(SAMPLE_DECODE_SVG)}`,
      fileName: 'decoded-circles',
    };
  }
  const blob = await renderCanvasToPngBlob(160, 120, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 160, 120);
    grad.addColorStop(0, id === 'decode-png-datauri' ? '#4f46e5' : '#059669');
    grad.addColorStop(1, id === 'decode-png-datauri' ? '#ec4899' : '#0ea5e9');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 160, 120);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(80, 60, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(id === 'decode-png-datauri' ? 'PNG' : 'RAW', 80, 66);
  });
  const b64 = await blobToBase64(blob);
  if (id === 'decode-png-datauri') {
    return {
      text: `data:image/png;base64,${b64}`,
      fileName: 'decoded-gradient',
    };
  }
  return {
    text: b64,
    fileName: 'raw-detected-png',
  };
}
