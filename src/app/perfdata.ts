// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Synthetic data for the performance measurement (docs/performance.md): a team with many tasks
// and about 20 ops per task. All names are synthetic. The ops are valid, signed and chained, but
// the generator writes them directly (no check of each write), so that 100 000 ops take seconds.
// No DOM: the Node performance test and the browser demo (?demo=perf) use it.
import {
  canonicalize,
  filePath,
  generateSigningKey,
  hashCanonical,
  signBytes,
  signEnvelope,
  TRUST_ROOT_PATH,
  type Envelope,
  type Signer,
  type Storage,
  type TrustRoot,
} from 'oplog-core';
import { keyBetween } from '../domain/fractional';

export interface PerfUser {
  id: string;
  name: string;
  keyId: string;
  signer: Signer;
}

export interface PerfData {
  users: PerfUser[];
  tasks: number;
  ops: number;
}

const FIRST = ['Alena', 'Petr', 'Eva', 'Věra', 'Jan', 'Lucie', 'Tomáš', 'Marie'];
const LAST = ['Adminová', 'Dvořák', 'Nová', 'Malá', 'Král', 'Černá', 'Svoboda', 'Bílá'];
const WORDS = ['objednat', 'zkontrolovat', 'připravit', 'opravit', 'zálohovat', 'domluvit', 'aktualizovat', 'archivovat', 'smlouva', 'faktura', 'porada', 'sklad', 'rozpočet', 'licence', 'tiskárna', 'školení'];
const TAGS = ['faktury', 'nákup', 'personální', 'právo', 'IT', 'sklad', 'marketing', 'kvalita', 'provoz', 'obchod', 'vedení', 'účetnictví'];

/** A small deterministic random generator, so that each run makes the same data. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * Writes the trust root and the ops of a synthetic team to `storage`.
 * `tasks` tasks with about `opsPerTask` ops each. `start` is the time of the first op; the ops are
 * 30 seconds apart, so all of them are in the past when `start` is early enough.
 */
export async function generatePerfData(storage: Storage, opts: { tasks: number; users?: number; opsPerTask?: number; start: number; seed?: number }): Promise<PerfData> {
  const rnd = rng(opts.seed ?? 1);
  const pick = <T,>(l: readonly T[]) => l[Math.floor(rnd() * l.length)];
  const nUsers = Math.min(opts.users ?? 8, FIRST.length);
  const users: PerfUser[] = [];
  const pub = new Map<string, string>();
  for (let i = 0; i < nUsers; i++) {
    const k = await generateSigningKey();
    users.push({ id: `u-perf-${i}`, name: `${FIRST[i]} ${LAST[i]}`, keyId: k.keyId, signer: { keyId: k.keyId, sign: (b) => signBytes(k.privateKey, b) } });
    pub.set(k.keyId, k.publicKey);
  }
  const admin = users[0];
  const verifier = users[Math.min(3, nUsers - 1)];
  const tr: TrustRoot = { v: 1, roots: [{ userId: admin.id, displayName: admin.name, keyId: admin.keyId, alg: 'Ed25519', publicKey: pub.get(admin.keyId)!, cutoffs: null }] };
  await storage.writeNew(TRUST_ROOT_PATH, JSON.stringify(tr, null, 2));

  let t = opts.start;
  let count = 0;
  const last = new Map<string, { seq: number; env: Envelope }>();
  const op = async (u: PerfUser, scope: string, type: string, payload: Record<string, unknown>) => {
    t += 30_000;
    const k = `${scope}|${u.keyId}`;
    const prev = last.get(k);
    const seq = (prev?.seq ?? 0) + 1;
    const env = await signEnvelope(
      { v: 1, opId: `perf-${u.keyId.slice(1, 9)}-${scope}-${seq}`, scope, authorKeyId: u.keyId, seq, prevHash: prev ? await hashCanonical(prev.env) : null, hlc: { t, c: 0 }, wallTime: new Date(t).toISOString(), type, payload },
      (b) => u.signer.sign(b),
    );
    await storage.writeNew(filePath(scope, 'ops', u.keyId, seq), canonicalize(env));
    last.set(k, { seq, env });
    count++;
  };

  for (const u of users.slice(1)) await op(admin, 'roles', 'GrantUser', { userId: u.id, displayName: u.name, keyId: u.keyId, publicKey: pub.get(u.keyId)!, role: 'user', verifier: u === verifier });
  const tagIds = TAGS.map((_, i) => `tag-perf-${i}`);
  for (let i = 0; i < TAGS.length; i++) await op(admin, 'data', 'CreateTag', { id: tagIds[i], name: TAGS[i] });

  const per = opts.opsPerTask ?? 20;
  for (let n = 0; n < opts.tasks; n++) {
    const id = `t-perf-${n}`;
    const author = pick(users);
    const title = `${pick(WORDS)} ${pick(WORDS)} ${n}`;
    const due = rnd() < 0.7 ? { due: { at: new Date(opts.start + Math.floor(rnd() * 400) * 86_400_000).toISOString(), allDay: rnd() < 0.5 } } : {};
    await op(author, 'data', 'CreateTask', { id, title: title.charAt(0).toUpperCase() + title.slice(1), description: `Popis úkolu ${n}: ${pick(WORDS)} a ${pick(WORDS)}.`, ...due });
    const who = pick(users.slice(1));
    await op(author, 'data', 'AddAssignee', { taskId: id, userId: who.id });
    await op(author, 'data', 'AddTaskTag', { taskId: id, tagId: pick(tagIds) });
    let pos: string | null = null;
    const subs: string[] = [];
    for (let s = 0; s < 3; s++) {
      pos = keyBetween(pos, null);
      subs.push(`${id}-s${s}`);
      await op(who, 'data', 'AddSubtask', { id: `${id}-s${s}`, taskId: id, text: `${pick(WORDS)} ${s + 1}`, pos });
    }
    // Comments and edits fill the rest up to `per` ops.
    const fixed = 9;
    for (let c = 0; c < per - fixed; c++) {
      const u = rnd() < 0.5 ? who : pick(users);
      if (c % 4 === 3) await op(u, 'data', 'UpdateTask', { id, fields: { description: `Upravený popis ${n}/${c}: ${pick(WORDS)}.` } });
      else await op(u, 'data', 'AddComment', { id: `${id}-c${c}`, taskId: id, text: `Komentář ${c}: ${pick(WORDS)} ${pick(WORDS)}.`, mentions: [] });
    }
    await op(who, 'data', 'CheckSubtask', { id: subs[0], done: true });
    await op(who, 'data', 'CheckSubtask', { id: subs[1], done: true });
    const r = rnd();
    if (r < 0.6) {
      await op(who, 'data', 'CompleteTask', { id, from: 'assigned' });
      if (r < 0.35) await op(verifier, 'data', 'VerifyTask', { id, from: 'done' });
    } else await op(who, 'data', 'UpdateTask', { id, fields: { title: `${title} (upraveno)` } });
  }
  return { users, tasks: opts.tasks, ops: count };
}
