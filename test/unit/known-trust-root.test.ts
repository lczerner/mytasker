// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The known trust roots of the folders in the browser (src/app/session.ts). IndexedDB is a stub. Synthetic data only.
import type { TrustRoot } from 'oplog-core';
import { Engine } from 'oplog-core';

const db = new Map<string, unknown>();
vi.mock('../../src/app/idb', () => ({
  // A copy of the list, as IndexedDB gives (the handle stubs have functions, so no structuredClone).
  idbGet: async (k: string) => {
    const v = db.get(k);
    return Array.isArray(v) ? [...v] : v;
  },
  idbSet: async (k: string, v: unknown) => void db.set(k, v),
  idbDel: async (k: string) => void db.delete(k),
}));
const { loadKnownTrustRoot, saveCache, saveKnownTrustRoot } = await import('../../src/app/session');
const { domain } = await import('../../src/domain/domain');
const { team } = await import('../helpers');

/** A folder handle stub: isSameEntry compares the name. */
const folder = (name: string) => ({ name, isSameEntry: async (o: { name: string }) => o.name === name }) as unknown as FileSystemDirectoryHandle;
const tr = (userId: string): TrustRoot => ({ v: 1, roots: [{ userId, displayName: userId, keyId: 'kaaaaaaaaaaaaaaaaaaaaaaaa', alg: 'Ed25519', publicKey: 'p', cutoffs: null }] });

beforeEach(() => db.clear());

describe('known trust roots of the folders', () => {
  it('a save for folder Y does not change the record of folder X; a new save replaces only its own record', async () => {
    const x = folder('X');
    const y = folder('Y');
    expect(await loadKnownTrustRoot(x)).toBeNull();
    await saveKnownTrustRoot(x, tr('u-x'));
    await saveKnownTrustRoot(y, tr('u-y'));
    expect((await loadKnownTrustRoot(x))?.roots[0].userId).toBe('u-x');
    expect((await loadKnownTrustRoot(y))?.roots[0].userId).toBe('u-y');
    await saveKnownTrustRoot(y, tr('u-y2'));
    expect((await loadKnownTrustRoot(x))?.roots[0].userId).toBe('u-x');
    expect((await loadKnownTrustRoot(y))?.roots[0].userId).toBe('u-y2');
    expect((db.get('knownTrustRoots') as unknown[]).length).toBe(2);
  });

  it('keeps at most 20 folders: the oldest record goes first', async () => {
    for (let i = 0; i < 22; i++) await saveKnownTrustRoot(folder(`F${i}`), tr(`u-${i}`));
    expect((db.get('knownTrustRoots') as unknown[]).length).toBe(20);
    expect(await loadKnownTrustRoot(folder('F0'))).toBeNull();
    expect(await loadKnownTrustRoot(folder('F1'))).toBeNull();
    expect((await loadKnownTrustRoot(folder('F21')))?.roots[0].userId).toBe('u-21');
  });

  it('saveCache writes the known trust root only when it gets the folder (first start, confirmation), not on a normal save', async () => {
    const t = await team();
    const kek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
    const u = { keyFile: { keyId: t.admin.keyId }, kek } as unknown as Parameters<typeof saveCache>[1];
    const x = folder('X');
    await saveKnownTrustRoot(x, tr('u-old'));
    const e = new Engine(t.storage, domain);
    await e.scan('full');
    await saveCache(e, u, 'install-1'); // the debounced save of a tab
    expect((await loadKnownTrustRoot(x))?.roots[0].userId).toBe('u-old');
    await saveCache(e, u, 'install-1', x); // after a confirmation
    expect((await loadKnownTrustRoot(x))?.roots[0].userId).toBe(t.admin.userId);
    expect(db.has(`cache:install-1:${t.admin.keyId}`)).toBe(true);
  });
});
