// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The Czech description of changes in the audit and the history. Synthetic data only.
import type { AuditEntry, IssueKind } from 'oplog-core';
import { createDemo } from '../../src/app/demo';
import { changeLabel, entityLabel, fieldText, knownField, tasksOf, valueText, visibleWrites } from '../../src/ui/audit';
import { t, type Key } from '../../src/ui/i18n';

const NOW = Date.parse('2026-11-19T10:00:00Z');
const names: Record<string, string> = {};
const userName = (id: string) => names[id] ?? id;

describe('audit texts', () => {
  it('describes a batch by its items, with counts', () => {
    const a = { type: 'Batch', itemTypes: ['CreateTask', 'AddAssignee', 'AddAssignee', 'AddTaskTag'] } as AuditEntry;
    expect(changeLabel(a)).toBe('Vytvoření úkolu, 2× Přidání řešitele, Přidání štítku');
    expect(changeLabel({ type: 'CompleteTask' } as AuditEntry)).toBe('Dokončení');
  });

  it('names fields and values in Czech, and hides technical fields', () => {
    expect(fieldText('status', 'task')).toBe('stav');
    expect(fieldText('on', 'assignee')).toBe('stav');
    expect(fieldText('completeRef', 'task')).toBe('');
    const st = { scopes: {} } as never;
    expect(valueText(st, 'status', 'done', userName)).toBe('Hotovo');
    expect(valueText(st, 'on', false, userName, 'assignee')).toBe('odebrán(a)');
    expect(valueText(st, 'on', true, userName, 'taskTag')).toBe('přidán');
    expect(valueText(st, 'done', true, userName)).toBe('ano');
    expect(valueText(st, 'due', { at: '2026-11-25T22:59:59.000Z', allDay: true }, userName)).toBe('25. 11. 2026');
    expect(valueText(st, 'title', '', userName)).toBe('—');
    expect(visibleWrites([{ e: 'task', id: 'x', f: 'assigneeCount', v: 1 }, { e: 'task', id: 'x', f: 'title', v: 'a' }]).map((w) => w.f)).toEqual(['title']);
  });

  it('every write of the demo has a Czech field name and an entity label, and every op touches its task', async () => {
    const d = await createDemo({ size: 'large', now: NOW });
    const engine = d.engineFor();
    await engine.scan();
    const st = engine.state;
    for (const u of d.users) names[u.id] = u.name;
    expect(engine.audit.length).toBeGreaterThan(100);
    for (const a of engine.audit) {
      for (const w of visibleWrites(a.writes)) {
        // A field without a Czech name would show its technical name.
        expect(knownField(w.f) || (w.f === 'on' && fieldText(w.f, w.e) !== w.f), `${w.e}.${w.f}`).toBe(true);
        expect(entityLabel(st, a.scope, w.e, w.id, userName)).not.toMatch(new RegExp(`^${w.e} `));
      }
      // Each write of a child maps to the task of the child, and a plain op touches exactly 1 task.
      if (a.scope !== 'data') continue;
      const tasks = tasksOf(st, a);
      for (const w of a.writes) {
        const tid = w.e === 'task' ? w.id : w.e === 'assignee' || w.e === 'taskTag' ? w.id.split('/')[0] : (st.scopes.data?.[w.e]?.[w.id] as { taskId?: string } | undefined)?.taskId;
        if (tid) expect(tasks.has(tid), `${a.type} ${w.e}`).toBe(true);
      }
      if (a.type !== 'Batch' && a.writes.length && !['CreateTag', 'RenameTag', 'MergeTag', 'DeleteTag', 'PurgeBlob'].includes(a.type)) expect(tasks.size, a.type).toBe(1);
    }
  });

  it('every integrity issue kind has a Czech label and advice', () => {
    const kinds: IssueKind[] = ['unknown-file', 'parse-error', 'misplaced', 'bad-signature', 'unknown-key', 'chain-gap', 'chain-broken', 'fork', 'revoked', 'unauthorized', 'invalid-payload', 'future-clock', 'bad-checkpoint', 'trust-root', 'domain'];
    for (const k of kinds) {
      expect(t(`issue.${k}` as Key)).not.toBe(`issue.${k}`);
      expect(t(`advice.${k}` as Key)).not.toBe(`advice.${k}`);
    }
  });
});

describe('tasksOf for ops without writes', () => {
  it('finds the task of a superseded child op that has only the child ID', async () => {
    const d = await createDemo({ now: NOW });
    const engine = d.engineFor();
    await engine.scan();
    const st = engine.state;
    const sub = Object.values(st.scopes.data!.subtask!)[0] as { id: string; taskId: string };
    const fake = { scope: 'data', type: 'CheckSubtask', payload: { id: sub.id, done: true }, writes: [] } as unknown as AuditEntry;
    expect([...tasksOf(st, fake)]).toEqual([sub.taskId]);
    const other = { scope: 'data', type: 'CheckSubtask', payload: { id: 'nothing', done: true }, writes: [] } as unknown as AuditEntry;
    expect(tasksOf(st, other).size).toBe(0);
  });
});
