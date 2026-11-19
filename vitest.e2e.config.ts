// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/e2e/**/*.e2e.test.ts'], environment: 'node', globals: true, testTimeout: 180_000, fileParallelism: false },
});
