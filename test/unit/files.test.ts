// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
import { MemoryStorage, sha256Hex } from 'oplog-core';
import { blobPath, loadBlob, purgeBlobFile, PurgedBlobError, sniffImage, storeBlob } from '../../src/app/files';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const enc = (s: string) => new TextEncoder().encode(s);

describe('attachment blobs', () => {
  it('detects only raster images by their first bytes, never SVG or HTML', () => {
    expect(sniffImage(png)).toBe('image/png');
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImage(enc('GIF89a'))).toBe('image/gif');
    expect(sniffImage(enc('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffImage(enc('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>'))).toBeNull();
    expect(sniffImage(enc('<!doctype html><script>x</script>'))).toBeNull();
    expect(sniffImage(new Uint8Array([]))).toBeNull();
  });

  it('stores a blob 1 time for the same content, and detects a changed blob', async () => {
    const s = new MemoryStorage();
    const a = await storeBlob(s, enc('obsah přílohy'));
    const b = await storeBlob(s, enc('obsah přílohy'));
    expect(a).toBe(b);
    expect(a).toBe(await sha256Hex(enc('obsah přílohy')));
    expect([...s.files.keys()]).toEqual([blobPath(a)]);
    expect(await loadBlob(s, a)).toEqual({ ok: true, bytes: enc('obsah přílohy') });
    s.files.set(blobPath(a), enc('změněno'));
    expect(await loadBlob(s, a)).toEqual({ ok: false, reason: 'bad' });
    expect(await loadBlob(s, 'f'.repeat(64))).toEqual({ ok: false, reason: 'missing' });
  });
});

describe('cache key of an installation', () => {
  it('depends on the trust root, not on the folder name', async () => {
    const { installIdOf } = await import('../../src/app/session');
    const a = await installIdOf('{"v":1,"roots":[{"keyId":"ka"}]}');
    const b = await installIdOf('{"v":1,"roots":[{"keyId":"kb"}]}');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
    expect(await installIdOf('{"v":1,"roots":[{"keyId":"ka"}]}')).toBe(a);
  });
});

describe('purge of a blob file', () => {
  const bytes = new TextEncoder().encode('citlivý dokument');
  it('storeBlob refuses the content of a purged file before it writes anything', async () => {
    const storage = new MemoryStorage();
    const sha = await storeBlob(storage, bytes);
    await storage.remove(`data/files/${sha}`);
    await expect(storeBlob(storage, bytes, (s) => s === sha)).rejects.toBeInstanceOf(PurgedBlobError);
    expect(await storage.readBytes(`data/files/${sha}`)).toBeNull();
  });
  it('purgeBlobFile tells a deleted, a missing and a failed delete apart', async () => {
    const storage = new MemoryStorage();
    const sha = await storeBlob(storage, bytes);
    expect(await purgeBlobFile(storage, sha)).toBe('deleted');
    expect(await storage.readBytes(`data/files/${sha}`)).toBeNull();
    expect(await purgeBlobFile(storage, sha)).toBe('missing');
    // A storage that cannot delete (for example a OneDrive lock): remove() returns false, the file stays.
    await storeBlob(storage, bytes);
    const locked = Object.assign(Object.create(storage), { remove: async () => false }) as MemoryStorage;
    expect(await purgeBlobFile(locked, sha)).toBe('failed');
  });
});
