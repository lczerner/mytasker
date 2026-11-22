// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The ZIP writer of the release archive (scripts/zip.mjs): read back through the central directory.
import { crc32, inflateRawSync } from 'node:zlib';
import { zip } from '../../scripts/zip.mjs';

interface Read {
  name: string;
  data: Buffer;
  dir: boolean;
}

/** Reads all entries through the end record and the central directory, as unzip tools do. */
function unzip(b: Buffer): Read[] {
  const end = b.length - 22;
  expect(b.readUInt32LE(end)).toBe(0x06054b50);
  const count = b.readUInt16LE(end + 10);
  let p = b.readUInt32LE(end + 16);
  const out: Read[] = [];
  for (let i = 0; i < count; i++) {
    expect(b.readUInt32LE(p)).toBe(0x02014b50);
    const method = b.readUInt16LE(p + 10);
    const crc = b.readUInt32LE(p + 16);
    const size = b.readUInt32LE(p + 20);
    const nameLen = b.readUInt16LE(p + 28);
    const attrs = b.readUInt32LE(p + 38);
    const at = b.readUInt32LE(p + 42);
    const name = b.toString('ascii', p + 46, p + 46 + nameLen);
    expect(b.readUInt32LE(at)).toBe(0x04034b50);
    expect(b.toString('ascii', at + 30, at + 30 + b.readUInt16LE(at + 26))).toBe(name);
    const start = at + 30 + b.readUInt16LE(at + 26) + b.readUInt16LE(at + 28);
    const packed = b.subarray(start, start + size);
    const data = method === 8 ? inflateRawSync(packed) : Buffer.from(packed);
    expect(crc32(data)).toBe(crc);
    out.push({ name, data, dir: (attrs & 0x10) !== 0 });
    p += 46 + nameLen + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
  }
  return out;
}

describe('zip (release archive)', () => {
  const html = Buffer.from('<!doctype html><title>Úkoly</title>'.repeat(50));
  const entries = [{ name: 'Ukoly/' }, { name: 'Ukoly/app/' }, { name: 'Ukoly/app/index.html', data: html }, { name: 'Ukoly/app/VERSION', data: Buffer.from('0.1.0 (abc1234)\n') }, { name: 'Ukoly/enroll/' }];

  it('keeps the names, the directories and the content', () => {
    const got = unzip(zip(entries));
    expect(got.map((e) => [e.name, e.dir])).toEqual(entries.map((e) => [e.name, e.name.endsWith('/')]));
    expect(got[2].data.equals(html)).toBe(true);
    expect(got[3].data.toString()).toBe('0.1.0 (abc1234)\n');
    expect(got[4].data.length).toBe(0);
  });

  it('gives the same bytes for the same input', () => {
    expect(zip(entries).equals(zip(entries))).toBe(true);
  });

  it('refuses a name that is not printable ASCII', () => {
    expect(() => zip([{ name: 'Úkoly/' }])).toThrow(/ASCII/);
  });
});
