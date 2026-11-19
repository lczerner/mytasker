// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// End-to-end UI tests with Chromium (playwright-core). Run: npm run test:e2e
// All data is synthetic (demo mode, or a new empty OPFS folder).
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';

const DIST = resolve('dist/index.html');
const CHROMIUM = process.env.CHROMIUM ?? '/usr/bin/chromium';
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({ executablePath: CHROMIUM });
});
afterAll(async () => browser?.close());

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('request', (r) => {
    if (!/^(file|data|blob|http:\/\/127\.0\.0\.1)/.test(r.url())) errors.push(`network request: ${r.url()}`);
  });
  return errors;
}

const toastGone = (page: Page) => page.waitForSelector('.toast-error', { state: 'detached', timeout: 1 }).catch(() => undefined);

describe('demo mode over file://', () => {
  it('creates, edits, completes and verifies a task; search, table, keyboard and admin pages work', async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = watch(page);
    await page.goto(`file://${DIST}?demo=petr#/all`);
    await page.waitForSelector('.board');

    // New task with the keyboard shortcut N.
    await page.keyboard.press('n');
    await page.waitForSelector('dialog[open] h2:has-text("Nový úkol")');
    await page.fill('dialog input[type=text]', 'Připravit školení e2e');
    await page.fill('dialog input[type=date]', '2030-01-15');
    await page.check('dialog label:has-text("Eva Nová") input');
    await page.check('dialog label:has-text("faktury") input');
    await page.click('dialog button:has-text("Vytvořit")');
    await page.waitForSelector('.drawer h2:has-text("Připravit školení e2e")');
    expect(await page.textContent('.drawer .task-head .status')).toContain('Přiřazeno');
    expect(await page.textContent('.drawer .task-head')).toContain('15. 1. 2030');

    // Subtask, comment with markdown and an unsafe link.
    await page.fill('.drawer input[placeholder="Přidat podúkol"]', 'Rezervovat místnost');
    await page.press('.drawer input[placeholder="Přidat podúkol"]', 'Enter');
    await page.waitForSelector('.drawer .subtasks li:has-text("Rezervovat místnost")');
    await page.fill('.drawer textarea[placeholder^="Napsat komentář"]', '**Důležité**: viz [web](https://example.invalid/a) a [x](javascript:alert(1)) @Eva Nová');
    await page.click('.drawer button:has-text("Odeslat")');
    await page.waitForSelector('.drawer .comments strong:has-text("Důležité")');
    const hrefs = await page.$$eval('.drawer .comments a', (as) => as.map((a) => [a.getAttribute('href'), a.getAttribute('rel')]));
    expect(hrefs).toEqual([['https://example.invalid/a', 'noopener noreferrer']]);

    // Mark done: the dialog warns about the open subtask.
    await page.click('.drawer .task-head button:has-text("Hotovo")');
    await page.waitForSelector('dialog[open] .warn:has-text("1 z 1")');
    await page.click('dialog[open] button.primary');
    await page.waitForSelector('.drawer .task-head .status:has-text("Hotovo")');
    // Petr is not a verifier: no "Zkontrolováno" button.
    expect(await page.locator('.drawer .task-head button:has-text("Zkontrolováno")').count()).toBe(0);

    // Esc closes the panel. Search without diacritics. Table view.
    await page.keyboard.press('Escape');
    await page.waitForSelector('.drawer', { state: 'detached' });
    await page.keyboard.press('/');
    await page.keyboard.type('skoleni e2e');
    await page.waitForFunction(() => document.querySelectorAll('.card').length === 1);
    await page.click('.seg button:has-text("Tabulka")');
    await page.waitForSelector('table.tasks td a:has-text("Připravit školení e2e")');
    expect(await page.locator('.chips .fchip').count()).toBe(1);
    await page.click('.chips button:has-text("Zrušit filtry")');
    await page.waitForFunction(() => document.querySelectorAll('table.tasks tbody tr').length > 5);

    // Switch the demo user to Věra (verifier) and verify the task.
    await page.selectOption('.me select', 'u-vera');
    await page.waitForSelector('nav a:has-text("Ke kontrole")');
    await page.click('nav a:has-text("Ke kontrole")');
    await page.click('[data-task]:has-text("Připravit školení e2e")');
    await page.click('.drawer .task-head button:has-text("Zkontrolováno")');
    await page.waitForSelector('.drawer .task-head .status:has-text("Zkontrolováno")');
    await page.waitForSelector('.drawer .note:has-text("Měnit ho může jen správce")');

    // Admin pages (Alena) open without errors.
    await page.selectOption('.me select', 'u-alena');
    for (const p of ['users', 'enroll', 'tags', 'settings', 'checkpoints', 'trash', 'audit', 'integrity']) {
      await page.evaluate((h) => (location.hash = h), `#/admin/${p}`);
      await page.waitForSelector('main .page h1');
    }
    await page.evaluate(() => (location.hash = '#/admin/trash'));
    await page.click('.trash button:has-text("Obnovit z koše")');
    await page.waitForSelector('.trash li', { state: 'detached' });
    await toastGone(page);
    expect(errors).toEqual([]);
    await page.close();
  }, 120_000);

  it('a user without admin rights sees no admin menu and no admin page', async () => {
    const page = await browser.newPage();
    const errors = watch(page);
    await page.goto(`file://${DIST}?demo=eva#/admin/users`);
    await page.waitForSelector('main');
    expect(await page.locator('nav .side-head').count()).toBe(0);
    await page.waitForSelector('text=Tuto stránku může otevřít jen správce.');
    expect(errors).toEqual([]);
    await page.close();
  });
});

describe('real flow with a folder (OPFS instead of the native dialogs, http://127.0.0.1)', () => {
  let server: Server;
  let url = '';
  beforeAll(async () => {
    const html = readFileSync(DIST, 'utf8');
    server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const STUBS = () => {
    const opfs = () => navigator.storage.getDirectory();
    (window as any).showDirectoryPicker = async () => {
      const d = await (await opfs()).getDirectoryHandle('shared', { create: true });
      await d.getDirectoryHandle('app', { create: true });
      return d;
    };
    (window as any).showSaveFilePicker = async (o: { suggestedName: string }) => (await (await opfs()).getDirectoryHandle('personal', { create: true })).getFileHandle(o.suggestedName, { create: true });
    (window as any).showOpenFilePicker = async () => [await (await (await opfs()).getDirectoryHandle('personal', { create: true })).getFileHandle(localStorage.getItem('e2e-open') ?? '')];
  };

  it('the key file is saved first: a cancel or the shared folder is refused, and nothing is written', async () => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(STUBS);
    // The save picker: 1st call cancelled, 2nd call inside the shared folder, 3rd call in the personal folder.
    await ctx.addInitScript(() => {
      const orig = (window as any).showSaveFilePicker;
      let n = 0;
      (window as any).showSaveFilePicker = async (o: { suggestedName: string }) => {
        n++;
        if (n === 1) throw new DOMException('cancelled', 'AbortError');
        if (n === 2) return (await (await navigator.storage.getDirectory()).getDirectoryHandle('shared', { create: true })).getFileHandle(o.suggestedName, { create: true });
        return orig(o);
      };
    });
    const page = await ctx.newPage();
    const errors = watch(page);
    await page.goto(url);
    await page.click('button:has-text("Vybrat složku")');
    await page.click('button:has-text("Vytvořit novou instalaci")');
    await page.fill('label:has-text("Vaše jméno") input', 'Alena Adminová');
    await page.fill('label:has-text("alespoň 12") input', 'heslo-pro-test-1');
    await page.fill('label:has-text("Heslo znovu") input', 'heslo-pro-test-1');
    await page.click('button:has-text("Vytvořit novou instalaci")');
    await page.waitForSelector('.error:has-text("nebyl uložen")');
    const files = () =>
      page.evaluate(async () => {
        const out: string[] = [];
        const shared = await (await navigator.storage.getDirectory()).getDirectoryHandle('shared', { create: true });
        for await (const [n] of (shared as any).entries()) out.push(n);
        const app = await shared.getDirectoryHandle('app', { create: true });
        for await (const [n] of (app as any).entries()) out.push(`app/${n}`);
        return out.sort();
      });
    expect(await files()).toEqual(['app']);
    await page.click('button:has-text("Vytvořit novou instalaci")');
    await page.waitForSelector('.error:has-text("nesmí být ve sdílené složce")');
    expect(await files()).toEqual(['app']);
    await page.click('button:has-text("Vytvořit novou instalaci")');
    await page.waitForSelector('main .page h1:has-text("Všechny úkoly")');
    expect(await files()).toEqual(['app', 'app/trust-root.json']);
    expect(errors).toEqual([]);
    await ctx.close();
  }, 60_000);

  it('bootstrap of the first admin, enrollment of a user, approval with the fingerprint', async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(STUBS);
    const page = await ctx.newPage();
    const errors = watch(page);
    await page.goto(url);
    await page.click('button:has-text("Vybrat složku")');
    await page.click('button:has-text("Vytvořit novou instalaci")');
    await page.fill('label:has-text("Vaše jméno") input', 'Alena Adminová');
    await page.fill('label:has-text("alespoň 12") input', 'heslo-pro-test-1');
    await page.fill('label:has-text("Heslo znovu") input', 'heslo-pro-test-1');
    await page.click('button:has-text("Vytvořit novou instalaci")');
    await page.waitForSelector('main .page h1:has-text("Všechny úkoly")');
    await page.waitForSelector('text=Žádné úkoly.');
    await page.keyboard.press('n');
    await page.fill('dialog input[type=text]', 'První úkol');
    await page.click('dialog button:has-text("Vytvořit")');
    await page.waitForSelector('.drawer h2:has-text("První úkol")');

    // A new user on the same computer (the same OPFS): a new key and a request.
    await page.reload();
    await page.click('button:has-text("Použít jiný klíč")');
    await page.click('button:has-text("Jsem nový uživatel")');
    await page.fill('label:has-text("Vaše jméno") input', 'Petr Dvořák');
    await page.fill('label:has-text("alespoň 12") input', 'heslo-petr-12345');
    await page.fill('label:has-text("Heslo znovu") input', 'heslo-petr-12345');
    await page.click('button:has-text("Vytvořit a uložit klíč")');
    await page.waitForSelector('.fingerprint.big');
    const fp = (await page.textContent('.fingerprint.big'))!.trim();
    expect(fp).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){4}$/);

    // The admin opens the own key file and approves the request.
    await page.evaluate(() => localStorage.setItem('e2e-open', 'alena-adminova.ukoly-key.json'));
    await page.reload();
    await page.click('button:has-text("Použít jiný klíč")');
    await page.click('button:has-text("Otevřít soubor s klíčem")');
    await page.fill('input[type=password]', 'heslo-pro-test-1');
    await page.click('button:has-text("Odemknout")');
    await page.waitForSelector('main .page h1');
    await page.evaluate(() => (location.hash = '#/admin/enroll'));
    await page.waitForSelector(`.enroll .fingerprint:has-text("${fp}")`);
    await page.click('.enroll button:has-text("Schválit")');
    await page.waitForSelector('.enroll.done');

    // Petr opens his key and works.
    await page.evaluate(() => localStorage.setItem('e2e-open', 'petr-dvorak.ukoly-key.json'));
    await page.reload();
    await page.click('button:has-text("Použít jiný klíč")');
    await page.click('button:has-text("Otevřít soubor s klíčem")');
    await page.fill('input[type=password]', 'heslo-petr-12345');
    await page.click('button:has-text("Odemknout")');
    // The URL still has the admin page of the last session: Petr is not an admin.
    await page.waitForSelector('text=Tuto stránku může otevřít jen správce.');
    await page.evaluate(() => (location.hash = '#/all'));
    await page.waitForSelector('[data-task]:has-text("První úkol")');
    expect(await page.locator('nav .side-head').count()).toBe(0);

    // Petr comments on the task of Alena. Alena gets 1 notification (after her first start).
    await page.click(`[data-task]:has-text("První úkol")`);
    await page.fill('.drawer textarea[placeholder^="Napsat komentář"]', 'Hotovo zítra.');
    await page.click('.drawer button:has-text("Odeslat")');
    await page.waitForSelector('.drawer .comments li:has-text("Hotovo zítra.")');
    const unlockAlena = async () => {
      await page.evaluate(() => localStorage.setItem('e2e-open', 'alena-adminova.ukoly-key.json'));
      await page.evaluate(() => (location.hash = '#/all'));
      await page.reload();
      await page.click('button:has-text("Použít jiný klíč")');
      await page.click('button:has-text("Otevřít soubor s klíčem")');
      await page.fill('input[type=password]', 'heslo-pro-test-1');
      await page.click('button:has-text("Odemknout")');
      await page.waitForSelector('.bell[data-ready]');
    };
    await unlockAlena();
    await page.waitForSelector('.bell-n');
    expect(await page.textContent('.bell-n')).toBe('1');
    expect(await page.getAttribute('.bell button', 'aria-label')).toBe('Upozornění: 1 nepřečtené');
    await page.click('.bell button');
    await page.click('#notif-list button:has-text("Vše přečteno")');
    await page.waitForSelector('.bell-n', { state: 'detached' });
    // The read state is saved (encrypted) and stays after a new start. Wait until no save is pending.
    await page.waitForSelector('.bell[data-saved]');
    await unlockAlena();
    await page.waitForSelector('.bell[data-ready]');
    expect(await page.locator('.bell-n').count()).toBe(0);
    expect(errors).toEqual([]);
    await ctx.close();
  }, 120_000);
});
