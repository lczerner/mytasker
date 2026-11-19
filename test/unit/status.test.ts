// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Full matrix of the status state machine (docs/data-model.md §9). The expected
// values are written here again, independent of src/domain/status.ts.
import { STATUS_OPS, STATUSES, type Status, type StatusOp } from '../../src/domain';
import { lastAudit, task, team, type Actor } from '../helpers';

// op → status → expected status after the op (null = superseded)
const EXPECTED: Record<StatusOp, Record<Status, Status | null>> = {
  PostponeTask: { new: 'postponed', assigned: 'postponed', postponed: null, done: null, verified: null, deleted: null },
  ResumeTask: { new: null, assigned: null, postponed: 'assigned', done: null, verified: null, deleted: null },
  CompleteTask: { new: 'done', assigned: 'done', postponed: null, done: null, verified: null, deleted: null },
  VerifyTask: { new: null, assigned: null, postponed: null, done: 'verified', verified: null, deleted: null },
  ReturnTask: { new: null, assigned: null, postponed: null, done: 'assigned', verified: null, deleted: null },
  ReopenTask: { new: null, assigned: null, postponed: null, done: null, verified: 'assigned', deleted: null },
  DeleteTask: { new: 'deleted', assigned: 'deleted', postponed: 'deleted', done: 'deleted', verified: 'deleted', deleted: null },
  RestoreTask: { new: null, assigned: null, postponed: null, done: null, verified: null, deleted: 'assigned' },
};

/** Brings a new task to a status. All tasks except "new" have the assignee petr. */
async function taskIn(admin: Actor, petrId: string, id: string, s: Status) {
  await admin.w('CreateTask', { id, title: `Úkol ${s}` });
  if (s === 'new') return;
  await admin.w('AddAssignee', { taskId: id, userId: petrId });
  if (s === 'postponed') await admin.w('PostponeTask', { id, from: 'assigned' });
  if (s === 'done' || s === 'verified') await admin.w('CompleteTask', { id, from: 'assigned' });
  if (s === 'verified') await admin.w('VerifyTask', { id, from: 'done' });
  if (s === 'deleted') await admin.w('DeleteTask', { id, from: 'assigned' });
}

const extra = (op: StatusOp): Record<string, unknown> => (op === 'ReturnTask' ? { commentId: `c-${Math.random().toString(36).slice(2)}`, text: 'Doplnit přílohu.' } : {});

describe('status state machine (full matrix, admin)', async () => {
  const { admin, petr } = await team();
  let n = 0;
  for (const op of STATUS_OPS)
    for (const s of STATUSES)
      it(`${op} from ${s}`, async () => {
        const id = `t-${n++}`;
        await taskIn(admin, petr.userId, id, s);
        expect(task(admin, id)!.status).toBe(s);
        // `from` must be in the list of the op. Use the actual status if it is in the list, else the first valid one.
        const valid = Object.entries(EXPECTED[op]).filter(([, to]) => to !== null).map(([f]) => f);
        const from = valid.includes(s) ? s : valid[0];
        await admin.w(op, { id, from, ...extra(op) });
        const want = EXPECTED[op][s];
        expect(lastAudit(admin).status).toBe(want === null ? 'superseded' : 'applied');
        expect(task(admin, id)!.status).toBe(want ?? s);
      });
});

describe('status rules', () => {
  it('assigns and unassigns: new ↔ assigned, other statuses stay', async () => {
    const { admin, petr, eva } = await team();
    await admin.w('CreateTask', { id: 't1', title: 'Objednat toner' });
    await admin.w('AddAssignee', { taskId: 't1', userId: petr.userId });
    expect(task(admin, 't1')).toMatchObject({ status: 'assigned', assigneeCount: 1 });
    await admin.w('AddAssignee', { taskId: 't1', userId: eva.userId });
    await admin.w('RemoveAssignee', { taskId: 't1', userId: petr.userId });
    expect(task(admin, 't1')).toMatchObject({ status: 'assigned', assigneeCount: 1 });
    await admin.w('RemoveAssignee', { taskId: 't1', userId: eva.userId });
    expect(task(admin, 't1')).toMatchObject({ status: 'new', assigneeCount: 0 });
    await admin.w('PostponeTask', { id: 't1', from: 'new' });
    await admin.w('AddAssignee', { taskId: 't1', userId: eva.userId });
    expect(task(admin, 't1')!.status).toBe('postponed');
    await admin.w('ResumeTask', { id: 't1', from: 'postponed' });
    expect(task(admin, 't1')!.status).toBe('assigned');
  });

  it('postpone clears the due date; resume can set a new one', async () => {
    const { admin } = await team();
    const due = { at: '2026-11-25T22:59:59.000Z', allDay: true };
    await admin.w('CreateTask', { id: 't1', title: 'Inventura', due });
    await admin.w('PostponeTask', { id: 't1', from: 'new' });
    expect(task(admin, 't1')).toMatchObject({ status: 'postponed', due: null, postponedBy: admin.userId });
    expect(lastAudit(admin).writes.find((w) => w.f === 'due')!.before).toEqual(due);
    const due2 = { at: '2026-12-01T09:00:00.000Z', allDay: false };
    await admin.w('ResumeTask', { id: 't1', from: 'postponed', due: due2 });
    expect(task(admin, 't1')).toMatchObject({ status: 'new', due: due2 });
  });

  it('complete records time and user; return clears them and adds a comment; reopen clears verification', async () => {
    const { admin, petr, vera, sync } = await team();
    await admin.w('CreateTask', { id: 't1', title: 'Zpráva' });
    await admin.w('AddAssignee', { taskId: 't1', userId: petr.userId });
    await sync();
    await petr.w('CompleteTask', { id: 't1', from: 'assigned', completedAt: '2026-11-18T15:00:00.000Z' });
    expect(task(petr, 't1')).toMatchObject({ status: 'done', completedAt: '2026-11-18T15:00:00.000Z', completedBy: petr.userId });
    await sync();
    await vera.w('ReturnTask', { id: 't1', from: 'done', commentId: 'c1', text: 'Chybí tabulka.' });
    expect(task(vera, 't1')).toMatchObject({ status: 'assigned', completedAt: null, completedBy: null });
    expect(vera.engine.state.scopes.data.comment.c1).toMatchObject({ taskId: 't1', text: 'Chybí tabulka.', createdBy: vera.userId, kind: 'return' });
    await sync();
    await petr.w('CompleteTask', { id: 't1', from: 'assigned' });
    await sync();
    await vera.w('VerifyTask', { id: 't1', from: 'done' });
    expect(task(vera, 't1')).toMatchObject({ status: 'verified', verifiedBy: vera.userId });
    await sync();
    await admin.w('ReopenTask', { id: 't1', from: 'verified' });
    expect(task(admin, 't1')).toMatchObject({ status: 'assigned', verifiedAt: null, verifiedBy: null, completedAt: null, completedBy: null });
  });

  it('a verifier can verify own work (no separation of duties, Q-11)', async () => {
    const { admin, vera, sync } = await team();
    await admin.w('CreateTask', { id: 't1', title: 'Kontrola' });
    await sync();
    await vera.w('CompleteTask', { id: 't1', from: 'new' });
    await vera.w('VerifyTask', { id: 't1', from: 'done' });
    expect(task(vera, 't1')!.status).toBe('verified');
  });

  it('restore returns to the status before the deletion', async () => {
    const { admin, petr } = await team();
    await admin.w('CreateTask', { id: 't1', title: 'Smazat' });
    await admin.w('AddAssignee', { taskId: 't1', userId: petr.userId });
    await admin.w('PostponeTask', { id: 't1', from: 'assigned' });
    await admin.w('DeleteTask', { id: 't1', from: 'postponed' });
    expect(task(admin, 't1')).toMatchObject({ status: 'deleted', statusBeforeDelete: 'postponed', deletedBy: admin.userId });
    await admin.w('RestoreTask', { id: 't1', from: 'deleted' });
    expect(task(admin, 't1')).toMatchObject({ status: 'postponed', deletedAt: null, deletedBy: null });
  });

  it('a status op from another status than `from` applies if the transition is valid now', async () => {
    const { admin } = await team();
    await admin.w('CreateTask', { id: 't1', title: 'x' });
    await admin.w('PostponeTask', { id: 't1', from: 'new' });
    await admin.w('DeleteTask', { id: 't1', from: 'assigned' });
    expect(task(admin, 't1')!.status).toBe('deleted');
  });

  it('rejects a `from` that is not in the list of the op (invalid payload)', async () => {
    const { admin } = await team();
    await admin.w('CreateTask', { id: 't1', title: 'x' });
    await expect(admin.w('VerifyTask', { id: 't1', from: 'new' })).rejects.toThrow('payload.from');
  });

  it('a verified task is read-only except comments; only an admin deletes it (Q-6, Q-21)', async () => {
    const { admin, petr, sync } = await team();
    await petr.w('CreateTask', { id: 't1', title: 'Hotová věc' });
    await petr.w('CompleteTask', { id: 't1', from: 'new' });
    await sync();
    await admin.w('VerifyTask', { id: 't1', from: 'done' });
    await sync();
    for (const [type, p] of [
      ['UpdateTask', { id: 't1', fields: { title: 'jiný název' } }],
      ['AddAssignee', { taskId: 't1', userId: petr.userId }],
      ['AddSubtask', { id: 's1', taskId: 't1', text: 'x', pos: 'V' }],
      ['DeleteTask', { id: 't1', from: 'verified' }],
    ] as const) {
      await petr.w(type, p);
      expect(lastAudit(petr).status).toBe('superseded');
    }
    await petr.w('AddComment', { id: 'c1', taskId: 't1', text: 'Díky!', mentions: [] });
    expect(lastAudit(petr).status).toBe('applied');
    await sync();
    await admin.w('DeleteTask', { id: 't1', from: 'verified' });
    expect(task(admin, 't1')!.status).toBe('deleted');
  });

  it('a concurrent verify makes the delete of the creator superseded, not rejected (data-model §6.1)', async () => {
    const { admin, petr, vera, sync } = await team();
    await petr.w('CreateTask', { id: 't1', title: 'Souběh' });
    await petr.w('CompleteTask', { id: 't1', from: 'new' });
    await sync();
    await vera.w('VerifyTask', { id: 't1', from: 'done' }); // sorts first
    await petr.w('DeleteTask', { id: 't1', from: 'done' }); // petr did not see the verify
    await admin.engine.scan();
    const del = admin.engine.audit.find((a) => a.type === 'DeleteTask')!;
    expect(del.status).toBe('superseded');
    expect(admin.engine.issues.filter((i) => i.kind === 'unauthorized')).toEqual([]);
    expect(task(admin, 't1')!.status).toBe('verified');
  });
});
