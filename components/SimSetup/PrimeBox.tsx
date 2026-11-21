import React from 'react';

import { DigitGrouping, groupDigits, removeDigitGroups } from '../../lib/simsetup/numbers';
import { EXACT_LIMIT, isPrime, nextPrime, prevPrime } from '../../lib/simsetup/primes';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/SimSetup.module.css';

// Keeps every button press well below a tenth of a second.
export const MAX_PRIME_DIGITS = 100;
const LIMIT = 10n ** BigInt(MAX_PRIME_DIGITS);

function roundedDivision(n: bigint, d: bigint) {
  return (n + d / 2n) / d;
}

interface Step {
  id: string;
  labelKey?: 'next' | 'prev';
  label: string;
  title: string;
  allowed: (n: bigint) => boolean;
  run: (n: bigint) => bigint;
}

function divideStep(d: bigint): Step {
  return {
    id: `div-${d}`,
    label: `÷${d}`,
    title: `First prime after the number divided by ${d}`,
    allowed: () => true,
    run: (n) => nextPrime(roundedDivision(n, d)),
  };
}

function multiplyStep(m: bigint): Step {
  return {
    id: `mul-${m}`,
    label: `×${m}`,
    title: `First prime after the number multiplied by ${m}`,
    allowed: (n) => n * m < LIMIT,
    run: (n) => nextPrime(n * m),
  };
}

// Larger numbers to the left, smaller to the right.
const STEPS: Step[] = [
  multiplyStep(1000n),
  multiplyStep(10n),
  multiplyStep(2n),
  {
    id: 'next',
    labelKey: 'next',
    label: 'Next',
    title: 'Smallest prime above the number',
    allowed: (n) => n + 1n < LIMIT,
    run: nextPrime,
  },
  {
    id: 'prev',
    labelKey: 'prev',
    label: 'Prev',
    title: 'Largest prime below the number',
    allowed: (n) => n > 2n,
    run: (n) => prevPrime(n) ?? n,
  },
  divideStep(2n),
  divideStep(10n),
  divideStep(1000n),
];

type Parsed =
  | { ok: true; value: bigint }
  | { ok: false; errorKey: 'enterWhole' | 'notWhole' | 'maxDigits' };

function parseWholeNumber(text: string): Parsed {
  const trimmed = removeDigitGroups(text.trim());
  if (trimmed === '') return { ok: false, errorKey: 'enterWhole' };
  if (!/^\d+$/.test(trimmed)) return { ok: false, errorKey: 'notWhole' };
  const value = BigInt(trimmed);
  if (value >= LIMIT) return { ok: false, errorKey: 'maxDigits' };
  return { ok: true, value };
}

export default function PrimeBox({
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
  const [internalText, setInternalText] = React.useState('11');
  const [appliedFlash, setAppliedFlash] = React.useState(false);

  const text = controlledText !== undefined ? controlledText : internalText;
  const setText = onTextChange ?? setInternalText;

  const parsed = React.useMemo(() => parseWholeNumber(text), [text]);
  const prime = React.useMemo(() => parsed.ok && isPrime(parsed.value), [parsed]);

  React.useEffect(() => {
    if (!appliedFlash) return;
    const timer = window.setTimeout(() => setAppliedFlash(false), 1600);
    return () => window.clearTimeout(timer);
  }, [appliedFlash]);

  let status: React.ReactNode = null;
  if (parsed.ok === false) {
    const errText =
      parsed.errorKey === 'maxDigits'
        ? t('simsetup.prime.maxDigits', { max: MAX_PRIME_DIGITS })
        : t(`simsetup.prime.${parsed.errorKey}`);
    status = <span className={[styles.badge, styles.badgeBad].join(' ')}>{errText}</span>;
  } else if (!prime) {
    status = (
      <span className={[styles.badge, styles.badgeBad].join(' ')}>
        <span aria-hidden="true">✗</span>
        <span>{t('simsetup.prime.notPrime')}</span>
      </span>
    );
  } else if (parsed.value < EXACT_LIMIT) {
    status = (
      <span className={[styles.badge, styles.badgeGood].join(' ')}>
        <span aria-hidden="true">✓</span>
        <span>{t('simsetup.prime.isPrime')}</span>
      </span>
    );
  } else {
    status = (
      <span className={[styles.badge, styles.badgeGood].join(' ')}>
        <span aria-hidden="true">✓</span>
        <span>{t('simsetup.prime.probablyPrime')}</span>
      </span>
    );
  }

  function handleApply() {
    if (!parsed.ok || !prime || !onApply) return;
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
          {t('simsetup.prime.title')}
        </h3>
        <div className={styles.status}>{status}</div>
      </div>

      <div className={styles.helperInput}>
        <input
          id={`${id}-number`}
          aria-label={t('simsetup.prime.inputAria')}
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
            {step.labelKey ? t(`simsetup.prime.${step.labelKey}`) : step.label}
          </button>
        ))}
      </div>

      {onApply && (
        <div className={styles.helperFooter}>
          <button
            type="button"
            className={styles.buttonPrimary}
            disabled={!parsed.ok || !prime}
            title={t('simsetup.prime.applyHint')}
            onClick={handleApply}
          >
            {appliedFlash ? `✓ ${t('simsetup.prime.applied')}` : t('simsetup.prime.apply')}
          </button>
        </div>
      )}
    </section>
  );
}
