// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Test helpers. All names and data here are synthetic.
import { canonicalize, Engine, filePath, generateSigningKey, hashCanonical, MemoryStorage, signBytes, signEnvelope, TRUST_ROOT_PATH, type Envelope, type Hlc, type Signer, type Storage, type TrustRoot } from 'oplog-core';
import { domain } from '../src/domain/domain';
import { buildTaskViews } from '../src/domain/view';

export interface Actor {
  name: string;
  userId: string;
  keyId: string;
  publicKey: string;
  signer: Signer;
  engine: Engine;
  /** Writes an op in the data scope. Superseded ops are permitted (they are part of many tests). */
  w(type: string, payload: Record<string, unknown>): Promise<Envelope>;
  /** Writes an op in the roles scope. */
  r(type: string, payload: Record<string, unknown>): Promise<Envelope>;
}

/** A fake clock. Each call moves 1 second forward. */
export function fakeClock(start = Date.parse('2026-11-19T08:00:00Z')) {
  let t = start;
  return { now: () => (t += 1000), set: (v: number) => (t = v), get: () => t };
}

export async function actor(name: string, storage: Storage, now: () => number): Promise<Actor> {
  const k = await generateSigningKey();
  const signer: Signer = { keyId: k.keyId, sign: (b) => signBytes(k.privateKey, b) };
  return withEngine({ name, userId: `u-${name}`, keyId: k.keyId, publicKey: k.publicKey, signer }, storage, now);
}

/** The same key with its own engine (another computer or tab of the same user). */
export function withEngine(a: Pick<Actor, 'name' | 'userId' | 'keyId' | 'publicKey' | 'signer'>, storage: Storage, now: () => number): Actor {
  const engine = new Engine(storage, domain, { now });
  return {
    ...a,
    engine,
    w: (type, payload) => engine.write(a.signer, 'data', type, payload, { allowSuperseded: true }),
    r: (type, payload) => engine.write(a.signer, 'roles', type, payload, { allowSuperseded: true }),
  };
}

export async function writeTrustRoot(storage: Storage, roots: Actor[]) {
  const tr: TrustRoot = { v: 1, roots: roots.map((r) => ({ userId: r.userId, displayName: r.name, keyId: r.keyId, alg: 'Ed25519', publicKey: r.publicKey, cutoffs: null })) };
  await storage.writeNew(TRUST_ROOT_PATH, JSON.stringify(tr, null, 2));
}

/**
 * A synthetic team on 1 storage:
 * admin (root admin), petr and eva (users), vera (verifier).
 */
export async function team() {
  const storage = new MemoryStorage();
  const clock = fakeClock();
  const admin = await actor('admin', storage, clock.now);
  await writeTrustRoot(storage, [admin]);
  await admin.engine.scan();
  const petr = await actor('petr', storage, clock.now);
  const eva = await actor('eva', storage, clock.now);
  const vera = await actor('vera', storage, clock.now);
  for (const [a, name, verifier] of [[petr, 'Petr Dvořák', false], [eva, 'Eva Nová', false], [vera, 'Věra Malá', true]] as const)
    await admin.r('GrantUser', { userId: a.userId, displayName: name, keyId: a.keyId, publicKey: a.publicKey, role: 'user', verifier });
  for (const a of [petr, eva, vera]) await a.engine.scan();
  const sync = async () => {
    for (const a of [admin, petr, eva, vera]) await a.engine.scan();
  };
  return { storage, clock, admin, petr, eva, vera, sync, all: [admin, petr, eva, vera] };
}

export const task = (a: Actor, id: string) => a.engine.state.scopes.data?.task?.[id];
export const view = (a: Actor, id: string) => buildTaskViews(a.engine.state).get(id)!;
export const lastAudit = (a: Actor) => a.engine.audit[a.engine.audit.length - 1];

/** Writes a hand-made op (for tests of order and integrity). Takes seq and prevHash from the files of the author. */
export async function rawOp(storage: Storage, a: Pick<Actor, 'name' | 'keyId' | 'signer'>, scope: string, type: string, payload: Record<string, unknown>, hlc: Hlc, wallTime = new Date(hlc.t).toISOString()): Promise<Envelope> {
  const dir = `${scope}/ops/${a.keyId}`;
  const names = ((await storage.list(dir)) ?? []).map((f) => f.name).filter((n) => /^\d{10}\.json$/.test(n)).sort();
  const seq = names.length + 1;
  const prev = names.length ? JSON.parse((await storage.read(`${dir}/${names[names.length - 1]}`))!) : null;
  const env = await signEnvelope(
    { v: 1, opId: `op-${a.name}-${scope}-${seq}-${hlc.t}`, scope, authorKeyId: a.keyId, seq, prevHash: prev ? await hashCanonical(prev) : null, hlc, wallTime, type, payload },
    (b) => a.signer.sign(b),
  );
  await storage.writeNew(filePath(scope, 'ops', a.keyId, seq), canonicalize(env));
  return env;
}

export { MemoryStorage };
