// Small parts shared by the QR code reader's views: a copy button with feedback, a value that is hidden until
// shown, downloads and the format names.

import React from 'react';

import type { Download } from '../../lib/qrread/types';
import styles from '../../styles/QrRead.module.css';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and pages without clipboard permission: a hidden text area and execCommand.
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const done = document.execCommand('copy');
    area.remove();
    return done;
  }
}

export function CopyButton({ text, label = 'Copy', small }: { text: string; label?: string; small?: boolean }) {
  const [state, setState] = React.useState<'idle' | 'done' | 'failed'>('idle');
  React.useEffect(() => {
    if (state === 'idle') return undefined;
    const t = setTimeout(() => setState('idle'), 1500);
    return () => clearTimeout(t);
  }, [state]);
  return (
    <button
      type="button"
      className={small ? styles.smallButton : styles.button}
      onClick={async () => setState((await copyText(text)) ? 'done' : 'failed')}
    >
      <span aria-live="polite">{state === 'done' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}</span>
    </button>
  );
}

export function save(d: Download) {
  const url = URL.createObjectURL(new Blob([d.data as BlobPart], { type: d.mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = d.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** A value hidden behind dots until "Show" is pressed. */
export function Secret({ value, mono }: { value: string; mono?: boolean }) {
  const [shown, setShown] = React.useState(false);
  return (
    <span className={styles.secret}>
      <span className={[mono ? styles.mono : '', shown ? '' : styles.hidden].join(' ')}>
        {shown ? value : '•'.repeat(Math.min(12, Math.max(6, [...value].length)))}
      </span>
      <button type="button" className={styles.linkButton} onClick={() => setShown(!shown)} aria-pressed={shown}>
        {shown ? 'Hide' : 'Show'}
      </button>
      <CopyButton text={value} small />
    </span>
  );
}

const FORMAT_NAMES: Record<string, string> = {
  QRCode: 'QR Code', QRCodeModel1: 'QR Code Model 1', QRCodeModel2: 'QR Code', MicroQRCode: 'Micro QR Code', RMQRCode: 'rMQR Code',
  DataMatrix: 'Data Matrix', PDF417: 'PDF417', Aztec: 'Aztec', MaxiCode: 'MaxiCode', EAN13: 'EAN-13', EAN8: 'EAN-8',
  UPCA: 'UPC-A', UPCE: 'UPC-E', Code128: 'Code 128', Code39: 'Code 39', Code93: 'Code 93', ITF: 'ITF', Codabar: 'Codabar',
  DataBar: 'GS1 DataBar', DataBarExpanded: 'GS1 DataBar Expanded', DataBarLimited: 'GS1 DataBar Limited',
};

export function formatName(format: string) {
  return FORMAT_NAMES[format] ?? format.replace(/([a-z])([A-Z0-9])/g, '$1 $2');
}

export const isQrFamily = (format: string) => /QRCode|RMQR/i.test(format);

/** Whether the page runs on an iPhone or iPad (iPadOS reports itself as a Mac with touch). */
export function onIos() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}
