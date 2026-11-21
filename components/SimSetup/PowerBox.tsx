import React from 'react';

import { DigitGrouping, groupDigits, removeDigitGroups } from '../../lib/simsetup/numbers';
import { bitLength, isPowerOfTwo, log2, nextPowerOfTwo, prevPowerOfTwo } from '../../lib/simsetup/powers';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/SimSetup.module.css';
import KatexSpan from '../KatexSpan';

interface Step {
  id: string;
  labelKey?: 'next' | 'prev';
  label: string;
  title: string;
  allowed: (n: bigint) => boolean;
  run: (n: bigint) => bigint;
}

// Larger numbers to the left, smaller to the right.
const STEPS: Step[] = [
  { id: 'shl4', label: '<<4', title: 'Shift left by 4 bits (multiply by 16)', allowed: () => true, run: (n) => n << 4n },
  { id: 'shl1', label: '<<1', title: 'Shift left by 1 bit (multiply by 2)', allowed: () => true, run: (n) => n << 1n },
  { id: 'next', labelKey: 'next', label: 'Next', title: 'Smallest power of 2 above the number', allowed: () => true, run: nextPowerOfTwo },
  { id: 'prev', labelKey: 'prev', label: 'Prev', title: 'Largest power of 2 below the number', allowed: (n) => n > 1n, run: (n) => prevPowerOfTwo(n) ?? n },
  { id: 'shr1', label: '>>1', title: 'Shift right by 1 bit (divide by 2, rounded down)', allowed: (n) => n >> 1n >= 1n, run: (n) => n >> 1n },
  { id: 'shr4', label: '>>4', title: 'Shift right by 4 bits (divide by 16, rounded down)', allowed: (n) => n >> 4n >= 1n, run: (n) => n >> 4n },
];

type Parsed =
  | { ok: true; value: bigint }
  | { ok: false; errorKey: 'enterWhole' | 'notWhole' | 'minOne' };

// Decimal, or hexadecimal (0x), binary (0b) and octal (0o) as BigInt reads them, with or without digit groups.
function parseWholeNumber(text: string): Parsed {
  const trimmed = removeDigitGroups(text.trim(), true);
  if (trimmed === '') return { ok: false, errorKey: 'enterWhole' };
  if (!/^(\d+|0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+)$/.test(trimmed)) return { ok: false, errorKey: 'notWhole' };
  const value = BigInt(trimmed);
  if (value < 1n) return { ok: false, errorKey: 'minOne' };
  return { ok: true, value };
}

export default function PowerBox({
  grouping,
  text: controlledText,
  onTextChange,
  onApply,
  embedded = false,
}: {
  grouping: DigitGrouping;
  text?: string;
  onTextChange?: (next: string) => void;
  onApply?: (value: string) => void;
  embedded?: boolean;
}) {
  const id = React.useId();
  const { t } = useI18n();
  const [internalText, setInternalText] = React.useState('16');
  const [appliedFlash, setAppliedFlash] = React.useState(false);

  const text = controlledText !== undefined ? controlledText : internalText;
  const setText = onTextChange ?? setInternalText;

  const parsed = parseWholeNumber(text);
  const exact = parsed.ok && isPowerOfTwo(parsed.value);

  React.useEffect(() => {
    if (!appliedFlash) return;
    const timer = window.setTimeout(() => setAppliedFlash(false), 1600);
    return () => window.clearTimeout(timer);
  }, [appliedFlash]);

  let status: React.ReactNode;
  if (parsed.ok === false) {
    status = <span className={[styles.badge, styles.badgeBad].join(' ')}>{t(`simsetup.power.${parsed.errorKey}`)}</span>;
  } else if (exact) {
    status = (
      <span className={[styles.badge, styles.badgeGood].join(' ')}>
        <span aria-hidden="true">✓</span>
        <span>{t('simsetup.power.exact')}</span>
      </span>
    );
  } else {
    status = (
      <span className={[styles.badge, styles.badgeBad].join(' ')}>
        <span aria-hidden="true">✗</span>
        <span>{t('simsetup.power.notExact')}</span>
      </span>
    );
  }

  let exponent: string | null = null;
  if (parsed.ok) exponent = exact ? `2^{${bitLength(parsed.value) - 1}} =` : `2^{${log2(parsed.value).toFixed(4)}} \\approx`;

  function handleApply() {
    if (!parsed.ok || !exact || !onApply) return;
    onApply(groupDigits(String(parsed.value), grouping));
    setAppliedFlash(true);
  }

  return (
    <section
      className={embedded ? styles.helperSection : styles.card}
      aria-labelledby={`${id}-title`}
    >
      <div className={styles.helperHeader}>
        <h3 id={`${id}-title`} className={styles.helperTitle}>
          {t('simsetup.power.title')}
        </h3>
        <div className={styles.status}>{status}</div>
      </div>

      <div className={styles.helperInput}>
        {exponent && <KatexSpan className={styles.exponent} text={exponent} />}
        <input
          id={`${id}-number`}
          aria-label={t('simsetup.power.inputAria')}
          className={styles.input}
          inputMode="numeric"
          spellCheck={false}
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={parsed.ok ? undefined : true}
        />
      </div>

      <div className={styles.buttonRow}>
        {STEPS.map((step) => (
          <button
            key={step.id}
            type="button"
            className={styles.buttonGhost}
            title={step.title}
            disabled={!parsed.ok || !step.allowed(parsed.value)}
            onClick={() => parsed.ok && setText(groupDigits(String(step.run(parsed.value)), grouping))}
          >
            {step.labelKey ? t(`simsetup.power.${step.labelKey}`) : step.label}
          </button>
        ))}
      </div>

      {onApply && (
        <div className={styles.helperFooter}>
          <button
            type="button"
            className={styles.buttonPrimary}
            disabled={!parsed.ok || !exact}
            title={t('simsetup.power.applyHint')}
            onClick={handleApply}
          >
            {appliedFlash ? `✓ ${t('simsetup.power.applied')}` : t('simsetup.power.apply')}
          </button>
        </div>
      )}
    </section>
  );
}
