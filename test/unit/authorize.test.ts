// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// authorize(): every role × every op type. The expected rights are written here
// again (docs/data-model.md §6), independent of src/domain/permissions.ts.
import { makeCtx, NO_KEY_BINDINGS, type State } from 'oplog-core';
import { authorize, CATALOG, PERMISSIONS } from '../../src/domain';
import { lastAudit, task, team } from '../helpers';

const ADMIN_ONLY = ['GrantUser', 'UpdateUser', 'SetRole', 'SetVerifier', 'AddKey', 'RevokeKey', 'RemoveUser', 'SetSetting', 'ReopenTask', 'RestoreTask', 'RenameTag', 'MergeTag', 'DeleteTag', 'PurgeBlob', 'Revert'];
const VERIFIER = ['VerifyTask', 'ReturnTask'];
const OWN_TASK = ['DeleteTask'];
const OWN_COMMENT = ['EditComment', 'DeleteComment'];

type Role = 'user' | 'verifier' | 'admin';
function expected(type: string, role: Role): 'yes' | 'no' | 'own' {
  if (role === 'admin') return 'yes';
  if (ADMIN_ONLY.includes(type)) return 'no';
  if (VERIFIER.includes(type)) return role === 'verifier' ? 'yes' : 'no';
  if (OWN_TASK.includes(type) || OWN_COMMENT.includes(type)) return 'own';
  return 'yes';
}

function state(role: Role): State {
  const user = { id: 'u1', status: 'active', role: role === 'admin' ? 'admin' : 'user', verifier: role === 'verifier' };
  return {
    scopes: {
      roles: { user: { u1: user, u2: { id: 'u2', status: 'active', role: 'user', verifier: false } } },
      data: {
        task: { mine: { id: 'mine', createdBy: 'u1' }, other: { id: 'other', createdBy: 'u2' } },
        comment: { mine: { id: 'mine', createdBy: 'u1' }, other: { id: 'other', createdBy: 'u2' } },
      },
    },
  };
}

const ctxFor = (role: Role) => makeCtx(state(role), { opId: 'x', scope: 'data', authorKeyId: 'k', userId: 'u1', seq: 1, hlc: { t: 1, c: 0 }, wallTime: '', envType: 'x', item: 0 }, NO_KEY_BINDINGS);

describe('authorize: role × op type', () => {
  it('every catalogue op type has a permission rule, and every rule has an op type', () => {
    expect(Object.keys(CATALOG).sort()).toEqual(Object.keys(PERMISSIONS).filter((t) => t !== 'Revert').sort());
  });

  for (const type of [...Object.keys(CATALOG), 'Revert'])
    for (const role of ['user', 'verifier', 'admin'] as Role[])
      it(`${role} ${type}`, () => {
        const ctx = ctxFor(role);
        const want = expected(type, role);
        if (want === 'own') {
          expect(authorize({ type, payload: { id: 'mine' } }, ctx).ok).toBe(true);
          expect(authorize({ type, payload: { id: 'other' } }, ctx).ok).toBe(false);
        } else expect(authorize({ type, payload: { id: 'mine' } }, ctx).ok).toBe(want === 'yes');
      });

  it('rejects an unknown op type and a Batch as an item', () => {
    expect(authorize({ type: 'Nonsense', payload: {} }, ctxFor('admin')).ok).toBe(false);
    expect(authorize({ type: 'Batch', payload: {} }, ctxFor('admin')).ok).toBe(false);
  });
});

describe('authorize in the replay', () => {
  it('a user can delete an own task but not the task of another user', async () => {
    const { petr, eva, sync } = await team();
    await petr.w('CreateTask', { id: 'p1', title: 'Petrův úkol' });
    await eva.w('CreateTask', { id: 'e1', title: 'Evin úkol' });
    await sync();
    await expect(petr.w('DeleteTask', { id: 'e1', from: 'new' })).rejects.toThrow('only the creator or an admin');
    await petr.w('DeleteTask', { id: 'p1', from: 'new' });
    expect(task(petr, 'p1')!.status).toBe('deleted');
  });

  it('a user cannot edit or delete the comment of another user; an admin can', async () => {
    const { admin, petr, eva, sync } = await team();
    await petr.w('CreateTask', { id: 't1', title: 'x' });
    await petr.w('AddComment', { id: 'c1', taskId: 't1', text: 'Petr píše', mentions: [] });
    await sync();
    await expect(eva.w('EditComment', { id: 'c1', text: 'Eva mění', mentions: [] })).rejects.toThrow('only the author or an admin');
    await admin.w('DeleteComment', { id: 'c1' });
    expect(admin.engine.state.scopes.data.comment.c1.status).toBe('deleted');
  });

  it('a non-verifier cannot verify', async () => {
    const { petr } = await team();
    await petr.w('CreateTask', { id: 't1', title: 'x' });
    await petr.w('CompleteTask', { id: 't1', from: 'new' });
    await expect(petr.w('VerifyTask', { id: 't1', from: 'done' })).rejects.toThrow('role may not issue VerifyTask');
  });

  it('a user cannot write in roles, also if the folder is writable', async () => {
    const { petr } = await team();
    await expect(petr.r('SetVerifier', { userId: petr.userId, verifier: true })).rejects.toThrow('role may not issue SetVerifier');
  });

  it('changes of a verifier flag apply from their point in the order', async () => {
    const { admin, petr, sync } = await team();
    await petr.w('CreateTask', { id: 't1', title: 'x' });
    await petr.w('CompleteTask', { id: 't1', from: 'new' });
    await sync();
    await admin.r('SetVerifier', { userId: petr.userId, verifier: true });
    await sync();
    await petr.w('VerifyTask', { id: 't1', from: 'done' });
    expect(lastAudit(petr).status).toBe('applied');
  });
});
