// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Entry point: demo mode (?demo[=user]) or the start screens for a real shared folder.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { createDemo, DEMO_USERS, type Demo } from '../app/demo';
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

const params = new URLSearchParams(location.search);
const root = document.getElementById('app')!;
if (params.has('demo')) {
  const v = params.get('demo') ?? '';
  const first = DEMO_USERS.find((u) => u.id === `u-${v}`)?.id ?? DEMO_USERS[0].id;
  render(<DemoRoot size={v === 'large' ? 'large' : 'small'} first={first} />, root);
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
