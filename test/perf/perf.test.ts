// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Performance (docs/performance.md). The large run only with PERF=1 (npm run perf):
// PERF_TASKS (default 5000) tasks with about 20 ops each, in a temporary folder on disk.
// Without PERF, a small run checks that all generated ops are valid.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine, MemoryStorage, type Signer } from 'oplog-core';
import { NodeFsStorage } from 'oplog-core/node-fs';
import { generatePerfData } from '../../src/app/perfdata';
import { domain } from '../../src/domain/domain';
import { computeNotifications } from '../../src/domain/notifications';
import { buildSearchIndex } from '../../src/domain/search';
import { buildTaskViews } from '../../src/domain/view';

const START = Date.parse('2025-06-01T08:00:00Z');
const NOW = Date.parse('2026-11-20T08:00:00Z');

describe('perf data', () => {
  it('a small run: all generated ops are valid and applied; the state has the tasks', async () => {
    const storage = new MemoryStorage();
    const d = await generatePerfData(storage, { tasks: 40, start: START });
    const e = new Engine(storage, domain, { now: () => NOW });
    await e.scan();
    expect(e.issues).toEqual([]);
    expect(e.audit.length).toBe(d.ops);
    const notApplied = e.audit.filter((a) => a.status !== 'applied');
    expect(notApplied.map((a) => `${a.type} ${a.status} ${a.reason ?? ''}`)).toEqual([]);
    expect(buildTaskViews(e.state).size).toBe(40);
    expect(d.ops / d.tasks).toBeGreaterThan(19);
  });
});

const ms = (t0: number) => Math.round(performance.now() - t0);

describe.skipIf(!process.env.PERF)('performance (PERF=1)', () => {
  it('cold start, refresh, 1 new op, warm start from the cache, cold start with checkpoints', async () => {
    const tasks = Number(process.env.PERF_TASKS ?? 5000);
    const dir = await mkdtemp(join(tmpdir(), 'mytasker-perf-'));
    const rows: [string, string][] = [];
    const row = (k: string, v: string) => {
      rows.push([k, v]);
      console.log(`${k}: ${v}`);
    };
    try {
      const storage = new NodeFsStorage(dir);
      let t0 = performance.now();
      const d = await generatePerfData(storage, { tasks, start: START });
      row('generate (not part of the app)', `${d.tasks} tasks, ${d.ops} ops, ${ms(t0)} ms`);

      // Cold start: read, parse, verify each signature and chain, replay.
      const e = new Engine(storage, domain, { now: () => NOW });
      t0 = performance.now();
      await e.scan('full');
      row('cold start: full scan (read + verify + replay)', `${ms(t0)} ms`);
      expect(e.issues).toEqual([]);
      expect(e.audit.length).toBe(d.ops);

      t0 = performance.now();
      const views = buildTaskViews(e.state);
      const search = buildSearchIndex(views.values());
      const notif = computeNotifications({ state: e.state, audit: e.audit, views, me: d.users[1].id, now: NOW });
      row('UI model: task views + search index + notifications', `${ms(t0)} ms (${views.size} tasks, ${search.size} search texts, ${notif.length} notifications)`);
      expect(views.size).toBe(tasks);

      t0 = performance.now();
      await e.scan('quick');
      row('refresh, no change: quick scan (polling)', `${ms(t0)} ms`);
      t0 = performance.now();
      await e.scan('full');
      row('refresh, no change: full scan (every 8th poll)', `${ms(t0)} ms`);

      // 1 new op of another user, then the quick scan of this client (incremental replay).
      const other = new Engine(storage, domain, { now: () => NOW });
      await other.scan('full');
      const u: Signer = d.users[2].signer;
      t0 = performance.now();
      await other.write(u, 'data', 'AddComment', { id: 'perf-new-c', taskId: 't-perf-1', text: 'Nový komentář', mentions: [] }, { allowSuperseded: true });
      row('write 1 op (check + sign + file)', `${ms(t0)} ms`);
      t0 = performance.now();
      await e.scan('quick');
      row('refresh after 1 new op: quick scan', `${ms(t0)} ms`);
      expect(e.audit.length).toBe(d.ops + 1);

      // Warm start: the app keeps the verified ops in its encrypted cache (ADR 0006).
      const cache = e.exportCache();
      const size = JSON.stringify(cache).length;
      const warm = new Engine(storage, domain, { now: () => NOW });
      t0 = performance.now();
      await warm.importCache(cache);
      await warm.scan('quick');
      row('warm start: import cache + quick scan (no encryption)', `${ms(t0)} ms (cache ${(size / 1e6).toFixed(1)} MB as JSON)`);
      expect(warm.audit.length).toBe(d.ops + 1);

      // Checkpoints by the admin, then a cold start of a new computer.
      const admin = d.users[0].signer;
      t0 = performance.now();
      await e.createCheckpoint(admin, 'roles');
      await e.createCheckpoint(admin, 'data');
      row('create checkpoints (roles + data)', `${ms(t0)} ms`);
      const fresh = new Engine(storage, domain, { now: () => NOW });
      t0 = performance.now();
      await fresh.scan('full');
      row('cold start with checkpoints: full scan', `${ms(t0)} ms`);
      expect(fresh.audit.length).toBe(d.ops + 1);
      expect(fresh.issues).toEqual([]);

      row('heap used after the run', `${Math.round(process.memoryUsage().heapUsed / 1e6)} MB`);
      console.log('\n| Measurement | Result |\n|---|---|\n' + rows.map(([k, v]) => `| ${k} | ${v} |`).join('\n'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 1_800_000);
});
