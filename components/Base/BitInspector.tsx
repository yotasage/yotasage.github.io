import React from 'react';

import {
  BIT_WIDTHS,
  inspectBits,
  invertBits,
  pickSuggestedWidth,
  shiftBitsLeft,
  shiftBitsRight,
  toggleBit,
} from '../../lib/base/bits';
import type { BitWidth, ParsedNumber } from '../../lib/base/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/BaseConverter.module.css';

interface BitInspectorProps {
  parsed: ParsedNumber;
  onApplyInteger: (nextUnsignedOrSigned: bigint) => void;
}

export default function BitInspector({ parsed, onApplyInteger }: BitInspectorProps) {
  const { t } = useI18n();
  const signedInput = parsed.negative ? -parsed.intPart : parsed.intPart;

  const [manualWidth, setManualWidth] = React.useState<BitWidth | null>(null);
  const suggestedWidth = pickSuggestedWidth(signedInput);
  const width: BitWidth = manualWidth ?? suggestedWidth;

  const state = React.useMemo(() => inspectBits(signedInput, width), [signedInput, width]);

  const nibbleCount = width / 4;
  const nibbles: {
    startBit: number;
    endBit: number;
    bits: readonly (0 | 1)[];
    hexDigit: string;
  }[] = [];

  for (let n = 0; n < nibbleCount; n++) {
    const slice = state.bits.slice(n * 4, n * 4 + 4);
    const val = (slice[0] << 3) | (slice[1] << 2) | (slice[2] << 1) | slice[3];
    nibbles.push({
      startBit: width - 1 - n * 4,
      endBit: width - 4 - n * 4,
      bits: slice,
      hexDigit: val.toString(16).toUpperCase(),
    });
  }

  return (
    <section className={styles.card} aria-labelledby="bit-inspector-title">
      <div className={styles.cardHeader}>
        <div>
          <h2 id="bit-inspector-title" className={styles.cardTitle}>
            {t('base.bits.title')}
          </h2>
          <p className={styles.cardSub}>{t('base.bits.sub')}</p>
        </div>

        <div className={styles.segmented} role="group" aria-label={t('base.bits.widthLabel')}>
          {BIT_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              className={[styles.segBtn, width === w ? styles.segBtnActive : '']
                .filter(Boolean)
                .join(' ')}
              aria-pressed={width === w}
              onClick={() => setManualWidth(w)}
            >
              {w}-bit
            </button>
          ))}
        </div>
      </div>

      <div className={styles.bitsToolbar}>
        <div className={styles.bitsOps}>
          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => onApplyInteger(shiftBitsLeft(state.unsignedValue, width))}
          >
            {t('base.bits.shl')}
          </button>
          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => onApplyInteger(shiftBitsRight(state.unsignedValue, width))}
          >
            {t('base.bits.shr')}
          </button>
          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => onApplyInteger(invertBits(state.unsignedValue, width))}
          >
            {t('base.bits.not')}
          </button>
          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => onApplyInteger(0n)}
          >
            {t('base.bits.zero')}
          </button>
          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => onApplyInteger((1n << BigInt(width)) - 1n)}
          >
            {t('base.bits.allOnes')}
          </button>
        </div>
      </div>

      {parsed.hasFraction && (
        <p className={styles.bitsWarning}>{t('base.bits.fractionNotice')}</p>
      )}
      {!state.fits && (
        <p className={styles.bitsWarning}>
          {t('base.bits.overflowNotice', { width })}
        </p>
      )}

      <div className={styles.nibblesWrap}>
        {nibbles.map((nib) => (
          <div key={nib.startBit} className={styles.nibbleGroup}>
            <div className={styles.nibbleBits}>
              {nib.bits.map((bit, offset) => {
                const bitIndex = nib.startBit - offset;
                const isSignBit = bitIndex === width - 1;
                return (
                  <button
                    key={bitIndex}
                    type="button"
                    className={[
                      styles.bitBtn,
                      bit === 1 ? styles.bitBtnOn : '',
                      isSignBit ? styles.bitBtnSign : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-pressed={bit === 1}
                    aria-label={t('base.bits.toggleBitAria', {
                      index: bitIndex,
                      val: bit,
                    })}
                    onClick={() =>
                      onApplyInteger(toggleBit(state.unsignedValue, bitIndex, width))
                    }
                  >
                    {bit}
                  </button>
                );
              })}
            </div>
            <div className={styles.nibbleIndices}>
              <span>{nib.startBit}</span>
              <span className={styles.nibbleHexLabel}>0x{nib.hexDigit}</span>
              <span>{nib.endBit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.bitMetricsRow}>
        <div className={styles.bitMetric}>
          <span className={styles.bitMetricLabel}>{t('base.bits.unsigned')}</span>
          <span className={styles.bitMetricValue}>{state.unsignedValue.toString(10)}</span>
        </div>
        <div className={styles.bitMetric}>
          <span className={styles.bitMetricLabel}>{t('base.bits.signed')}</span>
          <span className={styles.bitMetricValue}>{state.signedValue.toString(10)}</span>
        </div>
        <div className={styles.bitMetric}>
          <span className={styles.bitMetricLabel}>{t('base.bits.bigEndian')}</span>
          <span className={styles.bitMetricValue}>{state.hexBigEndian.join(' ')}</span>
        </div>
        <div className={styles.bitMetric}>
          <span className={styles.bitMetricLabel}>{t('base.bits.littleEndian')}</span>
          <span className={styles.bitMetricValue}>{state.hexLittleEndian.join(' ')}</span>
        </div>
      </div>
    </section>
  );
}
