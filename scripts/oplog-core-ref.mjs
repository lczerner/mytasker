#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The commit of oplog-core that this version of mytasker uses: .oplog-core-ref.
// The CI checks out exactly this commit of the repository lczerner/oplog-core.
//
//   node scripts/oplog-core-ref.mjs check    compare the oplog-core folder with .oplog-core-ref
//   node scripts/oplog-core-ref.mjs update   write the HEAD of the oplog-core folder to .oplog-core-ref
//   node scripts/oplog-core-ref.mjs link     link node_modules/oplog-core to the oplog-core folder
//
// The oplog-core folder is OPLOG_CORE_DIR, relative to the root of mytasker. The default is
// ../oplog-core, the folder of package.json ("file:../oplog-core") and of the CI. Use another
// folder for local work only, for example a git worktree of oplog-core. "npm install" and
// "npm ci" link node_modules/oplog-core to ../oplog-core again. Then run "link" again.
//
// "check" exits with 1 if the CODE of the oplog-core folder (src/, package.json,
// package-lock.json, tsconfig.json) differs from the pinned commit, or has uncommitted changes:
// then the local tests do not test the code that the CI tests. Commits with only docs or CI files
// are permitted. "check" also exits with 1 if node_modules/oplog-core is not a link to the
// oplog-core folder: then the build and the tests do not use the folder that "check" checks.
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] ?? 'check';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REF = join(root, '.oplog-core-ref');
const LINK = join(root, 'node_modules', 'oplog-core');
const setting = process.env.OPLOG_CORE_DIR || '../oplog-core';
const dir = resolve(root, setting);
const name = setting === '../oplog-core' ? '../oplog-core' : `${setting} (OPLOG_CORE_DIR)`;
const die = (m) => {
  console.error(`oplog-core: ${m}`);
  process.exit(1);
};
const git = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const CODE = ['src', 'package.json', 'package-lock.json', 'tsconfig.json'];

if (!['check', 'update', 'link'].includes(mode)) {
  console.error('usage: oplog-core-ref.mjs check|update|link');
  process.exit(2);
}
let head;
let top;
try {
  head = git('rev-parse', 'HEAD');
  top = git('rev-parse', '--show-toplevel');
} catch {
  die(`${name} is missing or is not a git repository with a work tree (README, "Quick start")`);
}
if (realpathSync(top) !== realpathSync(dir)) die(`${name} is not the top folder of a git repository`);
let pkgName = null;
try {
  pkgName = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name;
} catch {}
if (pkgName !== 'oplog-core') die(`${name} is not the oplog-core repository (package.json: "name" must be "oplog-core")`);

if (mode === 'link') {
  if (!existsSync(join(root, 'node_modules'))) die('node_modules is missing: run npm ci first');
  let old = null;
  try {
    old = lstatSync(LINK);
  } catch {}
  if (old && !old.isSymbolicLink()) die(`${relative(root, LINK)} is not a link: remove it first`);
  if (old) rmSync(LINK);
  symlinkSync(dir, LINK, 'dir');
  console.log(`${relative(root, LINK)} -> ${dir}`);
  process.exit(0);
}

const dirty = git('status', '--porcelain', '--', ...CODE) !== '';
if (mode === 'update') {
  if (dirty) die(`${name} has uncommitted changes: commit them first.`);
  writeFileSync(REF, head + '\n');
  console.log(`.oplog-core-ref: ${head} (from ${name})`);
  process.exit(0);
}

// mode === 'check'
if (!existsSync(REF)) die('.oplog-core-ref is missing (make oplog-core-ref)');
const ref = readFileSync(REF, 'utf8').trim();
if (!/^[0-9a-f]{40}$/.test(ref)) die('.oplog-core-ref must contain a full 40-character commit SHA (make oplog-core-ref)');
const problems = [];
let used = null;
try {
  used = realpathSync(LINK);
} catch {}
if (used === null) problems.push(`${relative(root, LINK)} is missing: run npm ci`);
else if (used !== realpathSync(dir)) {
  problems.push(`the build uses ${used} (node_modules/oplog-core), not ${name}. Run make oplog-core-link, or set OPLOG_CORE_DIR to the folder that the build uses`);
}
if (dirty) problems.push(`${name} has uncommitted changes in its code`);
if (ref !== head) {
  let changed = '';
  try {
    changed = git('diff', '--name-only', ref, 'HEAD', '--', ...CODE);
  } catch {
    changed = `(the pinned commit is not in ${name}: git fetch there)`;
  }
  if (changed) problems.push(`the code of ${name} (HEAD ${head.slice(0, 12)}) differs from .oplog-core-ref ${ref.slice(0, 12)}: ${changed.split('\n').join(', ')}. Commit and push oplog-core, then run make oplog-core-ref`);
}
if (problems.length) die(problems.join('; '));
console.log(`ok: oplog-core at ${ref.slice(0, 12)} (.oplog-core-ref) in ${name}`);
