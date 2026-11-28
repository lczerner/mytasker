// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Browser session: shared folder handle, signing key, encrypted cache (ADR 0006).
import {
  decryptJson, encryptJson, generateAesKey, generateSigningKey, isEd25519Supported, sha256Hex, signBytes, unwrapAesKey, unwrapSigningKey,
  wrapAesKey, wrapSigningKey, type Engine, type EngineCache, type KeyFile, type Signer, type TrustRoot,
} from 'oplog-core';
import { KEY_FILE_FORMAT } from '../domain/constants';
import { idbDel, idbGet, idbSet } from './idb';

export interface Unlocked {
  keyFile: KeyFile;
  privateKey: CryptoKey;
  kek: CryptoKey;
  signer: Signer;
}

export interface Support {
  ok: boolean;
  problems: ('fsa' | 'secure' | 'idb' | 'ed25519')[];
}

export async function checkSupport(): Promise<Support> {
  const problems: Support['problems'] = [];
  if (typeof (window as any).showDirectoryPicker !== 'function') problems.push('fsa');
  if (!window.isSecureContext) problems.push('secure');
  if (typeof indexedDB === 'undefined') problems.push('idb');
  if (!globalThis.crypto?.subtle || !(await isEd25519Supported())) problems.push('ed25519');
  return { ok: problems.length === 0, problems };
}

/**
 * True if the page runs inside a frame or as a sandboxed web page (for example the file preview of
 * SharePoint on the web), not from a file. The browser blocks the folder picker there,
 * and the storage access can throw.
 */
export const isEmbedded = (): boolean => window.top !== window || (location.protocol !== 'file:' && window.origin === 'null');

// ---- Shared folder (the handle is stored: accepted risk, Q-22) ------------------------------

const ROOT = 'rootHandle';

export async function pickRoot(): Promise<FileSystemDirectoryHandle> {
  const h: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ id: 'mytasker-root', mode: 'readwrite' });
  await idbSet(ROOT, h);
  return h;
}

export async function savedRoot(): Promise<FileSystemDirectoryHandle | undefined> {
  try {
    return await idbGet<FileSystemDirectoryHandle>(ROOT);
  } catch {
    return undefined;
  }
}

export const forgetRoot = () => idbDel(ROOT);

/** 'granted' | 'prompt' | 'denied'. requestPermission needs a user gesture. */
export async function rootPermission(h: FileSystemDirectoryHandle, request: boolean): Promise<string> {
  const opts = { mode: 'readwrite' };
  const a = h as any;
  let s = await a.queryPermission(opts);
  if (s !== 'granted' && request) s = await a.requestPermission(opts);
  return s;
}

/** True if the handle is inside the shared folder (the key file must NOT be there). */
export async function isInside(root: FileSystemDirectoryHandle, h: FileSystemHandle): Promise<boolean> {
  try {
    return (await root.resolve(h)) !== null;
  } catch {
    return false;
  }
}

// ---- Key (the IndexedDB copy is wrapped with the passphrase) ----------------------------------

const KEYFILE = 'keyFile';

export const storedKeyFile = () => idbGet<KeyFile>(KEYFILE).catch(() => undefined);
export const storeKeyFile = (k: KeyFile) => idbSet(KEYFILE, k);
export const forgetKeyFile = () => idbDel(KEYFILE);

/** Creates a key. The caller stores it (storeKeyFile) only after the key file is saved by the user. */
export async function createKey(displayName: string, passphrase: string, iterations?: number): Promise<{ unlocked: Unlocked; publicKey: string }> {
  const k = await generateSigningKey();
  const keyFile = await wrapSigningKey(k, passphrase, displayName, new Date(), KEY_FILE_FORMAT, iterations);
  return { unlocked: await unlock(keyFile, passphrase), publicKey: k.publicKey };
}

export async function unlock(keyFile: KeyFile, passphrase: string): Promise<Unlocked> {
  const { privateKey, kek } = await unwrapSigningKey(keyFile, passphrase, KEY_FILE_FORMAT);
  return { keyFile, privateKey, kek, signer: { keyId: keyFile.keyId, sign: (b) => signBytes(privateKey, b) } };
}

export function parseKeyFile(text: string): KeyFile {
  const k = JSON.parse(text) as KeyFile;
  if (k?.format !== KEY_FILE_FORMAT || k.v !== 1) throw new Error('not a key file');
  return k;
}

// ---- Encrypted cache --------------------------------------------------------------------------

interface CacheRecord {
  keyId: string;
  wrapped: { iv: string; wrapped: string };
  box: { iv: string; ct: string };
}

/**
 * The cache and the per-user data are stored per installation and key. `installId` is a short
 * hash of the trust root (not the folder name: 2 folders can have the same name).
 */
const cacheId = (installId: string, keyId: string) => `cache:${installId}:${keyId}`;

export async function installIdOf(trustRootText: string): Promise<string> {
  return (await sha256Hex(trustRootText)).slice(0, 16);
}

export async function loadCache(engine: Engine, u: Unlocked, rootName: string): Promise<boolean> {
  try {
    const rec = await idbGet<CacheRecord>(cacheId(rootName, u.keyFile.keyId));
    if (!rec || rec.keyId !== u.keyFile.keyId) return false;
    const key = await unwrapAesKey(rec.wrapped, u.kek);
    await engine.importCache(await decryptJson<EngineCache>(key, rec.box));
    return true;
  } catch {
    return false; // damaged or from another key: rebuild from the shared folder
  }
}

/**
 * Saves the encrypted cache. With `knownRoot`, it also stores the known trust root of the engine as
 * the known trust root of that folder: only after the first start in this browser, and after an
 * admin confirmed the trust root in this session (a debounced save of another tab must not write
 * back an older known trust root).
 */
export async function saveCache(engine: Engine, u: Unlocked, rootName: string, knownRoot?: FileSystemDirectoryHandle): Promise<void> {
  const key = await generateAesKey(true);
  const cache = engine.exportCache();
  const rec: CacheRecord = { keyId: u.keyFile.keyId, wrapped: await wrapAesKey(key, u.kek), box: await encryptJson(key, cache) };
  await idbSet(cacheId(rootName, u.keyFile.keyId), rec);
  if (knownRoot && cache.trustRoot) await saveKnownTrustRoot(knownRoot, cache.trustRoot);
}

// ---- Known trust roots of the folders (public data: not encrypted) ------------------------------

/**
 * The trust root that this browser knows for a folder: the first one that it read, or the one
 * that an admin confirmed (Engine.acknowledgeTrustRoot). The cache ID depends on the content of
 * app/trust-root.json (installIdOf), so after a change of the file the app finds no cache, or an
 * older cache. These records keep the known trust root, so that the engine also reports a change
 * after a reload (start.ts prepareEngine). 1 record for each folder, matched with isSameEntry.
 */
const KNOWN_TRUST_ROOTS = 'knownTrustRoots';
/** The maximum number of folders with a known trust root (the oldest goes first). */
const KNOWN_MAX = 20;

interface KnownTrustRoot {
  root: FileSystemDirectoryHandle;
  trustRoot: TrustRoot;
}

async function knownList(): Promise<KnownTrustRoot[]> {
  const l = await idbGet<KnownTrustRoot[]>(KNOWN_TRUST_ROOTS);
  return Array.isArray(l) ? l : [];
}

async function indexOfRoot(l: KnownTrustRoot[], root: FileSystemDirectoryHandle): Promise<number> {
  for (let i = 0; i < l.length; i++) if (await l[i].root.isSameEntry(root).catch(() => false)) return i;
  return -1;
}

/** The known trust root of the folder `root`, or null (first start in this browser for this folder). */
export async function loadKnownTrustRoot(root: FileSystemDirectoryHandle): Promise<TrustRoot | null> {
  try {
    const l = await knownList();
    const i = await indexOfRoot(l, root);
    return i < 0 ? null : l[i].trustRoot;
  } catch {
    return null;
  }
}

/** Stores the known trust root of the folder `root`. It replaces only the record of that folder. */
export async function saveKnownTrustRoot(root: FileSystemDirectoryHandle, trustRoot: TrustRoot): Promise<void> {
  const l = await knownList();
  const i = await indexOfRoot(l, root);
  if (i >= 0) l.splice(i, 1);
  l.push({ root, trustRoot });
  await idbSet(KNOWN_TRUST_ROOTS, l.slice(-KNOWN_MAX));
}

export const clearCache = (rootName: string, keyId: string) => idbDel(cacheId(rootName, keyId));

// ---- Encrypted per-user data (read state of notifications) --------------------------------------

interface UserBox {
  wrapped: { iv: string; wrapped: string };
  box: { iv: string; ct: string };
}

const userId = (rootName: string, keyId: string, name: string) => `user:${rootName}:${keyId}:${name}`;

/** Returns undefined if no record exists. Throws for an IndexedDB or a decryption error. */
export async function loadUserData<T>(u: Unlocked, rootName: string, name: string): Promise<T | undefined> {
  const rec = await idbGet<UserBox>(userId(rootName, u.keyFile.keyId, name));
  if (!rec) return undefined;
  return await decryptJson<T>(await unwrapAesKey(rec.wrapped, u.kek), rec.box);
}

export async function saveUserData(u: Unlocked, rootName: string, name: string, value: unknown): Promise<void> {
  const key = await generateAesKey(true);
  await idbSet(userId(rootName, u.keyFile.keyId, name), { wrapped: await wrapAesKey(key, u.kek), box: await encryptJson(key, value) } satisfies UserBox);
}
