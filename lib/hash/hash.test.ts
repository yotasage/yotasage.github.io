import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';

import {
  buildDigestDiff,
  bytesToBase64,
  bytesToHex,
  compareFieldDigests,
  computeDigestSync,
  computeHmacSync,
  formatChecksumManifest,
  formatDigest,
  parseExpectedHash,
  parseTextToBytes,
  verifyExpectedHash,
} from './engine';
import { blake2bBytes } from './sha3';
import { HashAlgorithmId, HashFieldEntry } from './types';

const TEST_INPUTS: readonly { name: string; bytes: Uint8Array }[] = [
  { name: 'empty', bytes: new Uint8Array(0) },
  { name: 'abc', bytes: new TextEncoder().encode('abc') },
  { name: 'quick brown fox', bytes: new TextEncoder().encode('The quick brown fox jumps over the lazy dog') },
  { name: 'utf8 norwegian', bytes: new TextEncoder().encode('Blåbærsyltetøy og æøå — 1234567890!') },
  { name: 'multi-block 300 bytes', bytes: Uint8Array.from({ length: 300 }, (_, i) => (i * 37 + 13) & 0xff) },
];

const NODE_CRYPTO_ALGOS: readonly { id: HashAlgorithmId; nodeName: string }[] = [
  { id: 'MD5', nodeName: 'md5' },
  { id: 'SHA-1', nodeName: 'sha1' },
  { id: 'SHA-224', nodeName: 'sha224' },
  { id: 'SHA-256', nodeName: 'sha256' },
  { id: 'SHA-384', nodeName: 'sha384' },
  { id: 'SHA-512', nodeName: 'sha512' },
  { id: 'SHA3-256', nodeName: 'sha3-256' },
  { id: 'SHA3-512', nodeName: 'sha3-512' },
  { id: 'BLAKE2s-256', nodeName: 'blake2s256' },
  { id: 'RIPEMD-160', nodeName: 'ripemd160' },
];

test('cryptographic digests match Node crypto across all test inputs', () => {
  for (const { id, nodeName } of NODE_CRYPTO_ALGOS) {
    for (const sample of TEST_INPUTS) {
      const actual = bytesToHex(computeDigestSync(id, sample.bytes));
      const expected = createHash(nodeName).update(sample.bytes).digest('hex');
      assert.equal(actual, expected, `${id} mismatch on "${sample.name}"`);
    }
  }
});

test('BLAKE2b-256 matches official RFC 7693 vectors and 64-byte BLAKE2b matches Node crypto', () => {
  assert.equal(
    bytesToHex(computeDigestSync('BLAKE2b-256', new Uint8Array(0))),
    '0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8',
  );
  assert.equal(
    bytesToHex(computeDigestSync('BLAKE2b-256', new TextEncoder().encode('abc'))),
    'bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319',
  );
  assert.equal(
    bytesToHex(computeDigestSync('BLAKE2b-256', new TextEncoder().encode('The quick brown fox jumps over the lazy dog'))),
    '01718cec35cd3d796dd00020e0bfecb473ad23457d063b75eff29c0ffa2e58a9',
  );
  for (const sample of TEST_INPUTS) {
    const expected = createHash('blake2b512').update(sample.bytes).digest('hex');
    const actual = bytesToHex(blake2bBytes(sample.bytes, 64));
    assert.equal(actual, expected, `BLAKE2b-512 mismatch on "${sample.name}"`);
  }
});

test('CRC32 and Adler-32 match IEEE 802.3 and RFC 1950 standard test vectors', () => {
  const digits = new TextEncoder().encode('123456789');
  assert.equal(bytesToHex(computeDigestSync('CRC32', new Uint8Array(0))), '00000000');
  assert.equal(bytesToHex(computeDigestSync('CRC32', digits)), 'cbf43926');

  assert.equal(bytesToHex(computeDigestSync('Adler-32', new Uint8Array(0))), '00000001');
  assert.equal(bytesToHex(computeDigestSync('Adler-32', new TextEncoder().encode('Wikipedia'))), '11e60398');
  assert.equal(bytesToHex(computeDigestSync('Adler-32', digits)), '091e01de');
});

test('HMAC matches Node crypto for short and long keys', () => {
  const shortKey = new TextEncoder().encode('secret-key');
  const longKey = Uint8Array.from({ length: 160 }, (_, i) => (i * 19 + 5) & 0xff);
  const msg = new TextEncoder().encode('message authentication test payload');

  for (const { id, nodeName } of [
    { id: 'MD5' as const, nodeName: 'md5' },
    { id: 'SHA-1' as const, nodeName: 'sha1' },
    { id: 'SHA-256' as const, nodeName: 'sha256' },
    { id: 'SHA-512' as const, nodeName: 'sha512' },
    { id: 'SHA3-256' as const, nodeName: 'sha3-256' },
  ]) {
    for (const key of [shortKey, longKey]) {
      const actual = bytesToHex(computeHmacSync(id, key, msg));
      const expected = createHmac(nodeName, key).update(msg).digest('hex');
      assert.equal(actual, expected, `HMAC-${id} mismatch`);
    }
  }
});

test('output formatting and text input parsing handle hex, uppercase, and base64', () => {
  const raw = computeDigestSync('SHA-256', new TextEncoder().encode('hello world'));
  assert.equal(
    formatDigest(raw, 'hex-lower'),
    'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
  );
  assert.equal(
    formatDigest(raw, 'hex-upper'),
    'B94D27B9934D3E08A52E52D7DA7DABFAC484EFE37A5380EE9088F7ACE2EFCDE9',
  );
  assert.equal(formatDigest(raw, 'base64'), bytesToBase64(raw));

  const hexParsed = parseTextToBytes('48 65:6c-6c6f', 'hex');
  assert.equal(hexParsed.ok, true);
  if (hexParsed.ok) {
    assert.equal(new TextDecoder().decode(hexParsed.bytes), 'Hello');
  }
  assert.equal(parseTextToBytes('zz', 'hex').ok, false);

  const b64Parsed = parseTextToBytes('SGVsbG8=', 'base64');
  assert.equal(b64Parsed.ok, true);
  if (b64Parsed.ok) {
    assert.equal(new TextDecoder().decode(b64Parsed.bytes), 'Hello');
  }
});

test('parseExpectedHash extracts GNU/BSD checksum lines, colon hex, and Base64', () => {
  const sha256Hello = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';

  const gnu = parseExpectedHash(`${sha256Hello}  firmware.bin`);
  assert.equal(gnu.format, 'hex');
  assert.equal(gnu.hexLower, sha256Hello);
  assert.equal(gnu.extractedFilename, 'firmware.bin');
  assert.equal(gnu.bitLength, 256);
  assert.ok(gnu.candidateAlgorithms.includes('SHA-256'));

  const bsd = parseExpectedHash(`SHA256 (release.zip) = ${sha256Hello.toUpperCase()}`);
  assert.equal(bsd.format, 'hex');
  assert.equal(bsd.hexLower, sha256Hello);
  assert.equal(bsd.extractedFilename, 'release.zip');

  const b64 = parseExpectedHash(bytesToBase64(computeDigestSync('SHA-256', new TextEncoder().encode('hello world'))));
  assert.equal(b64.format, 'base64');
  assert.equal(b64.hexLower, sha256Hello);
  assert.equal(b64.bitLength, 256);

  const invalid = parseExpectedHash('not-a-valid-hash');
  assert.equal(invalid.format, 'unknown');
});

test('verifyExpectedHash and compareFieldDigests match across multiple fields and formats', () => {
  const helloBytes = new TextEncoder().encode('hello world');
  const otherBytes = new TextEncoder().encode('hello world!');
  const algos: readonly HashAlgorithmId[] = ['MD5', 'SHA-256'];

  const makeField = (id: string, label: string, bytes: Uint8Array): HashFieldEntry => ({
    id,
    label,
    kind: 'text',
    text: new TextDecoder().decode(bytes),
    textEncoding: 'utf8',
    file: null,
    digests: {
      MD5: bytesToHex(computeDigestSync('MD5', bytes)),
      'SHA-256': bytesToHex(computeDigestSync('SHA-256', bytes)),
    },
    byteLength: bytes.length,
    error: null,
    computing: false,
  });

  const fields = [
    makeField('f1', 'Input 1', helloBytes),
    makeField('f2', 'Input 2', helloBytes),
    makeField('f3', 'Input 3', otherBytes),
  ];

  // Expected hash in Base64 should still match hex outputs via canonical bytes
  const b64Expected = bytesToBase64(computeDigestSync('SHA-256', helloBytes));
  const verified = verifyExpectedHash(b64Expected, fields, algos, 'hex-lower');
  assert.equal(verified.status, 'match');
  assert.equal(verified.matches.length, 2);
  assert.deepEqual(
    verified.matches.map((m) => m.fieldId),
    ['f1', 'f2'],
  );

  // Mismatch check
  const mismatched = verifyExpectedHash('0'.repeat(64), fields, algos, 'hex-lower');
  assert.equal(mismatched.status, 'mismatch');
  assert.equal(mismatched.matches.length, 0);

  // Cross-field comparison groups Input 1 & Input 2 together, Input 3 separate
  const cross = compareFieldDigests(fields, algos);
  assert.equal(cross.groups.length, 2);
  assert.equal(cross.allIdentical, false);
  assert.equal(cross.allDistinct, false);
  assert.deepEqual(cross.fieldMatchesByAlgorithm['f1']['SHA-256'], ['Input 2']);
  assert.deepEqual(cross.fieldMatchesByAlgorithm['f2']['SHA-256'], ['Input 1']);
  assert.equal(cross.fieldMatchesByAlgorithm['f3']['SHA-256'], undefined);

  // Manifest export
  const manifest = formatChecksumManifest(fields, 'SHA-256');
  assert.equal(manifest.split('\n').length, 3);
  assert.ok(manifest.includes('  Input 1'));

  // Diff helper
  const diff = buildDigestDiff('abcd1234', 'abcf1294');
  assert.equal(diff.matchingChars, 6);
  assert.equal(diff.totalChars, 8);
});
