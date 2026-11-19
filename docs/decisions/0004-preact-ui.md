# 0004. Preact for the UI

- Status: proposed
- Date: 2026-11-19

## Context

The task permits Preact or Svelte. The UI has many views and a side panel, so a component library helps. The bundle must be small and inline.

## Decision

Use Preact with hooks and hand-written CSS with design tokens (CSS custom properties). No UI component framework.

## Reasons

- Preact is about 4 kB (gzip). It has no compiler step except JSX in Vite.
- JSX escapes all text. This is the main protection against XSS (`docs/security-model.md`). The code never uses `dangerouslySetInnerHTML`. The Markdown renderer makes Preact nodes, not an HTML string.
- `system-vzdelavani` uses Preact. The 2 projects can share patterns and test helpers.
- Svelte compiles to small code too, but it is a second toolchain for the same owner.
