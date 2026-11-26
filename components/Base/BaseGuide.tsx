import React from 'react';

import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/BaseConverter.module.css';

const NIBBLES_LEFT = [0, 1, 2, 3, 4, 5, 6, 7];
const NIBBLES_RIGHT = [8, 9, 10, 11, 12, 13, 14, 15];

const POWERS_OF_TWO: readonly { exp: number; dec: string; hex: string; unit: string }[] = [
  { exp: 4, dec: '16', hex: '0x10', unit: '1 nibble (1 hex digit)' },
  { exp: 8, dec: '256', hex: '0x100', unit: '1 byte (uint8 max + 1)' },
  { exp: 10, dec: '1 024', hex: '0x400', unit: '1 KiB' },
  { exp: 12, dec: '4 096', hex: '0x1000', unit: '4 KiB (memory page)' },
  { exp: 16, dec: '65 536', hex: '0x10000', unit: '64 KiB (uint16 max + 1)' },
  { exp: 20, dec: '1 048 576', hex: '0x100000', unit: '1 MiB' },
  { exp: 24, dec: '16 777 216', hex: '0x1000000', unit: '24-bit RGB color count' },
  { exp: 30, dec: '1 073 741 824', hex: '0x40000000', unit: '1 GiB' },
  { exp: 32, dec: '4 294 967 296', hex: '0x100000000', unit: '4 GiB (uint32 max + 1)' },
  { exp: 40, dec: '1 099 511 627 776', hex: '0x10000000000', unit: '1 TiB' },
  { exp: 53, dec: '9 007 199 254 740 992', hex: '0x20000000000000', unit: 'IEEE 754 float64 exact int limit' },
  { exp: 64, dec: '18 446 744 073 709 551 616', hex: '0x10000000000000000', unit: '16 EiB (uint64 max + 1)' },
];

export default function BaseGuide() {
  const { t } = useI18n();

  const renderNibbleTable = (nums: readonly number[]) => (
    <div className={styles.tableWrap}>
      <table className={styles.dataTable}>
        <thead>
          <tr>
            <th>{t('base.guide.colDec')}</th>
            <th>{t('base.guide.colHexShort')}</th>
            <th>{t('base.guide.colOct')}</th>
            <th>{t('base.guide.colBin')}</th>
          </tr>
        </thead>
        <tbody>
          {nums.map((n) => (
            <tr key={n}>
              <td className={styles.monoCell}>{n}</td>
              <td className={styles.monoCellAccent}>{n.toString(16).toUpperCase()}</td>
              <td className={styles.monoCell}>{n.toString(8).padStart(2, '0')}</td>
              <td className={styles.monoCell}>{n.toString(2).padStart(4, '0')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className={styles.guideLayout}>
      <header className={styles.guideHeader}>
        <h2>{t('base.guide.title')}</h2>
        <p>{t('base.guide.lead')}</p>
      </header>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>{t('base.guide.nibbleTitle')}</h3>
        <div className={styles.nibbleRefGrid} style={{ marginTop: 12 }}>
          {renderNibbleTable(NIBBLES_LEFT)}
          {renderNibbleTable(NIBBLES_RIGHT)}
        </div>
      </section>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>{t('base.guide.alphabetsTitle')}</h3>
        <div className={styles.tableWrap} style={{ marginTop: 12 }}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>{t('base.guide.colName')}</th>
                <th>{t('base.guide.colRadix')}</th>
                <th>{t('base.guide.colOrder')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Standard</td>
                <td className={styles.monoCell}>2–36</td>
                <td>{t('base.guide.alphaStd36')}</td>
              </tr>
              <tr>
                <td>Extended Positional</td>
                <td className={styles.monoCell}>37–64</td>
                <td>{t('base.guide.alphaStd64')}</td>
              </tr>
              <tr>
                <td>Crockford Base 32</td>
                <td className={styles.monoCell}>32</td>
                <td>{t('base.guide.alphaCrockford')}</td>
              </tr>
              <tr>
                <td>Base 58 (Bitcoin)</td>
                <td className={styles.monoCell}>58</td>
                <td>{t('base.guide.alphaBase58')}</td>
              </tr>
              <tr>
                <td>Base 64 (RFC 4648)</td>
                <td className={styles.monoCell}>64</td>
                <td>{t('base.guide.alphaRfc64')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className={styles.guideGrid}>
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>{t('base.guide.methodTitle')}</h3>
          <p className={styles.guideProse}>{t('base.guide.methodBody1')}</p>
          <p className={styles.guideProse}>{t('base.guide.methodBody2')}</p>
        </section>

        <section className={styles.card}>
          <h3 className={styles.cardTitle}>{t('base.teaching.twosTitle')}</h3>
          <p className={styles.guideProse}>{t('base.teaching.twosBody')}</p>
          <p className={styles.guideProse}>{t('base.teaching.positionalBody')}</p>
        </section>
      </div>

      <section className={styles.card}>
        <h3 className={styles.cardTitle}>{t('base.guide.powersTitle')}</h3>
        <div className={styles.tableWrap} style={{ marginTop: 12 }}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>{t('base.guide.colPower')}</th>
                <th>{t('base.guide.colDecimal')}</th>
                <th>{t('base.guide.colHex')}</th>
                <th>{t('base.guide.colUnit')}</th>
              </tr>
            </thead>
            <tbody>
              {POWERS_OF_TWO.map((row) => (
                <tr key={row.exp}>
                  <td className={styles.monoCellAccent}>
                    2<sup>{row.exp}</sup>
                  </td>
                  <td className={styles.monoCell}>{row.dec}</td>
                  <td className={styles.monoCell}>{row.hex}</td>
                  <td>{row.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
