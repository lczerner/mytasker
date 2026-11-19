// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Demo mode (index.html?demo[=user]): synthetic data in memory. Nothing is written to disk.
// All names and texts are synthetic.
import { Engine, generateSigningKey, MemoryStorage, signBytes, TRUST_ROOT_PATH, uuidv7, type Signer, type TrustRoot } from 'oplog-core';
import { DATA, ROLES } from '../domain/constants';
import { domain } from '../domain/domain';
import { spreadKeys } from '../domain/fractional';

export interface DemoUser {
  id: string;
  name: string;
  keyId: string;
  signer: Signer;
}

export interface Demo {
  storage: MemoryStorage;
  users: DemoUser[];
  /** A new engine on the demo storage. */
  engineFor(): Engine;
}

export const DEMO_USERS = [
  { id: 'u-alena', name: 'Alena Adminová', role: 'admin' as const, verifier: false },
  { id: 'u-petr', name: 'Petr Dvořák', role: 'user' as const, verifier: false },
  { id: 'u-eva', name: 'Eva Nová', role: 'user' as const, verifier: false },
  { id: 'u-vera', name: 'Věra Malá', role: 'user' as const, verifier: true },
];

const DAY = 24 * 3600_000;

/** Due date `days` from now at `hour` Prague time (approximate: UTC+1), or all day. */
function due(now: number, days: number, hour: number | null) {
  const d = new Date(now + days * DAY);
  if (hour === null) {
    d.setUTCHours(22, 59, 59, 0);
    return { at: d.toISOString().replace(/\.\d{3}Z$/, '.000Z'), allDay: true };
  }
  d.setUTCHours(hour - 1, 0, 0, 0);
  return { at: d.toISOString().replace(/\.\d{3}Z$/, '.000Z'), allDay: false };
}

export async function createDemo(opts: { size?: 'small' | 'large'; now?: number } = {}): Promise<Demo> {
  const now = opts.now ?? Date.now();
  const storage = new MemoryStorage();
  const users: DemoUser[] = [];
  const pubs: string[] = [];
  for (const u of DEMO_USERS) {
    const k = await generateSigningKey();
    users.push({ id: u.id, name: u.name, keyId: k.keyId, signer: { keyId: k.keyId, sign: (b) => signBytes(k.privateKey, b) } });
    pubs.push(k.publicKey);
  }
  const tr: TrustRoot = { v: 1, roots: [{ userId: users[0].id, displayName: users[0].name, keyId: users[0].keyId, alg: 'Ed25519', publicKey: pubs[0], cutoffs: null }] };
  await storage.writeNew(TRUST_ROOT_PATH, JSON.stringify(tr, null, 2));
  // The demo history starts 20 days ago, so that relative times look natural.
  let clock = now - 20 * DAY;
  const tick = () => (clock += 37_000);
  const engines = new Map<string, Engine>();
  const eng = (u: DemoUser) => {
    let e = engines.get(u.id);
    if (!e) engines.set(u.id, (e = new Engine(storage, domain, { now: tick })));
    return e;
  };
  const [alena, petr, eva, vera] = users;
  await eng(alena).scan();
  await eng(alena).write(alena.signer, ROLES, 'Batch', {
    ops: DEMO_USERS.slice(1).map((u, i) => ({ type: 'GrantUser', payload: { userId: u.id, displayName: u.name, keyId: users[i + 1].keyId, publicKey: pubs[i + 1], role: u.role, verifier: u.verifier } })),
  });
  for (const u of users.slice(1)) await eng(u).scan();

  const w = async (u: DemoUser, type: string, payload: Record<string, unknown>) => {
    await eng(u).scan('quick');
    await eng(u).write(u.signer, DATA, type, payload, { allowSuperseded: true });
  };
  const tags = ['nákup', 'faktury', 'právo', 'sklad', 'IT', 'personální'];
  // The large demo (layout test) also has long tag names and many tags on each task.
  if (opts.size === 'large') tags.push('velmi dlouhý název štítku pro test', 'mezinárodní spolupráce', 'reklamace', 'kontrola kvality', 'smlouvy a dodatky', 'veřejné zakázky');
  const tagIds = tags.map((_, i) => `demo-tag-${i}`);
  await w(alena, 'Batch', { ops: tags.map((name, i) => ({ type: 'CreateTag', payload: { id: tagIds[i], name } })) });

  interface Spec {
    by: DemoUser;
    title: string;
    desc?: string;
    due?: ReturnType<typeof due> | null;
    who?: DemoUser[];
    tags?: number[];
    subs?: [string, boolean][];
    comments?: [DemoUser, string, DemoUser[]?][];
    status?: 'postponed' | 'done' | 'verified' | 'deleted';
    links?: [string, string][];
  }
  const specs: Spec[] = [
    { by: alena, title: 'Revize smlouvy s dodavatelem', desc: 'Zkontrolovat **článek 4** (platební podmínky) a přílohu č. 2.\n\n- porovnat s loňskou verzí\n- poslat připomínky právníkovi', due: due(now, -1, 14), who: [eva, petr], tags: [2, 1], subs: [['Přečíst smlouvu', true], ['Porovnat s loňskou verzí', true], ['Sepsat připomínky', false], ['Poslat právníkovi', false], ['Zapracovat odpověď', false]], comments: [[petr, 'Článek 4 je v pořádku, příloha ne.', [eva]], [eva, 'Díky, připomínky pošlu zítra.']], links: [['https://example.invalid/registr-smluv', 'Registr smluv']] },
    { by: petr, title: 'Objednat toner do tiskárny ve 2. patře', due: due(now, 1, null), tags: [0] },
    { by: eva, title: 'Inventura skladu kancelářských potřeb', desc: 'Sečíst zásoby a porovnat se stavem v tabulce.', due: due(now, 5, 9), who: [petr], tags: [3], subs: [['Papír A4', false], ['Toner', false], ['Obálky', false]] },
    { by: alena, title: 'Čtvrtletní zpráva o nákladech', due: due(now, 10, 12), who: [petr], tags: [1], status: 'done', subs: [['Data z účetnictví', true], ['Graf', true], ['Shrnutí', true], ['Kontrola', true]], comments: [[petr, 'Zpráva je hotová, prosím o kontrolu. @Věra Malá', [vera]]] },
    { by: vera, title: 'Aktualizovat seznam kontaktů dodavatelů', who: [eva], tags: [0], status: 'verified' },
    { by: petr, title: 'Přeinstalovat notebook pro novou kolegyni', due: due(now, 3, 10), who: [petr], tags: [4, 5], subs: [['Záloha dat', true], ['Instalace systému', false], ['Účty a hesla', false]] },
    { by: eva, title: 'Připravit podklady pro audit', desc: 'Auditor potřebuje smlouvy za poslední 2 roky.', due: due(now, 21, null), who: [eva, vera], tags: [1, 2] },
    { by: alena, title: 'Školení BOZP pro nové zaměstnance', tags: [5], status: 'postponed' },
    { by: petr, title: 'Vyřešit reklamaci kávovaru', who: [alena], tags: [0], comments: [[alena, 'Servis přijede ve čtvrtek.']] },
    { by: eva, title: 'Archivovat faktury za minulý rok', due: due(now, -4, 16), who: [eva], tags: [1] },
    { by: vera, title: 'Zkontrolovat platnost licencí software', due: due(now, 30, 12), who: [petr, vera], tags: [4, 2] },
    { by: alena, title: 'Návrh rozpočtu na příští rok', desc: 'První verze do konce měsíce.', due: due(now, 12, null), tags: [1] },
    { by: petr, title: 'Nahlásit poruchu klimatizace', status: 'done', who: [petr], tags: [3] },
    { by: eva, title: 'Starý úkol – zrušeno', status: 'deleted' },
    { by: alena, title: 'Doplnit směrnici o cestovních náhradách', who: [vera], tags: [2, 5], comments: [[vera, 'Návrh je ve sdílené složce.']] },
    { by: petr, title: 'Objednat vizitky pro obchodní oddělení', due: due(now, 2, 15), who: [eva], tags: [0] },
    { by: vera, title: 'Zálohovat sdílenou složku na externí disk', who: [petr], tags: [4], status: 'verified' },
    { by: eva, title: 'Uspořádat poradu týmu', due: due(now, 0, 17), who: [eva, petr, vera], tags: [5] },
  ];
  const extra = opts.size === 'large' ? 300 : 0;
  for (let i = 0; i < extra; i++)
    specs.push({ by: users[i % 4], title: `Úkol číslo ${i + 1} s poměrně dlouhým názvem, aby se ověřilo zalamování textu v kartě`, due: i % 3 ? due(now, (i % 40) - 10, 9 + (i % 8)) : null, who: [users[(i + 1) % 4], users[(i + 2) % 4]], tags: [i % 12, (i + 3) % 12, (i + 6) % 12, (i + 9) % 12] });

  for (const s of specs) {
    const id = uuidv7(clock);
    const ops: { type: string; payload: Record<string, unknown> }[] = [{ type: 'CreateTask', payload: { id, title: s.title, ...(s.desc ? { description: s.desc } : {}), ...(s.due ? { due: s.due } : {}) } }];
    for (const u of s.who ?? []) ops.push({ type: 'AddAssignee', payload: { taskId: id, userId: u.id } });
    for (const t of s.tags ?? []) ops.push({ type: 'AddTaskTag', payload: { taskId: id, tagId: tagIds[t] } });
    const keys = spreadKeys((s.subs ?? []).length);
    (s.subs ?? []).forEach(([text], j) => ops.push({ type: 'AddSubtask', payload: { id: `${id}-s${j}`, taskId: id, text, pos: keys[j] } }));
    for (const [url, title] of s.links ?? []) ops.push({ type: 'AddLink', payload: { id: `${id}-l`, taskId: id, url, title } });
    await w(s.by, 'Batch', { ops });
    for (const [j, [, done]] of (s.subs ?? []).entries()) if (done) await w(s.who?.[0] ?? s.by, 'CheckSubtask', { id: `${id}-s${j}`, done: true });
    for (const [j, [u, text, mentions]] of (s.comments ?? []).entries()) await w(u, 'AddComment', { id: `${id}-c${j}`, taskId: id, text, mentions: (mentions ?? []).map((m) => m.id) });
    const from = (s.who ?? []).length ? 'assigned' : 'new';
    if (s.status === 'postponed') await w(s.by, 'PostponeTask', { id, from });
    if (s.status === 'done' || s.status === 'verified') await w(s.who?.[0] ?? s.by, 'CompleteTask', { id, from });
    if (s.status === 'verified') await w(vera, 'VerifyTask', { id, from: 'done' });
    if (s.status === 'deleted') await w(s.by, 'DeleteTask', { id, from });
  }
  return {
    storage,
    users,
    engineFor: () => new Engine(storage, domain),
  };
}
