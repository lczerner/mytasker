// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The commit of a build, for the information bar (vite.config.ts) and VERSION (release.mjs).
import { execFileSync, execSync } from 'node:child_process';

/** The paths that the build reads (an untracked file there makes the build "-dirty"). */
const BUILD_INPUTS = ['src', 'docs/img', 'public', 'index.html', ':(glob)*.config.*', ':(glob)tsconfig*.json', ':(glob).postcssrc*', ':(glob).env*'];

/** Short commit of HEAD, with "-dirty" for uncommitted changes of the build inputs ("unknown" without git). */
export function gitCommit() {
  try {
    const c = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    // A change of a tracked file, or an untracked file in a path that the build reads, makes the
    // build "-dirty". Other untracked files (notes or tool folders of a developer) do not count.
    // An untracked file in src/ counts: for example src/x.js shadows src/x.ts in an import without
    // an extension. docs/img/*.jpg are bundled by a glob. Vite finds config files at the root by name.
    const changed = execSync('git status --porcelain --untracked-files=no', { encoding: 'utf8' }).trim();
    const untracked = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', ...BUILD_INPUTS], { encoding: 'utf8' }).trim();
    return changed || untracked ? `${c}-dirty` : c;
  } catch {
    return 'unknown';
  }
}
