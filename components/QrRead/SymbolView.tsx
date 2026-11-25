// The symbol as the reader saw it: its modules redrawn clean, and its version, error correction, mask and the
// other facts the reader reports.

import React from 'react';

import { formatSize } from '../../lib/qrread/bytes';
import type { Field } from '../../lib/qrread/types';
import type { Detection } from '../../lib/qrread/zxing';
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
import styles from '../../styles/QrRead.module.css';
import { formatName, isQrFamily } from './bits';
import { Fields } from './ContentView';

const EC_KEYS: Record<string, TranslationKey> = {
  L: 'qrread.sym.ecL',
  M: 'qrread.sym.ecM',
  Q: 'qrread.sym.ecQ',
  H: 'qrread.sym.ecH',
};

const SYMBOLOGY_ID_KEYS: Record<string, TranslationKey> = {
  ']Q0': 'qrread.sym.idQ0',
  ']Q1': 'qrread.sym.idQ1',
  ']Q2': 'qrread.sym.idQ2',
  ']Q3': 'qrread.sym.idQ3',
  ']Q4': 'qrread.sym.idQ4',
  ']Q5': 'qrread.sym.idQ5',
  ']Q6': 'qrread.sym.idQ6',
};

function ModuleCanvas({ symbol, quiet }: { symbol: NonNullable<Detection['symbol']>; quiet: number }) {
  const { t } = useI18n();
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
      aria-label={t('qrread.sym.canvasAria', { w: symbol.width, h: symbol.height })}
    />
  );
}

export default function SymbolView({ d }: { d: Detection }) {
  const { t } = useI18n();
  const fields: Field[] = [{ label: t('qrread.sym.kind'), value: formatName(d.format) }];
  if (d.symbol) fields.push({ label: t('qrread.sym.size'), value: t('qrread.sym.sizeVal', { w: d.symbol.width, h: d.symbol.height }) });
  if (d.version) fields.push({ label: t('qrread.sym.version'), value: d.version });
  if (d.ecLevel) fields.push({ label: t('qrread.sym.ec'), value: EC_KEYS[d.ecLevel] ? t(EC_KEYS[d.ecLevel]) : d.ecLevel });
  if (d.mask !== null) fields.push({ label: t('qrread.sym.mask'), value: String(d.mask) });
  fields.push({ label: t('qrread.sym.data'), value: formatSize(d.bytes.length) });
  fields.push({ label: t('qrread.sym.charset'), value: d.hasECI ? t('qrread.sym.charsetEci') : t('qrread.sym.charsetGuessed') });
  if (d.symbologyId) {
    const idKey = isQrFamily(d.format) ? SYMBOLOGY_ID_KEYS[d.symbologyId] : undefined;
    fields.push({ label: t('qrread.sym.symId'), value: d.symbologyId, mono: true, note: idKey ? t(idKey) : undefined });
  }
  if (d.sequence) fields.push({ label: t('qrread.sym.seq'), value: t('qrread.sym.seqVal', { i: d.sequence.index + 1, size: d.sequence.size }), note: t('qrread.joined.parity', { id: d.sequence.id }) });
  const look = [d.inverted ? t('qrread.sym.inverted') : '', d.mirrored ? t('qrread.sym.mirrored') : '', d.rotation ? t('qrread.sym.turned', { deg: d.rotation }) : ''].filter(Boolean);
  if (look.length) fields.push({ label: t('qrread.sym.seen'), value: look.join(', ') });
  return (
    <div className={styles.symbolView}>
      {d.symbol && <ModuleCanvas symbol={d.symbol} quiet={/Micro|RMQR/i.test(d.format) ? 2 : 4} />}
      <Fields fields={fields} />
    </div>
  );
}
