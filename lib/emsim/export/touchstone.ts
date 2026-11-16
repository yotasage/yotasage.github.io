// The via model's S-parameters as a Touchstone 1.1 file (step M8.2a, docs/em-sim/notes-M8.2a.md): `.s2p` for one via
// (port 1 the entry, port 2 the exit), `.s4p` for a pair with single-ended ports in the N-port's order (1 A entry,
// 2 B entry, 3 A exit, 4 B exit), stated in the comments. Touchstone 1.1 has no mixed-mode form; a reader that wants
// Sdd21 converts the 4-port. The option line is `# GHZ S RI R <z0>` (MA and DB on request); Touchstone 1.x allows
// one reference impedance for all ports, which the via model's single-ended ports have. Every frequency the model
// computed is written, from DC up; a comment gives the lumped model's limit (`valid.fMax`), above which the numbers
// are computed but not valid (kept so a time-domain tool has the band it needs). Data lines follow 1.1's layout: a
// 2-port's one line is S11 S21 S12 S22 (1.1's own order), a 4-port's matrix one row per line (4 pairs), the first
// line after the frequency. Numbers in shortest round-trip form, ASCII only, CRLF. Framework-free; `readTouchstone`
// reads such a file back (the harness).

import type { NPort } from '../nport';
import { SITE } from '../figure/tikz';
import { DB_FLOOR, ascii, fullLink } from './csv';

export type TouchstoneFormat = 'RI' | 'MA' | 'DB';
export const TOUCHSTONE_FORMATS: readonly TouchstoneFormat[] = ['RI', 'MA', 'DB'];

export interface TouchstoneOptions {
  format?: TouchstoneFormat;
  link?: string;
  date?: Date;
}

const DEG = 180 / Math.PI;

/** The file's extension: `.s2p` or `.s4p`. */
export const touchstoneExt = (np: NPort): string => `.s${np.ports}p`;

/** Why an N-port cannot be written as Touchstone 1.1, or '' when it can. */
export function touchstoneRefusal(np: NPort | null): string {
  if (!np) return 'There are no S-parameters yet.';
  if (np.mixed) return 'Touchstone 1.1 has single-ended ports only.';
  if (!np.z0.every((z) => z === np.z0[0])) return 'Touchstone 1.1 needs one reference impedance for every port.';
  return '';
}

export function touchstone(np: NPort, opt: TouchstoneOptions = {}): string {
  const why = touchstoneRefusal(np);
  if (why) throw new Error(why);
  const format = opt.format ?? 'RI';
  const P = np.ports, nf = np.f.length;
  const date = (opt.date ?? new Date()).toISOString().replace(/\.\d+Z$/, 'Z');
  const link = fullLink(opt.link);
  const c = (t: string) => `! ${ascii(t)}\r\n`;
  let out = c(`EM simulation, ${SITE}`)
    + c(`S-parameters of the via${P === 4 ? ' pair, single-ended' : ''} from ${np.producer.name} ${np.producer.version} (quasi-static lines and lumped capacitances, no loss)`)
    + c(`Date: ${date}`)
    + (link ? c(`Setup: ${link}`) : '');
  np.names.forEach((n, k) => { out += c(`Port ${k + 1}: ${n}`); });
  out += c(`The model holds up to ${np.valid.fMax / 1e9} GHz (${np.valid.reason}); every computed frequency is written, those above it are outside that range`);
  if (P === 2) out += c('Data per line: f S11 S21 S12 S22 (Touchstone 1.1\'s order for two ports)');
  else out += c(`Data per frequency: ${P} lines, row i of S (Si1 ... Si${P}), the frequency before the first`);
  out += `# GHZ S ${format} R ${String(np.z0[0])}\r\n`;
  const pairOf = (re: number, im: number): string => {
    if (format === 'RI') return `${String(re)} ${String(im)}`;
    const m = Math.hypot(re, im);
    return `${String(format === 'MA' ? m : m > 0 ? 20 * Math.log10(m) : DB_FLOOR)} ${String(Math.atan2(im, re) * DEG)}`;
  };
  for (let k = 0; k < nf; k++) {
    const o = 2 * P * P * k, at = (i: number, j: number) => pairOf(np.s[o + 2 * (i * P + j)], np.s[o + 2 * (i * P + j) + 1]);
    const f = String(np.f[k] / 1e9);
    if (P === 2) out += `${f} ${at(0, 0)} ${at(1, 0)} ${at(0, 1)} ${at(1, 1)}\r\n`;
    else for (let i = 0; i < P; i++) out += `${i === 0 ? f : ' '} ${Array.from({ length: P }, (_, j) => at(i, j)).join(' ')}\r\n`;
  }
  return out;
}

export interface ReadTouchstone { ports: number; f: number[]; s: number[]; z0: number; format: string; comments: string[] }

/** Reads a Touchstone 1.x file of P ports (from its extension) into Hz and S re, im interleaved row-major as NPort. */
export function readTouchstone(text: string, ports: number): ReadTouchstone {
  const comments: string[] = [];
  let unit = 1e9, format = 'MA', z0 = 50;
  const nums: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const bang = raw.indexOf('!');
    if (bang >= 0) comments.push(raw.slice(bang + 1).trim());
    const line = (bang >= 0 ? raw.slice(0, bang) : raw).trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const w = line.slice(1).trim().toUpperCase().split(/\s+/);
      for (let i = 0; i < w.length; i++) {
        if (w[i] === 'HZ') unit = 1; else if (w[i] === 'KHZ') unit = 1e3; else if (w[i] === 'MHZ') unit = 1e6; else if (w[i] === 'GHZ') unit = 1e9;
        else if (w[i] === 'RI' || w[i] === 'MA' || w[i] === 'DB') format = w[i];
        else if (w[i] === 'R') z0 = Number(w[++i]);
      }
      continue;
    }
    for (const t of line.split(/\s+/)) nums.push(Number(t));
  }
  const per = 1 + 2 * ports * ports, nf = Math.floor(nums.length / per);
  const f: number[] = [], s: number[] = new Array(2 * ports * ports * nf);
  for (let k = 0; k < nf; k++) {
    const b = k * per;
    f.push(nums[b] * unit);
    for (let q = 0; q < ports * ports; q++) {
      // 1.1's order: a 2-port's S11 S21 S12 S22, otherwise row-major.
      const i = ports === 2 ? q % 2 : Math.floor(q / ports), j = ports === 2 ? Math.floor(q / 2) : q % ports;
      const a = nums[b + 1 + 2 * q], c = nums[b + 2 + 2 * q];
      let re: number, im: number;
      if (format === 'RI') { re = a; im = c; } else {
        const m = format === 'MA' ? a : Math.pow(10, a / 20), ph = c / DEG;
        re = m * Math.cos(ph); im = m * Math.sin(ph);
      }
      const o = 2 * ((k * ports + i) * ports + j);
      s[o] = re; s[o + 1] = im;
    }
  }
  return { ports, f, s, z0, format, comments };
}
