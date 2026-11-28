// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The checks of the start screens (src/app/start.ts). Synthetic data only.
import { createEnrollment, enrollmentPath, FileExistsError, generateSigningKey, MemoryStorage, signBytes, TRUST_ROOT_PATH } from 'oplog-core';
import { folderState, newKeyProblem, readTrustRoot, requestState, trustRootDiff, writeRequest } from '../../src/app/start';
import { ENROLL_FORMAT } from '../../src/domain/constants';
import { team } from '../helpers';

async function request(displayName: string) {
  const k = await generateSigningKey();
  const req = await createEnrollment(ENROLL_FORMAT, displayName, k.keyId, k.publicKey, new Date('2026-11-19T10:00:00Z'), (b) => signBytes(k.privateKey, b));
  return { k, req };
}

describe('the trust root at the start', () => {
  it('a missing file in an empty folder is a new installation', async () => {
    expect(await folderState(new MemoryStorage(), null)).toEqual({ s: 'install' });
  });

  it('a missing file in a folder with op data is not a new installation', async () => {
    const t = await team();
    await t.storage.remove(TRUST_ROOT_PATH);
    expect(await folderState(t.storage, null)).toMatchObject({ s: 'bad', reason: expect.stringContaining('op data') });
    // With a known trust root of this folder, the engine uses the known copy and shows an issue.
    expect(await folderState(t.storage, t.admin.engine.trustRoot)).toEqual({ s: 'ok' });
  });

  it('an empty, partial, too large or not valid file is "bad", also with a known trust root', async () => {
    const t = await team();
    const known = t.admin.engine.trustRoot;
    const good = (await t.storage.read(TRUST_ROOT_PATH))!;
    for (const text of ['', good.slice(0, 20), '{"v":1}', 'x'.repeat(1024 * 1024 + 1)]) {
      t.storage.files.set(TRUST_ROOT_PATH, text);
      expect((await folderState(t.storage, known)).s).toBe('bad');
    }
    t.storage.files.set(TRUST_ROOT_PATH, good);
    expect(await folderState(t.storage, known)).toEqual({ s: 'ok' });
    expect(await readTrustRoot(t.storage)).toEqual({ text: good, error: null });
  });
});

describe('the access request', () => {
  it('writes a new request, and accepts the same valid request after FileExistsError', async () => {
    const s = new MemoryStorage();
    const { req } = await request('Petr Dvořák');
    expect(await requestState(s, req)).toBe('none');
    expect(await writeRequest(s, req)).toBe('ok');
    expect(await requestState(s, req)).toBe('ok');
    // A second try (for example after a reload) finds the valid file.
    expect(await writeRequest(s, req)).toBe('ok');
  });

  it('reports a damaged request file (an empty or partial file of a failed write) as "broken"', async () => {
    const { req } = await request('Petr Dvořák');
    const path = enrollmentPath(req.displayName, req.keyId);
    for (const bad of ['', JSON.stringify(req).slice(0, 30), JSON.stringify({ ...req, sig: 'x' }), 'x'.repeat(64 * 1024 + 1)]) {
      const s = new MemoryStorage();
      s.files.set(path, bad);
      expect(await requestState(s, req)).toBe('broken');
      expect(await writeRequest(s, req)).toBe('broken');
    }
    // The request of another key at the same path is not the request of this key.
    const other = await request('Petr Dvořák');
    const s = new MemoryStorage();
    s.files.set(path, JSON.stringify(other.req));
    expect(await requestState(s, req)).toBe('broken');
  });

  it('reports a key file name that the request rule refuses as "badName"', async () => {
    const s = new MemoryStorage();
    const k = { displayName: 'Petr‮Dvořák', keyId: 'kaaaaaaaaaaaaaaaaaaaaaaaa' };
    s.files.set(enrollmentPath(k.displayName, k.keyId), '{}');
    expect(await requestState(s, k)).toBe('badName');
  });

  it('a race: the file exists after the check (FileExistsError), with the valid content', async () => {
    const base = new MemoryStorage();
    const { req } = await request('Eva Nová');
    const s = Object.assign(Object.create(base), {
      writeNew: async (p: string, d: string) => {
        base.files.set(p, d);
        throw new FileExistsError(p);
      },
    }) as MemoryStorage;
    expect(await writeRequest(s, req)).toBe('ok');
  });
});

describe('the input of a new key', () => {
  it('checks the name with the rule of the access request before the key is made', () => {
    expect(newKeyProblem('Petr Dvořák', 'heslo-pro-test-1', 'heslo-pro-test-1')).toBeNull();
    for (const name of ['', '   ', 'Petr‮Dvořák', 'Petr\u0000', 'Petr\nDvořák', 'x'.repeat(201)]) expect(newKeyProblem(name, 'heslo-pro-test-1', 'heslo-pro-test-1'), JSON.stringify(name)).toBe('nameInvalid');
    expect(newKeyProblem('Petr', 'krátké', 'krátké')).toBe('passShort');
    expect(newKeyProblem('Petr', 'heslo-pro-test-1', 'heslo-pro-test-2')).toBe('passDiff');
  });
});

describe('the change of the trust root for the confirmation', () => {
  it('marks added, removed, changed and unchanged root entries against the known trust root', () => {
    const root = (keyId: string, userId: string, cutoffs: Record<string, number> | null = null) => ({ userId, displayName: userId, keyId, alg: 'Ed25519' as const, publicKey: 'p', cutoffs });
    const known = { v: 1 as const, roots: [root('ka', 'u-a'), root('kb', 'u-b'), root('kc', 'u-c')] };
    const now = { v: 1 as const, roots: [root('ka', 'u-a'), root('kb', 'u-b', { roles: 3, data: 7 }), root('kd', 'u-d')] };
    expect(trustRootDiff(known, now).map((r) => [r.root.keyId, r.change])).toEqual([
      ['ka', 'same'],
      ['kb', 'changed'],
      ['kd', 'added'],
      ['kc', 'removed'],
    ]);
    expect(trustRootDiff(null, now).map((r) => r.change)).toEqual(['added', 'added', 'added']);
  });
});
