// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Layout test: no page scrolls sideways, and no content leaks out of its box,
// at 1000, 1400 and 1920 px, with normal and with wider fonts. Data: ?demo=large (synthetic).
import { resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';

const DIST = resolve('dist/index.html');
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
});
afterAll(async () => browser?.close());

const PAGES = ['#/all', '#/all?view=table', '#/mine?view=table', '#/admin/users', '#/admin/tags', '#/admin/audit', '#/admin/integrity', '#/admin/settings'];

/** Elements whose content is wider than the element, and that do not clip or scroll on purpose. */
async function leaks(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const doc = document.scrollingElement!;
    if (doc.scrollWidth > window.innerWidth + 1) out.push(`page scrolls sideways: ${doc.scrollWidth} > ${window.innerWidth}`);
    for (const el of document.querySelectorAll<HTMLElement>('.card, .drawer, .page, td, th, .col, .side a, .top, .task-head, .sec, .enroll, .chips, .filters')) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll|hidden)/.test(cs.overflowX)) continue;
      if (el.scrollWidth > el.clientWidth + 2) out.push(`${el.className || el.tagName}: ${el.scrollWidth} > ${el.clientWidth} (${(el.textContent ?? '').slice(0, 40)})`);
    }
    return out;
  });
}

describe('layout', () => {
  for (const width of [1000, 1400, 1920])
    for (const wide of [false, true])
      it(`${width} px, ${wide ? 'wider' : 'normal'} fonts`, async () => {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        await page.goto(`file://${DIST}?demo=large#/all`);
        await page.waitForSelector('.board', { timeout: 60_000 });
        if (wide) await page.addStyleTag({ content: '* { letter-spacing: 0.06em !important; }' });
        const found: string[] = [];
        for (const h of PAGES) {
          await page.evaluate((x) => (location.hash = x), h);
          await page.waitForFunction((x) => document.querySelector('main')?.getAttribute('data-route') === x, h);
          await page.waitForSelector('main .page h1');
          found.push(...(await leaks(page)).map((l) => `${h}: ${l}`));
        }
        // The task panel with a long title.
        await page.evaluate(() => (location.hash = '#/all?view=table'));
        await page.click('table.tasks tbody tr >> nth=0 >> a');
        await page.waitForSelector('.drawer h2');
        found.push(...(await leaks(page)).map((l) => `drawer: ${l}`));
        expect(found).toEqual([]);
        await page.close();
      }, 120_000);
});
