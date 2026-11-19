// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Domain rules of docs/data-model.md. Synthetic data only.
import { planRevert, type OpMeta } from 'oplog-core';
import {
  buildSearchIndex, buildTaskViews, comparePos, computeNotifications, domain, downloadName, isBlockedFileName, keyBetween, matches, queryTerms, resolveTag, spreadKeys, unread,
} from '../../src/domain';
import { actor, lastAudit, rawOp, task, team, view, type Actor } from '../helpers';

const SHA = 'a'.repeat(64);
const meta = (a: Actor): OpMeta => ({ opId: 'plan', scope: 'data', authorKeyId: a.keyId, userId: a.userId, seq: 1, hlc: { t: 0, c: 0 }, wallTime: '2026-11-19T12:00:00.000Z', envType: 'Revert', item: 0 });
const plan = (a: Actor, opId: string) => {
  const p = planRevert(a.engine.result, opId, domain, meta(a), a.engine.validKeyBindings);
  if ('error' in p) throw new Error(p.error);
  return p;
};

describe('create ops', () => {
  it('a create op with an existing ID is superseded and does not change the entity', async () => {
    const { petr, eva, sync } = await team();
    await petr.w('CreateTask', { id: 't1', title: 'Petrův' });
    await petr.w('AddComment', { id: 'c1', taskId: 't1', text: 'Petr', mentions: [] });
    await sync();
    await eva.w('CreateTask', { id: 't1', title: 'Evin' });
    expect(lastAudit(eva).status).toBe('superseded');
    await eva.w('AddComment', { id: 'c1', taskId: 't1', text: 'Eva', mentions: [] });
    expect(lastAudit(eva).status).toBe('superseded');
    expect(task(eva, 't1')).toMatchObject({ title: 'Petrův', createdBy: petr.userId });
    expect(eva.engine.state.scopes.data.comment.c1).toMatchObject({ text: 'Petr', createdBy: petr.userId });
  });

  it('rejects text with control characters and links with other schemes', async () => {
    const { petr } = await team();
    await expect(petr.w('CreateTask', { id: 't1', title: 'a\u0000b' })).rejects.toThrow('control characters');
    await petr.w('CreateTask', { id: 't1', title: 'ok' });
    await expect(petr.w('AddLink', { id: 'l1', taskId: 't1', url: 'javascript:alert(1)', title: '' })).rejects.toThrow('URL');
    await petr.w('AddLink', { id: 'l1', taskId: 't1', url: 'https://example.invalid/x', title: 'Registr' });
    await expect(petr.w('EditLink', { id: 'l1', url: 'data:text/html,x', title: '' })).rejects.toThrow('URL');
  });
});

describe('fields and conflicts', () => {
  it('last writer wins for each field; 2 edits of different fields both stay', async () => {
    const { petr, eva, sync } = await team();
    await petr.w('CreateTask', { id: 't1', title: 'A', description: 'popis' });
    await sync();
    await petr.w('UpdateTask', { id: 't1', fields: { title: 'Petr' } });
    await eva.w('UpdateTask', { id: 't1', fields: { title: 'Eva', description: 'Evin popis' } });
    await sync();
    expect(task(petr, 't1')).toMatchObject({ title: 'Eva', description: 'Evin popis' });
    expect(task(eva, 't1')).toMatchObject({ title: 'Eva', description: 'Evin popis' });
  });

  it('completedAt changes only on a done task, by its completer or an admin (Q-12)', async () => {
    const { admin, petr, eva, sync } = await team();
    await petr.w('CreateTask', { id: 't1', title: 'x' });
    await petr.w('CompleteTask', { id: 't1', from: 'new' });
    await petr.w('UpdateTask', { id: 't1', fields: { completedAt: '2026-11-10T10:00:00.000Z' } });
    expect(task(petr, 't1')!.completedAt).toBe('2026-11-10T10:00:00.000Z');
    await sync();
    await eva.w('UpdateTask', { id: 't1', fields: { completedAt: '2026-11-11T10:00:00.000Z', title: 'Evin název' } });
    expect(task(eva, 't1')).toMatchObject({ completedAt: '2026-11-10T10:00:00.000Z', title: 'Evin název' });
    await sync();
    await admin.w('UpdateTask', { id: 't1', fields: { completedAt: '2026-11-12T10:00:00.000Z' } });
    expect(task(admin, 't1')!.completedAt).toBe('2026-11-12T10:00:00.000Z');
  });
});

describe('Revert', () => {
  it('reverts an assignee: the status follows (derived rule) and the count stays correct', async () => {
    const { admin, petr } = await team();
    await admin.w('CreateTask', { id: 't1', title: 'x' });
    const add = await admin.w('AddAssignee', { taskId: 't1', userId: petr.userId });
    expect(task(admin, 't1')).toMatchObject({ status: 'assigned', assigneeCount: 1 });
    await admin.w('Revert', plan(admin, add.opId).payload);
    expect(task(admin, 't1')).toMatchObject({ status: 'new', assigneeCount: 0 });
    expect(view(admin, 't1').assignees).toEqual([]);
  });

  it('warns about later changes, and clears verification fields after a revert of CompleteTask', async () => {
    const { admin } = await team();
    await admin.w('CreateTask', { id: 't1', title: 'x' });
    const done = await admin.w('CompleteTask', { id: 't1', from: 'new' });
    await admin.w('VerifyTask', { id: 't1', from: 'done' });
    const p = plan(admin, done.opId);
    expect(p.overwritten.map((o) => o.f)).toEqual(['status']);
    await admin.w('Revert', p.payload);
    expect(task(admin, 't1')).toMatchObject({ status: 'new', completedAt: null, completedBy: null, verifiedAt: null, verifiedBy: null });
  });

  it('reverts CreateTask as a soft delete that RestoreTask can undo', async () => {
    const { admin, petr } = await team();
    const c = await admin.w('CreateTask', { id: 't1', title: 'x' });
    await admin.w('AddAssignee', { taskId: 't1', userId: petr.userId });
    const p = plan(admin, c.opId);
    expect(p.payload.inverse).toEqual([{ e: 'task', id: 't1', f: 'status', v: 'deleted' }]);
    await admin.w('Revert', p.payload);
    expect(task(admin, 't1')).toMatchObject({ status: 'deleted', statusBeforeDelete: 'assigned' });
    await admin.w('RestoreTask', { id: 't1', from: 'deleted' });
    expect(task(admin, 't1')!.status).toBe('assigned');
  });

  it('a revert of CreateTask on a deleted task is superseded and keeps statusBeforeDelete', async () => {
    const { admin } = await team();
    const c = await admin.w('CreateTask', { id: 't1', title: 'x' });
    await admin.w('PostponeTask', { id: 't1', from: 'new' });
    const p = plan(admin, c.opId);
    await admin.w('DeleteTask', { id: 't1', from: 'postponed' });
    await admin.w('Revert', p.payload);
    expect(lastAudit(admin).status).toBe('superseded');
    expect(task(admin, 't1')!.statusBeforeDelete).toBe('postponed');
  });

  it('a revert of a revert cannot make a tag merge cycle', async () => {
    const { admin } = await team();
    await admin.w('CreateTag', { id: 'A', name: 'faktury' });
    await admin.w('CreateTag', { id: 'B', name: 'smlouvy' });
    const m1 = await admin.w('MergeTag', { id: 'A', into: 'B' });
    const r1 = await admin.w('Revert', plan(admin, m1.opId).payload);
    await admin.w('MergeTag', { id: 'B', into: 'A' });
    const p2 = plan(admin, r1.opId);
    await admin.w('Revert', p2.payload);
    expect(lastAudit(admin)).toMatchObject({ status: 'superseded', reason: 'the tag merge would make a cycle' });
    expect(resolveTag(admin.engine.state, 'A')!.id).toBe('A');
  });
});

describe('tags', () => {
  it('2 users create the same name offline: the replay merges them into the first tag', async () => {
    const { petr, eva, sync } = await team();
    await petr.w('CreateTask', { id: 't1', title: 'x' });
    await sync();
    await petr.w('CreateTag', { id: 'tp', name: 'Faktury' });
    await petr.w('AddTaskTag', { taskId: 't1', tagId: 'tp' });
    await eva.w('CreateTag', { id: 'te', name: ' faktury ' });
    await eva.w('AddTaskTag', { taskId: 't1', tagId: 'te' });
    await sync();
    for (const a of [petr, eva]) {
      expect(a.engine.state.scopes.data.tag.te).toMatchObject({ status: 'merged', mergedInto: 'tp' });
      expect(view(a, 't1').tags).toEqual([{ id: 'tp', name: 'Faktury' }]);
    }
    // Removing the visible tag also removes the merged duplicate.
    await petr.w('RemoveTaskTag', { taskId: 't1', tagId: 'tp' });
    expect(view(petr, 't1').tags).toEqual([]);
  });

  it('normalizes names without diacritics and case; rename to a used name is superseded', async () => {
    const { admin } = await team();
    await admin.w('CreateTag', { id: 'a', name: 'Účetnictví' });
    await admin.w('CreateTag', { id: 'b', name: 'ucetnictvi' });
    expect(admin.engine.state.scopes.data.tag.b.mergedInto).toBe('a');
    await admin.w('CreateTag', { id: 'c', name: 'Sklad' });
    await admin.w('RenameTag', { id: 'c', name: 'ÚČETNICTVÍ' });
    expect(lastAudit(admin).status).toBe('superseded');
  });

  it('merge and delete by an admin; a deleted tag is not shown', async () => {
    const { admin } = await team();
    await admin.w('CreateTask', { id: 't1', title: 'x' });
    await admin.w('CreateTag', { id: 'a', name: 'nákup' });
    await admin.w('CreateTag', { id: 'b', name: 'objednávky' });
    await admin.w('AddTaskTag', { taskId: 't1', tagId: 'a' });
    await admin.w('AddTaskTag', { taskId: 't1', tagId: 'b' });
    await admin.w('MergeTag', { id: 'a', into: 'b' });
    expect(view(admin, 't1').tags).toEqual([{ id: 'b', name: 'objednávky' }]);
    await admin.w('DeleteTag', { id: 'b' });
    expect(view(admin, 't1').tags).toEqual([]);
  });
});

describe('subtasks', () => {
  it('fractional keys sort between their neighbours and never end with 0', () => {
    let keys = spreadKeys(5);
    for (let i = 0; i < 200; i++) {
      const at = i % (keys.length + 1);
      const k = keyBetween(at === 0 ? null : keys[at - 1], at === keys.length ? null : keys[at]);
      expect(k.endsWith('0')).toBe(false);
      keys = [...keys.slice(0, at), k, ...keys.slice(at)];
      expect([...keys].sort()).toEqual(keys);
    }
    expect(() => keyBetween('V', 'V')).toThrow();
  });

  it('concurrent moves to the same place converge (the ID decides)', async () => {
    const { petr, eva, sync } = await team();
    await petr.w('CreateTask', { id: 't1', title: 'x' });
    const [k1, k2, k3] = spreadKeys(3);
    for (const [id, pos] of [['s1', k1], ['s2', k2], ['s3', k3]]) await petr.w('AddSubtask', { id, taskId: 't1', text: id, pos });
    await sync();
    const between = keyBetween(k1, k2);
    await petr.w('MoveSubtask', { id: 's3', pos: between });
    await eva.w('MoveSubtask', { id: 's2', pos: between });
    await sync();
    const order = (a: Actor) => view(a, 't1').subtasks.map((s) => s.id);
    expect(order(petr)).toEqual(order(eva));
    expect(order(petr)).toEqual(['s1', 's2', 's3'].sort((a, b) => comparePos({ pos: a === 's1' ? k1 : between, id: a }, { pos: b === 's1' ? k1 : between, id: b })));
  });

  it('check, edit and remove', async () => {
    const { petr } = await team();
    await petr.w('CreateTask', { id: 't1', title: 'x' });
    await petr.w('AddSubtask', { id: 's1', taskId: 't1', text: 'Přečíst', pos: 'V' });
    await petr.w('CheckSubtask', { id: 's1', done: true });
    await petr.w('EditSubtask', { id: 's1', text: 'Přečíst smlouvu' });
    expect(view(petr, 't1')).toMatchObject({ subtasksDone: 1 });
    expect(view(petr, 't1').subtasks[0]).toMatchObject({ text: 'Přečíst smlouvu', done: true, doneBy: petr.userId });
    await petr.w('RemoveSubtask', { id: 's1' });
    expect(view(petr, 't1').subtasks).toEqual([]);
    await expect(petr.w('AddSubtask', { id: 's2', taskId: 't1', text: 'x', pos: 'V0' })).rejects.toThrow('fractional index');
  });
});

describe('attachments', () => {
  const att = (id: string, extra: Record<string, unknown> = {}) => ({ id, taskId: 't1', sha256: SHA, name: 'smlouva.pdf', mime: 'application/pdf', size: 1000, ...extra });

  it('the same content is 1 blob for 2 attachments; purge makes later uploads superseded', async () => {
    const { admin, petr, sync } = await team();
    await petr.w('CreateTask', { id: 't1', title: 'x' });
    await petr.w('AddAttachment', att('a1'));
    await petr.w('AddAttachment', att('a2', { name: 'kopie.pdf' }));
    expect(view(petr, 't1').attachments.map((a) => a.sha256)).toEqual([SHA, SHA]);
    await sync();
    await admin.w('PurgeBlob', { sha256: SHA, reason: 'nahráno omylem' });
    await sync();
    await petr.w('AddAttachment', att('a3'));
    expect(lastAudit(petr)).toMatchObject({ status: 'superseded', reason: 'an admin removed this file' });
    expect(petr.engine.state.scopes.data.blob[SHA]).toMatchObject({ purged: true, purgedBy: admin.userId });
  });

  it('blocks HTML, SVG and similar names (Q-22), and the size limit applies at its point in the order', async () => {
    const { admin, petr, sync } = await team();
    await petr.w('CreateTask', { id: 't1', title: 'x' });
    for (const name of ['a.html', 'A.HTM', 'x.svg', 'x.html.', 'x.html ', '.xhtml', 'x.SHTM', 'x.xht'])
      await expect(petr.w('AddAttachment', att('b1', { name }))).rejects.toThrow('cannot be attached');
    await admin.r('SetSetting', { key: 'maxAttachmentMB', value: 1 });
    await sync();
    await petr.w('AddAttachment', att('big', { size: 2 * 1024 * 1024 }));
    expect(lastAudit(petr)).toMatchObject({ status: 'superseded', reason: 'the file is larger than the limit' });
  });

  it('makes safe download names', () => {
    expect(downloadName('smlouva.pdf')).toBe('smlouva.pdf');
    expect(downloadName('Foto.JPG')).toBe('Foto.JPG');
    expect(downloadName('stránka.html')).toBe('stránka.html.txt');
    expect(downloadName('x.html.')).toBe('x.html.txt');
    expect(downloadName('..\\..\\evil.exe')).toBe('....evil.exe.txt');
    expect(downloadName('bez-pripony')).toBe('bez-pripony.txt');
    expect(downloadName('.htaccess')).toBe('.htaccess.txt');
    const long = downloadName('a'.repeat(300) + '.docx');
    expect(long.length).toBe(120);
    expect(long.endsWith('.docx')).toBe(true);
    expect(isBlockedFileName('notes.txt')).toBe(false);
  });
});

describe('search', () => {
  it('finds tasks without case and diacritics, in title, description, subtasks and comments', async () => {
    const { petr } = await team();
    await petr.w('CreateTask', { id: 't1', title: 'Revize smlouvy', description: 'Článek 4' });
    await petr.w('CreateTask', { id: 't2', title: 'Inventura' });
    await petr.w('AddSubtask', { id: 's1', taskId: 't2', text: 'Spočítat Židle', pos: 'V' });
    await petr.w('AddComment', { id: 'c1', taskId: 't2', text: 'Účtenka chybí', mentions: [] });
    const idx = buildSearchIndex(buildTaskViews(petr.engine.state).values());
    const find = (q: string) => [...idx].filter(([, t]) => matches(t, queryTerms(q))).map(([id]) => id).sort();
    expect(find('clanek')).toEqual(['t1']);
    expect(find('ZIDLE')).toEqual(['t2']);
    expect(find('uctenka chybi')).toEqual(['t2']);
    expect(find('smlouvy inventura')).toEqual([]);
    expect(find('')).toEqual(['t1', 't2']);
  });
});

describe('notifications', () => {
  it('computes due, overdue, assigned, comment, mention, returned, superseded and verify', async () => {
    const { admin, petr, eva, vera, sync } = await team();
    const now = Date.parse('2026-11-20T08:00:00Z');
    await admin.w('CreateTask', { id: 'soon', title: 'Brzy', due: { at: '2026-11-21T08:00:00.000Z', allDay: false } });
    await admin.w('CreateTask', { id: 'late', title: 'Pozdě', due: { at: '2026-11-19T08:00:00.000Z', allDay: false } });
    await admin.w('AddAssignee', { taskId: 'soon', userId: petr.userId });
    await admin.w('AddAssignee', { taskId: 'late', userId: petr.userId });
    await sync();
    await eva.w('AddComment', { id: 'c1', taskId: 'soon', text: 'Ahoj', mentions: [] });
    await eva.w('AddComment', { id: 'c2', taskId: 'late', text: '@Petr', mentions: [petr.userId] });
    await petr.w('CreateTask', { id: 'mine', title: 'Moje' });
    await petr.w('CompleteTask', { id: 'mine', from: 'new' });
    await sync();
    await vera.w('ReturnTask', { id: 'mine', from: 'done', commentId: 'r1', text: 'Opravit' });
    await eva.w('PostponeTask', { id: 'soon', from: 'new' }); // the actual status is assigned: still valid, applied. It clears the due date.
    await sync();
    await petr.w('CompleteTask', { id: 'mine', from: 'assigned' }); // valid
    await sync();
    // "done" is not a valid `from` of PostponeTask: the engine refuses it before it writes a file.
    await expect(petr.w('PostponeTask', { id: 'mine', from: 'done' })).rejects.toThrow('payload.from');
    const views = buildTaskViews(petr.engine.state);
    const forPetr = computeNotifications({ state: petr.engine.state, audit: petr.engine.audit, views, me: petr.userId, now });
    const kinds = forPetr.map((n) => n.kind).sort();
    expect(kinds).toEqual(['assigned', 'assigned', 'comment', 'mention', 'overdue', 'returned'].sort());
    const forVera = computeNotifications({ state: vera.engine.state, audit: vera.engine.audit, views: buildTaskViews(vera.engine.state), me: vera.userId, now });
    expect(forVera.filter((n) => n.kind === 'verify').map((n) => n.taskId)).toEqual(['mine']);
    // Read state and baseline.
    const read = new Set([forPetr[0].id]);
    expect(unread(forPetr, read, '2000-01-01T00:00:00.000Z')).toHaveLength(forPetr.length - 1);
    expect(unread(forPetr, new Set(), '2100-01-01T00:00:00.000Z').map((n) => n.kind)).toEqual(['overdue']);
  });

  it('notifies the author of a superseded op', async () => {
    const { admin, petr, eva, sync } = await team();
    await admin.w('CreateTask', { id: 't1', title: 'x' });
    await sync();
    await eva.w('CompleteTask', { id: 't1', from: 'new' });
    await petr.w('PostponeTask', { id: 't1', from: 'new' }); // petr did not see the completion
    await sync();
    const n = computeNotifications({ state: petr.engine.state, audit: petr.engine.audit, views: buildTaskViews(petr.engine.state), me: petr.userId, now: Date.now() });
    expect(n.filter((x) => x.kind === 'superseded').map((x) => x.taskId)).toEqual(['t1']);
  });
});

describe('users and keys', () => {
  it('RemoveUser revokes all keys of the user; old ops stay valid; ops after the cutoff are rejected', async () => {
    const { storage, admin, petr, sync } = await team();
    const first = await petr.w('CreateTask', { id: 't1', title: 'platný' });
    await sync();
    await admin.r('RemoveUser', { userId: petr.userId, cutoffs: { [petr.keyId]: { roles: 0, data: 1 } } });
    // An op of petr, written after the removal with a backdated HLC: after his own last op, before the RemoveUser op.
    await rawOp(storage, petr, 'data', 'CreateTask', { id: 't2', title: 'po odebrání' }, { t: first.hlc.t, c: first.hlc.c + 1 });
    await admin.engine.scan();
    expect(task(admin, 't1')).toBeDefined();
    expect(task(admin, 't2')).toBeUndefined();
    expect(admin.engine.issues.some((i) => i.kind === 'revoked')).toBe(true);
    // A key that the RemoveUser payload does not list gets the cutoff 0.
    expect(admin.engine.state.scopes.roles.user[petr.userId].status).toBe('removed');
    await admin.r('AddKey', { userId: petr.userId, keyId: 'kxxxxxxxxxxxxxxxxxxxxxxxx', publicKey: 'x' });
    expect(lastAudit(admin)).toMatchObject({ status: 'superseded', reason: 'the user is not active' });
  });

  it('a GrantUser with the ID of a removed user is superseded', async () => {
    const { storage, admin, petr } = await team();
    await admin.r('RemoveUser', { userId: petr.userId, cutoffs: {} });
    const again = await actor('petr2', storage, () => Date.now());
    await admin.r('GrantUser', { userId: petr.userId, displayName: 'Petr znovu', keyId: again.keyId, publicKey: again.publicKey, role: 'user', verifier: false });
    expect(lastAudit(admin).status).toBe('superseded');
  });

  it('the trust root user cannot be changed by ops', async () => {
    const { admin } = await team();
    await expect(admin.r('SetRole', { userId: admin.userId, role: 'user' })).rejects.toThrow('trust root');
  });

  it('settings apply from their point in the order and are validated', async () => {
    const { admin } = await team();
    await expect(admin.r('SetSetting', { key: 'pollSeconds', value: 1 })).rejects.toThrow('integer 5–600');
    await admin.r('SetSetting', { key: 'dueSoonDays', value: 5 });
    expect(admin.engine.state.scopes.roles.setting.dueSoonDays.value).toBe(5);
  });
});
