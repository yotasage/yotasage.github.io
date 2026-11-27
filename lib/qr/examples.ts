import { type EcLevel, encode, type EncodeOptions, type Symbology } from './encoder';
import type { Values } from './payloads';
import type { ModuleShape } from './render';

export type QrGenExampleId =
  | 'wifi-guest'
  | 'vcard-engineer'
  | 'totp-2fa'
  | 'sepa-epc'
  | 'rmqr-compact'
  | 'event-summit';

export interface QrGenExamplePreset {
  readonly id: QrGenExampleId;
  readonly tagKey: string;
  readonly code: string;
  readonly titleKey: string;
  readonly descKey: string;
  readonly typeId: string;
  readonly values: Values;
  readonly symbology: Symbology;
  readonly ecLevel: EcLevel;
  readonly foreground?: string;
  readonly background?: string;
  readonly shape?: ModuleShape;
}

export const QR_GEN_EXAMPLES: readonly QrGenExamplePreset[] = [
  {
    id: 'wifi-guest',
    tagKey: 'ex.qrgen.wifi.tag',
    code: 'WIFI: · WPA',
    titleKey: 'ex.qrgen.wifi.title',
    descKey: 'ex.qrgen.wifi.desc',
    typeId: 'wifi',
    values: {
      ssid: 'LabGuest-5G',
      auth: 'WPA',
      password: 'correct-horse-battery',
      hidden: false,
      transition: false,
    },
    symbology: 'qr2',
    ecLevel: 'M',
    foreground: '#0f172a',
    background: '#ffffff',
    shape: 'rounded',
  },
  {
    id: 'vcard-engineer',
    tagKey: 'ex.qrgen.vcard.tag',
    code: 'vCard 3.0',
    titleKey: 'ex.qrgen.vcard.title',
    descKey: 'ex.qrgen.vcard.desc',
    typeId: 'vcard',
    values: {
      version: '3.0',
      first: 'Ada',
      last: 'Lovelace',
      org: 'Analytical Engines',
      title: 'Principal Engineer',
      cell: '+47 912 34 567',
      email: 'ada@example.com',
      url: 'https://yotasage.github.io/',
      city: 'Oslo',
      country: 'Norway',
    },
    symbology: 'qr2',
    ecLevel: 'L',
    foreground: '#000000',
    background: '#ffffff',
    shape: 'square',
  },
  {
    id: 'totp-2fa',
    tagKey: 'ex.qrgen.totp.tag',
    code: 'otpauth://',
    titleKey: 'ex.qrgen.totp.title',
    descKey: 'ex.qrgen.totp.desc',
    typeId: 'otp',
    values: {
      type: 'totp',
      issuer: 'ExampleCloud',
      account: 'ops@example.com',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    },
    symbology: 'qr2',
    ecLevel: 'M',
    foreground: '#1e293b',
    background: '#ffffff',
    shape: 'square',
  },
  {
    id: 'sepa-epc',
    tagKey: 'ex.qrgen.epc.tag',
    code: 'EPC069-12 · M',
    titleKey: 'ex.qrgen.epc.title',
    descKey: 'ex.qrgen.epc.desc',
    typeId: 'epc',
    values: {
      version: '002',
      name: 'Nordic Hardware Lab AS',
      iban: 'DE89370400440532013000',
      bic: 'COBADEFFXXX',
      amount: '49.50',
      purpose: 'GDDS',
      reference: '',
      text: 'Invoice INV-2026-0412',
      info: '',
    },
    symbology: 'qr2',
    ecLevel: 'M',
    foreground: '#000000',
    background: '#ffffff',
    shape: 'square',
  },
  {
    id: 'rmqr-compact',
    tagKey: 'ex.qrgen.rmqr.tag',
    code: 'rMQR · Compact',
    titleKey: 'ex.qrgen.rmqr.title',
    descKey: 'ex.qrgen.rmqr.desc',
    typeId: 'url',
    values: {
      url: 'https://yotasage.github.io/qrcode/main',
    },
    symbology: 'rmqr',
    ecLevel: 'M',
    foreground: '#000000',
    background: '#ffffff',
    shape: 'square',
  },
  {
    id: 'event-summit',
    tagKey: 'ex.qrgen.event.tag',
    code: 'iCalendar · VEVENT',
    titleKey: 'ex.qrgen.event.title',
    descKey: 'ex.qrgen.event.desc',
    typeId: 'event',
    values: {
      summary: 'Hardware Bring-Up Review',
      allDay: false,
      start: '2026-12-04T10:00',
      end: '2026-12-04T11:30',
      utc: true,
      location: 'Lab Room B-204',
      description: 'Rev B board power-on checklist and thermal capture review.',
      wrap: true,
    },
    symbology: 'qr2',
    ecLevel: 'Q',
    foreground: '#1e1b4b',
    background: '#ffffff',
    shape: 'dots',
  },
];

export type QrReaderExampleId =
  | 'multi-sheet'
  | 'wifi-code'
  | 'vcard-code'
  | 'totp-code'
  | 'sepa-code'
  | 'event-code';

export interface QrReaderExamplePreset {
  readonly id: QrReaderExampleId;
  readonly tagKey: string;
  readonly code: string;
  readonly titleKey: string;
  readonly descKey: string;
  readonly fileName: string;
  readonly symbols: readonly {
    readonly text: string;
    readonly options: EncodeOptions;
  }[];
}

const DEFAULT_QR2_M: EncodeOptions = {
  symbology: 'qr2',
  version: 'auto',
  ecLevel: 'M',
  mask: 'auto',
  mode: 'auto',
  charset: 'utf-8',
  eci: 'auto',
};

const DEFAULT_QR2_L: EncodeOptions = {
  ...DEFAULT_QR2_M,
  ecLevel: 'L',
};

const DEFAULT_RMQR_M: EncodeOptions = {
  ...DEFAULT_QR2_M,
  symbology: 'rmqr',
};

export const QR_READER_EXAMPLES: readonly QrReaderExamplePreset[] = [
  {
    id: 'multi-sheet',
    tagKey: 'ex.qrread.multi.tag',
    code: '3 Codes · QR + rMQR',
    titleKey: 'ex.qrread.multi.title',
    descKey: 'ex.qrread.multi.desc',
    fileName: 'multi-code-sheet.png',
    symbols: [
      { text: 'WIFI:T:WPA;S:Example network;P:correct horse battery staple;;', options: DEFAULT_QR2_M },
      {
        text: 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Lovelace;Ada;;;\r\nFN:Ada Lovelace\r\nORG:Analytical Engines\r\nTEL;TYPE=CELL:+4712345678\r\nEMAIL:ada@example.com\r\nEND:VCARD',
        options: DEFAULT_QR2_L,
      },
      { text: 'https://yotasage.github.io/qrcode/main', options: DEFAULT_RMQR_M },
    ],
  },
  {
    id: 'wifi-code',
    tagKey: 'ex.qrread.wifi.tag',
    code: 'WIFI: · WPA2',
    titleKey: 'ex.qrread.wifi.title',
    descKey: 'ex.qrread.wifi.desc',
    fileName: 'wifi-lab-guest.png',
    symbols: [
      { text: 'WIFI:T:WPA;S:LabGuest-5G;P:correct-horse-battery;;', options: DEFAULT_QR2_M },
    ],
  },
  {
    id: 'vcard-code',
    tagKey: 'ex.qrread.vcard.tag',
    code: 'vCard 3.0',
    titleKey: 'ex.qrread.vcard.title',
    descKey: 'ex.qrread.vcard.desc',
    fileName: 'contact-ada-lovelace.png',
    symbols: [
      {
        text: 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Lovelace;Ada;;;\r\nFN:Ada Lovelace\r\nORG:Analytical Engines\r\nTITLE:Principal Engineer\r\nTEL;TYPE=CELL:+4791234567\r\nEMAIL:ada@example.com\r\nURL:https://yotasage.github.io/\r\nEND:VCARD',
        options: DEFAULT_QR2_L,
      },
    ],
  },
  {
    id: 'totp-code',
    tagKey: 'ex.qrread.totp.tag',
    code: 'otpauth://totp',
    titleKey: 'ex.qrread.totp.title',
    descKey: 'ex.qrread.totp.desc',
    fileName: 'totp-authenticator.png',
    symbols: [
      {
        text: 'otpauth://totp/ExampleCloud%3Aops%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=ExampleCloud&algorithm=SHA1&digits=6&period=30',
        options: DEFAULT_QR2_M,
      },
    ],
  },
  {
    id: 'sepa-code',
    tagKey: 'ex.qrread.sepa.tag',
    code: 'EPC069-12 · EUR',
    titleKey: 'ex.qrread.sepa.title',
    descKey: 'ex.qrread.sepa.desc',
    fileName: 'sepa-epc-payment.png',
    symbols: [
      {
        text: 'BCD\n002\n1\nSCT\nCOBADEFFXXX\nNordic Hardware Lab AS\nDE89370400440532013000\nEUR49.50\nGDDS\n\nInvoice INV-2026-0412',
        options: DEFAULT_QR2_M,
      },
    ],
  },
  {
    id: 'event-code',
    tagKey: 'ex.qrread.event.tag',
    code: 'VEVENT · ICS',
    titleKey: 'ex.qrread.event.title',
    descKey: 'ex.qrread.event.desc',
    fileName: 'calendar-event.png',
    symbols: [
      {
        text: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nSUMMARY:Hardware Bring-Up Review\r\nDTSTART:20261204T100000Z\r\nDTEND:20261204T113000Z\r\nLOCATION:Lab Room B-204\r\nEND:VEVENT\r\nEND:VCALENDAR',
        options: DEFAULT_QR2_M,
      },
    ],
  },
];

/** Renders a QR Reader example preset to an in-memory PNG File for scanning. */
export async function buildQrReaderExampleFile(id: QrReaderExampleId): Promise<File> {
  const preset = QR_READER_EXAMPLES.find((p) => p.id === id) ?? QR_READER_EXAMPLES[0];
  const scale = preset.symbols.length > 1 ? 6 : 8;
  const syms = preset.symbols.map((s) => encode(s.text, s.options));
  const gap = 8 * scale;
  const width = syms.reduce((w, s) => w + (s.width + 8) * scale + gap, gap);
  const height = Math.max(...syms.map((s) => (s.height + 8) * scale)) + 2 * gap;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#000000';

  let ox = gap;
  for (const s of syms) {
    const oy = Math.floor((height - s.height * scale) / 2);
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        if (s.modules[y * s.width + x]) {
          ctx.fillRect(ox + (x + 4) * scale, oy + y * scale, scale, scale);
        }
      }
    }
    ox += (s.width + 8) * scale + gap;
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to render PNG'))), 'image/png');
  });
  return new File([blob], preset.fileName, { type: 'image/png' });
}
