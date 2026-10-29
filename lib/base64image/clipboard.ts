// The Clipboard API is only there on https and localhost. The dev server opened from a phone is plain http, where
// text is copied the old way instead.

export async function copyText(text: string): Promise<void> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.readOnly = true;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand('copy');
  area.remove();
  if (!ok) throw new Error('The browser did not allow copying. Select the text and copy it yourself.');
}

export function canReadText(): boolean {
  return window.isSecureContext && !!navigator.clipboard?.readText;
}

export function canCopyImages(): boolean {
  return window.isSecureContext && typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;
}

// Takes a promise so the clipboard item is created right away in the click; Safari refuses it after an await.
export function copyImage(png: Promise<Blob>): Promise<void> {
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}
