// Reads a design file and builds its board. The page loads this module (with the readers, the builder and the stroke
// font) only when a design file is opened; the Altium reader loads altiumts only when an Altium file is opened.
import { readAltiumBoard, readAltiumLibrary } from '../altium/board';
import { readKicadBoard, readKicadFootprint } from '../kicad/board';
import { Board, Design } from '../model';
import { readPadsBoard } from '../pads/board';
import { buildDesignBoard } from './build';

export type DesignFormat = 'kicad-pcb' | 'kicad-footprint' | 'altium-pcb' | 'altium-pcblib' | 'pads-ascii';

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export async function openDesign(format: DesignFormat, bytes: Uint8Array, fileName: string, onStatus: (text: string) => void): Promise<{ design: Design; board: Board }> {
  const stem = fileName.replace(/\.(kicad_pcb|kicad_mod|pcbdoc|pcblib|asc)$/i, '');
  onStatus(`Reading ${fileName}…`);
  await pause();
  const progress = (s: number) => onStatus(`Reading ${fileName} (${percent(s)})…`);
  let design: Design;
  if (format === 'altium-pcb') {
    design = await readAltiumBoard(bytes, { fileName, pause, onProgress: progress });
  } else if (format === 'altium-pcblib') {
    design = await readAltiumLibrary(bytes, { fileName, pause, onProgress: progress });
  } else if (format === 'pads-ascii') {
    design = await readPadsBoard(bytes, { fileName, pause, onProgress: progress });
  } else {
    const text = new TextDecoder('utf-8').decode(bytes);
    design = format === 'kicad-pcb' ? await readKicadBoard(text, { fileName, pause, onProgress: progress }) : readKicadFootprint(text, { fileName });
  }
  onStatus(`Drawing the layers of ${fileName}…`);
  await pause();
  const source: Board['source'] = format.startsWith('altium') ? 'altium' : format === 'pads-ascii' ? 'pads' : 'kicad';
  const board = await buildDesignBoard(design, { name: stem, source, pause, onProgress: (s) => onStatus(`Drawing the layers of ${fileName} (${percent(s)})…`) });
  return { design, board };
}
