import React from 'react';

import KatexSpan from '../KatexSpan';
import { DigitGrouping, groupDigits, removeDigitGroups } from '../../lib/simsetup/numbers';
import { bitLength, isPowerOfTwo, log2, nextPowerOfTwo, prevPowerOfTwo } from '../../lib/simsetup/powers';
import styles from '../../styles/SimSetup.module.css';

interface Step {
  label: string;
  title: string;
  allowed: (n: bigint) => boolean;
  run: (n: bigint) => bigint;
}

// Larger numbers to the left, smaller to the right.
const STEPS: Step[] = [
  { label: '<<4', title: 'Shift left by 4 bits (multiply by 16)', allowed: () => true, run: (n) => n << 4n },
  { label: '<<1', title: 'Shift left by 1 bit (multiply by 2)', allowed: () => true, run: (n) => n << 1n },
  { label: 'Next', title: 'Smallest power of 2 above the number', allowed: () => true, run: nextPowerOfTwo },
  { label: 'Prev', title: 'Largest power of 2 below the number', allowed: (n) => n > 1n, run: (n) => prevPowerOfTwo(n) ?? n },
  { label: '>>1', title: 'Shift right by 1 bit (divide by 2, rounded down)', allowed: (n) => n >> 1n >= 1n, run: (n) => n >> 1n },
  { label: '>>4', title: 'Shift right by 4 bits (divide by 16, rounded down)', allowed: (n) => n >> 4n >= 1n, run: (n) => n >> 4n },
];

type Parsed = { ok: true; value: bigint } | { ok: false; error: string };

// Decimal, or hexadecimal (0x), binary (0b) and octal (0o) as BigInt reads them, with or without digit groups.
function parseWholeNumber(text: string): Parsed {
  const trimmed = removeDigitGroups(text.trim(), true);
  if (trimmed === '') return { ok: false, error: 'Enter a whole number' };
  if (!/^(\d+|0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+)$/.test(trimmed)) return { ok: false, error: 'Not a whole number' };
  const value = BigInt(trimmed);
  if (value < 1n) return { ok: false, error: 'Must be 1 or more' };
  return { ok: true, value };
}

export default function PowerBox({ grouping }: { grouping: DigitGrouping }) {
  const id = React.useId();
  const [text, setText] = React.useState('16');
  const parsed = parseWholeNumber(text);
  const exact = parsed.ok && isPowerOfTwo(parsed.value);

  let status: React.ReactNode;
  if (parsed.ok === false) status = <span className={styles.bad}>{parsed.error}</span>;
  else if (exact) status = <span className={styles.good}><span aria-hidden="true">✓</span> Exact power of 2</span>;
  else status = <span className={styles.bad}><span aria-hidden="true">✗</span> Not a power of 2</span>;

  let exponent: string | null = null;
  if (parsed.ok) exponent = exact ? `2^{${bitLength(parsed.value) - 1}} =` : `2^{${log2(parsed.value).toFixed(4)}} \\approx`;

  return (
    <section className={styles.card} aria-labelledby={`${id}-title`}>
      <div className={styles.cardHeader}>
        <h2 id={`${id}-title`}>Powers of 2</h2>
        <p className={styles.status}>{status}</p>
      </div>

      <div className={styles.helperInput}>
        {exponent && <KatexSpan className={styles.exponent} text={exponent} />}
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
