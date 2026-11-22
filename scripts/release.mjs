#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Builds the release package in release/app/: index.html, LICENSE, THIRD-PARTY-NOTICES.md, VERSION, SHA256SUMS,
// the full installation release/mytasker-<version>.zip (the folder skeleton with these files in app/),
// and the SBOMs in release/sbom/ (runtime + build, CycloneDX).
// Copy the CONTENT of release/app/ into <SharedRoot>/app/ (admins only), or extract the archive.
import { createHash } from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitCommit } from './commit.mjs';
import { zip } from './zip.mjs';

// The release and its SBOM must use exactly the pinned oplog-core code (.oplog-core-ref).
execSync('node scripts/oplog-core-ref.mjs check', { stdio: 'inherit' });
execSync('npm run build', { stdio: 'inherit' });
// The SBOMs of this release (release/sbom/), with their checks (runtime packages and notices).
execSync('node scripts/sbom.mjs cyclonedx', { stdio: 'inherit' });
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
// The same helper as the build: VERSION and the information bar show the same commit.
const commit = gitCommit();
mkdirSync('release/app', { recursive: true });
const files = ['index.html', 'LICENSE', 'THIRD-PARTY-NOTICES.md'];
copyFileSync('dist/index.html', 'release/app/index.html');
copyFileSync('LICENSE', 'release/app/LICENSE');
copyFileSync('THIRD-PARTY-NOTICES.md', 'release/app/THIRD-PARTY-NOTICES.md');
writeFileSync('release/app/VERSION', `${pkg.version} (${commit})\n`);
const sums = files.map((f) => `${createHash('sha256').update(readFileSync(`release/app/${f}`)).digest('hex')}  ${f}`);
writeFileSync('release/app/SHA256SUMS', sums.join('\n') + '\n');
console.log(`release/app: version ${pkg.version} (${commit}), sha256 ${sums[0].split(' ')[0]}`);

// The full installation: the folder skeleton of create-folders.sh, with the release files in app/.
// Only the listed files: release/app/ is not emptied, and an old or stray file (for example a
// trust-root.json of a local test) must not go into the archive.
const ROOT = 'Ukoly';
const tmp = mkdtempSync(join(tmpdir(), 'mytasker-release-'));
try {
  execFileSync('sh', ['release/create-folders.sh', join(tmp, ROOT)], { stdio: 'ignore' });
  for (const f of [...files, 'VERSION', 'SHA256SUMS']) copyFileSync(`release/app/${f}`, join(tmp, ROOT, 'app', f));
  const entries = [];
  const walk = (rel) => {
    entries.push({ name: `${rel}/` });
    for (const e of readdirSync(join(tmp, rel), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.isDirectory()) walk(`${rel}/${e.name}`);
      else entries.push({ name: `${rel}/${e.name}`, data: readFileSync(join(tmp, rel, e.name)) });
    }
  };
  walk(ROOT);
  const archive = `release/mytasker-${pkg.version}.zip`;
  writeFileSync(archive, zip(entries));
  console.log(`${archive}: ${entries.length} entries, folder ${ROOT}/`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
