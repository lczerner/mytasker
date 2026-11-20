#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Makes the screenshots of the guides (docs/img/*.jpg) from the demo mode: synthetic data only.
// Run `npm run build` first. CHROMIUM=/path/to/chromium overrides the browser.
// The build bundles the images into the app (src/ui/Help.tsx), so keep them small.
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

const dist = 'file://' + resolve('dist/index.html');
const out = (n) => resolve('docs/img', n);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
const shot = async (page, name, clip) => page.screenshot({ path: out(name), type: 'jpeg', quality: 72, ...(clip ? { clip } : {}) });

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 720 } });
  // The demo of Věra (she checks tasks): the board, a task, the notifications.
  await page.goto(`${dist}?demo=vera#/all`);
  await page.waitForSelector('.board');
  await page.click('.start-banner button');
  await shot(page, 'tabule.jpg');
  await page.click('[data-task]:has-text("Čtvrtletní zpráva")');
  await page.waitForSelector('.drawer h2');
  await page.mouse.move(0, 0);
  await shot(page, 'ukol.jpg');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.drawer', { state: 'detached' });
  await page.click('.bell button');
  await page.waitForSelector('#notif-list');
  await shot(page, 'upozorneni.jpg', { x: 300, y: 0, width: 900, height: 560 });
  await page.close();

  // The admin: the users screen and the audit with an open detail.
  const admin = await browser.newPage({ viewport: { width: 1200, height: 720 } });
  await admin.goto(`${dist}?demo=alena#/admin/users`);
  await admin.waitForSelector('table');
  await admin.click('.start-banner button').catch(() => undefined);
  await shot(admin, 'uzivatele.jpg', { x: 0, y: 0, width: 1200, height: 420 });
  await admin.evaluate(() => (location.hash = '#/admin/audit'));
  await admin.waitForSelector('table.audit');
  await admin.click('table.audit tbody tr >> nth=2 >> button.link');
  await admin.waitForSelector('.change-detail');
  await shot(admin, 'audit.jpg');
  await admin.close();
  console.log('ok: docs/img/tabule.jpg, ukol.jpg, upozorneni.jpg, uzivatele.jpg, audit.jpg');
} finally {
  await browser.close();
}
