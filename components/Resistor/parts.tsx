import React, { useEffect, useRef, useState } from 'react';

import { ohmsParts } from '../../lib/resistor';
import styles from '../../styles/Resistor.module.css';

// A resistance with its unit in a quieter colour.
export function Ohms({ ohms, digits, className }: { ohms: number; digits?: number; className?: string }) {
  const [number, unit] = ohmsParts(ohms, digits);
  return (
    <span className={[styles.num, className].filter(Boolean).join(' ')}>
      {number}<span className={styles.unit}>{' '}{unit}</span>
    </span>
  );
}

// A resistance that becomes the current value when clicked.
export function ValueButton({ ohms, onPick, className }: { ohms: number; onPick: (ohms: number) => void; className?: string }) {
  return (
    <button type="button" className={[styles.valueButton, className].filter(Boolean).join(' ')} onClick={() => onPick(ohms)} title="Use this value">
      <Ohms ohms={ohms} />
    </button>
  );
}

function Svg({ children, size = 16 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const CopyIcon = () => <Svg size={14}><rect x={5.5} y={5.5} width={8} height={8} rx={1.5} /><path d="M10.5 5.5v-1.5a1.5 1.5 0 0 0-1.5-1.5h-5a1.5 1.5 0 0 0-1.5 1.5v5a1.5 1.5 0 0 0 1.5 1.5h1.5" /></Svg>;
export const LinkIcon = () => <Svg size={14}><path d="M6.8 9.2a2.8 2.8 0 0 0 4 0l2-2a2.8 2.8 0 0 0-4-4l-.7.7" /><path d="M9.2 6.8a2.8 2.8 0 0 0-4 0l-2 2a2.8 2.8 0 0 0 4 4l.7-.7" /></Svg>;
export const CheckIcon = ({ size = 14 }: { size?: number }) => <Svg size={size}><path d="M3 8.5l3.2 3.2L13 4.8" /></Svg>;
export const CloseIcon = () => <Svg><path d="M4 4l8 8M12 4l-8 8" /></Svg>;
export const UpIcon = () => <Svg size={14}><path d="M4 10l4-4 4 4" /></Svg>;
export const DownIcon = () => <Svg size={14}><path d="M4 6l4 4 4-4" /></Svg>;
export const InfoIcon = () => <Svg><circle cx={8} cy={8} r={6} /><path d="M8 7.2v3.6M8 5.1v.1" /></Svg>;
export const SunIcon = () => <Svg><circle cx={8} cy={8} r={2.8} /><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" /></Svg>;
export const TurnIcon = () => <Svg size={14}><path d="M2.5 5.5h10l-2.6-2.6M13.5 10.5h-10l2.6 2.6" /></Svg>;
export const SaveIcon = () => <Svg size={14}><path d="M8 2.5v8M4.8 7.6L8 10.8l3.2-3.2M3 13.5h10" /></Svg>;
export const MoonIcon = () => <Svg><path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z" /></Svg>;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Without the clipboard API (an old browser, or a page not served over HTTPS): a hidden field and the old command.
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let done = false;
    try { done = document.execCommand('copy'); } catch { done = false; }
    area.remove();
    return done;
  }
}

// Copies a text, or what `text` returns when clicked, and says so for a moment.
export function CopyButton({ text, label, title, icon }: { text: string | (() => string); label: React.ReactNode; title: string; icon?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onClick = async () => {
    if (!(await copyText(typeof text === 'function' ? text() : text))) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button type="button" className={styles.copy} data-copied={copied} onClick={onClick} title={title} aria-label={title}>
      {copied ? <CheckIcon /> : (icon ?? <CopyIcon />)}
      {/* The label stays, so the button keeps its width; the check mark says it was copied. */}
      <span>{label}</span>
    </button>
  );
}

// A choice between a few options, shown side by side.
export function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: React.ReactNode; title?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.seg} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={String(option.value)} type="button" role="radio" aria-checked={option.value === value} className={styles.segButton} title={option.title} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
