// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Multi-user simulation. Each user has an own copy of the shared folder on disk
// (as OneDrive on an own computer). A seeded random generator decides the actions
// and the sync between the copies, with delays and partial visibility.
// SIM_SEED and SIM_ROUNDS change the run.
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { AuthError, canonicalize, Engine, SupersededError } from 'oplog-core';
import { NodeFsStorage } from 'oplog-core/node-fs';
import { buildTaskViews, domain, keyBetween, type Status } from '../../src/domain';
import { actor, fakeClock, rawOp, team, writeTrustRoot, type Actor } from '../helpers';

const SEED = Number(process.env.SIM_SEED ?? 20261119);
const ROUNDS = Number(process.env.SIM_ROUNDS ?? 60);

/** Deterministic random numbers (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T,>(l: readonly T[]): T => l[Math.floor(next() * l.length)], chance: (p: number) => next() < p };
}

async function files(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else out.push(relative(root, p));
    }
  }
  await walk(root);
  return out;
}

/** Copies files that `to` does not have yet. With `fraction` < 1, only a random part (slow sync). */
async function syncCopy(from: string, to: string, fraction: number, r: ReturnType<typeof rng>) {
  for (const f of await files(from)) {
    if (fraction < 1 && !r.chance(fraction)) continue;
    const dst = join(to, f);
    try {
      await stat(dst);
      continue;
    } catch {
      /* the file does not exist in the target */
    }
    await mkdir(dirname(dst), { recursive: true });
    await writeFile(dst, await readFile(join(from, f)));
  }
}

describe('multi-user simulation', () => {
  let base = '';
  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'mytasker-sim-'));
  });
  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it(`converges after concurrent offline work (seed ${SEED}, ${ROUNDS} rounds)`, async () => {
    const r = rng(SEED);
    const clock = fakeClock();
    const names = ['admin', 'petr', 'eva', 'vera', 'jan'];
    const roots = names.map((n) => join(base, n));
    for (const d of roots) await mkdir(d, { recursive: true });
    const users: Actor[] = [];
    for (let i = 0; i < names.length; i++) users.push(await actor(names[i], new NodeFsStorage(roots[i]), clock.now));
    const [admin] = users;
    await writeTrustRoot(admin.engine.storage, [admin]);
    await admin.engine.scan();
    for (const u of users.slice(1)) await admin.r('GrantUser', { userId: u.userId, displayName: u.name, keyId: u.keyId, publicKey: u.publicKey, role: 'user', verifier: u.name === 'vera' });
    for (let i = 1; i < users.length; i++) await syncCopy(roots[0], roots[i], 1, r);
    for (const u of users) await u.engine.scan();

    let created = 0;
    const counts = { written: 0, refused: 0 };
    for (let round = 0; round < ROUNDS; round++) {
      // Actions: each user does 0–3 things on the own copy.
      for (const u of users) {
        for (let n = r.int(4); n > 0; n--) {
          const views = [...buildTaskViews(u.engine.state).values()].filter((v) => v.status !== 'deleted');
          const t = views.length ? r.pick(views) : null;
          const other = r.pick(users);
          const st = t?.status as Status | undefined;
          const actions: [string, Record<string, unknown>][] = [['CreateTask', { id: `t-${u.name}-${created++}`, title: `Úkol ${round}` }]];
          if (t) {
            actions.push(
              ['UpdateTask', { id: t.id, fields: { title: `${t.title.slice(0, 50)} ${u.name}` } }],
              ['AddAssignee', { taskId: t.id, userId: other.userId }],
              ['RemoveAssignee', { taskId: t.id, userId: other.userId }],
              ['AddComment', { id: `c-${u.name}-${created++}`, taskId: t.id, text: `Poznámka ${round}`, mentions: [other.userId] }],
              ['AddSubtask', { id: `s-${u.name}-${created++}`, taskId: t.id, text: 'Krok', pos: keyBetween(null, null) }],
              ['CreateTag', { id: `g-${u.name}-${created++}`, name: r.pick(['nákup', 'Nakup', 'sklad', 'právo']) }],
            );
            if (t.subtasks.length) actions.push(['MoveSubtask', { id: r.pick(t.subtasks).id, pos: keyBetween(null, String(t.subtasks[0].pos)) }], ['CheckSubtask', { id: r.pick(t.subtasks).id, done: r.chance(0.5) }]);
            const tags = Object.keys(u.engine.state.scopes.data?.tag ?? {});
            if (tags.length) actions.push(['AddTaskTag', { taskId: t.id, tagId: r.pick(tags) }], ['RemoveTaskTag', { taskId: t.id, tagId: r.pick(tags) }]);
            if (st === 'new' || st === 'assigned') actions.push(['PostponeTask', { id: t.id, from: st }], ['CompleteTask', { id: t.id, from: st }]);
            if (st === 'postponed') actions.push(['ResumeTask', { id: t.id, from: st }]);
            if (st === 'done') actions.push(['VerifyTask', { id: t.id, from: st }], ['ReturnTask', { id: t.id, from: st, commentId: `r-${u.name}-${created++}`, text: 'Opravit' }]);
            if (st) actions.push(['DeleteTask', { id: t.id, from: st }]);
            if (st === 'verified') actions.push(['ReopenTask', { id: t.id, from: st }]);
          }
          const [type, payload] = r.pick(actions);
          try {
            await u.engine.write(u.signer, 'data', type, payload, { allowSuperseded: true });
            counts.written++;
          } catch (e) {
            if (!(e instanceof AuthError || e instanceof SupersededError)) throw e;
            counts.refused++;
          }
        }
      }
      // Sync: random pairs, often only a part of the files (OneDrive latency).
      for (let k = r.int(names.length * 2); k > 0; k--) {
        const a = r.int(names.length);
        const b = r.int(names.length);
        if (a !== b) await syncCopy(roots[a], roots[b], r.pick([0.3, 0.7, 1]), r);
      }
      for (const u of users) if (r.chance(0.6)) await u.engine.scan(r.chance(0.5) ? 'quick' : 'full');
      // Revocation in the middle of the run: jan's key is valid only up to his current seq.
      if (round === Math.floor(ROUNDS / 2)) {
        const jan = users[4];
        const head = jan.engine.validHeads().find((h) => h.scope === 'data' && h.keyId === jan.keyId)?.seq ?? 0;
        await admin.r('RemoveUser', { userId: jan.userId, cutoffs: { [jan.keyId]: { roles: 0, data: head } } });
      }
    }

    // Full sync: every copy gets all files.
    for (let i = 0; i < names.length; i++) for (let j = 0; j < names.length; j++) if (i !== j) await syncCopy(roots[i], roots[j], 1, r);
    for (let i = 0; i < names.length; i++) for (let j = 0; j < names.length; j++) if (i !== j) await syncCopy(roots[i], roots[j], 1, r);
    for (const u of users) await u.engine.scan('full');

    const states = users.map((u) => canonicalize(u.engine.state));
    for (const s of states) expect(s).toBe(states[0]);
    const fresh = new Engine(new NodeFsStorage(roots[0]), domain);
    await fresh.scan();
    expect(canonicalize(fresh.state)).toBe(states[0]);
    // No file of honest clients is an integrity issue, except the ops of jan after his removal.
    const issues = fresh.issues.filter((i) => !(i.kind === 'revoked' && i.authorKeyId === users[4].keyId));
    expect(issues).toEqual([]);
    expect(counts.written).toBeGreaterThan(ROUNDS);
    const statuses = new Set(fresh.audit.map((a) => a.status));
    expect(statuses.has('applied') && statuses.has('superseded')).toBe(true);
    const tasks = Object.values(fresh.state.scopes.data.task ?? {});
    expect(new Set(tasks.map((t) => t.status)).size).toBeGreaterThan(2);
  }, 300_000);
});

describe('attacks and broken files', () => {
  /** A team with some work. Returns a fresh client for checks. */
  async function setup() {
    const t = await team();
    await t.petr.w('CreateTask', { id: 'p1', title: 'Petrův úkol' });
    await t.petr.w('CreateTask', { id: 'p2', title: 'Druhý' });
    await t.eva.w('CreateTask', { id: 'e1', title: 'Evin úkol' });
    await t.eva.w('CompleteTask', { id: 'e1', from: 'new' });
    await t.sync();
    const check = async () => {
      const e = new Engine(t.storage, domain);
      await e.scan();
      return e;
    };
    return { ...t, check };
  }
  const kinds = (e: Engine) => new Set(e.issues.map((i) => i.kind));

  it('a modified file: bad signature, the chain stops', async () => {
    const { storage, petr, check } = await setup();
    const path = `data/ops/${petr.keyId}/0000000001.json`;
    const env = JSON.parse(storage.files.get(path) as string);
    storage.files.set(path, canonicalize({ ...env, payload: { ...env.payload, title: 'Změněno' } }));
    const e = await check();
    expect(kinds(e).has('bad-signature')).toBe(true);
    expect(e.state.scopes.data.task.p1).toBeUndefined();
    expect(e.state.scopes.data.task.p2).toBeUndefined();
  });

  it('a missing file in a chain: chain-gap, later ops wait', async () => {
    const { storage, petr, check } = await setup();
    storage.files.delete(`data/ops/${petr.keyId}/0000000001.json`);
    const e = await check();
    expect(kinds(e).has('chain-gap')).toBe(true);
    expect(e.state.scopes.data.task.p2).toBeUndefined();
  });

  it('a forked seq (the same key on 2 computers) and a conflict copy: fork and unknown file', async () => {
    const { storage, petr, check } = await setup();
    const { MemoryStorage } = await import('oplog-core');
    const pc2 = new MemoryStorage();
    await rawOp(pc2, petr, 'data', 'CreateTask', { id: 'x', title: 'Z druhého PC' }, { t: Date.parse('2026-11-19T09:00:00Z'), c: 0 });
    storage.files.set(`data/ops/${petr.keyId}/0000000001-PETR-PC2.json`, pc2.files.get(`data/ops/${petr.keyId}/0000000001.json`)!);
    const e = await check();
    expect(kinds(e).has('fork')).toBe(true);
    expect(e.issues.some((i) => i.kind === 'unknown-file' && i.path!.endsWith('-PETR-PC2.json'))).toBe(true);
  });

  it('an op from a revoked key is rejected', async () => {
    const { storage, admin, petr, check } = await setup();
    await admin.r('RevokeKey', { keyId: petr.keyId, cutoff: { roles: 0, data: 2 } });
    await rawOp(storage, petr, 'data', 'CreateTask', { id: 'p3', title: 'Po odvolání' }, { t: Date.parse('2026-11-19T10:00:00Z'), c: 0 });
    const e = await check();
    expect(e.issues.some((i) => i.kind === 'revoked' && i.authorKeyId === petr.keyId)).toBe(true);
    expect(e.state.scopes.data.task.p3).toBeUndefined();
    expect(e.state.scopes.data.task.p2).toBeDefined();
  });

  it('a non-verifier who verifies is rejected', async () => {
    const { storage, petr, check } = await setup();
    await rawOp(storage, petr, 'data', 'VerifyTask', { id: 'e1', from: 'done' }, { t: Date.parse('2026-11-19T10:00:00Z'), c: 0 });
    const e = await check();
    expect(e.issues.some((i) => i.kind === 'unauthorized' && i.detail.includes('VerifyTask'))).toBe(true);
    expect(e.state.scopes.data.task.e1.status).toBe('done');
  });

  it('a user who deletes the task of another user is rejected', async () => {
    const { storage, petr, check } = await setup();
    await rawOp(storage, petr, 'data', 'DeleteTask', { id: 'e1', from: 'done' }, { t: Date.parse('2026-11-19T10:00:00Z'), c: 0 });
    const e = await check();
    expect(e.issues.some((i) => i.kind === 'unauthorized' && i.detail.includes('creator'))).toBe(true);
    expect(e.state.scopes.data.task.e1.status).toBe('done');
  });

  it('a user who writes in roles is rejected', async () => {
    const { storage, petr, check } = await setup();
    await rawOp(storage, petr, 'roles', 'SetRole', { userId: petr.userId, role: 'admin' }, { t: Date.parse('2026-11-19T10:00:00Z'), c: 0 });
    const e = await check();
    expect(e.issues.some((i) => i.kind === 'unauthorized')).toBe(true);
    expect(e.state.scopes.roles.user[petr.userId].role).toBe('user');
  });

  it('a file of an unknown key waits and is listed', async () => {
    const { storage, check } = await setup();
    const stranger = await actor('stranger', storage, () => Date.now());
    await rawOp(storage, stranger, 'data', 'CreateTask', { id: 's1', title: 'Cizí' }, { t: Date.parse('2026-11-19T10:00:00Z'), c: 0 });
    const e = await check();
    expect(kinds(e).has('unknown-key')).toBe(true);
    expect(e.state.scopes.data.task.s1).toBeUndefined();
  });
});
