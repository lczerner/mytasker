// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Entry point: demo mode (?demo[=user]) or the start screens for a real shared folder.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { MemoryStorage, Engine } from 'oplog-core';
import { createDemo, DEMO_USERS, type Demo } from '../app/demo';
import { generatePerfData, type PerfData } from '../app/perfdata';
import { domain } from '../domain/domain';
import { App } from './App';
import type { UserData } from './Notifications';
import { Gate } from './Gate';
import { t } from './i18n';
import './styles.css';

function DemoRoot({ size, first }: { size: 'small' | 'large'; first: string }) {
  const [demo, setDemo] = useState<Demo | null>(null);
  const [user, setUser] = useState(first);
  const [engine, setEngine] = useState<ReturnType<Demo['engineFor']> | null>(null);
  useEffect(() => {
    void createDemo({ size }).then(setDemo);
  }, []);
  useEffect(() => {
    if (!demo) return;
    const e = demo.engineFor();
    void e.scan().then(() => setEngine(e));
  }, [demo, user]);
  if (!demo || !engine) return <p class="gate">{t('gate.loading')}</p>;
  const u = demo.users.find((x) => x.id === user) ?? demo.users[0];
  return (
    <App
      key={u.id}
      engine={engine}
      storage={demo.storage}
      me={{ userId: u.id, keyId: u.keyId, signer: u.signer }}
      demo
      demoUsers={demo.users.map((x) => ({ id: x.id, name: x.name }))}
      onDemoUser={(id) => {
        setEngine(null);
        setUser(id);
      }}
      onLock={() => location.reload()}
      userData={demoUserData(u.id)}
    />
  );
}

/**
 * ?demo=perf[&tasks=N][&per=M]: the performance measurement in the browser (docs/performance.md).
 * Synthetic data in memory, the admin as the user. The times are in window.__perf.
 */
function PerfRoot({ tasks, per }: { tasks: number; per: number }) {
  const [run, setRun] = useState<{ engine: Engine; storage: MemoryStorage; data: PerfData } | null>(null);
  useEffect(() => {
    void (async () => {
      const storage = new MemoryStorage();
      let t0 = performance.now();
      const data = await generatePerfData(storage, { tasks, opsPerTask: per, start: Date.now() - 600 * 86_400_000 });
      const gen = performance.now() - t0;
      const engine = new Engine(storage, domain);
      t0 = performance.now();
      await engine.scan('full');
      (window as unknown as { __perf: Record<string, number> }).__perf = { gen, scan: performance.now() - t0, ops: data.ops, tasks: data.tasks, mounted: performance.now() };
      setRun({ engine, storage, data });
    })();
  }, []);
  if (!run) return <p class="gate">{t('gate.loading')}</p>;
  const u = run.data.users[0];
  return <App engine={run.engine} storage={run.storage} me={{ userId: u.id, keyId: u.keyId, signer: u.signer }} demo onLock={() => location.reload()} userData={demoUserData(u.id)} />;
}

const params = new URLSearchParams(location.search);
const root = document.getElementById('app')!;
if (params.has('demo')) {
  const v = params.get('demo') ?? '';
  if (v === 'perf') {
    // Limits: a mistake in the URL must not freeze the tab for minutes.
    const num = (k: string, d: number, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number(params.get(k) ?? d)) || d));
    render(<PerfRoot tasks={num('tasks', 5000, 1, 20_000)} per={num('per', 20, 9, 60)} />, root);
  } else {
    const first = DEMO_USERS.find((u) => u.id === `u-${v}`)?.id ?? DEMO_USERS[0].id;
    render(<DemoRoot size={v === 'large' ? 'large' : 'small'} first={first} />, root);
  }
} else render(<Gate />, root);

/** Demo: the per-user data stays in memory (nothing is saved). */
const demoData = new Map<string, unknown>();
function demoUserData(user: string): UserData {
  return {
    // The demo starts with all events unread (baseline ''), so the notifications have content.
    load: async <T,>(name: string) => (demoData.get(`${user}:${name}`) ?? (name === 'notifications' ? { baseline: '', read: [] } : undefined)) as T | undefined,
    save: async (name: string, value: unknown) => void demoData.set(`${user}:${name}`, value),
  };
}
