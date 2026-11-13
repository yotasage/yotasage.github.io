// The status note at the top of the QR code reader. The tool went live before its owner had used it, so the note
// says plainly what works, how it is checked and what is not done. This file is the one place these texts live.

import React from 'react';

import styles from '../../styles/QrRead.module.css';

export const STATUS_LEAD = 'New.';
export const STATUS_NOW =
  'It reads QR, Micro QR and rMQR codes (and other barcodes if you ask) from your camera, images, PDFs and pasted ' +
  'pictures, and shows what they hold: Wi-Fi networks, eSIMs, links, contacts, events, payments, sign-in codes and ' +
  'more, next to the raw text and bytes.';
export const STATUS_CHECKED =
  'Checked by automated tests: codes made by this site’s generator in every size and setting are read back ' +
  'exactly, and the previews are checked against the examples and test values of each format’s own standard. ' +
  'It is still new to real-world codes, so for something that matters, like a payment, a quick look at the details ' +
  'in the app you use is a good idea.';
export const STATUS_LIMITS =
  'Not yet: QR Code Model 1, an old form, is read up to version 6 only; a code that is badly damaged or blurred is ' +
  'found and outlined but not decoded. Reading is done by ZXing-C++, built into this page as WebAssembly.';

export function Status() {
  return (
    <aside className={styles.status} aria-label="Status of this tool">
      <p><strong>{STATUS_LEAD}</strong> {STATUS_NOW}</p>
      <p>{STATUS_CHECKED}</p>
      <details>
        <summary>More</summary>
        <p>{STATUS_LIMITS}</p>
      </details>
    </aside>
  );
}
