// The symbol as the reader saw it: its modules redrawn clean, and its version, error correction, mask and the
// other facts the reader reports.

import React from 'react';

import { formatSize } from '../../lib/qrread/bytes';
import type { Field } from '../../lib/qrread/types';
import type { Detection } from '../../lib/qrread/zxing';
import styles from '../../styles/QrRead.module.css';
import { formatName, isQrFamily } from './bits';
import { Fields } from './ContentView';

const EC: Record<string, string> = { L: 'L, restores about 7 %', M: 'M, restores about 15 %', Q: 'Q, restores about 25 %', H: 'H, restores about 30 %' };

const SYMBOLOGY_IDS: Record<string, string> = {
  ']Q0': 'Model 1',
  ']Q1': 'plain data',
  ']Q2': 'with ECI character sets',
  ']Q3': 'GS1 data (FNC1 in first position)',
  ']Q4': 'GS1 data with ECI',
  ']Q5': 'industry data (FNC1 in second position)',
  ']Q6': 'industry data with ECI',
};

function ModuleCanvas({ symbol, quiet }: { symbol: NonNullable<Detection['symbol']>; quiet: number }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = symbol.width + 2 * quiet;
    const h = symbol.height + 2 * quiet;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    img.data.fill(255);
    for (let y = 0; y < symbol.height; y++) {
      for (let x = 0; x < symbol.width; x++) {
        if (symbol.data[y * symbol.width + x] !== 0) continue;
        const i = ((y + quiet) * w + x + quiet) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 0;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [symbol, quiet]);
  const scale = Math.max(2, Math.floor(260 / Math.max(symbol.width + 2 * quiet, symbol.height + 2 * quiet)));
  return (
    <canvas
      ref={ref}
      className={styles.moduleCanvas}
      style={{ width: (symbol.width + 2 * quiet) * scale, height: (symbol.height + 2 * quiet) * scale }}
      role="img"
      aria-label={`The symbol's ${symbol.width} by ${symbol.height} modules as read`}
    />
  );
}

export default function SymbolView({ d }: { d: Detection }) {
  const fields: Field[] = [{ label: 'Kind', value: formatName(d.format) }];
  if (d.symbol) fields.push({ label: 'Size', value: `${d.symbol.width} × ${d.symbol.height} modules` });
  if (d.version) fields.push({ label: 'Version', value: d.version });
  if (d.ecLevel) fields.push({ label: 'Error correction', value: EC[d.ecLevel] ?? d.ecLevel });
  if (d.mask !== null) fields.push({ label: 'Mask pattern', value: String(d.mask) });
  fields.push({ label: 'Data', value: formatSize(d.bytes.length) });
  fields.push({ label: 'Character set', value: d.hasECI ? 'Declared in the code (ECI)' : 'Not declared: the reader judged it from the bytes' });
  if (d.symbologyId) fields.push({ label: 'Symbology identifier', value: d.symbologyId, mono: true, note: isQrFamily(d.format) ? SYMBOLOGY_IDS[d.symbologyId] : undefined });
  if (d.sequence) fields.push({ label: 'Structured append', value: `Symbol ${d.sequence.index + 1} of ${d.sequence.size}`, note: `parity ${d.sequence.id}` });
  const look = [d.inverted ? 'light on dark (inverted)' : '', d.mirrored ? 'mirrored' : '', d.rotation ? `turned ${d.rotation}°` : ''].filter(Boolean);
  if (look.length) fields.push({ label: 'Seen', value: look.join(', ') });
  return (
    <div className={styles.symbolView}>
      {d.symbol && <ModuleCanvas symbol={d.symbol} quiet={/Micro|RMQR/i.test(d.format) ? 2 : 4} />}
      <Fields fields={fields} />
    </div>
  );
}
