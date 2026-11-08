import React from 'react';

import type { PickedFile } from '../../lib/pcb/load';
import pdfStyles from '../../styles/PdfTools.module.css';

// Files dropped from the desktop, with the files inside dropped folders. Entries must be taken during the drop event;
// the folders are read afterwards.
export async function droppedFiles(dt: DataTransfer): Promise<PickedFile[]> {
  const entries = Array.from(dt.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));
  if (!entries.length) return Array.from(dt.files).map((file) => ({ file, path: file.name }));
  const out: PickedFile[] = [];
  const walk = async (entry: FileSystemEntry, dir: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      out.push({ file, path: dir + file.name });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns the entries in batches until it returns none.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await walk(child, `${dir}${entry.name}/`);
      }
    }
  };
  for (const entry of entries) await walk(entry, '');
  return out;
}

export function DropZone({ onFiles, className, overClassName, children }: {
  onFiles: (files: PickedFile[]) => void;
  className: string;
  overClassName: string;
  children: React.ReactNode;
}) {
  const [over, setOver] = React.useState(false);
  const depth = React.useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  return (
    <div
      className={[className, over ? overClassName : ''].join(' ')}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        depth.current -= 1;
        if (depth.current <= 0) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        void droppedFiles(e.dataTransfer).then((files) => {
          if (files.length) onFiles(files);
        });
      }}
    >
      {children}
    </div>
  );
}

// A button that opens the file picker, or the folder picker with `folder`. No file filter: phones grey out files
// whose extension they do not know, which is most Gerber extensions.
export function PickButton({ folder, onFiles, className, children }: {
  folder?: boolean;
  onFiles: (files: PickedFile[]) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  // React passes the attribute through; TypeScript's input props do not list it.
  const folderProps = folder ? { webkitdirectory: '', directory: '' } : {};
  return (
    <>
      <button type="button" className={className} onClick={() => input.current?.click()}>{children}</button>
      <input
        ref={input}
        type="file"
        multiple
        className={pdfStyles.visuallyHidden}
        tabIndex={-1}
        aria-hidden
        {...folderProps}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).map((file) => ({ file, path: file.webkitRelativePath || file.name }));
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

// Folder pickers exist in desktop browsers; phones only pick files.
export function canPickFolders(): boolean {
  if (typeof document === 'undefined') return false;
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return false;
  return 'webkitdirectory' in document.createElement('input');
}
