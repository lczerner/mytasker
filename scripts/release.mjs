#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Builds the release package in release/app/: index.html, LICENSE, THIRD-PARTY-NOTICES.md, VERSION, SHA256SUMS,
// and the SBOMs in release/sbom/ (runtime + build, CycloneDX).
// Copy the CONTENT of release/app/ into <SharedRoot>/app/ (admins only).
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gitCommit } from './commit.mjs';

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
