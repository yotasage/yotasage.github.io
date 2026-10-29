import React from 'react';

import { DigitGrouping, groupDigits, removeDigitGroups } from '../../lib/simsetup/numbers';
import { EXACT_LIMIT, isPrime, nextPrime, prevPrime } from '../../lib/simsetup/primes';
import styles from '../../styles/SimSetup.module.css';

// Keeps every button press well below a tenth of a second.
export const MAX_PRIME_DIGITS = 100;
const LIMIT = 10n ** BigInt(MAX_PRIME_DIGITS);

function roundedDivision(n: bigint, d: bigint) {
  return (n + d / 2n) / d;
}

interface Step {
  label: string;
  title: string;
  allowed: (n: bigint) => boolean;
  run: (n: bigint) => bigint;
}

function divideStep(d: bigint): Step {
  return { label: `÷${d}`, title: `First prime after the number divided by ${d}`, allowed: () => true, run: (n) => nextPrime(roundedDivision(n, d)) };
}

function multiplyStep(m: bigint): Step {
  return { label: `×${m}`, title: `First prime after the number multiplied by ${m}`, allowed: (n) => n * m < LIMIT, run: (n) => nextPrime(n * m) };
}

// Larger numbers to the left, smaller to the right.
const STEPS: Step[] = [
  multiplyStep(1000n),
  multiplyStep(10n),
  multiplyStep(2n),
  { label: 'Next', title: 'Smallest prime above the number', allowed: (n) => n + 1n < LIMIT, run: nextPrime },
  { label: 'Prev', title: 'Largest prime below the number', allowed: (n) => n > 2n, run: (n) => prevPrime(n) ?? n },
  divideStep(2n),
  divideStep(10n),
  divideStep(1000n),
];

type Parsed = { ok: true; value: bigint } | { ok: false; error: string };

function parseWholeNumber(text: string): Parsed {
  const trimmed = removeDigitGroups(text.trim());
  if (trimmed === '') return { ok: false, error: 'Enter a whole number' };
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: 'Not a whole number' };
  const value = BigInt(trimmed);
  if (value >= LIMIT) return { ok: false, error: `At most ${MAX_PRIME_DIGITS} digits` };
  return { ok: true, value };
}

export default function PrimeBox({ grouping }: { grouping: DigitGrouping }) {
  const id = React.useId();
  const [text, setText] = React.useState('11');
  const parsed = React.useMemo(() => parseWholeNumber(text), [text]);
  const prime = React.useMemo(() => parsed.ok && isPrime(parsed.value), [parsed]);

  let status: React.ReactNode = null;
  if (parsed.ok === false) status = <span className={styles.bad}>{parsed.error}</span>;
  else if (!prime) status = <span className={styles.bad}><span aria-hidden="true">✗</span> Not prime</span>;
  else if (parsed.value < EXACT_LIMIT) status = <span className={styles.good}><span aria-hidden="true">✓</span> Prime</span>;
  else status = <span className={styles.good}><span aria-hidden="true">✓</span> Probably prime</span>;

  return (
    <section className={styles.card} aria-labelledby={`${id}-title`}>
      <div className={styles.cardHeader}>
        <h2 id={`${id}-title`}>Prime numbers</h2>
        <p className={styles.status}>{status}</p>
      </div>

      <div className={styles.helperInput}>
        <input
          id={`${id}-number`}
          aria-label="Number"
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
            key={step.label}
            type="button"
            className={styles.buttonSmall}
            title={step.title}
            disabled={!parsed.ok || !step.allowed(parsed.value)}
            onClick={() => parsed.ok && setText(groupDigits(String(step.run(parsed.value)), grouping))}
          >
            {step.label}
          </button>
        ))}
      </div>
    </section>
  );
}
