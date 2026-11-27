import { createLayer } from './canvasOps';
import { createRuntimeFromLayers, type ImageDocRuntime } from './documents';
import type { PaintLayer } from './types';

export type PaintExampleId =
  | 'geometric-poster'
  | 'pixel-sprite'
  | 'block-diagram'
  | 'sunset-landscape'
  | 'isometric-cubes';

export interface PaintExamplePreset {
  readonly id: PaintExampleId;
  readonly tagKey: string;
  readonly code: string;
  readonly titleKey: string;
  readonly descKey: string;
  readonly docName: string;
  readonly width: number;
  readonly height: number;
}

export const PAINT_EXAMPLES: readonly PaintExamplePreset[] = [
  {
    id: 'geometric-poster',
    tagKey: 'ex.paint.poster.tag',
    code: '800×600 · 3 Layers',
    titleKey: 'ex.paint.poster.title',
    descKey: 'ex.paint.poster.desc',
    docName: 'Geometric Poster',
    width: 800,
    height: 600,
  },
  {
    id: 'pixel-sprite',
    tagKey: 'ex.paint.sprite.tag',
    code: '64×64 · Pixel Art',
    titleKey: 'ex.paint.sprite.title',
    descKey: 'ex.paint.sprite.desc',
    docName: 'Retro Robot Sprite',
    width: 64,
    height: 64,
  },
  {
    id: 'block-diagram',
    tagKey: 'ex.paint.diagram.tag',
    code: '960×540 · 3 Layers',
    titleKey: 'ex.paint.diagram.title',
    descKey: 'ex.paint.diagram.desc',
    docName: 'Signal Chain Diagram',
    width: 960,
    height: 540,
  },
  {
    id: 'sunset-landscape',
    tagKey: 'ex.paint.landscape.tag',
    code: '800×520 · 4 Layers',
    titleKey: 'ex.paint.landscape.title',
    descKey: 'ex.paint.landscape.desc',
    docName: 'Fjord Sunset',
    width: 800,
    height: 520,
  },
  {
    id: 'isometric-cubes',
    tagKey: 'ex.paint.iso.tag',
    code: '720×540 · 3 Layers',
    titleKey: 'ex.paint.iso.title',
    descKey: 'ex.paint.iso.desc',
    docName: 'Isometric Blocks',
    width: 720,
    height: 540,
  },
];

function drawGeometricPoster(): { layers: PaintLayer[]; width: number; height: number } {
  const width = 800;
  const height = 600;
  const bg = createLayer(width, height, 'Paper Background', '#f6f1e7');
  const bgCtx = bg.canvas.getContext('2d');
  if (bgCtx) {
    bgCtx.strokeStyle = 'rgba(15, 23, 42, 0.06)';
    bgCtx.lineWidth = 1;
    for (let x = 40; x < width; x += 40) {
      bgCtx.beginPath();
      bgCtx.moveTo(x, 0);
      bgCtx.lineTo(x, height);
      bgCtx.stroke();
    }
    for (let y = 40; y < height; y += 40) {
      bgCtx.beginPath();
      bgCtx.moveTo(0, y);
      bgCtx.lineTo(width, y);
      bgCtx.stroke();
    }
  }

  const shapes = createLayer(width, height, 'Geometric Shapes');
  const sCtx = shapes.canvas.getContext('2d');
  if (sCtx) {
    sCtx.fillStyle = '#0f766e';
    sCtx.beginPath();
    sCtx.arc(270, 290, 155, 0, Math.PI * 2);
    sCtx.fill();

    sCtx.fillStyle = '#e11d48';
    sCtx.beginPath();
    sCtx.moveTo(390, 130);
    sCtx.lineTo(660, 460);
    sCtx.lineTo(310, 460);
    sCtx.closePath();
    sCtx.fill();

    sCtx.fillStyle = '#f59e0b';
    sCtx.fillRect(460, 110, 180, 180);
  }

  const accents = createLayer(width, height, 'Line Accents');
  accents.opacity = 0.92;
  const aCtx = accents.canvas.getContext('2d');
  if (aCtx) {
    aCtx.strokeStyle = '#0f172a';
    aCtx.lineWidth = 6;
    aCtx.strokeRect(64, 56, width - 128, height - 112);

    aCtx.beginPath();
    aCtx.arc(440, 310, 120, Math.PI * 0.15, Math.PI * 1.45);
    aCtx.stroke();

    aCtx.fillStyle = '#0f172a';
    aCtx.font = '700 44px system-ui, -apple-system, sans-serif';
    aCtx.fillText('BAUHAUS 26', 96, 520);
  }

  return { layers: [bg, shapes, accents], width, height };
}

function drawPixelSprite(): { layers: PaintLayer[]; width: number; height: number } {
  const width = 64;
  const height = 64;
  const bg = createLayer(width, height, 'Backdrop', '#1e293b');
  const sprite = createLayer(width, height, 'Robot Sprite');
  const ctx = sprite.canvas.getContext('2d');
  if (ctx) {
    const px = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    };
    // Antenna
    px(30, 6, 4, 4, '#f59e0b');
    px(31, 10, 2, 6, '#94a3b8');
    // Head
    px(18, 16, 28, 20, '#38bdf8');
    px(20, 18, 24, 16, '#0284c7');
    // Visor & eyes
    px(22, 22, 20, 7, '#0f172a');
    px(25, 24, 4, 3, '#4ade80');
    px(35, 24, 4, 3, '#4ade80');
    // Ears
    px(14, 22, 4, 8, '#64748b');
    px(46, 22, 4, 8, '#64748b');
    // Body
    px(20, 38, 24, 16, '#e2e8f0');
    px(24, 42, 16, 8, '#334155');
    px(26, 44, 4, 4, '#f43f5e');
    px(34, 44, 4, 4, '#38bdf8');
    // Arms & legs
    px(12, 39, 8, 5, '#94a3b8');
    px(44, 39, 8, 5, '#94a3b8');
    px(23, 54, 6, 6, '#64748b');
    px(35, 54, 6, 6, '#64748b');
  }
  return { layers: [bg, sprite], width, height };
}

function drawBlockDiagram(): { layers: PaintLayer[]; width: number; height: number } {
  const width = 960;
  const height = 540;
  const bg = createLayer(width, height, 'Grid Canvas', '#ffffff');
  const bgCtx = bg.canvas.getContext('2d');
  if (bgCtx) {
    bgCtx.fillStyle = '#e2e8f0';
    for (let x = 24; x < width; x += 24) {
      for (let y = 24; y < height; y += 24) {
        bgCtx.fillRect(x, y, 2, 2);
      }
    }
  }

  const blocks = createLayer(width, height, 'Signal Blocks');
  const bCtx = blocks.canvas.getContext('2d');
  const boxes = [
    { x: 64, y: 210, w: 160, h: 92, color: '#dbeafe', stroke: '#2563eb', title: 'Sensor', sub: '0–5 V analog' },
    { x: 288, y: 210, w: 168, h: 92, color: '#dcfce7', stroke: '#16a34a', title: 'Anti-Alias LPF', sub: 'fc = 10 kHz' },
    { x: 520, y: 210, w: 160, h: 92, color: '#fef3c7', stroke: '#d97706', title: '16-bit ADC', sub: 'fs = 48 kS/s' },
    { x: 744, y: 210, w: 156, h: 92, color: '#f3e8ff', stroke: '#7c3aed', title: 'DSP / FFT', sub: '4096-pt Hann' },
  ];
  if (bCtx) {
    bCtx.lineWidth = 3;
    for (const box of boxes) {
      bCtx.fillStyle = box.color;
      bCtx.strokeStyle = box.stroke;
      bCtx.beginPath();
      bCtx.roundRect(box.x, box.y, box.w, box.h, 12);
      bCtx.fill();
      bCtx.stroke();
    }
    // Connecting arrows
    bCtx.strokeStyle = '#334155';
    bCtx.fillStyle = '#334155';
    bCtx.lineWidth = 3;
    for (let i = 0; i < boxes.length - 1; i++) {
      const fromX = boxes[i].x + boxes[i].w;
      const toX = boxes[i + 1].x;
      const midY = boxes[i].y + boxes[i].h / 2;
      bCtx.beginPath();
      bCtx.moveTo(fromX + 4, midY);
      bCtx.lineTo(toX - 10, midY);
      bCtx.stroke();
      bCtx.beginPath();
      bCtx.moveTo(toX - 2, midY);
      bCtx.lineTo(toX - 14, midY - 7);
      bCtx.lineTo(toX - 14, midY + 7);
      bCtx.closePath();
      bCtx.fill();
    }
  }

  const labels = createLayer(width, height, 'Annotations');
  const lCtx = labels.canvas.getContext('2d');
  if (lCtx) {
    lCtx.fillStyle = '#0f172a';
    lCtx.font = '700 26px system-ui, -apple-system, sans-serif';
    lCtx.fillText('Data Acquisition Signal Chain', 64, 96);
    lCtx.fillStyle = '#475569';
    lCtx.font = '400 16px system-ui, -apple-system, sans-serif';
    lCtx.fillText('Edit boxes on the Signal Blocks layer or add callouts on Annotations.', 64, 126);

    lCtx.textAlign = 'center';
    for (const box of boxes) {
      lCtx.fillStyle = '#0f172a';
      lCtx.font = '700 18px system-ui, -apple-system, sans-serif';
      lCtx.fillText(box.title, box.x + box.w / 2, box.y + 42);
      lCtx.fillStyle = '#475569';
      lCtx.font = '500 14px ui-monospace, SFMono-Regular, monospace';
      lCtx.fillText(box.sub, box.x + box.w / 2, box.y + 68);
    }
  }

  return { layers: [bg, blocks, labels], width, height };
}

function drawSunsetLandscape(): { layers: PaintLayer[]; width: number; height: number } {
  const width = 800;
  const height = 520;
  const sky = createLayer(width, height, 'Sky Gradient');
  const sCtx = sky.canvas.getContext('2d');
  if (sCtx) {
    const grad = sCtx.createLinearGradient(0, 0, 0, 340);
    grad.addColorStop(0, '#1e1b4b');
    grad.addColorStop(0.45, '#be185d');
    grad.addColorStop(0.85, '#f97316');
    grad.addColorStop(1, '#fde047');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, width, height);

    sCtx.fillStyle = '#fef08a';
    sCtx.beginPath();
    sCtx.arc(400, 275, 62, 0, Math.PI * 2);
    sCtx.fill();
  }

  const mountains = createLayer(width, height, 'Mountains');
  const mCtx = mountains.canvas.getContext('2d');
  if (mCtx) {
    mCtx.fillStyle = '#4c1d95';
    mCtx.beginPath();
    mCtx.moveTo(0, 340);
    mCtx.lineTo(140, 200);
    mCtx.lineTo(270, 290);
    mCtx.lineTo(440, 175);
    mCtx.lineTo(585, 275);
    mCtx.lineTo(720, 190);
    mCtx.lineTo(800, 260);
    mCtx.lineTo(800, 340);
    mCtx.closePath();
    mCtx.fill();

    mCtx.fillStyle = '#1e1b4b';
    mCtx.beginPath();
    mCtx.moveTo(0, 340);
    mCtx.lineTo(190, 245);
    mCtx.lineTo(350, 320);
    mCtx.lineTo(540, 235);
    mCtx.lineTo(800, 340);
    mCtx.closePath();
    mCtx.fill();
  }

  const water = createLayer(width, height, 'Fjord Water');
  const wCtx = water.canvas.getContext('2d');
  if (wCtx) {
    const grad = wCtx.createLinearGradient(0, 340, 0, height);
    grad.addColorStop(0, '#312e81');
    grad.addColorStop(1, '#0f172a');
    wCtx.fillStyle = grad;
    wCtx.fillRect(0, 340, width, height - 340);

    wCtx.fillStyle = 'rgba(253, 224, 71, 0.55)';
    for (let i = 0; i < 8; i++) {
      const rw = 120 - i * 11;
      wCtx.fillRect(400 - rw / 2, 352 + i * 18, rw, 5);
    }
  }

  const mist = createLayer(width, height, 'Horizon Glow');
  mist.opacity = 0.4;
  const gCtx = mist.canvas.getContext('2d');
  if (gCtx) {
    const rad = gCtx.createRadialGradient(400, 330, 10, 400, 330, 280);
    rad.addColorStop(0, 'rgba(254, 240, 138, 0.9)');
    rad.addColorStop(1, 'rgba(254, 240, 138, 0)');
    gCtx.fillStyle = rad;
    gCtx.fillRect(0, 120, width, 340);
  }

  return { layers: [sky, mountains, water, mist], width, height };
}

function drawIsoCube(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  topColor: string,
  leftColor: string,
  rightColor: string,
) {
  const dx = size * 0.866;
  const dy = size * 0.5;
  // Top face
  ctx.fillStyle = topColor;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + dx, cy - dy);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx - dx, cy - dy);
  ctx.closePath();
  ctx.fill();
  // Left face
  ctx.fillStyle = leftColor;
  ctx.beginPath();
  ctx.moveTo(cx - dx, cy - dy);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx, cy + size);
  ctx.lineTo(cx - dx, cy + dy);
  ctx.closePath();
  ctx.fill();
  // Right face
  ctx.fillStyle = rightColor;
  ctx.beginPath();
  ctx.moveTo(cx + dx, cy - dy);
  ctx.lineTo(cx + dx, cy + dy);
  ctx.lineTo(cx, cy + size);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();
}

function drawIsometricCubes(): { layers: PaintLayer[]; width: number; height: number } {
  const width = 720;
  const height = 540;
  const bg = createLayer(width, height, 'Studio Backdrop', '#0f172a');
  const shadow = createLayer(width, height, 'Ground Shadow');
  shadow.opacity = 0.5;
  const shCtx = shadow.canvas.getContext('2d');
  if (shCtx) {
    shCtx.fillStyle = '#020617';
    shCtx.beginPath();
    shCtx.ellipse(360, 412, 210, 56, 0, 0, Math.PI * 2);
    shCtx.fill();
  }

  const cubes = createLayer(width, height, 'Isometric Cubes');
  const cCtx = cubes.canvas.getContext('2d');
  if (cCtx) {
    drawIsoCube(cCtx, 360, 210, 78, '#67e8f9', '#0891b2', '#155e75');
    drawIsoCube(cCtx, 250, 305, 78, '#fde047', '#ca8a04', '#854d0e');
    drawIsoCube(cCtx, 470, 305, 78, '#f9a8d4', '#db2777', '#9d174d');
    drawIsoCube(cCtx, 360, 368, 78, '#c4b5fd', '#7c3aed', '#4c1d95');
  }

  return { layers: [bg, shadow, cubes], width, height };
}

export function buildPaintExampleRuntime(id: PaintExampleId): {
  runtime: ImageDocRuntime;
  docName: string;
} {
  const preset = PAINT_EXAMPLES.find((p) => p.id === id) ?? PAINT_EXAMPLES[0];
  let built: { layers: PaintLayer[]; width: number; height: number };
  switch (preset.id) {
    case 'pixel-sprite':
      built = drawPixelSprite();
      break;
    case 'block-diagram':
      built = drawBlockDiagram();
      break;
    case 'sunset-landscape':
      built = drawSunsetLandscape();
      break;
    case 'isometric-cubes':
      built = drawIsometricCubes();
      break;
    case 'geometric-poster':
    default:
      built = drawGeometricPoster();
      break;
  }
  const activeLayerId = built.layers[built.layers.length - 1]?.id ?? '';
  const zoom = preset.id === 'pixel-sprite' ? 6 : 1;
  const runtime = createRuntimeFromLayers(
    built.layers,
    built.width,
    built.height,
    activeLayerId,
    preset.docName,
    zoom,
    false,
  );
  return { runtime, docName: preset.docName };
}
