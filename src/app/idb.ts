// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Minimal IndexedDB key-value store. All file:// pages share 1 origin, so
// store only data that is encrypted or not secret (see ADR 0006).
const DB = 'mytasker';
const STORE = 'kv';

let conn: Promise<IDBDatabase> | null = null;

/** 1 connection for the page (opened on first use). */
function open(): Promise<IDBDatabase> {
  conn ??= openDb().catch((e) => {
    conn = null;
    throw e;
  });
  return conn;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => {
      // Another tab deletes the database (deleteDb): close, so that the delete is not blocked.
      r.result.onversionchange = () => {
        r.result.close();
        conn = null;
      };
      res(r.result);
    };
    r.onerror = () => rej(r.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((res, rej) => {
    const q = db.transaction(STORE).objectStore(STORE).get(key);
    q.onsuccess = () => res(q.result as T | undefined);
    q.onerror = () => rej(q.error);
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(value, key);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

export async function idbDel(key: string): Promise<void> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readwrite');
    t.objectStore(STORE).delete(key);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
}

/**
 * Deletes the database: all data of the app in this browser (the folder handle, the wrapped key,
 * the cache). Call it before any other access in this page. Open connections in other tabs close
 * on the versionchange event.
 */
export function deleteDb(): Promise<void> {
  return new Promise((res, rej) => {
    const r = indexedDB.deleteDatabase(DB);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
