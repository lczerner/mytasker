// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Minimal ZIP writer for the release archive (deflate, Node built-ins only).
// All entries have the same fixed time, so the same input gives the same archive.
import { crc32, deflateRawSync } from 'node:zlib';

const DOS_TIME = 0;
// 1980-02-01: ZIP times have no time zone, and 1980-01-01 00:00 in a zone east of UTC is before the
// start of the ZIP time range in UTC.
const DOS_DATE = (2 << 5) | 1;
const DOS_DIR = 0x10;

/**
 * Makes a ZIP archive. A name that ends with "/" is a directory (no data). Names must be
 * printable ASCII: the ZIP tool of Windows can show other names incorrectly.
 * @param {{ name: string, data?: Buffer }[]} entries
 * @returns {Buffer}
 */
export function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    if (!/^[\x20-\x7e]+$/.test(e.name)) throw new Error(`zip: the name must be printable ASCII: ${JSON.stringify(e.name)}`);
    const dir = e.name.endsWith('/');
    const name = Buffer.from(e.name, 'ascii');
    const raw = dir ? Buffer.alloc(0) : e.data;
    const packed = dir ? raw : deflateRawSync(raw, { level: 9 });
    const method = dir ? 0 : 8;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // made by: MS-DOS, 2.0
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(DOS_TIME, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(dir ? DOS_DIR : 0, 38);
    entry.writeUInt32LE(offset, 42);

    parts.push(local, name, packed);
    central.push(entry, name);
    offset += local.length + name.length + packed.length;
  }
  const dirBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dirBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dirBytes, end]);
}
