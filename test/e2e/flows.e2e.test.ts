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

  it('the information bar shows the version, the author and the license', async () => {
    const { page, errors } = await open('eva');
    expect(await page.textContent('footer.footer')).toMatch(/Úkoly \d+\.\d+\.\d+ \(([0-9a-f]{7,}(-dirty)?|unknown)\)/);
    expect(await page.textContent('footer.footer')).toContain('© 2026 Lukáš Czerner');
    await page.click('footer.footer button:has-text("Licence MIT")');
    await page.waitForSelector('dialog[open] pre.license:has-text("MIT License")');
    // The dialog is not in the bar, so it has the normal font size of the dialogs.
    expect(await page.locator('footer.footer dialog').count()).toBe(0);
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog[open]', { state: 'detached' });
    expect(errors).toEqual([]);
    await page.close();
  });

  it('the information bar is on the start screen, and at 360 px it has 1 line and covers no content', async () => {
    const page = await browser.newPage({ viewport: { width: 360, height: 640 } });
    await page.goto(`file://${DIST}`);
    await page.waitForSelector('.gate h1');
    expect(await page.textContent('footer.footer')).toContain('Licence MIT');
    // No scrollbar on the short start screen.
    expect(await page.evaluate(() => document.scrollingElement!.scrollHeight <= window.innerHeight + 1)).toBe(true);
    await page.goto(`file://${DIST}?demo=eva#/all`);
    await page.waitForSelector('.board');
    const r = await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      const bar = document.querySelector('footer.footer')!.getBoundingClientRect();
      const last = document.querySelector('.layout')!.getBoundingClientRect();
      return { barH: bar.height, barTop: bar.top, end: last.bottom };
    });
    expect(r.barH).toBeLessThan(30);
    expect(r.end).toBeLessThanOrEqual(r.barTop + 1);
    await page.close();
  }, 60_000);

  it('notifications: the bell count, the page title, the start banner, mark as read, open a task', async () => {
    const { page, errors } = await open('vera');
    await page.waitForSelector('.bell-n');
    const n = Number(await page.textContent('.bell-n'));
    expect(n).toBeGreaterThan(2);
    expect(await page.title()).toBe(`(${n}) Úkoly`);
    expect(await page.textContent('.start-banner')).toContain('2 úkoly čekají na kontrolu');
    // The view "Ke kontrole" has a dot: a task of the view has an unread notification.
    expect(await page.locator('nav a[href="#/review"] .dot').count()).toBe(1);
    await page.click('.bell button');
    await page.waitForSelector('#notif-list li.unread');
    // A click on 1 notification opens its task and marks it as read.
    const first = page.locator('#notif-list li.unread a').first();
    const title = (await first.locator('.notif-title').textContent())!;
    await first.click();
    await page.waitForSelector(`.drawer h2:has-text("${title}")`);
    await page.waitForFunction((x) => document.querySelector('.bell-n')?.textContent === String(x), n - 1);
    await page.waitForFunction((x) => document.title === `(${x}) Úkoly`, n - 1);
    // "Vše přečteno" marks all as read; Esc closes the list and the focus goes back to the bell.
    await page.click('.bell button');
    await page.click('#notif-list button:has-text("Vše přečteno")');
    await page.waitForSelector('.bell-n', { state: 'detached' });
    await page.waitForFunction(() => document.title === 'Úkoly');
    expect(await page.locator('#notif-list li.unread').count()).toBe(0);
    await page.keyboard.press('Escape');
    await page.waitForSelector('#notif-list', { state: 'detached' });
    expect(await page.evaluate(() => document.activeElement?.closest('.bell') !== null)).toBe(true);
    // The banner closes with its ×.
    await page.click('.start-banner button');
    await page.waitForSelector('.start-banner', { state: 'detached' });
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);

  it('history and audit: Czech details, revert with its result, filters; no revert for a non-admin', async () => {
    const { page, errors } = await open('alena');
    await task(page, 'Objednat toner');
    await page.click('.drawer h2 button:has-text("Upravit")');
    await page.fill('.drawer .title-input', 'Objednat toner (opraveno)');
    await page.press('.drawer .title-input', 'Enter');
    await page.waitForSelector('.drawer h2:has-text("Objednat toner (opraveno)")');
    // The history shows the change in Czech: field, old value, new value.
    await page.click('#tab-h');
    const first = page.locator('.history > li').first();
    expect(await first.textContent()).toContain('Úprava úkolu');
    expect(await first.textContent()).toContain('Název: Objednat toner do tiskárny ve 2. patře → Objednat toner (opraveno)');
    // The detail has the table "Co / Pole / Před / Po".
    await first.locator('button.link').click();
    await page.waitForSelector('.history .change-detail table.diff td.after:has-text("Objednat toner (opraveno)")');
    // Revert: nobody changed the field since, so no warning; the title is the old one again.
    await first.locator('button:has-text("Vrátit")').click();
    await page.waitForSelector('dialog[open]:has-text("Od té doby nikdo tato pole nezměnil.")');
    await page.click('dialog[open] button.danger');
    await page.waitForSelector('.drawer h2:has-text("Objednat toner do tiskárny ve 2. patře")');
    await page.waitForFunction(() => document.querySelector('.history > li')?.textContent?.includes('Vrácení změny'));

    // The audit: the newest change first, with Czech text; the filters change the list.
    await page.evaluate(() => (location.hash = '#/admin/audit'));
    await page.waitForSelector('table.audit');
    const row = page.locator('table.audit tbody tr').first();
    expect(await row.textContent()).toContain('Vrácení změny');
    expect(await row.textContent()).toContain('Alena Adminová');
    const total = await page.locator('table.audit tbody tr').count();
    await page.selectOption('select[aria-label="Autor"]', { label: 'Věra Malá' });
    await page.waitForFunction((n) => document.querySelectorAll('table.audit tbody tr').length < n, total);
    for (const r of await page.locator('table.audit tbody tr td:nth-child(2)').allTextContents()) expect(r).toBe('Věra Malá');
    await page.selectOption('select[aria-label="Autor"]', '');
    await page.selectOption('select[aria-label="Stav"]', 'rejected');
    await page.waitForSelector('text=Žádné změny neodpovídají filtru.');
    await page.selectOption('select[aria-label="Stav"]', '');
    // The date filter: a range in the future is empty; "Do" today includes the change from a moment ago.
    await page.fill('label:has-text("Od") input[type=date]', '2099-01-01');
    await page.waitForSelector('text=Žádné změny neodpovídají filtru.');
    await page.fill('label:has-text("Od") input[type=date]', '');
    const today = await page.evaluate(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date()));
    await page.fill('label:has-text("Do") input[type=date]', today);
    await page.waitForSelector('table.audit tbody tr:first-child:has-text("Vrácení změny")');
    await page.fill('label:has-text("Do") input[type=date]', '2000-01-01');
    await page.waitForSelector('text=Žádné změny neodpovídají filtru.');
    await page.fill('label:has-text("Do") input[type=date]', '');
    // "jen tento úkol" filters by task; the chip removes the filter.
    await page.locator('table.audit tbody tr').first().locator('a:has-text("jen tento úkol")').click();
    await page.waitForSelector('.chips:has-text("Úkol: Objednat toner do tiskárny ve 2. patře")');
    expect(await page.locator('table.audit tbody tr').count()).toBeGreaterThanOrEqual(3);
    await page.click('.chips button[aria-label="Zrušit filtr úkolu"]');
    await page.waitForSelector('.chips', { state: 'detached' });
    expect(errors).toEqual([]);
    await page.close();

    // A non-admin sees the history, but no revert button.
    const eva = await open('eva');
    await task(eva.page, 'Objednat toner');
    await eva.page.click('#tab-h');
    await eva.page.waitForSelector('.history > li');
    expect(await eva.page.locator('.history button:has-text("Vrátit")').count()).toBe(0);
    expect(eva.errors).toEqual([]);
    await eva.page.close();
  }, 90_000);

  it('keyboard: the skip link, and the focus goes back to the opener after a dialog closes', async () => {
    const { page, errors } = await open('alena');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Přejít na obsah');
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('main');
    // The license dialog: Esc closes it, and the focus is on its button again.
    await page.focus('footer.footer button');
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog[open]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog[open]', { state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.closest('footer') !== null && document.activeElement?.tagName === 'BUTTON');
    // A status dialog removes its opener (the button "Hotovo"): the focus goes to the task panel.
    await task(page, 'Uspořádat poradu týmu');
    await page.waitForSelector('.drawer h2:has-text("Uspořádat poradu týmu")');
    await page.focus('.drawer .row.wrap button:has-text("Hotovo")');
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog[open]');
    await page.focus('dialog[open] button.primary');
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog[open]', { state: 'detached' });
    await page.waitForSelector('.drawer .status-done');
    await page.waitForFunction(() => document.activeElement?.closest('.drawer') !== null);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('help: ? opens the user guide, the table of contents scrolls, the admin guide is for admins only', async () => {
    const { page, errors } = await open('eva');
    await page.keyboard.press('?');
    await page.waitForSelector('.doc-body h1:has-text("Uživatelská příručka")');
    expect(page.url()).toContain('#/help');
    // A non-admin has no admin guide: no link, and the route shows the refusal.
    expect(await page.locator('nav a[href="#/help/admin"]').count()).toBe(0);
    expect(await page.locator('.help-switch').count()).toBe(0);
    await page.click('.doc-toc a:has-text("Stavy úkolu")');
    await page.waitForFunction(() => location.hash.includes('s=stavy-ukolu'));
    await page.waitForFunction(() => {
      const h = document.querySelector('[data-section="stavy-ukolu"]')!.getBoundingClientRect();
      return h.top >= 0 && h.top < 200;
    });
    await page.evaluate(() => (location.hash = '#/help/admin'));
    await page.waitForSelector('text=Tuto stránku může otevřít jen správce.');
    expect(errors).toEqual([]);
    await page.close();

    const admin = await open('alena');
    await admin.page.click('nav a[href="#/help/admin"]');
    await admin.page.waitForSelector('.doc-body h1:has-text("Příručka správce")');
    // A local link in the admin guide opens the user guide.
    await admin.page.click('.doc-body a[href="#/help"]');
    await admin.page.waitForSelector('.doc-body h1:has-text("Uživatelská příručka")');
    expect(admin.errors).toEqual([]);
    await admin.page.close();

    // The start screen: the help opens in a dialog.
    const start = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await start.goto(`file://${DIST}`);
    await start.waitForSelector('.gate h1');
    await start.click('footer button:has-text("Nápověda")');
    await start.waitForSelector('dialog[open] .doc-body h1:has-text("Uživatelská příručka")');
    await start.close();
  }, 60_000);

  it('an admin revokes a key: confirmation, "odvolán", an audit entry; no button for the own key or the root key', async () => {
    const { page, errors } = await open('alena', '#/admin/users');
    await page.waitForSelector('table');
    const row = (name: string) => page.locator('tr', { hasText: name });
    expect(await row('Alena Adminová').locator('button:has-text("Odvolat klíč")').count()).toBe(0);
    await row('Petr Dvořák').locator('button:has-text("Odvolat klíč")').click();
    await page.waitForSelector('dialog[open]:has-text("Odvolání nejde vrátit.")');
    await page.click('dialog[open] button.danger');
    await page.waitForSelector('dialog[open]', { state: 'detached' });
    await row('Petr Dvořák').locator('text=odvolán').waitFor();
    expect(await row('Petr Dvořák').locator('button:has-text("Odvolat klíč")').count()).toBe(0);
    await page.evaluate(() => (location.hash = '#/admin/audit'));
    await page.waitForSelector('table.audit tbody tr:first-child:has-text("Odvolání klíče")');
    // The cutoff keeps the earlier changes of Petr valid: none of them is rejected (a cutoff of 0 would reject all).
    await page.selectOption('select[aria-label="Autor"]', { label: 'Petr Dvořák' });
    await page.waitForFunction(() => [...document.querySelectorAll('table.audit tbody tr td:nth-child(2)')].every((td) => td.textContent === 'Petr Dvořák'));
    expect(await page.locator('table.audit tbody tr').count()).toBeGreaterThan(0);
    await page.selectOption('select[aria-label="Stav"]', 'rejected');
    await page.waitForSelector('text=Žádné změny neodpovídají filtru.');
    expect(errors).toEqual([]);
    await page.close();
  }, 60_000);
});
