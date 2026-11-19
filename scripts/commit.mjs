// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// The commit of a build, for the information bar (vite.config.ts) and VERSION (release.mjs).
import { execSync } from 'node:child_process';

/** Short commit of HEAD, with "-dirty" for uncommitted changes ("unknown" without git). */
export function gitCommit() {
  try {
    const c = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return execSync('git status --porcelain', { encoding: 'utf8' }).trim() ? `${c}-dirty` : c;
  } catch {
    return 'unknown';
  }
}
