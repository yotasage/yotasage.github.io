// What the content of a code is understood as: a kind, a title and fields to show, with warnings, notes and actions.
// Made by content.ts and the parsers it calls; shown by components/QrRead/ContentView.tsx.

export type Kind =
  | 'text' | 'url' | 'wifi' | 'esim' | 'contact' | 'event' | 'email' | 'sms' | 'tel' | 'geo' | 'otp' | 'otp-migration'
  | 'epc' | 'swiss-qr' | 'crypto' | 'gs1' | 'matter' | 'dpp' | 'bcbp' | 'encrypted' | 'json' | 'image' | 'binary';

export interface Field {
  label: string;
  value: string;
  /** Monospaced (codes, addresses, keys). */
  mono?: boolean;
  /** Hidden until shown (passwords, keys, activation codes). */
  secret?: boolean;
  /** A link the value opens: only http(s), mailto, tel, sms and geo links are made. */
  href?: string;
  /** A short remark after the value, e.g. "check digit correct". */
  note?: string;
  tone?: 'good' | 'bad';
}

export interface Download {
  name: string;
  mime: string;
  data: string | Uint8Array;
}

export interface Action {
  label: string;
  href?: string;
  download?: Download;
  /** Text copied to the clipboard. */
  copy?: string;
  /** Said under the button, e.g. where the link goes. */
  hint?: string;
  /** Shown only on that platform (a link that does something useful only there). */
  only?: 'ios';
}

export interface OtpAccount {
  type: 'totp' | 'hotp';
  issuer: string;
  account: string;
  secret: Uint8Array;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512' | 'MD5';
  digits: number;
  period: number;
  counter: number;
  /** An otpauth:// URI for the account (for the migration format, made here). */
  uri: string;
}

export interface Parsed {
  kind: Kind;
  /** What it is, e.g. "Wi-Fi network" or "eSIM activation code". */
  title: string;
  /** One line under the title, e.g. the network name. */
  subtitle?: string;
  fields: Field[];
  /** Tables of further fields, e.g. one per leg of a boarding pass or per file in a ZIP. */
  groups?: { title: string; fields: Field[] }[];
  warnings: string[];
  notes: string[];
  actions: Action[];
  /** Text shown as it is (the body of a text, a pretty-printed JSON). */
  body?: string;
  /** An image to show. */
  image?: { bytes: Uint8Array; mime: string };
  /** Accounts whose codes are computed live. */
  otp?: OtpAccount[];
  /** Cipher text of the site's password-protected text, to decrypt with a password. */
  encrypted?: { line: string; before: string };
  /** Content found inside this one (unpacked, decoded from Base64 or a data URL). */
  inner?: Parsed;
}

export function parsed(kind: Kind, title: string, extra: Partial<Parsed> = {}): Parsed {
  return { kind, title, fields: [], warnings: [], notes: [], actions: [], ...extra };
}

/** Only these schemes become links. */
export function safeHref(href: string): string | undefined {
  return /^(https?:|mailto:|tel:|sms:|geo:)/i.test(href) ? href : undefined;
}
