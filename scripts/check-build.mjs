#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Build check:
//  1. dist/ contains exactly 1 file: index.html
//  2. no external URLs (http, https, ws, wss) outside an allow list of XML namespaces
//  3. the CSP meta tag is present with connect-src 'none'
//  4. Chromium opens it over file:// with no errors, and the page makes no request
//     except the file itself
//  5. THIRD-PARTY-NOTICES.md has a section "## <name> <version>" for each runtime dependency
//     (installed version), and the app contains the notices (license dialog)
//
// CHROMIUM=/path/to/chromium overrides the browser. SKIP_BROWSER=1 skips step 4 (other values do not).
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve('dist');
const fail = (m) => {
  console.error('BUILD CHECK FAILED: ' + m);
  process.exit(1);
};
const files = readdirSync(dist, { recursive: true });
if (files.length !== 1 || files[0] !== 'index.html') fail(`dist must contain only index.html, found: ${files.join(', ')}`);
const html = readFileSync(resolve(dist, 'index.html'), 'utf8');

const ALLOWED = [/^http:\/\/www\.w3\.org\//, /^http:\/\/www\.w3\.org$/];
const urls = [...html.matchAll(/\b(?:https?|wss?):\/\/[^\s"'`)<>\\]+/gi)].map((m) => m[0]);
const bad = [...new Set(urls.filter((u) => !ALLOWED.some((re) => re.test(u)) && !u.startsWith('https://example.invalid')))];
if (bad.length) fail(`external URLs found: ${bad.slice(0, 10).join(', ')}`);
if (/<script[^>]+src=/i.test(html)) fail('external <script src> found');
if (/<link[^>]+href=/i.test(html)) fail('external <link href> found');
const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
if (!csp) fail('CSP meta tag missing');
for (const d of ["connect-src 'none'", "default-src 'none'", "form-action 'none'", "base-uri 'none'"]) if (!csp[1].includes(d)) fail(`CSP lacks ${d}`);
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const notices = readFileSync('THIRD-PARTY-NOTICES.md', 'utf8');
for (const name of Object.keys(pkg.dependencies ?? {})) {
  const version = JSON.parse(readFileSync(resolve('node_modules', name, 'package.json'), 'utf8')).version;
  if (!notices.includes(`## ${name} ${version}\n`)) fail(`THIRD-PARTY-NOTICES.md lacks the section "## ${name} ${version}"`);
}
if (!html.includes('# Third-party notices')) fail('the app does not contain THIRD-PARTY-NOTICES.md');
console.log(`ok: 1 file, ${(html.length / 1024).toFixed(0)} kB, no external URLs, CSP: ${csp[1]}`);
console.log(`ok: notices for ${Object.keys(pkg.dependencies ?? {}).join(', ')}`);

if (process.env.SKIP_BROWSER === '1') process.exit(0);
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium' });
try {
  const fileUrl = 'file://' + resolve(dist, 'index.html');
  for (const [name, url, selector] of [
    ['start', fileUrl, '.gate h1'],
    ['demo', fileUrl + '?demo', '.board'],
  ]) {
    const page = await browser.newPage();
    const errors = [];
    const requests = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('request', (r) => requests.push(r.url()));
    await page.goto(url);
    await page.waitForSelector(selector, { timeout: 30_000 });
    const text = (await page.textContent(selector)).slice(0, 60);
    const external = requests.filter((u) => !u.startsWith('file://') && !u.startsWith('data:') && !u.startsWith('blob:'));
    if (errors.length) fail(`${name}: console errors: ${errors.join(' | ')}`);
    if (external.length) fail(`${name}: network requests: ${external.join(', ')}`);
    console.log(`ok: ${name} loads over file:// ("${text.trim()}"), ${requests.length} request(s), all local`);
    await page.close();
  }
} finally {
  await browser.close();
}
