// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The engine keeps the chain check of each author (oplog-core checkChainsCached). A chain that
// changes between 2 scans must be checked again. Synthetic data only.
import { Engine, filePath, MemoryStorage, TRUST_ROOT_PATH } from 'oplog-core';
import { domain } from '../../src/domain/domain';
import { rawOp, team } from '../helpers';

describe('chain cache of the engine', () => {
  it('a gap that closes later, and a key that becomes known later, change the result of the chain', async () => {
    const t = await team();
    // Petr writes 3 ops in a source folder.
    const now = t.clock.get();
    for (let i = 1; i <= 3; i++) await rawOp(t.storage, t.petr, 'data', 'CreateTask', { id: `g${i}`, title: `Úkol ${i}` }, { t: now + i * 1000, c: 0 });
    // Another computer sees the roles, op 1 and op 3 of Petr, but not op 2 yet.
    const other = new MemoryStorage();
    const copy = async (p: string) => other.writeNew(p, (await t.storage.read(p))!);
    await copy(TRUST_ROOT_PATH);
    for (const f of (await t.storage.list(`roles/ops/${t.admin.keyId}`))!) await copy(`roles/ops/${t.admin.keyId}/${f.name}`);
    await copy(filePath('data', 'ops', t.petr.keyId, 1));
    await copy(filePath('data', 'ops', t.petr.keyId, 3));
    const e = new Engine(other, domain, { now: t.clock.now });
    await e.scan();
    expect(e.state.scopes.data?.task?.g1).toBeDefined();
    expect(e.state.scopes.data?.task?.g3).toBeUndefined();
    expect(e.issues.map((i) => i.kind)).toContain('chain-gap');
    // Op 2 arrives: the cached chain of Petr must be checked again.
    await copy(filePath('data', 'ops', t.petr.keyId, 2));
    await e.scan();
    expect(e.issues).toEqual([]);
    expect(['g1', 'g2', 'g3'].every((id) => e.state.scopes.data?.task?.[id])).toBe(true);
  });

  it('ops of a key that is not known yet become valid when the approval arrives', async () => {
    const t = await team();
    const other = new MemoryStorage();
    const copy = async (p: string) => other.writeNew(p, (await t.storage.read(p))!);
    await copy(TRUST_ROOT_PATH);
    await rawOp(t.storage, t.eva, 'data', 'CreateTask', { id: 'k1', title: 'Před schválením' }, { t: t.clock.get() + 1000, c: 0 });
    await copy(filePath('data', 'ops', t.eva.keyId, 1));
    const e = new Engine(other, domain, { now: t.clock.now });
    await e.scan();
    expect(e.issues.map((i) => i.kind)).toContain('unknown-key');
    // The GrantUser ops of the admin arrive.
    for (const f of (await t.storage.list(`roles/ops/${t.admin.keyId}`))!) await copy(`roles/ops/${t.admin.keyId}/${f.name}`);
    await e.scan();
    expect(e.issues).toEqual([]);
    expect(e.state.scopes.data?.task?.k1).toBeDefined();
  });
});
