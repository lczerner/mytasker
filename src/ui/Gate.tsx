// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Start screens for a real shared folder: browser check, folder, trust root, key, enrollment.
import { createEnrollment, enrollmentPath, Engine, FileExistsError, fingerprint, FsaStorage, TRUST_ROOT_PATH, uuidv7, WrongPassphraseError, type KeyFile, type TrustRoot } from 'oplog-core';
import { useEffect, useRef, useState } from 'preact/hooks';
import { openTextFile, saveTextFile } from '../app/files';
import { deleteDb } from '../app/idb';
import {
  checkSupport,
  createKey,
  forgetKeyFile,
  forgetRoot,
  installIdOf,
  isEmbedded,
  isInside,
  loadCache,
  loadUserData,
  parseKeyFile,
  pickRoot,
  rootPermission,
  savedRoot,
  saveCache,
  saveUserData,
  storedKeyFile,
  storeKeyFile,
  unlock,
  type Unlocked,
} from '../app/session';
import { ENROLL_FORMAT, LIMITS } from '../domain/constants';
import { domain } from '../domain/domain';
import { settingsOf, userIsActive } from '../domain/state';
import { App } from './App';
import { Footer } from './Footer';
import { t, type Key } from './i18n';
import { LangButton, useLang } from './lang';

type Root = FileSystemDirectoryHandle;

/** The first checks (before any user action) normally take less than 1 s. */
const START_TIMEOUT_MS = 15_000;
/** Set by the reset button: the next page load deletes the database before any other IndexedDB access. */
const RESET_FLAG = 'mytasker-reset';
const RESET_STEP = 'reset of the browser data (IndexedDB)';

type Step =
  | { s: 'loading' }
  | { s: 'error'; reason: string; retry: () => void; resetFailed?: boolean }
  | { s: 'unsupported'; problems: string[] }
  | { s: 'embedded' }
  | { s: 'pick'; error?: string; errorKey?: Key }
  | { s: 'permission'; root: Root }
  | { s: 'install'; root: Root }
  | { s: 'key'; root: Root; stored?: KeyFile }
  | { s: 'create'; root: Root; bootstrap: boolean }
  | { s: 'waiting'; root: Root; u: Unlocked; engine: Engine; sent: boolean }
  | { s: 'removed'; root: Root }
  | { s: 'app'; root: Root; u: Unlocked; engine: Engine; installId: string };

export function Gate() {
  useLang(); // a change of the language renders the start screens and the app again
  const [step, setStep] = useState<Step>({ s: 'loading' });

  /** Runs a step function. An error shows a message with "try again" (never an endless "loading"). */
  const guard = (f: () => Promise<void>) => async () => {
    try {
      await f();
    } catch (e) {
      setStep({ s: 'error', reason: (e as Error).message, retry: () => void guard(f)() });
    }
  };

  useEffect(() => {
    // A browser call that never ends (seen with IndexedDB data in Edge) must not give an endless
    // "loading": after the timeout, show the error screen with the step. If the step ends later,
    // its result replaces only that error screen, not a step that the user reached since then.
    let at = 'browser check';
    let timedOut: Step | null = null;
    const timer = setTimeout(() => {
      timedOut = { s: 'error', reason: `The start did not end in ${START_TIMEOUT_MS / 1000} s. Step: ${at}.`, retry: () => location.reload(), resetFailed: at === RESET_STEP };
      setStep(timedOut);
    }, START_TIMEOUT_MS);
    const set = (next: Step) => setStep((cur) => (timedOut === null || cur === timedOut ? next : cur));
    const mark = (s: string) => (at = s);
    void (async () => {
      try {
        if (isEmbedded()) return set({ s: 'embedded' }); // before any storage access: it can throw there
        if (sessionStorage.getItem(RESET_FLAG)) {
          sessionStorage.removeItem(RESET_FLAG); // 1 try only: no reload loop
          mark(RESET_STEP);
          try {
            await deleteDb();
          } catch (e) {
            return set({ s: 'error', reason: (e as Error).message, retry: () => location.reload(), resetFailed: true });
          }
        }
        mark('browser check');
        const sup = await checkSupport();
        if (!sup.ok) return set({ s: 'unsupported', problems: sup.problems });
        mark('saved folder (IndexedDB)');
        const root = await savedRoot();
        if (!root) return set({ s: 'pick' });
        mark('folder permission');
        set((await rootPermission(root, false)) === 'granted' ? await rootStep(root, mark) : { s: 'permission', root });
      } catch (e) {
        set({ s: 'error', reason: (e as Error).message, retry: () => location.reload() });
      } finally {
        clearTimeout(timer);
      }
    })();
  }, []);

  const afterRoot = async (root: Root) => setStep(await rootStep(root));

  const start = (root: Root, u: Unlocked) =>
    guard(async () => {
      setStep({ s: 'loading' });
      const storage = new FsaStorage(root);
      const installId = await installIdOf((await storage.read(TRUST_ROOT_PATH)) ?? '');
      const engine = new Engine(storage, domain);
      await loadCache(engine, u, installId);
      await engine.scan('full');
      const owner = domain.keyOwner(engine.state, u.keyFile.keyId);
      if (owner === null) return setStep({ s: 'waiting', root, u, engine, sent: (await storage.read(enrollmentPath(u.keyFile.displayName, u.keyFile.keyId))) !== null });
      if (!userIsActive(engine.state, owner)) return setStep({ s: 'removed', root });
      void saveCache(engine, u, installId).catch(() => undefined); // the cache is only an optimization
      setStep({ s: 'app', root, u, engine, installId });
    })();

  const otherKey = async (root: Root) => {
    await forgetKeyFile();
    setStep({ s: 'key', root });
  };

  switch (step.s) {
    case 'loading':
      return <Screen title={t('appName')}>{<p>{t('gate.loading')}</p>}</Screen>;
    case 'error':
      return (
        <Screen title={t('appName')}>
          <p class="error">{t('gate.errorGeneric')}</p>
          <details class="small">
            <summary>{t('admin.techDetail')}</summary>
            <code>{step.reason}</code>
          </details>
          <div class="row wrap">
            <button type="button" class="primary" onClick={step.retry}>
              {t('gate.retry')}
            </button>
            <button type="button" onClick={async () => (await forgetRoot().catch(() => undefined), setStep({ s: 'pick' }))}>
              {t('top.changeFolder')}
            </button>
          </div>
          {step.resetFailed && <p class="note">{t('gate.reset.failed')}</p>}
          <ResetBrowserData />
        </Screen>
      );
    case 'embedded':
      return (
        <Screen title={t('gate.embedded.title')}>
          <p>{t('gate.embedded.text')}</p>
          <ol>
            <li>{t('gate.embedded.sync')}</li>
            <li>{t('gate.embedded.keep')}</li>
            <li>{t('gate.embedded.open')}</li>
            <li>{t('gate.embedded.pick')}</li>
          </ol>
        </Screen>
      );
    case 'unsupported':
      return (
        <Screen title={t('gate.unsupported.title')}>
          <p>{t('gate.unsupported.text')}</p>
          <ul>
            {step.problems.map((p) => (
              <li key={p}>{t(`gate.unsupported.${p}` as Key)}</li>
            ))}
          </ul>
        </Screen>
      );
    case 'pick':
      return (
        <Screen title={t('gate.pick.title')}>
          <p>{t('gate.pick.text')}</p>
          {step.errorKey && <p class="error">{t(step.errorKey)}</p>}
          {step.error && <p class="error">{step.error}</p>}
          <button
            type="button"
            class="primary"
            onClick={async () => {
              let root: Root;
              try {
                root = await pickRoot();
              } catch (e) {
                const name = (e as Error).name;
                // SecurityError: the page is embedded in a way that isEmbedded() does not detect.
                if (name === 'SecurityError') setStep({ s: 'embedded' });
                else if (name !== 'AbortError') setStep({ s: 'pick', error: (e as Error).message });
                return;
              }
              await guard(() => afterRoot(root))();
            }}
          >
            {t('gate.pick.button')}
          </button>
        </Screen>
      );
    case 'permission':
      return (
        <Screen title={t('gate.pick.title')}>
          <div class="row wrap">
            <button type="button" class="primary" onClick={guard(async () => ((await rootPermission(step.root, true)) === 'granted' ? afterRoot(step.root) : setStep({ s: 'pick' })))}>
              {t('gate.permission', { name: step.root.name })}
            </button>
            <button type="button" onClick={() => setStep({ s: 'pick' })}>
              {t('top.changeFolder')}
            </button>
          </div>
        </Screen>
      );
    case 'install':
      return (
        <Screen title={t('gate.newInstall.title')}>
          <p>{t('gate.newInstall.text')}</p>
          <div class="row wrap">
            <button type="button" class="primary" onClick={() => setStep({ s: 'create', root: step.root, bootstrap: true })}>
              {t('gate.newInstall.button')}
            </button>
            <button type="button" onClick={() => setStep({ s: 'pick' })}>
              {t('top.changeFolder')}
            </button>
          </div>
        </Screen>
      );
    case 'key':
      return <KeyStep step={step} onUnlocked={(u) => start(step.root, u)} onCreate={() => setStep({ s: 'create', root: step.root, bootstrap: false })} setStep={setStep} />;
    case 'create':
      return <CreateStep root={step.root} bootstrap={step.bootstrap} onDone={(u) => start(step.root, u)} />;
    case 'waiting':
      return <Waiting step={step} onApproved={() => start(step.root, step.u)} />;
    case 'removed':
      return (
        <Screen title={t('appName')}>
          <p>{t('gate.removed')}</p>
          <div class="row wrap">
            <button type="button" onClick={() => otherKey(step.root)}>
              {t('gate.unlock.other')}
            </button>
            <button type="button" onClick={async () => (await forgetRoot().catch(() => undefined), setStep({ s: 'pick' }))}>
              {t('top.changeFolder')}
            </button>
          </div>
        </Screen>
      );
    case 'app':
      return (
        <App
          engine={step.engine}
          storage={step.engine.storage}
          me={{ userId: domain.keyOwner(step.engine.state, step.u.keyFile.keyId)!, keyId: step.u.keyFile.keyId, signer: step.u.signer }}
          demo={false}
          onChange={debounce(() => void saveCache(step.engine, step.u, step.installId), 3000)}
          onLock={() => location.reload()}
          userData={{ load: (name) => loadUserData(step.u, step.installId, name), save: (name, value) => saveUserData(step.u, step.installId, name, value) }}
        />
      );
  }
}

function debounce(f: () => void, ms: number): () => void {
  let id: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(id);
    id = setTimeout(f, ms);
  };
}

function Screen({ title, children }: { title: string; children: preact.ComponentChildren }) {
  return (
    <>
      <main class="gate">
        <div class="gate-box">
          <div class="gate-top">
            <p class="brand">
              <span aria-hidden="true">✓</span> {t('appName')}
            </p>
            <LangButton />
          </div>
          <h1>{title}</h1>
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}

/** The step after the folder is known (no state change: the caller sets the step). */
async function rootStep(root: Root, mark: (step: string) => void = () => undefined): Promise<Step> {
  const storage = new FsaStorage(root);
  mark('shared folder read');
  if ((await storage.list('app')) === null) return { s: 'pick', errorKey: 'gate.wrongFolder' };
  if ((await storage.read(TRUST_ROOT_PATH)) === null) return { s: 'install', root };
  mark('saved key (IndexedDB)');
  return { s: 'key', root, stored: await storedKeyFile() };
}

/**
 * Deletes the data of the app in this browser (after a confirmation). The delete runs after a
 * reload, before any IndexedDB access: in this page, a request that never ended can block it.
 */
function ResetBrowserData() {
  const [ask, setAsk] = useState(false);
  if (!ask)
    return (
      <button type="button" class="link" onClick={() => setAsk(true)}>
        {t('gate.reset.button')}
      </button>
    );
  return (
    <div class="stack">
      <p class="note">{t('gate.reset.confirm')}</p>
      <div class="row wrap">
        <button type="button" class="danger" onClick={() => (sessionStorage.setItem(RESET_FLAG, '1'), location.reload())}>
          {t('gate.reset.do')}
        </button>
        <button type="button" onClick={() => setAsk(false)}>
          {t('dlg.cancel')}
        </button>
      </div>
    </div>
  );
}

/** The fingerprints of the root admins (security-model §2.5): users compare them with the admin. */
function TrustRootInfo({ root }: { root: Root }) {
  const [fps, setFps] = useState<string[]>([]);
  useEffect(() => {
    void new FsaStorage(root)
      .read(TRUST_ROOT_PATH)
      .then((txt) => {
        const tr = JSON.parse(txt ?? 'null') as TrustRoot | null;
        setFps((tr?.roots ?? []).filter((r) => typeof r.keyId === 'string').map((r) => `${String(r.displayName).slice(0, 80)}: ${fingerprint(r.keyId)}`));
      })
      .catch(() => setFps([]));
  }, [root]);
  if (!fps.length) return null;
  return (
    <p class="muted small">
      {t('gate.fingerprint')}:{' '}
      {fps.map((f) => (
        <code key={f}>{f}</code>
      ))}
    </p>
  );
}

function KeyStep({ step, onUnlocked, onCreate, setStep }: { step: Extract<Step, { s: 'key' }>; onUnlocked: (u: Unlocked) => void; onCreate: () => void; setStep: (s: Step) => void }) {
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Key | null>(null);
  const open = async () => {
    try {
      const f = await openTextFile();
      if (!f) return;
      if (await isInside(step.root, f.handle)) return setErr('gate.key.inside');
      const k = parseKeyFile(f.text);
      await storeKeyFile(k);
      setStep({ ...step, stored: k });
    } catch {
      setErr('gate.key.notKey');
    }
  };
  if (!step.stored)
    return (
      <Screen title={t('gate.key.title')}>
        {err && <p class="error">{t(err)}</p>}
        <div class="stack">
          <button type="button" class="primary" onClick={open}>
            {t('gate.key.open')}
          </button>
          <button type="button" onClick={onCreate}>
            {t('gate.key.new')}
          </button>
        </div>
        <TrustRootInfo root={step.root} />
      </Screen>
    );
  return (
    <Screen title={t('gate.unlock.title')}>
      <p>
        <strong>{step.stored.displayName}</strong> · <code>{fingerprint(step.stored.keyId)}</code>
      </p>
      <form
        class="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            onUnlocked(await unlock(step.stored!, pass));
          } catch (x) {
            console.warn(x);
            setErr(x instanceof WrongPassphraseError ? 'gate.unlock.wrong' : 'gate.errorGeneric');
            setBusy(false);
          }
        }}
      >
        <label>
          {t('gate.unlock.pass')}
          <input type="password" autoFocus required autoComplete="current-password" value={pass} onInput={(e) => setPass((e.target as HTMLInputElement).value)} />
        </label>
        {err && <p class="error">{t(err)}</p>}
        <button type="submit" class="primary" disabled={busy}>
          {t('gate.unlock.button')}
        </button>
        <button
          type="button"
          class="link"
          onClick={async () => {
            await forgetKeyFile();
            setStep({ ...step, stored: undefined });
          }}
        >
          {t('gate.unlock.other')}
        </button>
      </form>
      <TrustRootInfo root={step.root} />
    </Screen>
  );
}

function keyFileName(name: string): string {
  return `${name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'klic'}.ukoly-key.json`;
}

function CreateStep({ root, bootstrap, onDone }: { root: Root; bootstrap: boolean; onDone: (u: Unlocked) => void }) {
  const [name, setName] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);
  // The key is created 1 time. If the save of the key file is cancelled, the user saves again with the SAME key.
  const [made, setMade] = useState<{ u: Unlocked; publicKey: string } | null>(null);

  const finish = async (m: { u: Unlocked; publicKey: string }) => {
    const r = await saveTextFile(keyFileName(m.u.keyFile.displayName), JSON.stringify(m.u.keyFile, null, 2), 'application/json', t('file.keyDescription'), (h) => isInside(root, h));
    if (!r.saved) {
      setErr(r.reason === 'forbidden' ? 'gate.key.inside' : 'gate.key.saveCancelled');
      return;
    }
    // Only after the key file is saved: keep the wrapped copy and write the trust root or the access request.
    await storeKeyFile(m.u.keyFile);
    const storage = new FsaStorage(root);
    if (bootstrap) {
      const tr: TrustRoot = { v: 1, roots: [{ userId: uuidv7(), displayName: m.u.keyFile.displayName, keyId: m.u.keyFile.keyId, alg: 'Ed25519', publicKey: m.publicKey, cutoffs: null }] };
      await storage.writeNew(TRUST_ROOT_PATH, JSON.stringify(tr, null, 2));
    } else {
      const req = await createEnrollment(ENROLL_FORMAT, m.u.keyFile.displayName, m.u.keyFile.keyId, m.publicKey, new Date(), m.u.signer.sign);
      await storage.writeNew(enrollmentPath(req.displayName, req.keyId), JSON.stringify(req, null, 2));
    }
    onDone(m.u);
  };

  const submit = async () => {
    setErr(null);
    if (!made) {
      if (p1.length < 12) return setErr('gate.create.passShort');
      if (p1 !== p2) return setErr('gate.create.passDiff');
    }
    setBusy(true);
    try {
      let m = made;
      if (!m) {
        const c = await createKey(name.trim(), p1);
        m = { u: c.unlocked, publicKey: c.publicKey };
        setMade(m);
      }
      await finish(m);
    } catch (e) {
      console.warn(e);
      setErr('gate.errorGeneric');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen title={bootstrap ? t('gate.newInstall.title') : t('gate.create.title')}>
      <form
        class="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label>
          {t('gate.create.name')}
          <input type="text" required autoFocus autoComplete="name" disabled={!!made} maxLength={LIMITS.displayName} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </label>
        {!made && (
          <>
            <label>
              {t('gate.create.pass')}
              <input type="password" required minLength={12} autoComplete="new-password" value={p1} onInput={(e) => setP1((e.target as HTMLInputElement).value)} />
            </label>
            <label>
              {t('gate.create.pass2')}
              <input type="password" required minLength={12} autoComplete="new-password" value={p2} onInput={(e) => setP2((e.target as HTMLInputElement).value)} />
            </label>
          </>
        )}
        <p class="note">{t('gate.create.saveHint')}</p>
        {err && <p class="error">{t(err)}</p>}
        <button type="submit" class="primary" disabled={busy}>
          {bootstrap ? t('gate.newInstall.button') : t('gate.create.save')}
        </button>
      </form>
      <TrustRootInfo root={root} />
    </Screen>
  );
}

function Waiting({ step, onApproved }: { step: Extract<Step, { s: 'waiting' }>; onApproved: () => void }) {
  const secs = settingsOf(step.engine.state).pollSeconds;
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const [sent, setSent] = useState(step.sent);
  const [err, setErr] = useState<Key | null>(null);
  useEffect(() => {
    timer.current = setInterval(async () => {
      try {
        await step.engine.scan('full');
        if (domain.keyOwner(step.engine.state, step.u.keyFile.keyId) !== null) {
          clearInterval(timer.current);
          onApproved();
        }
      } catch (e) {
        console.warn(e);
        setErr('gate.errorGeneric');
      }
    }, secs * 1000);
    return () => clearInterval(timer.current);
  }, []);
  const send = async () => {
    try {
      const k = step.u.keyFile;
      const req = await createEnrollment(ENROLL_FORMAT, k.displayName, k.keyId, k.publicKey, new Date(), step.u.signer.sign);
      try {
        await step.engine.storage.writeNew(enrollmentPath(req.displayName, req.keyId), JSON.stringify(req, null, 2));
      } catch (e) {
        if (!(e instanceof FileExistsError)) throw e; // the request exists already: that is fine
      }
      setSent(true);
    } catch (e) {
      console.warn(e);
      setErr('gate.errorGeneric');
    }
  };
  return (
    <Screen title={t('gate.enroll.title')}>
      {sent ? (
        <>
          <p>{t('gate.enroll.sent')}</p>
          <p class="fingerprint big">{fingerprint(step.u.keyFile.keyId)}</p>
          <p class="muted">{t('gate.enroll.waiting', { s: secs })}</p>
        </>
      ) : (
        <button type="button" class="primary" onClick={send}>
          {t('gate.enroll.send')}
        </button>
      )}
      {err && <p class="error">{t(err)}</p>}
      <TrustRootInfo root={step.root} />
    </Screen>
  );
}
