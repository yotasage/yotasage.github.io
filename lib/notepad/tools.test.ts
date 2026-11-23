import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'fflate';

import { computeAllDigests, computeDigestHex, computeMd5Hex } from './cryptoHash';
import {
  decodeBytesWithEncoding,
  detectEncodingFromBytes,
  encodeTextWithEncoding,
} from './encoding';
import { groupLanguagesByLetter } from './languages';
import { runMimeTool } from './mimeTools';
import { createStarterWorkspace, sanitizeWorkspaceState } from './storage';

test('MIME Tools: Base64 standard, no-pad, Unix EOL, by-line, and strict decode', () => {
  const sample = 'Hello Scratchpad — æøå!';
  const enc = runMimeTool('base64-encode', sample);
  assert.equal(enc.error, null);
  assert.equal(runMimeTool('base64-decode', enc.output).output, sample);

  const nopad = runMimeTool('base64-encode-nopad', 'Hi');
  assert.equal(nopad.output, 'SGk');
  assert.equal(runMimeTool('base64-decode', nopad.output).output, 'Hi');
  assert.notEqual(runMimeTool('base64-decode-strict', nopad.output).error, null);

  const longText = 'A'.repeat(120);
  const unixWrap = runMimeTool('base64-encode-unix', longText);
  assert.ok(unixWrap.output.includes('\n'));
  assert.equal(unixWrap.output.split('\n')[0].length, 76);

  const byLine = runMimeTool('base64-encode-byline', 'one\ntwo');
  assert.equal(byLine.output, 'b25l\ndHdv');
  assert.equal(runMimeTool('base64-decode-byline', byLine.output).output, 'one\ntwo');
});

test('MIME Tools: Quoted-printable, URL encode, Full URL encode, and SAML Decode', () => {
  const qpEnc = runMimeTool('qp-encode', 'Price = 10€\r\nNext line');
  assert.equal(qpEnc.error, null);
  assert.ok(qpEnc.output.includes('=3D'));
  assert.ok(qpEnc.output.includes('=E2=82=AC'));
  assert.equal(runMimeTool('qp-decode', qpEnc.output).output, 'Price = 10€\r\nNext line');

  assert.equal(runMimeTool('url-encode', 'a b&c=1').output, 'a%20b%26c%3D1');
  assert.equal(runMimeTool('url-encode-full', 'AB').output, '%41%42');
  assert.equal(runMimeTool('url-decode', 'a+b%26c%3D1').output, 'a b&c=1');

  // SAML HTTP-Redirect (DEFLATE + Base64 + URL-encode)
  const xml = '<samlp:AuthnRequest ID="id123" Version="2.0"><saml:Issuer>https://app.test</saml:Issuer></samlp:AuthnRequest>';
  const deflated = deflateSync(new TextEncoder().encode(xml));
  const b64 = Buffer.from(deflated).toString('base64');
  const urlEnc = encodeURIComponent(b64);
  const samlRes = runMimeTool('saml-decode', `SAMLRequest=${urlEnc}`);
  assert.equal(samlRes.error, null);
  assert.equal(samlRes.output, xml);
});

test('Crypto Hashes: RFC 1321 MD5 + SHA-1 / SHA-256 / SHA-512 exact test vectors', async () => {
  const enc = new TextEncoder();
  assert.equal(computeMd5Hex(enc.encode('')), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(computeMd5Hex(enc.encode('abc')), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(computeMd5Hex(enc.encode('message digest')), 'f96b697d7cb7938d525a2f31aaf161d0');

  const digests = await computeAllDigests(enc.encode('abc'));
  assert.equal(digests.MD5, '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(digests['SHA-1'], 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.equal(
    digests['SHA-256'],
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal(
    digests['SHA-512'],
    'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
  );

  // UTF-8 vs UTF-8-BOM produces different file byte digests
  const hNoBom = await computeDigestHex('SHA-256', encodeTextWithEncoding('hello', 'utf-8').bytes);
  const hBom = await computeDigestHex('SHA-256', encodeTextWithEncoding('hello', 'utf-8-bom').bytes);
  assert.notEqual(hNoBom, hBom);
});

test('Encodings: BOM detection, heuristic detection, conversion, and mojibake reinterpret', () => {
  const text = 'Café — æøå €10';

  const utf8Bom = encodeTextWithEncoding(text, 'utf-8-bom').bytes;
  assert.deepEqual(detectEncodingFromBytes(utf8Bom), {
    encoding: 'utf-8-bom',
    confidence: 'exact',
    hasBom: true,
  });
  assert.equal(decodeBytesWithEncoding(utf8Bom, 'utf-8-bom'), text);

  const utf16Le = encodeTextWithEncoding(text, 'utf-16le-bom').bytes;
  assert.equal(detectEncodingFromBytes(utf16Le).encoding, 'utf-16le-bom');
  assert.equal(detectEncodingFromBytes(utf16Le).confidence, 'exact');
  assert.equal(decodeBytesWithEncoding(utf16Le, 'utf-16le-bom'), text);

  const utf16Be = encodeTextWithEncoding(text, 'utf-16be-bom').bytes;
  assert.equal(detectEncodingFromBytes(utf16Be).encoding, 'utf-16be-bom');
  assert.equal(decodeBytesWithEncoding(utf16Be, 'utf-16be-bom'), text);

  // Windows-1252 bytes (e.g. 0x80 = Euro, 0xE6 = æ) are invalid UTF-8 -> detected as windows-1252 likely
  const ansiBytes = encodeTextWithEncoding(text, 'windows-1252');
  assert.equal(ansiBytes.lossyCount, 0);
  const detAnsi = detectEncodingFromBytes(ansiBytes.bytes);
  assert.equal(detAnsi.encoding, 'windows-1252');
  assert.equal(detAnsi.confidence, 'likely');
  assert.equal(decodeBytesWithEncoding(ansiBytes.bytes, 'windows-1252'), text);

  // Reinterpreting UTF-8 bytes that were wrongly decoded as ANSI fixes mojibake
  const utf8Bytes = encodeTextWithEncoding('æøå', 'utf-8').bytes;
  const mojibake = decodeBytesWithEncoding(utf8Bytes, 'windows-1252');
  assert.notEqual(mojibake, 'æøå');
  assert.equal(decodeBytesWithEncoding(utf8Bytes, 'utf-8'), 'æøå');
});

test('Language grouping sorts alphabetically and groups shared first letters into submenus', () => {
  const { plainText, groups } = groupLanguagesByLetter();
  assert.equal(plainText.id, 'plaintext');
  assert.ok(groups.length > 10);

  const letters = groups.map((g) => g.letter);
  const sorted = letters.slice().sort((a, b) => a.localeCompare(b, 'en'));
  assert.deepEqual(letters, sorted);

  const cGroup = groups.find((g) => g.letter === 'C');
  assert.ok(cGroup && cGroup.languages.length >= 4);
  assert.ok(cGroup.languages.some((l) => l.id === 'csv'));

  const pGroup = groups.find((g) => g.letter === 'P');
  assert.ok(pGroup && pGroup.languages.some((l) => l.id === 'python'));
});

test('Storage sanitizer preserves backward compatibility with older workspaces and validates custom grids', () => {
  const starter = createStarterWorkspace();
  assert.equal(starter.gridRows, 2);
  assert.equal(starter.gridCols, 2);
  assert.equal(starter.paneDocIds.length, 16);

  // Simulate legacy v1 saved object lacking gridRows/encoding/direction/symbols
  const legacy = {
    version: 1,
    docs: [{ id: 'a', name: 'old.txt', content: 'hi', language: 'plaintext', eol: 'LF' }],
    layout: 'grid',
    paneDocIds: ['a', 'a', 'a', 'a'],
    activePane: 0,
    diffLeftId: 'a',
    diffRightId: 'a',
    settings: { wordWrap: false, showWhitespace: true, showMinimap: false, fontSize: 14 },
  };
  const sanitized = sanitizeWorkspaceState(legacy);
  assert.ok(sanitized);
  assert.equal(sanitized.docs[0].encoding, 'utf-8');
  assert.equal(sanitized.docs[0].direction, 'ltr');
  assert.equal(sanitized.settings.symbols.showWhitespaceAndTab, true);
  assert.equal(sanitized.gridRows, 2);
  assert.equal(sanitized.gridCols, 2);
  assert.equal(sanitized.gridColSizes.length, 2);
});
