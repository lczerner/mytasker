// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// A storage view that shows only some files (simulates partial OneDrive sync).
import { MemoryStorage, TRUST_ROOT_PATH, type DirEntry, type ReadOptions, type Storage } from 'oplog-core';

export class PartialView implements Storage {
  visible = new Set<string>([TRUST_ROOT_PATH]);
  constructor(private readonly base: MemoryStorage) {}
  async list(dir: string): Promise<DirEntry[] | null> {
    const v = new MemoryStorage();
    for (const p of this.visible) if (this.base.files.has(p)) v.files.set(p, this.base.files.get(p)!);
    return v.list(dir);
  }
  async read(path: string, opts?: ReadOptions) {
    return this.visible.has(path) ? this.base.read(path, opts) : null;
  }
  async readBytes(path: string, opts?: ReadOptions) {
    return this.visible.has(path) ? this.base.readBytes(path, opts) : null;
  }
  async writeNew(): Promise<void> {
    throw new Error('read-only view');
  }
  async writeNewBytes(): Promise<void> {
    throw new Error('read-only view');
  }
  async remove(): Promise<boolean> {
    throw new Error('read-only view');
  }
}
