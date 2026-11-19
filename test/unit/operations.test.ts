// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The manual procedures of docs/operations.md that change app/trust-root.json. Synthetic data only.
import { Engine, TRUST_ROOT_PATH, type Storage, type TrustRoot } from 'oplog-core';
import { domain } from '../../src/domain/domain';
import { actor, lastAudit, rawOp, task, team, type Actor } from '../helpers';

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
    // A running client reads the new trust root on the next full scan.
    await t.admin.engine.scan('full');
    expect(t.admin.engine.state.scopes.roles?.user?.[t.petr.userId]?.root).toBe(true);
    expect(t.admin.engine.issues).toEqual([]);
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
    await t.petr.r('SetVerifier', { userId: t.eva.userId, verifier: true });
    expect(lastAudit(t.petr).status).toBe('applied');
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
