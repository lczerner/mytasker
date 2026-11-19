// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Tests for the findings of the review of the Phase 3 domain. Synthetic data only.
import { keyBetween, planMove, POS_RE, spreadKeys } from '../../src/domain';
import { actor, lastAudit, task, team, view } from '../helpers';

describe('composite keys', () => {
  it('rejects "/" in the fields of composite keys, so a user cannot block the tags of another task', async () => {
    const { petr, eva, sync } = await team();
    await eva.w('CreateTask', { id: 'A', title: 'Evin' });
    await eva.w('CreateTag', { id: 'R', name: 'faktury' });
    await expect(petr.w('CreateTask', { id: 'A/Q', title: 'x' })).rejects.toThrow('"/" is not permitted');
    await expect(petr.w('CreateTag', { id: 'Q/R', name: 'y' })).rejects.toThrow('"/" is not permitted');
    await sync();
    await expect(petr.w('AddTaskTag', { taskId: 'A/Q', tagId: 'R' })).rejects.toThrow('"/" is not permitted');
    await eva.w('AddTaskTag', { taskId: 'A', tagId: 'R' });
    expect(view(eva, 'A').tags.map((t) => t.id)).toEqual(['R']);
  });
});

describe('fractional keys under many moves', () => {
  it('spreadKeys gives sorted, valid keys of nearly equal length', () => {
    for (const n of [1, 2, 10, 61, 62, 500, 5000]) {
      const k = spreadKeys(n);
      expect(k).toHaveLength(n);
      expect([...k].sort()).toEqual(k);
      expect(new Set(k).size).toBe(n);
      for (const x of k) expect(POS_RE.test(x)).toBe(true);
      expect(Math.max(...k.map((x) => x.length))).toBeLessThanOrEqual(4);
    }
  });

  it('1000 moves to the same place keep all keys valid (planMove rebalances long keys)', () => {
    let items = spreadKeys(5).map((pos, i) => ({ id: `s${i}`, pos }));
    for (let i = 0; i < 1000; i++) {
      const id = items[items.length - 1].id;
      for (const c of planMove(items, id, 1)) items = items.map((x) => (x.id === c.id ? c : x));
      items.sort((a, b) => (a.pos < b.pos ? -1 : a.pos > b.pos ? 1 : a.id < b.id ? -1 : 1));
      for (const x of items) expect(POS_RE.test(x.pos)).toBe(true);
    }
    expect(keyBetween(null, null)).toBe('V');
  });
});

describe('rules without tests before', () => {
  it('a key that RemoveUser does not list gets the cutoff 0', async () => {
    const { storage, admin, petr } = await team();
    const pc2 = await actor('petr-pc2', storage, () => Date.now());
    await admin.r('AddKey', { userId: petr.userId, keyId: pc2.keyId, publicKey: pc2.publicKey });
    await admin.r('RemoveUser', { userId: petr.userId, cutoffs: { [petr.keyId]: { roles: 0, data: 5 } } });
    const keys = admin.engine.state.scopes.roles.key;
    expect(keys[petr.keyId].cutoff).toEqual({ roles: 0, data: 5 });
    expect(keys[pc2.keyId].cutoff).toEqual({ roles: 0, data: 0 });
  });

  it('AddAssignee of a removed user is superseded', async () => {
    const { admin, petr } = await team();
    await admin.w('CreateTask', { id: 't1', title: 'x' });
    await admin.r('RemoveUser', { userId: petr.userId, cutoffs: {} });
    await admin.w('AddAssignee', { taskId: 't1', userId: petr.userId });
    expect(lastAudit(admin)).toMatchObject({ status: 'superseded', reason: 'the user is not active' });
  });

  it('GrantUser and AddKey with a key ID that does not match the public key are superseded', async () => {
    const { storage, admin, petr } = await team();
    const a = await actor('nova', storage, () => Date.now());
    const b = await actor('jina', storage, () => Date.now());
    await admin.r('GrantUser', { userId: 'u-nova', displayName: 'Nová', keyId: a.keyId, publicKey: b.publicKey, role: 'user', verifier: false });
    expect(lastAudit(admin)).toMatchObject({ status: 'superseded', reason: 'the key ID does not match the public key' });
    await admin.r('AddKey', { userId: petr.userId, keyId: a.keyId, publicKey: b.publicKey });
    expect(lastAudit(admin).status).toBe('superseded');
  });

  it('ReturnTask with an existing comment ID is superseded and changes nothing', async () => {
    const { admin } = await team();
    await admin.w('CreateTask', { id: 't1', title: 'x' });
    await admin.w('AddComment', { id: 'c1', taskId: 't1', text: 'první', mentions: [] });
    await admin.w('CompleteTask', { id: 't1', from: 'new' });
    await admin.w('ReturnTask', { id: 't1', from: 'done', commentId: 'c1', text: 'přepsat' });
    expect(lastAudit(admin).status).toBe('superseded');
    expect(task(admin, 't1')!.status).toBe('done');
    expect(admin.engine.state.scopes.data.comment.c1.text).toBe('první');
  });

  it('2 concurrent merges A→B and B→A: the later one is superseded', async () => {
    const { admin, sync, storage } = await team();
    const admin2 = await actor('admin2', storage, () => Date.now());
    await admin.r('GrantUser', { userId: admin2.userId, displayName: 'Druhý', keyId: admin2.keyId, publicKey: admin2.publicKey, role: 'admin', verifier: false });
    await admin.w('CreateTag', { id: 'A', name: 'jedna' });
    await admin.w('CreateTag', { id: 'B', name: 'dva' });
    await sync();
    await admin2.engine.scan();
    await admin.w('MergeTag', { id: 'A', into: 'B' });
    await admin2.w('MergeTag', { id: 'B', into: 'A' });
    await admin.engine.scan();
    await admin2.engine.scan();
    const st = (s: typeof admin.engine.state) => [s.scopes.data.tag.A.status, s.scopes.data.tag.B.status];
    expect(st(admin.engine.state)).toEqual(st(admin2.engine.state));
    expect(admin.engine.audit.filter((a) => a.type === 'MergeTag').map((a) => a.status).sort()).toEqual(['applied', 'superseded']);
  });

  it('a Batch with 1 unauthorized item is rejected in full', async () => {
    const { petr, eva, sync } = await team();
    await eva.w('CreateTask', { id: 'e1', title: 'Evin' });
    await sync();
    await expect(petr.w('Batch', { ops: [{ type: 'CreateTask', payload: { id: 'p1', title: 'x' } }, { type: 'DeleteTask', payload: { id: 'e1', from: 'new' } }] })).rejects.toThrow('only the creator');
    expect(task(petr, 'p1')).toBeUndefined();
  });

  it('ReturnTask and ReopenTask without assignees give "new"; RestoreTask returns to any earlier status', async () => {
    const { admin } = await team();
    await admin.w('CreateTask', { id: 't1', title: 'x' });
    await admin.w('CompleteTask', { id: 't1', from: 'new' });
    await admin.w('ReturnTask', { id: 't1', from: 'done', commentId: 'c1', text: 'znovu' });
    expect(task(admin, 't1')!.status).toBe('new');
    await admin.w('CompleteTask', { id: 't1', from: 'new' });
    await admin.w('VerifyTask', { id: 't1', from: 'done' });
    await admin.w('ReopenTask', { id: 't1', from: 'verified' });
    expect(task(admin, 't1')!.status).toBe('new');
    for (const s of ['new', 'done', 'verified'] as const) {
      const id = `r-${s}`;
      await admin.w('CreateTask', { id, title: s });
      if (s !== 'new') await admin.w('CompleteTask', { id, from: 'new' });
      if (s === 'verified') await admin.w('VerifyTask', { id, from: 'done' });
      await admin.w('DeleteTask', { id, from: s });
      await admin.w('RestoreTask', { id, from: 'deleted' });
      expect(task(admin, id)).toMatchObject({ status: s, statusBeforeDelete: null });
    }
  });

  it('UpdateTask with a refused completedAt and no other change is superseded', async () => {
    const { petr, eva, sync } = await team();
    await petr.w('CreateTask', { id: 't1', title: 'x' });
    await petr.w('CompleteTask', { id: 't1', from: 'new' });
    await sync();
    await eva.w('UpdateTask', { id: 't1', fields: { title: 'x', completedAt: '2026-11-01T00:00:00.000Z' } });
    expect(lastAudit(eva).status).toBe('superseded');
  });

  it('notification and completion references: the op ID for a plain op, "<opId>/<index>" in a Batch', async () => {
    const { admin } = await team();
    await admin.w('CreateTask', { id: 't1', title: 'x' });
    const c = await admin.w('CompleteTask', { id: 't1', from: 'new' });
    expect(task(admin, 't1')!.completeRef).toBe(c.opId);
    await admin.w('CreateTask', { id: 't2', title: 'y' });
    const b = await admin.w('Batch', { ops: [{ type: 'AddComment', payload: { id: 'c9', taskId: 't2', text: 'x', mentions: [] } }, { type: 'CompleteTask', payload: { id: 't2', from: 'new' } }] });
    expect(task(admin, 't2')!.completeRef).toBe(`${b.opId}/1`);
  });
});
