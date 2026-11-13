// Parsers for payment codes: SEPA credit transfers (EPC069-12, "GiroCode"), Swiss QR bills (SIX, Swiss Payment
// Standards) and cryptocurrency payment links (BIP 21, EIP-681, Lightning), with the check digits of IBANs and
// payment references verified.

import { decodeAs } from './bytes';
import { queryPairs } from './network';
import { Field, Parsed, parsed } from './types';

// IBAN lengths per country (SWIFT IBAN registry).
const IBAN_LENGTH: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28,
  CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18,
  GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32,
  LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24,
  PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28,
  TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

/** ISO 7064 MOD 97-10 of letters and digits (A = 10 … Z = 35), as IBANs and RF references use. */
function mod97(s: string) {
  let r = 0;
  for (const c of s) {
    const v = /\d/.test(c) ? c : String(c.charCodeAt(0) - 55);
    for (const d of v) r = (r * 10 + Number(d)) % 97;
  }
  return r;
}

/** Checks an IBAN: country length and check digits. */
export function checkIban(input: string): { ok: boolean; why: string; pretty: string } {
  const iban = input.replace(/\s+/g, '').toUpperCase();
  const pretty = iban.replace(/(.{4})/g, '$1 ').trim();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return { ok: false, why: 'not an IBAN', pretty };
  const want = IBAN_LENGTH[iban.slice(0, 2)];
  if (want && iban.length !== want) return { ok: false, why: `${iban.slice(0, 2)} IBANs have ${want} characters, this has ${iban.length}`, pretty };
  if (mod97(iban.slice(4) + iban.slice(0, 4)) !== 1) return { ok: false, why: 'check digits wrong: a typing error?', pretty };
  return { ok: true, why: want ? 'check digits and length correct' : 'check digits correct', pretty };
}

/** ISO 11649 creditor reference: RF, two check digits, up to 21 letters and digits. */
export function checkRf(ref: string) {
  const r = ref.replace(/\s+/g, '').toUpperCase();
  return /^RF\d{2}[A-Z0-9]{1,21}$/.test(r) && mod97(r.slice(4) + r.slice(0, 4)) === 1;
}

/** Swiss QR reference: 27 digits, the last a check digit by recursive modulo 10. */
export function checkQrr(ref: string) {
  const r = ref.replace(/\s+/g, '');
  if (!/^\d{27}$/.test(r)) return false;
  const table = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  let carry = 0;
  for (let i = 0; i < 26; i++) carry = table[(carry + Number(r[i])) % 10];
  return (10 - carry) % 10 === Number(r[26]);
}

function ibanField(label: string, iban: string): Field {
  const c = checkIban(iban);
  return { label, value: c.pretty, mono: true, note: c.why, tone: c.ok ? 'good' : 'bad' };
}

const EPC_CHARSETS: Record<string, string> = {
  1: 'utf-8', 2: 'iso-8859-1', 3: 'iso-8859-2', 4: 'iso-8859-4', 5: 'iso-8859-5', 6: 'iso-8859-7', 7: 'iso-8859-10', 8: 'iso-8859-15',
};

/** SEPA credit transfer, EPC069-12: lines BCD, version, charset, SCT, BIC, name, IBAN, amount, purpose, reference, text, note. */
export function parseEpc(text: string, bytes: Uint8Array | null): Parsed | null {
  if (!/^BCD\r?\n/.test(text)) return null;
  let lines = text.split(/\r?\n/);
  const charset = EPC_CHARSETS[lines[2]?.trim()];
  const p = parsed('epc', 'SEPA bank transfer');
  // The code says which character set it uses; read the bytes again in it when it is not UTF-8.
  if (charset && charset !== 'utf-8' && bytes) {
    try { lines = decodeAs(bytes, charset).split(/\r?\n/); } catch { /* keep the reader's text */ }
  }
  const [, version, , id, bic, name, iban, amount, purpose, reference, remittance, info] = lines.map((l) => l?.trim() ?? '');
  p.subtitle = name || undefined;
  p.fields.push({ label: 'Pay to', value: name });
  p.fields.push(ibanField('IBAN', iban));
  if (bic) p.fields.push({ label: 'BIC', value: bic, mono: true });
  const amt = /^EUR(\d+(?:\.\d{1,2})?)$/.exec(amount ?? '');
  if (amount) p.fields.push({ label: 'Amount', value: amt ? `€ ${Number(amt[1]).toFixed(2)}` : amount, mono: true, tone: amt ? undefined : 'bad', note: amt ? undefined : 'not in the EPC form EUR12.34' });
  else p.fields.push({ label: 'Amount', value: 'Not given: you enter it' });
  if (reference) p.fields.push({ label: 'Reference', value: reference, mono: true, ...(reference.startsWith('RF') ? { note: checkRf(reference) ? 'RF check digits correct' : 'RF check digits wrong', tone: checkRf(reference) ? 'good' : 'bad' as const } : {}) });
  if (remittance) p.fields.push({ label: 'Message', value: remittance });
  if (purpose) p.fields.push({ label: 'Purpose code', value: purpose, mono: true });
  if (info) p.fields.push({ label: 'Note to you', value: info });
  p.fields.push({ label: 'Form', value: `EPC version ${version}, ${id === 'INST' ? 'instant transfer' : 'credit transfer'}, ${charset?.toUpperCase() ?? `character set ${lines[2]}`}` });
  if (version === '001' && !bic) p.warnings.push('Version 001 needs a BIC, which is missing.');
  if (reference && remittance) p.warnings.push('A code should have a reference or a message, not both.');
  if (amt && Number(amt[1]) > 999999999.99) p.warnings.push('The amount is above the EPC limit of €999,999,999.99.');
  p.notes.push('Banking apps in the euro area fill in a transfer from this code; check the name, IBAN and amount before you approve it.');
  p.actions.push({ label: 'Copy IBAN', copy: iban.replace(/\s/g, '') });
  return p;
}

/** Swiss QR bill (Swiss Payment Standards, QR-bill implementation guidelines 2.x). */
export function parseSwissQr(text: string): Parsed | null {
  if (!/^SPC\r?\n/.test(text)) return null;
  const l = text.split(/\r?\n/).map((s) => s.trim());
  const address = (o: number) => {
    const [type, name, a, b, code, town, country] = l.slice(o, o + 7);
    if (!name) return null;
    const lines = type === 'K' ? [a, b] : [[a, b].filter(Boolean).join(' '), [code, town].filter(Boolean).join(' ')];
    return [name, ...lines, country].filter(Boolean).join(', ');
  };
  const p = parsed('swiss-qr', 'Swiss QR bill');
  const creditor = address(4);
  p.subtitle = creditor?.split(',')[0];
  p.fields.push(ibanField('Account (IBAN or QR-IBAN)', l[3] ?? ''));
  if (creditor) p.fields.push({ label: 'Pay to', value: creditor });
  const amount = l[18];
  p.fields.push({ label: 'Amount', value: amount ? `${l[19]} ${Number(amount).toFixed(2)}` : `${l[19] ?? ''} (you enter it)`, mono: true });
  const debtor = address(20);
  if (debtor) p.fields.push({ label: 'Payable by', value: debtor });
  const [refType, ref, message, trailer, billInfo] = [l[27], l[28], l[29], l[30], l[31]];
  if (refType === 'QRR') p.fields.push({ label: 'QR reference', value: ref, mono: true, note: checkQrr(ref) ? 'check digit correct' : 'check digit wrong', tone: checkQrr(ref) ? 'good' : 'bad' });
  else if (refType === 'SCOR') p.fields.push({ label: 'Creditor reference', value: ref, mono: true, note: checkRf(ref) ? 'RF check digits correct' : 'RF check digits wrong', tone: checkRf(ref) ? 'good' : 'bad' });
  if (message) p.fields.push({ label: 'Message', value: message });
  if (billInfo) p.fields.push({ label: 'Billing information', value: billInfo, mono: true });
  for (const alt of l.slice(32).filter(Boolean)) p.fields.push({ label: 'Other procedure', value: alt, mono: true });
  if (l[1] !== '0200') p.notes.push(`Version ${l[1]}; this reader knows version 0200.`);
  if (trailer !== 'EPD') p.warnings.push('The line “EPD” that ends the payment data is missing; the code may be damaged or of another form.');
  p.actions.push({ label: 'Copy IBAN', copy: (l[3] ?? '').replace(/\s/g, '') });
  return p;
}

// ---------------------------------------------------------------------------------------------------------------

const COINS: Record<string, { name: string; unit: string; amountKey?: string }> = {
  bitcoin: { name: 'Bitcoin', unit: 'BTC' },
  litecoin: { name: 'Litecoin', unit: 'LTC' },
  bitcoincash: { name: 'Bitcoin Cash', unit: 'BCH' },
  dogecoin: { name: 'Dogecoin', unit: 'DOGE' },
  dash: { name: 'Dash', unit: 'DASH' },
  zcash: { name: 'Zcash', unit: 'ZEC' },
  monero: { name: 'Monero', unit: 'XMR', amountKey: 'tx_amount' },
  ethereum: { name: 'Ethereum', unit: 'ETH', amountKey: 'value' },
  solana: { name: 'Solana', unit: 'SOL' },
  ripple: { name: 'XRP', unit: 'XRP' },
  cardano: { name: 'Cardano', unit: 'ADA' },
  tron: { name: 'Tron', unit: 'TRX' },
};

/** Wei (an integer, maybe in e-notation) as ether, exactly. */
function weiToEther(v: string): string | null {
  const m = /^(\d+)(?:\.(\d+))?(?:e(\d+))?$/i.exec(v);
  if (!m) return null;
  const frac = m[2] ?? '';
  const exp = Number(m[3] ?? 0);
  if (frac.length > exp) return null;
  const wei = BigInt(m[1] + frac + '0'.repeat(exp - frac.length));
  const whole = wei / 10n ** 18n;
  const rest = (wei % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return rest ? `${whole}.${rest}` : `${whole}`;
}

/** The amount in a Lightning invoice's prefix (BOLT 11): lnbc2500u is 2500 µBTC. */
function lightningAmount(invoice: string): string | null {
  const m = /^ln(?:bc|tb|bcrt|tbs)(\d+)([munp]?)1/i.exec(invoice);
  if (!m) return null;
  const scale: Record<string, number> = { '': 0, m: -3, u: -6, n: -9, p: -12 };
  const digits = m[1];
  const exp = scale[m[2].toLowerCase()];
  const value = Number(digits) * 10 ** exp;
  return `${value.toFixed(12).replace(/\.?0+$/, '')} BTC`;
}

export function parseCrypto(text: string): Parsed | null {
  const t = text.trim();
  const ln = /^(?:lightning:)?(ln(?:bc|tb|bcrt|tbs)[0-9a-z]+)$/i.exec(t);
  if (ln && /^lightning:/i.test(t) || (ln && t.length > 60)) {
    const p = parsed('crypto', 'Lightning invoice');
    const amount = lightningAmount(ln[1]);
    p.fields.push({ label: 'Amount', value: amount ?? 'Not given: the payer chooses' });
    p.fields.push({ label: 'Invoice', value: ln[1], mono: true });
    p.notes.push('A Lightning Network payment request (BOLT 11). Its other fields (payee, expiry, description) are signed data that a wallet shows.');
    p.actions.push({ label: 'Copy invoice', copy: ln[1] });
    return p;
  }
  const m = /^([a-z]+):(?:\/\/)?([^?]*)(?:\?(.*))?$/is.exec(t);
  if (!m || !COINS[m[1].toLowerCase()]) return null;
  const scheme = m[1].toLowerCase();
  const coin = COINS[scheme];
  const params = queryPairs(m[3] ?? '');
  const p = parsed('crypto', `${coin.name} payment`);
  let address = m[2];
  if (scheme === 'ethereum') {
    // EIP-681: [pay-]address[@chain id][/function]
    const e = /^(?:pay-)?([^@/]+)(?:@(\d+))?(?:\/(.+))?$/.exec(address);
    if (e) {
      address = e[1];
      p.fields.push({ label: 'Address', value: address, mono: true });
      if (e[2]) p.fields.push({ label: 'Chain ID', value: e[2], note: e[2] === '1' ? 'Ethereum main network' : undefined });
      if (e[3]) p.fields.push({ label: 'Contract function', value: e[3], mono: true });
    }
  } else {
    p.fields.push({ label: 'Address', value: address, mono: true, note: scheme === 'bitcoin' ? bitcoinKind(address) : undefined });
  }
  for (const [k, v] of params) {
    if (k === (coin.amountKey ?? 'amount')) {
      const ether = scheme === 'ethereum' ? weiToEther(v) : null;
      p.fields.push({ label: 'Amount', value: scheme === 'ethereum' ? (ether ? `${ether} ETH` : v) : `${v} ${coin.unit}`, mono: true, note: scheme === 'ethereum' ? `${v} wei` : undefined });
    } else if (k === 'label' || k === 'recipient_name') p.fields.push({ label: 'Recipient', value: v });
    else if (k === 'message' || k === 'tx_description') p.fields.push({ label: 'Message', value: v });
    else if (k === 'lightning') p.fields.push({ label: 'Lightning invoice', value: v, mono: true });
    else p.fields.push({ label: k, value: v, mono: true });
  }
  p.subtitle = `${address.slice(0, 10)}…${address.slice(-6)}`;
  p.notes.push('Check the whole address in your wallet before paying: a payment to a wrong address cannot be undone.');
  p.actions.push({ label: 'Copy address', copy: address });
  return p;
}

function bitcoinKind(a: string) {
  if (/^bc1p/i.test(a)) return 'Taproot address';
  if (/^bc1q/i.test(a)) return 'SegWit address';
  if (/^3/.test(a)) return 'script (P2SH) address';
  if (/^1/.test(a)) return 'legacy address';
  if (/^(tb1|[mn2])/.test(a)) return 'test network address';
  return undefined;
}
