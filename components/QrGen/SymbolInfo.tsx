import React from 'react';

import { QrSymbol, SYMBOLOGY_LABELS } from '../../lib/qr/encoder';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/QrGen.module.css';

export default function SymbolInfo({ sym }: { sym: QrSymbol }) {
  const { t } = useI18n();
  const recovery: Record<string, string> = {
    L: t('qrgen.info.recL'),
    M: t('qrgen.info.recM'),
    Q: t('qrgen.info.recQ'),
    H: t('qrgen.info.recH'),
  };
  const usedPct = sym.capacityBits ? (100 * sym.usedBits) / sym.capacityBits : 100;
  const blocks = sym.blocks
    .map((b) => t('qrgen.info.blockFmt', { count: b.count, data: b.data, ec: b.ec }))
    .join(' + ');
  const maskLabel = sym.symbology === 'rmqr' ? t('qrgen.info.fixedMask') : String(sym.mask);
  const scoreTitle = sym.symbology === 'micro' ? t('qrgen.info.scoreHigher') : t('qrgen.info.scoreLower');

  return (
    <>
      <table className={styles.infoTable}>
        <tbody>
          <tr><th>{t('qrgen.info.thSymbol')}</th><td>{SYMBOLOGY_LABELS[sym.symbology]}</td></tr>
          <tr><th>{t('qrgen.info.thVersion')}</th><td>{sym.versionName} ({sym.width} × {sym.height} {t('qrgen.preview.modules')})</td></tr>
          <tr>
            <th>{t('qrgen.info.thEc')}</th>
            <td>{sym.ecLevel ? t('qrgen.info.ecRestores', { level: sym.ecLevel, rec: recovery[sym.ecLevel] }) : t('qrgen.info.ecM1Only')}</td>
          </tr>
          <tr><th>{t('qrgen.info.thMask')}</th><td>{maskLabel}</td></tr>
          <tr>
            <th>{t('qrgen.info.thDataBits')}</th>
            <td>
              {t('qrgen.info.bitsOf', { used: sym.usedBits, cap: sym.capacityBits, pct: usedPct.toFixed(1) })}
              <div className={styles.meter}><div style={{ width: `${Math.min(100, usedPct)}%` }} /></div>
            </td>
          </tr>
          <tr><th>{t('qrgen.info.thCodewords')}</th><td>{t('qrgen.info.codewordsVal', { data: sym.dataCodewords, ec: sym.ecCodewords })}</td></tr>
          <tr><th>{t('qrgen.info.thBlocks')}</th><td>{blocks}</td></tr>
          {sym.remainderBits > 0 && <tr><th>{t('qrgen.info.thRemainder')}</th><td>{sym.remainderBits}</td></tr>}
        </tbody>
      </table>

      <h3>{t('qrgen.info.segmentsHeading')}</h3>
      <table className={styles.infoTable}>
        <tbody>
          {sym.segments.length === 0 && <tr><td>{t('qrgen.info.emptySymbol')}</td></tr>}
          {sym.segments.map((s, i) => (
            <tr key={i}>
              <th>{s.label}{s.mode !== 'header' ? ` (${s.count})` : ''}</th>
              <td>
                {t('qrgen.info.bitsUnit', { bits: s.bits })}
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
