// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
import { createDemo } from '../../src/app/demo';
import { buildTaskViews } from '../../src/domain';

describe('demo data', () => {
  it('has tasks in all statuses and no integrity issues', async () => {
    const demo = await createDemo({ now: Date.parse('2026-11-19T10:00:00Z') });
    const e = demo.engineFor();
    await e.scan();
    expect(e.issues).toEqual([]);
    const views = [...buildTaskViews(e.state).values()];
    expect(new Set(views.map((v) => v.status))).toEqual(new Set(['new', 'assigned', 'postponed', 'done', 'verified', 'deleted']));
    expect(views.length).toBe(18);
    expect(e.audit.filter((a) => a.status === 'rejected')).toEqual([]);
  });
});
