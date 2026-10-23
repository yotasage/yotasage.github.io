import React from 'react';

import { QrSymbol, SYMBOLOGY_LABELS } from '../../lib/qr/encoder';
import styles from '../../styles/QrGen.module.css';

const RECOVERY: Record<string, string> = { L: 'about 7 %', M: 'about 15 %', Q: 'about 25 %', H: 'about 30 %' };

export default function SymbolInfo({ sym }: { sym: QrSymbol }) {
  const usedPct = sym.capacityBits ? (100 * sym.usedBits) / sym.capacityBits : 100;
  const blocks = sym.blocks.map((b) => `${b.count} × (${b.data} data + ${b.ec} EC)`).join(' + ');
  const maskLabel = sym.symbology === 'rmqr' ? 'Fixed pattern (rMQR has a single mask)' : String(sym.mask);
  const scoreTitle = sym.symbology === 'micro' ? 'Mask scores (higher is better)' : 'Mask penalties (lower is better)';

  return (
    <>
      <table className={styles.infoTable}>
        <tbody>
          <tr><th>Symbol</th><td>{SYMBOLOGY_LABELS[sym.symbology]}</td></tr>
          <tr><th>Version</th><td>{sym.versionName} ({sym.width} × {sym.height} modules)</td></tr>
          <tr>
            <th>Error correction</th>
            <td>{sym.ecLevel ? `${sym.ecLevel}, restores ${RECOVERY[sym.ecLevel]} of the codewords` : 'Error detection only (M1)'}</td>
          </tr>
          <tr><th>Data mask</th><td>{maskLabel}</td></tr>
          <tr>
            <th>Data bits</th>
            <td>
              {sym.usedBits} of {sym.capacityBits} ({usedPct.toFixed(1)} %)
              <div className={styles.meter}><div style={{ width: `${Math.min(100, usedPct)}%` }} /></div>
            </td>
          </tr>
          <tr><th>Codewords</th><td>{sym.dataCodewords} data + {sym.ecCodewords} error correction</td></tr>
          <tr><th>Blocks</th><td>{blocks}</td></tr>
          {sym.remainderBits > 0 && <tr><th>Remainder modules</th><td>{sym.remainderBits}</td></tr>}
        </tbody>
      </table>

      <h3>Segments</h3>
      <table className={styles.infoTable}>
        <tbody>
          {sym.segments.length === 0 && <tr><td>No data (empty symbol)</td></tr>}
          {sym.segments.map((s, i) => (
            <tr key={i}>
              <th>{s.label}{s.mode !== 'header' ? ` (${s.count})` : ''}</th>
              <td>
                {s.bits} bits
                {s.preview && <div className={styles.mono}>{s.preview.length > 80 ? s.preview.slice(0, 80) + '…' : s.preview}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sym.maskScores && (
        <>
          <h3>{scoreTitle}</h3>
          <table className={[styles.infoTable, styles.scoreTable].join(' ')}>
            <tbody>
              <tr>
                {sym.maskScores.map((s, i) => <th key={i} className={i === sym.mask ? styles.chosen : undefined}>{i}</th>)}
              </tr>
              <tr>
                {sym.maskScores.map((s, i) => <td key={i} className={i === sym.mask ? styles.chosen : undefined}>{s}</td>)}
              </tr>
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
