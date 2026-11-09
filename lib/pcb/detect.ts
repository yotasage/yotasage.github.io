// Recognises the files the PCB viewer is given by their content, not their extension: .asc can be PADS or LTspice,
// .pcb PADS binary or gEDA, .brd EAGLE XML, EAGLE binary or Allegro. Each file gets a status: read now, read in a
// later version ("not supported yet"), never read (with what to do instead), an archive, or ignored.
import { gunzipSync } from 'fflate';

import { pnpFormatName } from './pnp';

export type FormatId =
  | 'gerber' | 'gerber-job' | 'excellon' | 'zip' | 'kicad-pcb' | 'kicad-footprint' | 'altium-pcb' | 'altium-pcblib' | 'pads-ascii'
  | 'eagle-brd' | 'eagle-library' | 'pnp-csv'
  // Not read.
  | 'altium-pcblib-ascii'
  | 'gerber-rs274d' | 'kicad-legacy' | 'pads-binary' | 'pads-library' | 'eagle-binary' | 'allegro'
  | 'odb' | 'ipc2581' | 'ipcd356' | 'gedac' | 'diptrace' | 'easyeda' | 'protel-pcb' | 'archive-other'
  // Ignored: not boards.
  | 'schematic' | 'project' | 'bom' | 'pdf' | 'image' | 'model3d' | 'dxf' | 'text' | 'binary' | 'empty';

export type FileStatus = 'read' | 'later' | 'unsupported' | 'ignored' | 'archive';

export interface Detected {
  id: FormatId;
  // What the file is, e.g. "Gerber X2" or "KiCad board".
  name: string;
  status: FileStatus;
  // Why it is not read, and what to do if there is a way.
  message?: string;
}

function unsupported(id: FormatId, name: string, message: string): Detected {
  return { id, name, status: 'unsupported', message };
}

function ignored(id: FormatId, name: string, message = 'Not a board or layer file; ignored.'): Detected {
  return { id, name, status: 'ignored', message };
}

function startsWithBytes(bytes: Uint8Array, sig: number[], at = 0): boolean {
  if (bytes.length < at + sig.length) return false;
  return sig.every((b, i) => bytes[at + i] === b);
}

function extension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

// Text if the start has no NUL bytes and few control characters.
function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8192);
  let control = 0;
  for (let i = 0; i < n; i += 1) {
    const b = bytes[i];
    if (b === 0) return true;
    if (b < 9 || (b > 13 && b < 32 && b !== 26 && b !== 27)) control += 1;
  }
  return control > n * 0.02;
}

// Whether a compound file (OLE) has a stream or storage with this name; directory names are UTF-16LE.
function hasOleName(bytes: Uint8Array, name: string): boolean {
  const pattern = new Uint8Array(name.length * 2);
  for (let i = 0; i < name.length; i += 1) pattern[i * 2] = name.charCodeAt(i);
  outer: for (let i = 0; i + pattern.length <= bytes.length; i += 1) {
    if (bytes[i] !== pattern[0]) continue;
    for (let k = 1; k < pattern.length; k += 1) if (bytes[i + k] !== pattern[k]) continue outer;
    return true;
  }
  return false;
}

function latin1(bytes: Uint8Array, max = 65536): string {
  const n = Math.min(bytes.length, max);
  let s = '';
  for (let i = 0; i < n; i += 4096) s += String.fromCharCode(...bytes.subarray(i, Math.min(n, i + 4096)));
  return s;
}

// The names in a tar archive (for ODB++ inside a .tgz).
function tarNames(tar: Uint8Array): string[] {
  const names: string[] = [];
  let at = 0;
  while (at + 512 <= tar.length && names.length < 2000) {
    const header = tar.subarray(at, at + 512);
    if (header[0] === 0) break;
    let end = 0;
    while (end < 100 && header[end] !== 0) end += 1;
    names.push(String.fromCharCode(...header.subarray(0, end)));
    const sizeText = String.fromCharCode(...header.subarray(124, 136)).replace(/[^0-7]/g, '');
    const size = parseInt(sizeText || '0', 8);
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return names;
}

const ALTIUM_LIBRARY = 'ASCII PCB libraries are not read. Save the library in binary form in Altium, or open a board (.PcbDoc) that uses its footprints.';

const ODB_MESSAGE = 'ODB++ cannot be read: writing software for it needs membership of Siemens\' ODB++ Solutions Alliance. Export Gerber files instead.';

export function isOdbPath(path: string): boolean {
  return /(^|\/)matrix\/matrix$/i.test(path);
}

function detectBinary(name: string, bytes: Uint8Array): Detected {
  const ext = extension(name);
  if (startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06])) {
    return { id: 'zip', name: 'ZIP archive', status: 'archive' };
  }
  if (startsWithBytes(bytes, [0x1f, 0x8b])) {
    try {
      if (bytes.length < 200 * 1024 * 1024) {
        const tar = gunzipSync(bytes);
        if (tarNames(tar).some(isOdbPath)) return unsupported('odb', 'ODB++', ODB_MESSAGE);
      }
    } catch {
      // Not a gzip file after all.
    }
    return unsupported('archive-other', 'Gzip archive', 'Only ZIP archives are opened. Extract this archive first, or put the files in a ZIP.');
  }
  if (startsWithBytes(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
    return unsupported('archive-other', '7-Zip archive', 'Only ZIP archives are opened. Extract this archive first.');
  }
  if (startsWithBytes(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) {
    return unsupported('archive-other', 'RAR archive', 'Only ZIP archives are opened. Extract this archive first.');
  }
  if (startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    if (hasOleName(bytes, 'Board6')) return { id: 'altium-pcb', name: 'Altium PCB (binary)', status: 'read' };
    if (hasOleName(bytes, 'ComponentParamsTOC') || hasOleName(bytes, 'PadViaLibrary')) return { id: 'altium-pcblib', name: 'Altium PCB library', status: 'read' };
    if (latin1(bytes, 1 << 20).includes('Schematic Capture')) return ignored('schematic', 'Altium schematic', 'A schematic, not a board; ignored.');
    return ignored('binary', 'Compound document (Office or similar)');
  }
  if (startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46])) return ignored('pdf', 'PDF document');
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47]) || startsWithBytes(bytes, [0xff, 0xd8, 0xff]) || startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38])
    || startsWithBytes(bytes, [0x42, 0x4d])) {
    return ignored('image', 'Image');
  }
  // PADS Layout: starts with 00 FF, keeps its own file name (….pcb) near the start, and has a DOC_PADS record. Seen in
  // Linear's DC2637A-1.PCB, also when the file is renamed (as their DC2637A-1.txt).
  const head = latin1(bytes, 1 << 20);
  if ((bytes[0] === 0x00 && bytes[1] === 0xff && /[\x20-\x7e]{1,200}\.pcb\x00/i.test(head.slice(0, 8192))) || head.includes('\x00DOC_PADS\x00') || ext === 'pcb') {
    return unsupported('pads-binary', 'PADS Layout (binary)', 'PADS Layout\'s binary .pcb format cannot be read. In PADS Layout, export PADS ASCII (File → Export → .asc) and open that file.');
  }
  if (ext === 'brd' || ext === 'sch' || ext === 'lbr') {
    // EAGLE before 6.0 wrote 24-byte records; the first is a header of type 0x10.
    if (bytes[0] === 0x10) {
      return unsupported('eagle-binary', 'EAGLE (binary, before 6.0)', 'EAGLE files from before version 6 are binary and cannot be read. Open the file in EAGLE 6 or later and save it, which writes XML, or export Gerber files.');
    }
    if (ext === 'brd') {
      return unsupported('allegro', 'Allegro board', 'Allegro boards (and other binary .brd files) cannot be read. Export Gerber files from Allegro.');
    }
  }
  return ignored('binary', 'Binary file');
}

// The first non-empty line that is not a comment.
function firstLine(text: string): string {
  for (const line of text.split(/\r?\n/, 200)) {
    const t = line.trim();
    if (t && !t.startsWith(';') && !t.startsWith('#')) return t;
  }
  return '';
}

// Pick-and-place files (KiCad, Altium, JLCPCB, EAGLE's mount files, Fusion 360, other tables with a designator and a
// position; lib/pcb/pnp.ts), and bills of materials, which are not read.
function detectCsv(name: string, text: string): Detected | null {
  const pnp = pnpFormatName(name, text);
  if (pnp) return { id: 'pnp-csv', name: pnp, status: 'read' };
  const header = text.split(/\r?\n/, 5).find((l) => l.trim()) ?? '';
  if (!/[,;\t]/.test(header)) return null;
  const h = header.toLowerCase();
  const hasRef = /\b(ref|refdes|designator|reference)\b/.test(h);
  if (hasRef && /\b(qty|quantity|value|val|comment|footprint)\b/.test(h)) return ignored('bom', 'Bill of materials', 'A bill of materials; ignored.');
  return null;
}

function detectText(name: string, text: string): Detected {
  const ext = extension(name);
  const t = text.replace(/^﻿/, '').trimStart();
  const head = t.slice(0, 4096);

  // KiCad
  if (/^\(kicad_pcb\b/.test(t)) return { id: 'kicad-pcb', name: 'KiCad board', status: 'read' };
  if (/^\((footprint|module)\b/.test(t)) return { id: 'kicad-footprint', name: 'KiCad footprint', status: 'read' };
  if (/^\(kicad_sch\b/.test(t) || /^EESchema/.test(t)) return ignored('schematic', 'KiCad schematic', 'A schematic, not a board; ignored.');
  if (/^\((fp_lib_table|sym_lib_table|kicad_wks|kicad_symbol_lib)\b/.test(t)) return ignored('project', 'KiCad library table or sheet');
  if (ext === 'kicad_pro' || ext === 'kicad_prl') return ignored('project', ext === 'kicad_pro' ? 'KiCad project' : 'KiCad project settings');
  if (ext === 'kicad_dru' || /^\(version \d+\)\s*\(rule\b/.test(t)) return ignored('project', 'KiCad design rules');
  if (/^PCBNEW-BOARD Version/.test(t)) {
    return unsupported('kicad-legacy', 'KiCad board (legacy, before KiCad 4)', 'Open the board in KiCad 4 or later and save it as .kicad_pcb.');
  }
  if (/^PCBNEW-LibModule/.test(t)) return unsupported('kicad-legacy', 'KiCad footprint library (legacy)', 'Open it in KiCad and save the footprints as .kicad_mod.');

  // Altium ASCII
  if (/^\|RECORD=Board\|/.test(t) || (/^\|RECORD=/.test(t) && ext === 'pcbdoc')) return { id: 'altium-pcb', name: 'Altium PCB (ASCII)', status: 'read' };
  if (/^\|RECORD=/.test(t) && ext === 'pcblib') return unsupported('altium-pcblib-ascii', 'Altium PCB library (ASCII)', ALTIUM_LIBRARY);
  if (/^\|HEADER=Protel for Windows - Schematic/.test(t)) return ignored('schematic', 'Altium schematic', 'A schematic, not a board; ignored.');
  if (/^\[Design\]/.test(t) && /PrjPcb|ProjectVariant|OutputGroup/.test(head)) return ignored('project', 'Altium project');

  // PADS
  if (/^[!*]PADS-LIBRARY/i.test(t)) return unsupported('pads-library', 'PADS library', 'PADS library files are not read; open a PADS ASCII board (.asc).');
  if (/^!PADS-/i.test(t)) return { id: 'pads-ascii', name: 'PADS ASCII board', status: 'read' };
  if (/^\*PADS-(LOGIC|POWERLOGIC)/i.test(t)) return ignored('schematic', 'PADS Logic schematic', 'A schematic, not a board; ignored.');
  if (/^\*PADS-(PCB|2000|POWERPCB)\*/i.test(t)) return ignored('project', 'PADS netlist');

  // XML
  if (/^<\?xml|^<!DOCTYPE|^<eagle\b|^<IPC-2581/i.test(t)) {
    if (/<IPC-2581\b/i.test(head)) return unsupported('ipc2581', 'IPC-2581', 'IPC-2581 files are not supported (yet). Open the Gerber files of the board.');
    if (/<eagle\b/i.test(head)) {
      if (/<board\b/i.test(t)) return { id: 'eagle-brd', name: 'EAGLE board', status: 'read' };
      if (/<schematic\b/i.test(t)) return ignored('schematic', 'EAGLE schematic', 'A schematic, not a board; ignored.');
      if (/<library\b/i.test(t)) return { id: 'eagle-library', name: 'EAGLE library', status: 'read' };
      // The drawing's kind comes after its layer table, which can be long: a board is the likeliest.
      if (!/<\/drawing>/i.test(t)) return { id: 'eagle-brd', name: 'EAGLE board', status: 'read' };
    }
    return ignored('text', 'XML file');
  }

  // Other design formats
  if (/^Version 4\b/.test(t) && /\bSHEET\b/.test(head)) return ignored('schematic', 'LTspice schematic', 'An LTspice schematic, not a board; ignored.');
  if (/^\(Source "DipTrace/.test(t)) return unsupported('diptrace', 'DipTrace ASCII', 'DipTrace files cannot be read. Export Gerber files from DipTrace.');
  if (/^(# release: pcb|PCB\s*[[(]|FileVersion\s*\[)/m.test(head) && (ext === 'pcb' || /FileVersion\[/.test(head))) {
    return unsupported('gedac', 'gEDA / pcb-rnd board', 'gEDA and pcb-rnd boards cannot be read. Export Gerber files from the program.');
  }
  if (/^PCB FILE \d/.test(t)) return unsupported('protel-pcb', 'Protel PCB (ASCII)', 'Old Protel boards cannot be read. Export Gerber files, or open the board in Altium and save it as .PcbDoc.');
  if (/^\{/.test(t) && /"docType"\s*:\s*"3"/.test(head)) return unsupported('easyeda', 'EasyEDA board', 'EasyEDA boards cannot be read. Export Gerber files from EasyEDA.');
  if (/^STEP\s*\{/.test(t) || (name.toLowerCase() === 'matrix' && /STEP\s*\{/.test(head))) return unsupported('odb', 'ODB++', ODB_MESSAGE);

  // Gerber job file
  // EAGLE and Fusion 360 write "Overall" where the specification has "GeneralSpecs".
  if (/^\{/.test(t) && /"Header"\s*:/.test(head) && /"(FilesAttributes|GeneralSpecs|Overall)"\s*:/.test(t)) {
    return { id: 'gerber-job', name: 'Gerber job file', status: 'read' };
  }
  if (/^\{/.test(t)) return ignored('project', 'JSON file');

  // Gerber
  const x2 = /%T[FAO]\./.test(t);
  if (/%FS[LTD]?[AI]?[NGXY]/i.test(t) || /%MO(MM|IN)\*/i.test(t) || /%ADD\d/.test(t) || x2) {
    return { id: 'gerber', name: x2 ? 'Gerber X2' : 'Gerber RS-274X', status: 'read' };
  }
  if (/^G0?4\b[^\n]*\*/m.test(head) && /D0?[123]\*/.test(t)) {
    return unsupported('gerber-rs274d', 'Gerber RS-274-D', 'This Gerber file has no aperture definitions (RS-274-D, with the apertures in a separate list), which is not supported. Export RS-274X Gerber files.');
  }

  // Excellon drill
  const first = firstLine(t);
  if (/^M48\b/.test(first) || (/^%\s*$/.test(first) && /^T\d+C[\d.]+/m.test(head)) || /^T\d+C[\d.]+/m.test(head)
    || (/^(METRIC|INCH)\b/m.test(head) && /^T\d+/m.test(head)) || (/^;.*\b(drill|excellon)\b/im.test(head) && /^X[-+]?[\d.]+Y[-+]?[\d.]+\s*$/m.test(t))) {
    return { id: 'excellon', name: 'Excellon drill', status: 'read' };
  }

  // IPC-D-356 netlist
  if (/^(C|P)\s+(JOB|IPC-D-356|UNITS|TITLE)/m.test(head) || /^(317|327|367)[A-Z0-9 ]/m.test(head) && /^999\s*$/m.test(t)) {
    return unsupported('ipcd356', 'IPC-D-356 netlist', 'IPC-D-356 netlists are not supported (yet).');
  }

  const csv = detectCsv(name, t);
  if (csv) return csv;
  if (/^0\s*\r?\n\s*SECTION\b/.test(t)) return ignored('dxf', 'DXF drawing');
  if (/^ISO-10303-21/.test(t)) return ignored('model3d', '3D model (STEP)', 'A 3D model; the 3D viewer of this site opens it.');
  if (/^solid\s/.test(t) && /facet\s+normal/.test(head)) return ignored('model3d', '3D model (STL)', 'A 3D model; the 3D viewer of this site opens it.');
  return ignored('text', 'Text file');
}

export function detectFormat(name: string, bytes: Uint8Array): Detected {
  if (!bytes.length) return ignored('empty', 'Empty file', 'The file is empty; ignored.');
  // Text in UTF-16 with a byte order mark (EasyEDA's pick-and-place files).
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) {
    return detectText(name, new TextDecoder(bytes[0] === 0xff ? 'utf-16le' : 'utf-16be').decode(bytes.subarray(0, 1 << 20)));
  }
  if (looksBinary(bytes)) return detectBinary(name, bytes);
  return detectText(name, latin1(bytes));
}
