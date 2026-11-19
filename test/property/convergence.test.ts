// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The same ops in any order or partition give the same state, audit and issues.
import fc from 'fast-check';
import { canonicalize, Engine, planRevert, replay } from 'oplog-core';
import { domain, spreadKeys, keyBetween } from '../../src/domain';
import { fakeClock, team } from '../helpers';
import { PartialView } from '../partial-view';

/** Concurrent, partly conflicting ops of 4 writers. Nobody sees the others until the end. */
async function buildOpSet() {
  const { storage, admin, petr, eva, vera, sync } = await team();
  await admin.w('CreateTask', { id: 't1', title: 'Revize smlouvy', due: { at: '2026-11-25T10:00:00.000Z', allDay: false } });
  await admin.w('CreateTask', { id: 't2', title: 'Inventura' });
  const [k1, k2] = spreadKeys(2);
  await admin.w('AddSubtask', { id: 's1', taskId: 't1', text: 'A', pos: k1 });
  await admin.w('AddSubtask', { id: 's2', taskId: 't1', text: 'B', pos: k2 });
  await sync();
  // Concurrent part.
  await petr.w('AddAssignee', { taskId: 't1', userId: petr.userId });
  await eva.w('AddAssignee', { taskId: 't1', userId: eva.userId });
  await eva.w('RemoveAssignee', { taskId: 't1', userId: petr.userId });
  await petr.w('CompleteTask', { id: 't2', from: 'new' });
  await eva.w('PostponeTask', { id: 't2', from: 'new' }); // races with the completion
  await vera.w('UpdateTask', { id: 't1', fields: { title: 'Revize smlouvy (Věra)' } });
  await petr.w('UpdateTask', { id: 't1', fields: { title: 'Revize (Petr)', description: 'Petrův popis' } });
  await petr.w('CreateTag', { id: 'g-p', name: 'Právo' });
  await eva.w('CreateTag', { id: 'g-e', name: 'pravo' });
  await petr.w('AddTaskTag', { taskId: 't1', tagId: 'g-p' });
  await eva.w('AddTaskTag', { taskId: 't1', tagId: 'g-e' });
  await petr.w('MoveSubtask', { id: 's2', pos: keyBetween(null, k1) });
  await eva.w('MoveSubtask', { id: 's1', pos: keyBetween(null, k1) });
  await vera.w('AddComment', { id: 'c1', taskId: 't1', text: '@Petr hotovo?', mentions: [petr.userId] });
  await eva.w('Batch', { ops: [{ type: 'CreateTask', payload: { id: 't3', title: 'Batch' } }, { type: 'AddAssignee', payload: { taskId: 't3', userId: vera.userId } }, { type: 'DeleteComment', payload: { id: 'nope' } }] });
  await sync();
  await vera.w('VerifyTask', { id: 't2', from: 'done' });
  const target = admin.engine.audit.find((a) => a.type === 'UpdateTask' && a.status === 'applied')!;
  const p = planRevert(admin.engine.result, target.opId, domain, { opId: 'x', scope: 'data', authorKeyId: admin.keyId, userId: admin.userId, seq: 1, hlc: { t: 0, c: 0 }, wallTime: '', envType: 'Revert', item: 0 }, admin.engine.validKeyBindings);
  if ('error' in p) throw new Error(p.error);
  await admin.w('Revert', p.payload);
  await admin.r('RevokeKey', { keyId: eva.keyId, cutoff: { roles: 0, data: 3 } });
  // Eva did not see the revocation: her engine writes the op, and all other clients reject it.
  await eva.w('CreateTask', { id: 't4', title: 'Po odvolání klíče' });
  const ref = new Engine(storage, domain, { now: fakeClock().now });
  await ref.scan();
  const opPaths = [...storage.files.keys()].filter((x) => x.includes('/ops/'));
  return { storage, ref, opPaths };
}

describe('convergence of the domain (property)', async () => {
  const { storage, ref, opPaths } = await buildOpSet();
  const refState = canonicalize(ref.state);
  const summary = (e: Engine) => canonicalize({ audit: e.audit.map((a) => [a.opId, a.status, a.reason ?? null]), issues: e.result.issues.map((i) => [i.kind, i.opId ?? null]) });
  const refSummary = summary(ref);
  const verified = ref.audit.map((a) => ({ env: ref.knownOps().find((e) => e.opId === a.opId)!, hash: a.hash }));

  it('the op set has applied, superseded and rejected ops', () => {
    expect(new Set(ref.audit.map((a) => a.status))).toEqual(new Set(['applied', 'superseded', 'rejected']));
  });

  it('replay gives the same state for any order of the same ops', () => {
    fc.assert(
      fc.property(fc.shuffledSubarray(verified, { minLength: verified.length, maxLength: verified.length }), (perm) => {
        expect(canonicalize(replay(perm, { domain, trustRoot: ref.trustRoot, validKeyBindings: ref.validKeyBindings }).state)).toBe(refState);
      }),
      { numRuns: 150 },
    );
  });

  it('incremental sync in any partition converges to the same state, audit and issues', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.shuffledSubarray(opPaths, { minLength: opPaths.length, maxLength: opPaths.length }),
        fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 1, maxLength: 10 }),
        async (order, chunks) => {
          const view = new PartialView(storage);
          const e = new Engine(view, domain, { now: fakeClock().now });
          let i = 0;
          for (const n of chunks) {
            for (const x of order.slice(i, i + n)) view.visible.add(x);
            i += n;
            await e.scan(i % 2 ? 'full' : 'quick');
          }
          for (const x of order) view.visible.add(x);
          await e.scan('full');
          expect(canonicalize(e.state)).toBe(refState);
          expect(summary(e)).toBe(refSummary);
        },
      ),
      { numRuns: 30 },
    );
  });
});
