// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Files chosen by the user, attachment blobs and downloads (no network, ADR 0011).
import { FileExistsError, sha256Hex, type Storage } from 'oplog-core';
import { downloadName } from '../domain/text';

export type SaveResult = { saved: true } | { saved: false; reason: 'cancelled' | 'forbidden' };

/**
 * Saves a text file at a place that the user chooses. `forbid` refuses some places (for example
 * the shared folder for a key file): such a file is not written, and an empty file that the
 * picker made is removed.
 */
export async function saveTextFile(suggestedName: string, text: string, mime: string, description: string, forbid?: (h: FileSystemFileHandle) => Promise<boolean>): Promise<SaveResult> {
  const w = window as any;
  if (typeof w.showSaveFilePicker !== 'function') {
    downloadBytes(new TextEncoder().encode(text), suggestedName);
    return { saved: true };
  }
  let h: FileSystemFileHandle;
  try {
    const ext = suggestedName.slice(suggestedName.lastIndexOf('.'));
    h = await w.showSaveFilePicker({ suggestedName, id: 'mytasker-key', startIn: 'documents', types: [{ description, accept: { [mime]: [ext] } }] });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { saved: false, reason: 'cancelled' };
    throw e;
  }
  if (forbid && (await forbid(h))) {
    await (h as any).remove?.().catch(() => undefined);
    return { saved: false, reason: 'forbidden' };
  }
  const s = await (h as any).createWritable();
  await s.write(text);
  await s.close();
  return { saved: true };
}

export async function openTextFile(accept: Record<string, string[]> = { 'application/json': ['.json'] }): Promise<{ name: string; text: string; handle: FileSystemFileHandle } | null> {
  const w = window as any;
  try {
    const [h] = await w.showOpenFilePicker({ multiple: false, id: 'mytasker-key', types: [{ description: 'JSON', accept }] });
    const f = await h.getFile();
    return { name: f.name, text: await f.text(), handle: h };
  } catch (e) {
    if ((e as Error).name === 'AbortError') return null;
    throw e;
  }
}

// ---- Attachments --------------------------------------------------------------------------------

export const blobPath = (sha256: string) => `data/files/${sha256}`;

/** Writes the blob if it does not exist yet (deduplication by content). Returns its SHA-256. */
export async function storeBlob(storage: Storage, bytes: Uint8Array): Promise<string> {
  const sha = await sha256Hex(bytes);
  if ((await storage.readBytes(blobPath(sha))) !== null) return sha;
  try {
    await storage.writeNewBytes(blobPath(sha), bytes);
  } catch (e) {
    if (!(e instanceof FileExistsError)) throw e; // written by another client at the same time: the same content
  }
  return sha;
}

export type BlobResult = { ok: true; bytes: Uint8Array } | { ok: false; reason: 'missing' | 'bad' };

/** Reads a blob and checks its hash. */
export async function loadBlob(storage: Storage, sha256: string): Promise<BlobResult> {
  const bytes = await storage.readBytes(blobPath(sha256));
  if (bytes === null) return { ok: false, reason: 'missing' };
  return (await sha256Hex(bytes)) === sha256 ? { ok: true, bytes } : { ok: false, reason: 'bad' };
}

/** The raster image type from the first bytes (magic bytes), or null. Never SVG. */
export function sniffImage(b: Uint8Array): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | null {
  const at = (i: number, ...v: number[]) => v.every((x, j) => b[i + j] === x);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  return null;
}

/** A blob URL for an inline thumbnail, only for a raster image (checked by magic bytes). */
export function imageUrl(bytes: Uint8Array): string | null {
  const type = sniffImage(bytes);
  return type ? URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type })) : null;
}

/** Downloads bytes with a safe name and the type application/octet-stream (never opens them in the page). */
export function downloadBytes(bytes: Uint8Array, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/octet-stream' }));
  a.download = downloadName(name);
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
