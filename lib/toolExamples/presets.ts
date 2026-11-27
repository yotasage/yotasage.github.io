import type { BaseSpec } from '../base/types';
import type { HarmonyKind, RGBA } from '../color/types';
import type { DigestEncoding, HashAlgorithmId, TextInputEncoding } from '../hash/types';
import type { EpochUnit } from '../timestamp/types';

/* ── Hash Generator ────────────────────────────────────────────────────── */
export interface HashExamplePreset {
  readonly id: string;
  readonly tagKey: string;
  readonly code: string;
  readonly titleKey: string;
  readonly descKey: string;
  readonly algorithms: readonly HashAlgorithmId[];
  readonly encoding: DigestEncoding;
  readonly hmacEnabled?: boolean;
  readonly hmacKey?: string;
  readonly expectedHash?: string;
  readonly fields: readonly {
    readonly label: string;
    readonly text: string;
    readonly textEncoding?: TextInputEncoding;
  }[];
}

export const HASH_EXAMPLES: readonly HashExamplePreset[] = [
  {
    id: 'integrity-verify',
    tagKey: 'ex.hash.verify.tag',
    code: 'SHA-256 · Compare',
    titleKey: 'ex.hash.verify.title',
    descKey: 'ex.hash.verify.desc',
    algorithms: ['SHA-256', 'SHA-512', 'MD5'],
    encoding: 'hex-lower',
    expectedHash: '315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3',
    fields: [
      { label: 'Release payload', text: 'Hello, world!' },
      { label: 'Verified copy', text: 'Hello, world!' },
      { label: 'Tampered copy', text: 'Hello, world.' },
    ],
  },
  {
    id: 'avalanche-effect',
    tagKey: 'ex.hash.avalanche.tag',
    code: '1-Bit Flip · SHA-256',
    titleKey: 'ex.hash.avalanche.title',
    descKey: 'ex.hash.avalanche.desc',
    algorithms: ['SHA-256', 'SHA3-256', 'BLAKE2b-256'],
    encoding: 'hex-lower',
    fields: [
      { label: 'Message A', text: 'The quick brown fox jumps over the lazy dog' },
      { label: 'Message B (+period)', text: 'The quick brown fox jumps over the lazy dog.' },
    ],
  },
  {
    id: 'hmac-webhook',
    tagKey: 'ex.hash.hmac.tag',
    code: 'HMAC-SHA256',
    titleKey: 'ex.hash.hmac.title',
    descKey: 'ex.hash.hmac.desc',
    algorithms: ['SHA-256', 'SHA-512'],
    encoding: 'hex-lower',
    hmacEnabled: true,
    hmacKey: 'whsec_demo_signing_secret_2026',
    fields: [
      { label: 'Webhook JSON body', text: '{"event":"deploy.succeeded","commit":"9f3a1c2","env":"prod"}' },
    ],
  },
  {
    id: 'hex-packet-crc',
    tagKey: 'ex.hash.crc.tag',
    code: 'Hex Bytes · CRC32',
    titleKey: 'ex.hash.crc.title',
    descKey: 'ex.hash.crc.desc',
    algorithms: ['CRC32', 'SHA-256'],
    encoding: 'hex-upper',
    fields: [
      { label: 'ASCII "123456789" (hex)', text: '31 32 33 34 35 36 37 38 39', textEncoding: 'hex' },
    ],
  },
  {
    id: 'sri-base64',
    tagKey: 'ex.hash.sri.tag',
    code: 'Base64 · SHA-384',
    titleKey: 'ex.hash.sri.title',
    descKey: 'ex.hash.sri.desc',
    algorithms: ['SHA-256', 'SHA-384', 'SHA-512'],
    encoding: 'base64',
    fields: [
      { label: 'Script bundle snippet', text: 'export function checksum(x){return x>>>0;}' },
    ],
  },
  {
    id: 'empty-vectors',
    tagKey: 'ex.hash.nist.tag',
    code: 'NIST Vector · "abc"',
    titleKey: 'ex.hash.nist.title',
    descKey: 'ex.hash.nist.desc',
    algorithms: ['SHA-1', 'SHA-256', 'SHA3-256', 'BLAKE2s-256'],
    encoding: 'hex-lower',
    expectedHash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    fields: [
      { label: 'NIST FIPS 180-4 vector', text: 'abc' },
    ],
  },
];

/* ── Base Converter ────────────────────────────────────────────────────── */
export interface BaseExamplePreset {
  readonly id: string;
  readonly tagKey: string;
  readonly code: string;
  readonly titleKey: string;
  readonly descKey: string;
  readonly from: BaseSpec;
  readonly to: BaseSpec;
  readonly value: string;
}

export const BASE_EXAMPLES: readonly BaseExamplePreset[] = [
  {
    id: 'hex-register',
    tagKey: 'ex.base.hex.tag',
    code: 'Base 16 → Base 2',
    titleKey: 'ex.base.hex.title',
    descKey: 'ex.base.hex.desc',
    from: { radix: 16, alphabetId: 'standard' },
    to: { radix: 2, alphabetId: 'standard' },
    value: 'DEADBEEF',
  },
  {
    id: 'fractional-bin',
    tagKey: 'ex.base.frac.tag',
    code: 'Base 10 → Base 2',
    titleKey: 'ex.base.frac.title',
    descKey: 'ex.base.frac.desc',
    from: { radix: 10, alphabetId: 'standard' },
    to: { radix: 2, alphabetId: 'standard' },
    value: '42.625',
  },
  {
    id: 'u64-bigint',
    tagKey: 'ex.base.u64.tag',
    code: '64-bit · BigInt',
    titleKey: 'ex.base.u64.title',
    descKey: 'ex.base.u64.desc',
    from: { radix: 10, alphabetId: 'standard' },
    to: { radix: 16, alphabetId: 'standard' },
    value: '18446744073709551615',
  },
  {
    id: 'twos-complement',
    tagKey: 'ex.base.neg.tag',
    code: 'Signed · -42',
    titleKey: 'ex.base.neg.title',
    descKey: 'ex.base.neg.desc',
    from: { radix: 10, alphabetId: 'standard' },
    to: { radix: 2, alphabetId: 'standard' },
    value: '-42',
  },
  {
    id: 'base58-id',
    tagKey: 'ex.base.b58.tag',
    code: 'Base 16 → Base58',
    titleKey: 'ex.base.b58.title',
    descKey: 'ex.base.b58.desc',
    from: { radix: 16, alphabetId: 'standard' },
    to: { radix: 58, alphabetId: 'base58' },
    value: '00F54A5851E9372B87810A8E60CDD2E7CFD80B6E31',
  },
  {
    id: 'crockford-ulid',
    tagKey: 'ex.base.c32.tag',
    code: 'Crockford Base32',
    titleKey: 'ex.base.c32.title',
    descKey: 'ex.base.c32.desc',
    from: { radix: 32, alphabetId: 'crockford32' },
    to: { radix: 10, alphabetId: 'standard' },
    value: '01J9X4K8M2',
  },
];

/* ── Timestamp Converter ───────────────────────────────────────────────── */
export interface TimestampExamplePreset {
  readonly id: string;
  readonly tagKey: string;
  readonly code: string;
  readonly titleKey: string;
  readonly descKey: string;
  readonly targetWorkspace: 'converter' | 'difference' | 'batch';
  readonly rawInput?: string;
  readonly unitOverride?: EpochUnit;
  readonly selectedZone?: string;
}

export const TIMESTAMP_EXAMPLES: readonly TimestampExamplePreset[] = [
  {
    id: 'unix-epoch-zero',
    tagKey: 'ex.ts.epoch0.tag',
    code: '0 · Unix Epoch',
    titleKey: 'ex.ts.epoch0.title',
    descKey: 'ex.ts.epoch0.desc',
    targetWorkspace: 'converter',
    rawInput: '0',
    unitOverride: 's',
    selectedZone: 'UTC',
  },
  {
    id: 'y2k38-limit',
    tagKey: 'ex.ts.y2k38.tag',
    code: '2147483647 · Int32',
    titleKey: 'ex.ts.y2k38.title',
    descKey: 'ex.ts.y2k38.desc',
    targetWorkspace: 'converter',
    rawInput: '2147483647',
    unitOverride: 's',
    selectedZone: 'UTC',
  },
  {
    id: 'js-milliseconds',
    tagKey: 'ex.ts.ms.tag',
    code: '13-digit · ms',
    titleKey: 'ex.ts.ms.title',
    descKey: 'ex.ts.ms.desc',
    targetWorkspace: 'converter',
    rawInput: '1767225600000',
    unitOverride: 'auto',
    selectedZone: 'Europe/Oslo',
  },
  {
    id: 'nanosecond-trace',
    tagKey: 'ex.ts.ns.tag',
    code: '19-digit · ns',
    titleKey: 'ex.ts.ns.title',
    descKey: 'ex.ts.ns.desc',
    targetWorkspace: 'converter',
    rawInput: '1795635565123456789',
    unitOverride: 'auto',
    selectedZone: 'UTC',
  },
  {
    id: 'iso-offset',
    tagKey: 'ex.ts.iso.tag',
    code: 'ISO 8601 · +02:00',
    titleKey: 'ex.ts.iso.title',
    descKey: 'ex.ts.iso.desc',
    targetWorkspace: 'converter',
    rawInput: '2026-06-21T14:30:00+02:00',
    unitOverride: 'auto',
    selectedZone: 'America/New_York',
  },
  {
    id: 'rfc-http-date',
    tagKey: 'ex.ts.rfc.tag',
    code: 'RFC 2822 · HTTP',
    titleKey: 'ex.ts.rfc.title',
    descKey: 'ex.ts.rfc.desc',
    targetWorkspace: 'converter',
    rawInput: 'Wed, 21 Oct 2015 07:28:00 GMT',
    unitOverride: 'auto',
    selectedZone: 'Asia/Tokyo',
  },
];

/* ── Color Picker & Converter ──────────────────────────────────────────── */
export interface ColorExamplePreset {
  readonly id: string;
  readonly tagKey: string;
  readonly code: string;
  readonly titleKey: string;
  readonly descKey: string;
  readonly color: RGBA;
  readonly harmony: HarmonyKind;
}

export const COLOR_EXAMPLES: readonly ColorExamplePreset[] = [
  {
    id: 'cobalt-ui',
    tagKey: 'ex.color.cobalt.tag',
    code: '#2563EB · Triadic',
    titleKey: 'ex.color.cobalt.title',
    descKey: 'ex.color.cobalt.desc',
    color: { r: 37, g: 99, b: 235, a: 1 },
    harmony: 'triadic',
  },
  {
    id: 'emerald-teal',
    tagKey: 'ex.color.teal.tag',
    code: '#0D9488 · Analogous',
    titleKey: 'ex.color.teal.title',
    descKey: 'ex.color.teal.desc',
    color: { r: 13, g: 148, b: 136, a: 1 },
    harmony: 'analogous',
  },
  {
    id: 'amber-signal',
    tagKey: 'ex.color.amber.tag',
    code: '#D97706 · Complementary',
    titleKey: 'ex.color.amber.title',
    descKey: 'ex.color.amber.desc',
    color: { r: 217, g: 119, b: 6, a: 1 },
    harmony: 'complementary',
  },
  {
    id: 'magenta-accent',
    tagKey: 'ex.color.magenta.tag',
    code: '#DB2777 · Split-Comp',
    titleKey: 'ex.color.magenta.title',
    descKey: 'ex.color.magenta.desc',
    color: { r: 219, g: 39, b: 119, a: 1 },
    harmony: 'split',
  },
  {
    id: 'pcb-soldermask',
    tagKey: 'ex.color.pcb.tag',
    code: '#166534 · Tetradic',
    titleKey: 'ex.color.pcb.title',
    descKey: 'ex.color.pcb.desc',
    color: { r: 22, g: 101, b: 52, a: 1 },
    harmony: 'tetradic',
  },
  {
    id: 'translucent-glass',
    tagKey: 'ex.color.glass.tag',
    code: 'rgba(124,58,237,0.72)',
    titleKey: 'ex.color.glass.title',
    descKey: 'ex.color.glass.desc',
    color: { r: 124, g: 58, b: 237, a: 0.72 },
    harmony: 'monochromatic',
  },
];
