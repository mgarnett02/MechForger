import type { AnyDesign } from './storage';
import { designKey, parseAny } from './storage';

/** File API provided by the desktop app (electron/preload.cjs). Absent in a plain browser. */
interface DesktopFiles {
  save(suggestedName: string, text: string): Promise<string | null>;
  open(): Promise<{ name: string; text: string } | null>;
  saveAll(files: { name: string; text: string }[]): Promise<string | null>;
}

/** The subset of the browser File System Access API used here (Chrome and Edge). */
interface PickerWindow {
  showSaveFilePicker?: (o: object) => Promise<{ name: string; createWritable(): Promise<{ write(t: string): Promise<void>; close(): Promise<void> }> }>;
  showOpenFilePicker?: (o: object) => Promise<{ getFile(): Promise<File> }[]>;
}

const desktop = (): DesktopFiles | undefined => (window as unknown as { mechforgerFiles?: DesktopFiles }).mechforgerFiles;
const pickers = () => window as unknown as PickerWindow;
const PICKER_TYPES = [{ description: 'MechForger design', accept: { 'application/json': ['.json'] } }];

/** Suggested file name for a design, e.g. "Atlas AS7-D.json". */
export function designFileName(d: AnyDesign): string {
  return `${designKey(d).replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').trim() || 'Unnamed'}.json`;
}

export const designText = (d: AnyDesign) => `${JSON.stringify(d, null, 2)}\n`;

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Save a design as its own JSON file. The desktop app and Chrome/Edge show a Save dialog;
 * other browsers download the file. Resolves to the file name, or null if cancelled.
 */
export async function saveDesignFile(d: AnyDesign): Promise<string | null> {
  const name = designFileName(d);
  const text = designText(d);
  const app = desktop();
  if (app) return app.save(name, text);
  const w = pickers();
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName: name, types: PICKER_TYPES });
      const out = await handle.createWritable();
      await out.write(text);
      await out.close();
      return handle.name;
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  download(name, text);
  return name;
}

function pickWithInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Ask for a design file and parse it. Resolves to null if cancelled; throws if the file is not a design. */
export async function loadDesignFile(): Promise<{ name: string; design: AnyDesign } | null> {
  let picked: { name: string; text: string } | null = null;
  const app = desktop();
  const w = pickers();
  if (app) {
    picked = await app.open();
  } else if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: PICKER_TYPES });
      const file = await handle.getFile();
      picked = { name: file.name, text: await file.text() };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  } else {
    const file = await pickWithInput();
    if (file) picked = { name: file.name, text: await file.text() };
  }
  if (!picked) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(picked.text);
  } catch {
    throw new Error(`${picked.name} is not a MechForger design file`);
  }
  return { name: picked.name, design: parseAny(raw) };
}

/** Write several designs as separate files (used to move designs out of old browser storage). */
export async function saveDesignFiles(designs: AnyDesign[]): Promise<boolean> {
  const files = designs.map((d) => ({ name: designFileName(d), text: designText(d) }));
  const app = desktop();
  if (app) return (await app.saveAll(files)) !== null;
  for (const f of files) download(f.name, f.text);
  return true;
}
