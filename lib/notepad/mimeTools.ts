import { inflateSync, unzlibSync } from 'fflate';

export type MimeToolAction =
  | 'base64-encode'
  | 'base64-encode-unix'
  | 'base64-encode-nopad'
  | 'base64-encode-byline'
  | 'base64-decode'
  | 'base64-decode-strict'
  | 'base64-decode-byline'
  | 'qp-encode'
  | 'qp-decode'
  | 'url-encode'
  | 'url-encode-full'
  | 'url-decode'
  | 'saml-decode';

export interface MimeTransformResult {
  output: string;
  error: string | null;
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: false });

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToBytes(raw: string, strict: boolean): Uint8Array {
  let cleaned = strict ? raw : raw.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (strict) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
      throw new Error('Input contains invalid characters or invalid Base64 padding.');
    }
  } else {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
      throw new Error('Input contains invalid Base64 characters.');
    }
    const rem = cleaned.length % 4;
    if (rem === 1) {
      throw new Error('Invalid Base64 length.');
    }
    if (rem > 0) {
      cleaned += '='.repeat(4 - rem);
    }
  }

  const binary = atob(cleaned);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function wrapLines(text: string, width: number, eol: string): string {
  if (text.length <= width) return text;
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += width) {
    parts.push(text.slice(i, i + width));
  }
  return parts.join(eol);
}

export function encodeQuotedPrintable(text: string): string {
  const bytes = utf8Encoder.encode(text);
  let out = '';
  let lineLen = 0;

  const appendToken = (token: string) => {
    if (lineLen + token.length > 75) {
      out += '=\r\n';
      lineLen = 0;
    }
    out += token;
    lineLen += token.length;
  };

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    // Preserve hard CRLF / LF line breaks cleanly
    if (b === 0x0d && bytes[i + 1] === 0x0a) {
      out += '\r\n';
      lineLen = 0;
      i++;
      continue;
    }
    if (b === 0x0a) {
      out += '\n';
      lineLen = 0;
      continue;
    }

    const next = bytes[i + 1];
    const isTrailingWs = (b === 0x20 || b === 0x09) && (next === undefined || next === 0x0d || next === 0x0a);
    const printableSafe = ((b >= 33 && b <= 60) || (b >= 62 && b <= 126) || b === 0x20 || b === 0x09) && !isTrailingWs;

    if (printableSafe) {
      appendToken(String.fromCharCode(b));
    } else {
      appendToken(`=${b.toString(16).toUpperCase().padStart(2, '0')}`);
    }
  }

  return out;
}

export function decodeQuotedPrintable(text: string): string {
  // Strip RFC 2045 soft line breaks
  const unwrapped = text.replace(/=\r?\n/g, '');
  const out: number[] = [];

  for (let i = 0; i < unwrapped.length; i++) {
    const ch = unwrapped[i];
    if (ch === '=' && i + 2 < unwrapped.length && /^[0-9A-Fa-f]{2}$/.test(unwrapped.slice(i + 1, i + 3))) {
      out.push(parseInt(unwrapped.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const encoded = utf8Encoder.encode(ch);
      for (const byte of encoded) out.push(byte);
    }
  }

  return utf8Decoder.decode(new Uint8Array(out));
}

export function fullUrlEncode(text: string): string {
  const bytes = utf8Encoder.encode(text);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += `%${bytes[i].toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

export function decodeSamlPayload(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Step 1: If URL-encoded (e.g., SAMLRequest=... or %2B/%2F/%3D), extract/decode
  let candidate = trimmed;
  const paramMatch = /(?:^|[?&])(?:SAMLRequest|SAMLResponse)=([^&]+)/i.exec(candidate);
  if (paramMatch) {
    candidate = paramMatch[1];
  }
  if (/%[0-9A-Fa-f]{2}/.test(candidate)) {
    candidate = decodeURIComponent(candidate.replace(/\+/g, '%20'));
  }

  // Step 2: Base64 decode
  const rawBytes = base64ToBytes(candidate, false);

  // Step 3: If already uncompressed XML (HTTP-POST binding), return directly
  const directText = utf8Decoder.decode(rawBytes);
  if (/^\s*<[\s\S]*>\s*$/.test(directText)) {
    return directText;
  }

  // Step 4: Try raw DEFLATE (HTTP-Redirect binding per SAML 2.0 spec), then zlib wrapper
  try {
    return utf8Decoder.decode(inflateSync(rawBytes));
  } catch {
    try {
      return utf8Decoder.decode(unzlibSync(rawBytes));
    } catch {
      throw new Error('Could not inflate SAML payload (expected Base64 XML or DEFLATE + Base64 SAML data).');
    }
  }
}

export function runMimeTool(action: MimeToolAction, input: string): MimeTransformResult {
  try {
    switch (action) {
      case 'base64-encode':
        return { output: bytesToBase64(utf8Encoder.encode(input)), error: null };

      case 'base64-encode-unix':
        return { output: wrapLines(bytesToBase64(utf8Encoder.encode(input)), 76, '\n'), error: null };

      case 'base64-encode-nopad':
        return { output: bytesToBase64(utf8Encoder.encode(input)).replace(/=+$/, ''), error: null };

      case 'base64-encode-byline': {
        const eol = input.includes('\r\n') ? '\r\n' : '\n';
        const lines = input.split(/\r?\n/);
        const encoded = lines.map((line) => (line.length === 0 ? '' : bytesToBase64(utf8Encoder.encode(line))));
        return { output: encoded.join(eol), error: null };
      }

      case 'base64-decode': {
        const bytes = base64ToBytes(input, false);
        return { output: utf8Decoder.decode(bytes), error: null };
      }

      case 'base64-decode-strict': {
        const bytes = base64ToBytes(input, true);
        return { output: utf8Decoder.decode(bytes), error: null };
      }

      case 'base64-decode-byline': {
        const eol = input.includes('\r\n') ? '\r\n' : '\n';
        const lines = input.split(/\r?\n/);
        const decoded = lines.map((line) =>
          line.trim().length === 0 ? '' : utf8Decoder.decode(base64ToBytes(line, false)),
        );
        return { output: decoded.join(eol), error: null };
      }

      case 'qp-encode':
        return { output: encodeQuotedPrintable(input), error: null };

      case 'qp-decode':
        return { output: decodeQuotedPrintable(input), error: null };

      case 'url-encode':
        return { output: encodeURIComponent(input), error: null };

      case 'url-encode-full':
        return { output: fullUrlEncode(input), error: null };

      case 'url-decode':
        return { output: decodeURIComponent(input.replace(/\+/g, '%20')), error: null };

      case 'saml-decode':
        return { output: decodeSamlPayload(input), error: null };
    }
  } catch (err) {
    return {
      output: input,
      error: err instanceof Error ? err.message : 'MIME transformation failed.',
    };
  }
}
