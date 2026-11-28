// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The checks of the start screens (Gate) that read the shared folder: the trust root, the access
// request of the user and the input for a new key. No DOM: the unit tests use a MemoryStorage.
import {
  canonicalize,
  enrollmentPath,
  FileExistsError,
  FileTooLargeError,
  isValidDisplayName,
  MAX_ENROLLMENT_BYTES,
  MAX_TRUST_ROOT_BYTES,
  TRUST_ROOT_PATH,
  trustRootError,
  verifyEnrollment,
  type Engine,
  type EnrollmentRequest,
  type KeyFile,
  type Storage,
  type TrustRoot,
} from 'oplog-core';
import { DATA, ENROLL_FORMAT, ROLES } from '../domain/constants';

/**
 * Reads app/trust-root.json with the size limit of the engine. `text` is null if the file does not
 * exist. `error` is not null if the file is too large, empty or not a valid trust root. A write
 * that failed can leave an empty or partial file.
 */
export async function readTrustRoot(storage: Storage): Promise<{ text: string | null; error: string | null }> {
  let text: string | null;
  try {
    text = await storage.read(TRUST_ROOT_PATH, { maxBytes: MAX_TRUST_ROOT_BYTES });
  } catch (e) {
    if (e instanceof FileTooLargeError) return { text: null, error: e.message };
    throw e;
  }
  if (text === null) return { text: null, error: null };
  let x: unknown;
  try {
    x = JSON.parse(text);
  } catch (e) {
    return { text, error: `${TRUST_ROOT_PATH}: not valid JSON (${(e as Error).message})` };
  }
  const err = trustRootError(x);
  return { text, error: err === null ? null : `${TRUST_ROOT_PATH}: ${err}` };
}

/** True if the folder contains op data (an entry in roles/ops or data/ops). */
export async function hasOpData(storage: Storage): Promise<boolean> {
  for (const scope of [ROLES, DATA]) if (((await storage.list(`${scope}/ops`)) ?? []).length > 0) return true;
  return false;
}

export type FolderState = { s: 'install' } | { s: 'bad'; reason: string } | { s: 'ok' };

/**
 * The state of the trust root of a shared folder at the start:
 * - 'bad': the file is empty, damaged, too large or not valid. Or it is missing, the browser knows
 *   no trust root of this folder, and the folder contains op data. Then a new installation would
 *   let any user make himself root admin of the existing data. An admin must repair the file.
 * - 'install': the file is missing and the folder has no op data (a new installation).
 * - 'ok': a valid file, or a missing file with a known trust root (for example a file that
 *   OneDrive still downloads): the engine uses the known copy and shows an issue.
 */
export async function folderState(storage: Storage, known: TrustRoot | null): Promise<FolderState> {
  const tr = await readTrustRoot(storage);
  if (tr.error !== null) return { s: 'bad', reason: tr.error };
  if (tr.text !== null || known) return { s: 'ok' };
  if (await hasOpData(storage)) return { s: 'bad', reason: `${TRUST_ROOT_PATH}: the file is missing, but the folder contains op data` };
  return { s: 'install' };
}

/**
 * Prepares a new engine before its first scan. First the known trust root of the folder (it stays
 * the known trust root: importCache does not replace it), then the encrypted cache. Thus a cache
 * of an older trust root (for example after a rollback of the file) cannot hide a change.
 */
export async function prepareEngine(engine: Engine, known: TrustRoot | null, loadCache: () => Promise<boolean>): Promise<void> {
  if (known) await engine.importCache({ v: 3, ops: [], sigOk: [], trustRoot: known });
  await loadCache();
}

/**
 * The state of the access request of this key in enroll/:
 * - 'none': the file does not exist.
 * - 'ok': a valid request of this key.
 * - 'badName': the name in the key file is not a valid display name (an older key file).
 * - 'broken': the file is not a valid request of this key (for example an empty or partial file
 *   of a write that failed, or a file that is too large).
 */
export async function requestState(storage: Storage, k: Pick<KeyFile, 'displayName' | 'keyId'>): Promise<'none' | 'ok' | 'badName' | 'broken'> {
  let text: string | null;
  try {
    text = await storage.read(enrollmentPath(k.displayName, k.keyId), { maxBytes: MAX_ENROLLMENT_BYTES });
  } catch (e) {
    if (e instanceof FileTooLargeError) return isValidDisplayName(k.displayName) ? 'broken' : 'badName';
    throw e;
  }
  if (text === null) return 'none';
  if (!isValidDisplayName(k.displayName)) return 'badName';
  try {
    const r = JSON.parse(text) as EnrollmentRequest;
    return r?.keyId === k.keyId && (await verifyEnrollment(r, ENROLL_FORMAT)) ? 'ok' : 'broken';
  } catch {
    return 'broken';
  }
}

/**
 * Writes the access request. If the file exists already (an earlier try), the function checks it:
 * nobody can overwrite it. Returns the state of the request file (requestState).
 */
export async function writeRequest(storage: Storage, req: EnrollmentRequest): Promise<'ok' | 'badName' | 'broken'> {
  try {
    await storage.writeNew(enrollmentPath(req.displayName, req.keyId), JSON.stringify(req, null, 2));
    return 'ok';
  } catch (e) {
    if (!(e instanceof FileExistsError)) throw e;
  }
  const st = await requestState(storage, req);
  return st === 'none' ? 'broken' : st;
}

/** The input of a new key. Returns the first problem, or null. The name rule is the rule of the access request. */
export function newKeyProblem(name: string, pass: string, pass2: string): 'nameInvalid' | 'passShort' | 'passDiff' | null {
  if (!isValidDisplayName(name.trim())) return 'nameInvalid';
  if (pass.length < 12) return 'passShort';
  if (pass !== pass2) return 'passDiff';
  return null;
}

export interface TrustRootRow {
  root: TrustRoot['roots'][number];
  /** Against the known trust root: a new key, a removed key, a changed entry (name, user, key or cutoffs) or no change. */
  change: 'added' | 'removed' | 'changed' | 'same';
}

/**
 * The root entries of the current trust root, compared with the known trust root by keyId, and
 * then the removed entries. An admin checks all of them before the confirmation.
 */
export function trustRootDiff(known: TrustRoot | null, current: TrustRoot | null): TrustRootRow[] {
  const before = new Map((known?.roots ?? []).map((r) => [r.keyId, r]));
  const now = current?.roots ?? [];
  const rows: TrustRootRow[] = now.map((r) => {
    const k = before.get(r.keyId);
    return { root: r, change: !k ? 'added' : canonicalize(k) === canonicalize(r) ? 'same' : 'changed' };
  });
  const nowKeys = new Set(now.map((r) => r.keyId));
  for (const r of known?.roots ?? []) if (!nowKeys.has(r.keyId)) rows.push({ root: r, change: 'removed' });
  return rows;
}
