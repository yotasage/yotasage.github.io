import Head from 'next/head'
import Link from 'next/link';
import React from "react";

import KatexSpan from './katex/span';

import styles from '../styles/Home.module.css';

export default function PowerBox() {
  const [power, setPower] = React.useState(16n);
  const [isExactPower, setIsExactPower] = React.useState(true);

  function isPowerOfTwo(n) {
    return n > 0n && (n & (n - 1n)) === 0n;
  }

  function getExponent(n) {
    let count = 0n;
    let value = n;

    while (value > 1n) {
      value >>= 1n;
      count++;
    }
    return count;
  }

  function nextPowerOfTwo(n) {
    if (n <= 1n) return 2n;

    let p = 1n;
    while (p <= n) {
      p <<= 1n;
    }
    return p;
  }

  function prevPowerOfTwo(n) {
    if (n <= 1n) return 1n;

    let p = 1n;
    while ((p << 1n) < n) {
      p <<= 1n;
    }
    return p;
  }

  function updateValue_power(e) {
    try {
      let value = e.target.value;
      if (value === "") return;

      let newValue = BigInt(value);

      if (newValue > 0n) {
        setPower(newValue);
        setIsExactPower(isPowerOfTwo(newValue));
      }
    } catch {
      // ignore invalid input
    }
  }

  function onNextPower(op, num) {
    let shift = BigInt(num);
    let newValue;

    if (op === 0) {
      newValue = power << shift;
    } else {
      newValue = power >> shift;
    }

    if (newValue > 0n) {
      setPower(newValue);
      setIsExactPower(isPowerOfTwo(newValue));
    }
  }

  function jumpToNextPower() {
    let newValue = nextPowerOfTwo(power);
    setPower(newValue);
    setIsExactPower(true);
  }

  function jumpToPrevPower() {
    let newValue = prevPowerOfTwo(power);
    setPower(newValue);
    setIsExactPower(true);
  }

  function log2BigIntApprox(n) {
    if (n <= 0n) return null;

    // If small enough, convert directly
    if (n <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Math.log2(Number(n));
    }

    // For large numbers: scale down
    let shift = 0n;
    let temp = n;

    while (temp > BigInt(Number.MAX_SAFE_INTEGER)) {
      temp >>= 1n;
      shift++;
    }

    return Math.log2(Number(temp)) + Number(shift);
  }

  const exponentApprox = log2BigIntApprox(power);

  return (
    <div className={styles.grid}>
      <div className={styles.card}>
        <h3>Power of 2</h3>

        <p>
          Exact power of 2: {isExactPower ? "Yes ✅" : "No ❌"}
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {isExactPower ? (
            <KatexSpan
              text={`2^{${getExponent(power)}} =`}
              style={{ fontSize: '1.2rem' }}
            />
          ) : (
            <KatexSpan
              text={`2^{${exponentApprox.toFixed(4)}} \\approx`}
              style={{ fontSize: '1.2rem' }}
            />
          )}

          <input
            type="text"
            name="power"
            value={power.toString()}
            onChange={updateValue_power}
          />
        </div>

        <br />

        {/* Shift buttons (your originals) */}
        <button onClick={() => onNextPower(0, 4)}>&lt;&lt;4</button>
        <button onClick={() => onNextPower(0, 1)}>&lt;&lt;1</button>
        <button onClick={jumpToNextPower}>Next</button>
        <button onClick={jumpToPrevPower}>Prev</button>
        <button onClick={() => onNextPower(1, 1)}>&gt;&gt;1</button>
        <button onClick={() => onNextPower(1, 4)}>&gt;&gt;4</button>

        {/* New jump buttons */}
        

      </div>
    </div>
  );
}