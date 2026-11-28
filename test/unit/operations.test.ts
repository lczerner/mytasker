// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The manual procedures of docs/operations.md that change app/trust-root.json. Synthetic data only.
import { Engine, TRUST_ROOT_PATH, type Storage, type TrustRoot } from 'oplog-core';
import { prepareEngine } from '../../src/app/start';
import { domain } from '../../src/domain/domain';
import { actor, auditOf, lastAudit, rawOp, task, team, type Actor } from '../helpers';

async function setRoots(storage: Storage, roots: TrustRoot['roots']) {
  await storage.remove(TRUST_ROOT_PATH);
  await storage.writeNew(TRUST_ROOT_PATH, JSON.stringify({ v: 1, roots } satisfies TrustRoot, null, 2));
}
const rootOf = (a: Actor, displayName: string, cutoffs: { roles: number; data: number } | null = null) => ({ userId: a.userId, displayName, keyId: a.keyId, alg: 'Ed25519' as const, publicKey: a.publicKey, cutoffs });
const seqOf = (e: Engine, keyId: string, scope: string) => e.validHeads().find((h) => h.keyId === keyId && h.scope === scope)?.seq ?? 0;

describe('operations: trust root procedures', () => {
  it('§ second root admin: an approved admin becomes a root admin; nothing breaks', async () => {
    const t = await team();
    await t.admin.r('SetRole', { userId: t.petr.userId, role: 'admin' });
    await t.sync();
    await t.petr.w('CreateTask', { id: 't1', title: 'Před změnou' });
    await setRoots(t.storage, [rootOf(t.admin, 'admin'), rootOf(t.petr, 'Petr Dvořák')]);
    const fresh = new Engine(t.storage, domain, { now: t.clock.now });
    await fresh.scan();
    expect(fresh.issues).toEqual([]);
    expect(fresh.state.scopes.roles?.user?.[t.petr.userId]).toMatchObject({ root: true, role: 'admin', status: 'active' });
    expect(fresh.state.scopes.data?.task?.t1?.title).toBe('Před změnou');
    // A running client reads the new trust root on the next full scan. It shows the change as a
    // 'trust-root' issue until an admin compares the fingerprints and acknowledges the trust root.
    await t.admin.engine.scan('full');
    expect(t.admin.engine.state.scopes.roles?.user?.[t.petr.userId]?.root).toBe(true);
    expect(t.admin.engine.issues.map((i) => i.kind)).toEqual(['trust-root']);
    expect(t.admin.engine.issues[0].detail).toContain('trust root changed');
    await t.admin.engine.scan('full');
    expect(t.admin.engine.issues.map((i) => i.kind)).toEqual(['trust-root']);
    expect(t.admin.engine.trustRootChanged).toBe(true);
    await t.admin.engine.acknowledgeTrustRoot(t.admin.engine.trustRootHash!);
    expect(t.admin.engine.trustRootChanged).toBe(false);
    expect(t.admin.engine.issues).toEqual([]);
  });

  it('§ a changed trust root stays a trust-root issue after a reload, until an admin confirms it', async () => {
    const t = await team();
    await t.admin.r('SetRole', { userId: t.petr.userId, role: 'admin' });
    await t.sync();
    // The browser keeps the known trust root of the folder (saveCache → exportCache().trustRoot).
    const known = t.admin.engine.exportCache().trustRoot;
    expect(known?.roots.map((r) => r.userId)).toEqual([t.admin.userId]);
    await setRoots(t.storage, [rootOf(t.admin, 'admin'), rootOf(t.petr, 'Petr Dvořák')]);
    // Reload: the cache ID depends on the trust root file, so no cache is found. Gate.start restores the known trust root.
    const start = async (k: typeof known) => {
      const e = new Engine(t.storage, domain, { now: t.clock.now });
      await prepareEngine(e, k, async () => false);
      await e.scan('full');
      return e;
    };
    const reloaded = await start(known);
    expect(reloaded.issues.map((i) => i.kind)).toEqual(['trust-root']);
    expect(reloaded.issues[0].detail).toContain('trust root changed');
    expect(reloaded.state.scopes.roles?.user?.[t.petr.userId]?.root).toBe(true); // the new file applies
    // The admin compares the fingerprints (the UI keeps the hash of the trust root that it shows).
    const shown = reloaded.trustRootHash!;
    expect(shown).toMatch(/^sha256:[0-9a-f]{64}$/);
    // The file changes again before the confirmation: the confirmation of the old hash fails and changes nothing.
    await setRoots(t.storage, [rootOf(t.admin, 'admin'), rootOf(t.petr, 'Petr Dvořák'), rootOf(t.eva, 'Eva Nová')]);
    await reloaded.scan('full');
    await expect(reloaded.acknowledgeTrustRoot(shown)).rejects.toThrow('changed after the check');
    expect(reloaded.trustRootChanged).toBe(true);
    expect(reloaded.issues.map((i) => i.kind)).toEqual(['trust-root']);
    // Back to the file that the admin compared. Then the confirmation works. The app saves the new known trust root.
    await setRoots(t.storage, [rootOf(t.admin, 'admin'), rootOf(t.petr, 'Petr Dvořák')]);
    await reloaded.scan('full');
    expect(reloaded.trustRootHash).toBe(shown);
    await reloaded.acknowledgeTrustRoot(shown);
    expect(reloaded.trustRootChanged).toBe(false);
    expect(reloaded.issues).toEqual([]);
    const confirmed = reloaded.exportCache().trustRoot;
    expect(confirmed?.roots.map((r) => r.userId)).toEqual([t.admin.userId, t.petr.userId]);
    expect((await start(confirmed)).issues).toEqual([]);
    // A missing file: the engine keeps the known trust root, with an issue.
    await t.storage.remove(TRUST_ROOT_PATH);
    const missing = await start(confirmed);
    expect(missing.issues.map((i) => i.kind)).toEqual(['trust-root']);
    expect(missing.state.scopes.roles?.user?.[t.petr.userId]?.root).toBe(true);
    // First start in a browser (no known trust root): no issue for the trust root that the engine reads first.
    await t.storage.writeNew(TRUST_ROOT_PATH, JSON.stringify({ v: 1, roots: [rootOf(t.admin, 'admin'), rootOf(t.petr, 'Petr Dvořák')] }, null, 2));
    expect((await start(null)).issues).toEqual([]);
  });

  it('§ a rollback of the trust root to an older file is a trust-root issue, also with the old cache of that file', async () => {
    const t = await team();
    await t.admin.r('SetRole', { userId: t.petr.userId, role: 'admin' });
    await t.sync();
    const fileA = (await t.storage.read(TRUST_ROOT_PATH))!;
    const cacheA = t.admin.engine.exportCache(); // the cache of the installId of file A
    // The admins replace a stolen root key: trust root B with a cutoff, confirmed.
    const cut = { roles: seqOf(t.admin.engine, t.admin.keyId, 'roles'), data: seqOf(t.admin.engine, t.admin.keyId, 'data') };
    await setRoots(t.storage, [rootOf(t.admin, 'admin', cut), rootOf(t.petr, 'Petr Dvořák')]);
    const b = new Engine(t.storage, domain, { now: t.clock.now });
    await prepareEngine(b, cacheA.trustRoot, async () => false);
    await b.scan('full');
    await b.acknowledgeTrustRoot(b.trustRootHash!);
    const knownB = b.exportCache().trustRoot!;
    expect(knownB.roots.length).toBe(2);
    // The thief restores file A. The browser finds the old cache of A (same installId), and an old v2 cache.
    await t.storage.remove(TRUST_ROOT_PATH);
    await t.storage.writeNew(TRUST_ROOT_PATH, fileA);
    for (const cache of [cacheA, { v: 2, ops: [], sigOk: [] } as unknown as typeof cacheA]) {
      const e = new Engine(t.storage, domain, { now: t.clock.now });
      await prepareEngine(e, knownB, async () => (await e.importCache(cache), true));
      await e.scan('full');
      expect(e.trustRootChanged).toBe(true);
      expect(e.issues.filter((i) => i.kind === 'trust-root').length).toBe(1);
      expect(e.issues.find((i) => i.kind === 'trust-root')!.detail).toContain('trust root changed');
    }
  });

  it('§ lost root key with a second root admin: a cutoff on the old key; later ops of that key are invalid', async () => {
    const t = await team();
    await t.admin.r('SetRole', { userId: t.petr.userId, role: 'admin' });
    await t.sync();
    await t.admin.w('CreateTask', { id: 't1', title: 'Platné' });
    const cut = { roles: seqOf(t.admin.engine, t.admin.keyId, 'roles'), data: seqOf(t.admin.engine, t.admin.keyId, 'data') };
    await setRoots(t.storage, [rootOf(t.admin, 'admin', cut), rootOf(t.petr, 'Petr Dvořák')]);
    // The thief writes with the old key after the cutoff. rawOp skips the check of the engine.
    const later = { t: t.clock.now() + 60_000, c: 0 };
    await rawOp(t.storage, t.admin, 'data', 'CreateTask', { id: 't2', title: 'Ukradený klíč' }, later);
    await rawOp(t.storage, t.admin, 'roles', 'SetRole', { userId: t.eva.userId, role: 'admin' }, { t: later.t + 1000, c: 0 });
    const fresh = new Engine(t.storage, domain, { now: t.clock.now });
    await fresh.scan();
    expect(fresh.state.scopes.data?.task?.t1?.title).toBe('Platné');
    expect(fresh.state.scopes.data?.task?.t2).toBeUndefined();
    expect(fresh.state.scopes.roles?.user?.[t.eva.userId]?.role).toBe('user');
    expect(fresh.issues.filter((i) => i.kind === 'revoked').length).toBe(2);
    // The second root admin can still administrate.
    await t.petr.engine.scan('full');
    // auditOf, not lastAudit: the rejected ops of the thief have a later HLC, and a rejected op
    // does not move the clock of the other clients.
    const sv = await t.petr.r('SetVerifier', { userId: t.eva.userId, verifier: true });
    expect(auditOf(t.petr, sv)?.status).toBe('applied');
    expect(task(t.petr, 't1')?.title).toBe('Platné');
  });

  it('§ lost key of the only admin: a new root key for the same user from the enrollment request, no approval', async () => {
    const t = await team();
    await t.admin.w('CreateTask', { id: 't1', title: 'Platné' });
    // The admin has a new key (from "Jsem nový uživatel"): only its keyId and publicKey are known.
    const fresh = await actor('admin-new', t.storage, t.clock.now);
    const newKey = { ...fresh, userId: t.admin.userId };
    const cut = { roles: seqOf(t.admin.engine, t.admin.keyId, 'roles'), data: seqOf(t.admin.engine, t.admin.keyId, 'data') };
    await setRoots(t.storage, [rootOf(t.admin, 'admin', cut), rootOf(newKey, 'admin')]);
    await fresh.engine.scan();
    expect(fresh.engine.issues).toEqual([]);
    expect(fresh.engine.domain.keyOwner(fresh.engine.state, fresh.keyId)).toBe(t.admin.userId);
    expect(fresh.engine.state.scopes.roles?.user?.[t.admin.userId]).toMatchObject({ root: true, role: 'admin', status: 'active' });
    // The new key writes admin ops for the same user; the old ops stay valid.
    await fresh.r('SetVerifier', { userId: t.eva.userId, verifier: true });
    expect(lastAudit(fresh).status).toBe('applied');
    await fresh.w('CreateTask', { id: 't3', title: 'Nový klíč' });
    expect(task(fresh, 't1')?.title).toBe('Platné');
    expect(task(fresh, 't3')?.createdBy).toBe(t.admin.userId);
  });
});
