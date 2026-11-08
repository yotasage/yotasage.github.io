// Reads a design file and builds its board. The page loads this module (with the readers, the builder and the stroke
// font) only when a design file is opened.
import { readKicadBoard, readKicadFootprint } from '../kicad/board';
import { Board, Design } from '../model';
import { buildDesignBoard } from './build';

export type DesignFormat = 'kicad-pcb' | 'kicad-footprint';

function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export async function openDesign(format: DesignFormat, text: string, fileName: string, onStatus: (text: string) => void): Promise<{ design: Design; board: Board }> {
  const stem = fileName.replace(/\.(kicad_pcb|kicad_mod)$/i, '');
  onStatus(`Reading ${fileName}…`);
  await pause();
  const design = format === 'kicad-pcb'
    ? await readKicadBoard(text, { fileName, pause, onProgress: (s) => onStatus(`Reading ${fileName} (${percent(s)})…`) })
    : readKicadFootprint(text, { fileName });
  onStatus(`Drawing the layers of ${fileName}…`);
  await pause();
  const board = await buildDesignBoard(design, { name: stem, source: 'kicad', pause, onProgress: (s) => onStatus(`Drawing the layers of ${fileName} (${percent(s)})…`) });
  return { design, board };
}
