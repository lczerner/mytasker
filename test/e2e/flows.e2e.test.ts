// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// More UI flows in the demo (synthetic data): attachments, dialogs, delete rules,
// tags, subtasks and the panel state after a switch to another task.
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';

const DIST = resolve('dist/index.html');
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
});
afterAll(async () => browser?.close());

async function open(user: string, hash = '#/all'): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`file://${DIST}?demo=${user}${hash}`);
  await page.waitForSelector('main .page h1');
  return { page, errors };
}
const task = (page: Page, title: string) => page.click(`[data-task]:has-text("${title}")`);
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fe0def46b80000000049454e44ae426082', 'hex');

describe('more flows (demo over file://)', () => {
  it('attachments: allowed file, blocked HTML, PNG thumbnail, safe download name', async () => {
    const { page, errors } = await open('petr');
    await task(page, 'Objednat toner');
    await page.setInputFiles('.drawer input[type=file]', { name: 'objednavka.txt', mimeType: 'text/plain', buffer: Buffer.from('obsah') });
    await page.waitForSelector('.drawer .files li:has-text("objednavka.txt")');
    await page.setInputFiles('.drawer input[type=file]', { name: 'stranka.HTML', mimeType: 'text/html', buffer: Buffer.from('<script>x</script>') });
    await page.waitForSelector('.toast-error:has-text("nelze přiložit")');
    expect(await page.locator('.drawer .files li:has-text("stranka")').count()).toBe(0);
    await page.setInputFiles('.drawer input[type=file]', { name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForSelector('.drawer .files img.thumb');
    await page.setInputFiles('.drawer input[type=file]', { name: 'skript.js', mimeType: 'text/javascript', buffer: Buffer.from('alert(1)') });
    await page.waitForSelector('.drawer .files li:has-text("skript.js")');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.drawer .files li:has-text("skript.js") button:has-text("Stáhnout")')]);
    expect(dl.suggestedFilename()).toBe('skript.js.txt');
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it('dialogs: return with a reason, resume, reopen and delete; delete rules', async () => {
    // Věra returns the done report with a reason.
    let { page, errors } = await open('vera');
    await task(page, 'Čtvrtletní zpráva o nákladech');
    await page.waitForSelector('.drawer h2:has-text("Čtvrtletní zpráva")');
    await page.click('.drawer .task-head button:has-text("Vrátit k přepracování")');
    await page.fill('dialog[open] textarea', 'Chybí srovnání s minulým rokem.');
    await page.click('dialog[open] button.primary');
    await page.waitForSelector('.drawer .task-head .status:has-text("Přiřazeno")');
    await page.waitForSelector('.drawer .comments li.return:has-text("Chybí srovnání")');
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
    await page.close();

    ({ page, errors } = await open('alena'));
    // Resume a postponed task with a new due date.
    await task(page, 'Školení BOZP');
    await page.click('.drawer .task-head button:has-text("Pokračovat")');
    await page.fill('dialog[open] input[type=date]', '2030-02-01');
    await page.click('dialog[open] button.primary');
    await page.waitForSelector('.drawer .task-head .status:has-text("Nový")');
    expect(await page.textContent('.drawer .task-head')).toContain('1. 2. 2030');
    await page.keyboard.press('Escape');
    // An admin reopens a verified task (verified tasks are hidden by default: switch them on).
    await page.check('label.toggle input');
    await task(page, 'Aktualizovat seznam kontaktů');
    await page.click('.drawer .task-head button:has-text("Znovu otevřít")');
    await page.waitForSelector('.drawer .task-head .status:has-text("Přiřazeno")');
    // An admin deletes a task after the confirmation.
    await page.click('.drawer .task-head button:has-text("Smazat")');
    await page.click('dialog[open] button:has-text("Smazat")');
    await page.waitForSelector('.drawer', { state: 'detached' });
    expect(await page.locator('[data-task]:has-text("Aktualizovat seznam kontaktů")').count()).toBe(0);
    expect(errors).toEqual([]);
    await page.close();

    // Eva: no "Smazat" on the task of Petr; "Smazat" on her own task.
    ({ page, errors } = await open('eva'));
    await task(page, 'Objednat toner');
    await page.waitForSelector('.drawer h2:has-text("Objednat toner")');
    await page.waitForSelector('.drawer .task-head button:has-text("Odložit")');
    expect(await page.locator('.drawer .task-head button:has-text("Smazat")').count()).toBe(0);
    await page.keyboard.press('Escape');
    await task(page, 'Inventura skladu');
    await page.waitForSelector('.drawer h2:has-text("Inventura skladu")');
    await page.waitForSelector('.drawer .task-head button:has-text("Smazat")');
    expect(errors).toEqual([]);
    await page.close();

    // Petr created "Nahlásit poruchu…" (done). After Věra verifies it, Petr cannot delete it.
    ({ page, errors } = await open('vera'));
    await task(page, 'Nahlásit poruchu klimatizace');
    await page.click('.drawer .task-head button:has-text("Zkontrolováno")');
    await page.waitForSelector('.drawer .task-head .status:has-text("Zkontrolováno")');
    // The URL keeps the open task: after the switch, Petr sees the same panel.
    await page.selectOption('.me select', 'u-petr');
    await page.waitForSelector('.drawer h2:has-text("Nahlásit poruchu klimatizace")');
    await page.waitForSelector('.drawer .task-head .status:has-text("Zkontrolováno")');
    expect(await page.locator('.drawer .task-head button:has-text("Smazat")').count()).toBe(0);
    expect(errors).toEqual([]);
    await page.close();
  }, 120_000);

  it('a new tag from the picker, a subtask move, and the panel state after a switch to another task', async () => {
    const { page, errors } = await open('eva');
    await task(page, 'Revize smlouvy');
    await page.click('.drawer button:has-text("Přidat štítek")');
    await page.fill('.drawer .picker input', 'Dodavatelé e2e');
    await page.press('.drawer .picker input', 'Enter');
    await page.waitForSelector('.drawer .tag:has-text("Dodavatelé e2e")');
    // Move the first subtask 1 place down.
    const first = (await page.textContent('.drawer .subtasks li >> nth=0'))!.trim();
    await page.click('.drawer .subtasks li >> nth=0 >> button[aria-label="Posunout dolů"]');
    await page.waitForFunction((t) => document.querySelectorAll('.drawer .subtasks li')[1]?.textContent?.includes(t), first.slice(0, 12));
    // Open the due editor, then switch to another task: the editor must not keep the date of the first task.
    await page.click('.drawer .task-head button.link.small:near(:text("Termín"))');
    await page.waitForSelector('.drawer input[type=date]');
    await page.evaluate(() => {
      const card = document.querySelector<HTMLAnchorElement>('[data-task]:not(.card.overdue)');
      location.hash = card!.getAttribute('href')!;
    });
    await page.waitForFunction(() => !document.querySelector('.drawer input[type=date]'));
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it('keyboard and state details: Esc in a field, double submit, search history, focus back, settings draft', async () => {
    const { page, errors } = await open('alena');
    await task(page, 'Objednat toner');
    await page.waitForSelector('.drawer h2:has-text("Objednat toner")');
    // Esc in a text field leaves the field and keeps the panel and the draft.
    await page.fill('.drawer textarea[placeholder^="Napsat komentář"]', 'Rozepsaný komentář');
    await page.focus('.drawer textarea[placeholder^="Napsat komentář"]');
    await page.keyboard.press('Escape');
    expect(await page.locator('.drawer').count()).toBe(1);
    expect(await page.inputValue('.drawer textarea[placeholder^="Napsat komentář"]')).toBe('Rozepsaný komentář');
    // 2 submits in the same tick write 1 comment (the busy guard reads a ref, not a stale state value).
    await page.evaluate(() => {
      const f = document.querySelector<HTMLFormElement>('.drawer textarea[placeholder^="Napsat komentář"]')!.form!;
      f.requestSubmit();
      f.requestSubmit();
    });
    await page.waitForSelector('.drawer .comments li:has-text("Rozepsaný komentář")');
    await page.waitForTimeout(500);
    expect(await page.locator('.drawer .comments li:has-text("Rozepsaný komentář")').count()).toBe(1);
    // Esc outside a field closes the panel, and the focus goes back to the card.
    await page.click('.drawer h2');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.drawer', { state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.closest('[data-task]')?.textContent?.includes('Objednat toner'));
    // The search replaces the history entry: no new entry for each character.
    const before = await page.evaluate(() => history.length);
    await page.keyboard.press('/');
    await page.keyboard.type('toner');
    expect(await page.evaluate(() => history.length)).toBe(before);
    // The settings form keeps an unsaved value when the data changes.
    await page.evaluate(() => (location.hash = '#/admin/settings'));
    await page.fill('label:has-text("dny předem") input', '7');
    await page.click('button[aria-label="Načíst změny"]');
    await page.waitForTimeout(300);
    expect(await page.inputValue('label:has-text("dny předem") input')).toBe('7');
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it('verified tasks are hidden by default; the switch or the status filter shows them', async () => {
    const { page, errors } = await open('alena');
    const cards = () => page.locator('[data-task]').count();
    expect(await page.locator('.col-verified').count()).toBe(0);
    expect(await page.locator('[data-task]:has-text("Aktualizovat seznam kontaktů")').count()).toBe(0);
    const hidden = Number((await page.textContent('label.toggle'))!.match(/\((\d+)\)/)![1]);
    expect(hidden).toBe(2);
    const before = await cards();
    const sidebar = Number((await page.textContent('nav a[href="#/all"] .badge'))!.trim());
    expect(sidebar).toBe(before);
    await page.check('label.toggle input');
    await page.waitForSelector('.col-verified');
    expect(await cards()).toBe(before + 2);
    expect(page.url()).toContain('verified=1');
    // N counts only the verified tasks that match the other filters, in both states of the switch.
    await page.fill('input[type=search]', 'kontaktu');
    await page.waitForFunction(() => document.querySelectorAll('[data-task]').length === 1);
    expect(await page.textContent('label.toggle')).toContain('(1)');
    await page.uncheck('label.toggle input');
    await page.waitForFunction(() => document.querySelectorAll('[data-task]').length === 0);
    expect(await page.textContent('label.toggle')).toContain('(1)');
    await page.click('.chips button:has-text("Zrušit filtry")');
    // The status filter "Zkontrolováno" alone shows only the verified tasks.
    await page.click('summary:has-text("Stav")');
    await page.check('.dd-menu label:has-text("Zkontrolováno") input');
    await page.waitForFunction(() => document.querySelectorAll('[data-task]').length === 2);
    expect(await page.locator('label.toggle').count()).toBe(0);
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it('a click outside the panel closes it; a card opens another task; unsaved text keeps the panel', async () => {
    const { page, errors } = await open('alena');
    await task(page, 'Objednat toner');
    await page.waitForSelector('.drawer h2:has-text("Objednat toner")');
    // A click on another card opens that task.
    await task(page, 'Inventura skladu');
    await page.waitForSelector('.drawer h2:has-text("Inventura skladu")');
    // A click on an empty place of the page closes the panel.
    await page.mouse.click(300, 860);
    await page.waitForSelector('.drawer', { state: 'detached' });
    // Unsaved text: the panel stays open and a message explains why.
    await task(page, 'Inventura skladu');
    await page.fill('.drawer textarea[placeholder^="Napsat komentář"]', 'Rozepsáno');
    await page.mouse.click(300, 860);
    await page.waitForSelector('.toast:has-text("neuložená změna")');
    expect(await page.locator('.drawer').count()).toBe(1);
    // The × still closes it.
    await page.click('.drawer-x');
    await page.waitForSelector('.drawer', { state: 'detached' });
    // A selection that starts in the panel and ends outside does not close it.
    await task(page, 'Objednat toner');
    const h = (await page.locator('.drawer h2').boundingBox())!;
    await page.mouse.move(h.x + 5, h.y + 5);
    await page.mouse.down();
    await page.mouse.move(300, 860);
    await page.mouse.up();
    expect(page.url()).toContain('task=');
    // A keyboard click on "Upravit" of the due date keeps the panel open (and no message).
    await page.focus('.drawer .task-head p.row button.link');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.drawer input[type=date]');
    expect(page.url()).toContain('task=');
    // An editor that is open but not changed is not unsaved: a click outside closes the panel.
    await page.click('.drawer h2 button:has-text("Upravit")');
    await page.waitForSelector('.drawer .title-input');
    await page.mouse.click(300, 860);
    await page.waitForSelector('.drawer', { state: 'detached' });
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);
});
