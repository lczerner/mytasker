// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Text functions. All are locale-independent, so the replay stays deterministic.

/** Lowercase, no diacritics. For search and for tag names. Uses no locale. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Normalized tag name (docs/data-model.md §10.3). */
export function normalizeTagName(name: string): string {
  return fold(name).trim().replace(/\s+/g, ' ');
}

/** Characters that a download name must not contain (data-model §11, step 1). */
// eslint-disable-next-line no-control-regex
const BAD_NAME_CHARS = /[\u0000-\u001f\u007f<>:"/\\|?*]/g;

/** Extensions that the app does not accept as attachments (Q-22). */
export const BLOCKED_EXTENSIONS = ['html', 'htm', 'xht', 'xhtm', 'xhtml', 'shtm', 'shtml', 'svg', 'svgz', 'xml', 'xsl', 'mht', 'mhtml'] as const;

/** Extensions that download with their own name. Others get ".txt" (data-model §11, step 4). */
export const SAFE_EXTENSIONS = [
  'pdf', 'txt', 'csv', 'md', 'rtf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'zip', '7z', 'eml', 'msg',
] as const;

const MAX_NAME = 120;
const MAX_EXT = 10;

/** The extension: the text after the last dot, also if the dot is the first character. Lowercase. */
export function extensionOf(name: string): string | null {
  const i = name.lastIndexOf('.');
  if (i < 0 || i === name.length - 1) return null;
  return name.slice(i + 1).toLowerCase();
}

/** Steps 1 to 3 of data-model §11: remove bad characters, trailing dots and spaces, and cut the length. */
export function cleanFileName(name: string): string {
  let n = name.replace(BAD_NAME_CHARS, '').replace(/[. ]+$/, '');
  if (n.length > MAX_NAME) {
    const ext = extensionOf(n);
    if (ext && ext.length <= MAX_EXT && ext.length + 1 < MAX_NAME) n = n.slice(0, MAX_NAME - ext.length - 1).replace(/[. ]+$/, '') + '.' + ext;
    else n = n.slice(0, MAX_NAME).replace(/[. ]+$/, '');
  }
  return n;
}

/** True if the replay and the UI must refuse an attachment with this name (Q-22). */
export function isBlockedFileName(name: string): boolean {
  const ext = extensionOf(cleanFileName(name));
  return ext !== null && (BLOCKED_EXTENSIONS as readonly string[]).includes(ext);
}

/** The name for a download (data-model §11, steps 1 to 5). */
export function downloadName(name: string): string {
  const n = cleanFileName(name) || 'soubor';
  const ext = extensionOf(n);
  return ext !== null && ext.length <= MAX_EXT && (SAFE_EXTENSIONS as readonly string[]).includes(ext) ? n : `${n}.txt`;
}
