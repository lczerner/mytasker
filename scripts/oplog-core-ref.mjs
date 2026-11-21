#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The commit of oplog-core that this version of mytasker uses: .oplog-core-ref.
// The CI checks out exactly this commit of the repository lczerner/oplog-core.
//
//   node scripts/oplog-core-ref.mjs check    compare with ../oplog-core (HEAD, clean tree)
//   node scripts/oplog-core-ref.mjs update   write the HEAD of ../oplog-core to .oplog-core-ref
//
// "check" exits with 1 if the CODE of ../oplog-core (src/, package.json, package-lock.json,
// tsconfig.json) differs from the pinned commit, or has uncommitted changes: then the local tests
// do not test the code that the CI tests. Commits with only docs or CI files are permitted.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const mode = process.argv[2] ?? 'check';
const die = (m) => {
  console.error(`oplog-core: ${m}`);
  process.exit(1);
};
const git = (...a) => execFileSync('git', ['-C', '../oplog-core', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const CODE = ['src', 'package.json', 'package-lock.json', 'tsconfig.json'];
let head;
try {
  head = git('rev-parse', 'HEAD');
} catch {
  die('../oplog-core is missing or is not a git repository (README, "Quick start")');
}
const dirty = git('status', '--porcelain', '--', ...CODE) !== '';
if (mode === 'update') {
  if (dirty) {
    console.error('../oplog-core has uncommitted changes: commit them first.');
    process.exit(1);
  }
  writeFileSync('.oplog-core-ref', head + '\n');
  console.log(`.oplog-core-ref: ${head}`);
} else if (mode === 'check') {
  if (!existsSync('.oplog-core-ref')) die('.oplog-core-ref is missing (make oplog-core-ref)');
  const ref = readFileSync('.oplog-core-ref', 'utf8').trim();
  if (!/^[0-9a-f]{40}$/.test(ref)) die('.oplog-core-ref must contain a full 40-character commit SHA (make oplog-core-ref)');
  const problems = [];
  if (dirty) problems.push('../oplog-core has uncommitted changes in its code');
  if (ref !== head) {
    let changed = '';
    try {
      changed = git('diff', '--name-only', ref, 'HEAD', '--', ...CODE);
    } catch {
      changed = '(the pinned commit is not in ../oplog-core: git fetch there)';
    }
    if (changed) problems.push(`the code of ../oplog-core (HEAD ${head.slice(0, 12)}) differs from .oplog-core-ref ${ref.slice(0, 12)}: ${changed.split('\n').join(', ')}. Commit and push oplog-core, then run make oplog-core-ref`);
  }
  if (problems.length) {
    console.error(`oplog-core: ${problems.join('; ')}`);
    process.exit(1);
  }
  console.log(`ok: oplog-core at ${ref.slice(0, 12)} (.oplog-core-ref)`);
} else {
  console.error('usage: oplog-core-ref.mjs check|update');
  process.exit(2);
}
