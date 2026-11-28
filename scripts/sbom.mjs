#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright 2026, Lukáš Czerner <lukas@czerner.cz>
// Software bill of materials (SBOM) of the installed packages (`npm ci` first, also in
// ../oplog-core), with the npm built-in `npm sbom`.
//
//   release/sbom/runtime.<ext>.json  packages that ship in app/index.html (no dev dependencies)
//   release/sbom/build.<ext>.json    all packages, including the build and test toolchain
//
// Usage: node scripts/sbom.mjs [cyclonedx|spdx] [--skip-other-oplog-core]   (default: cyclonedx)
//
// Checks (exit 1 on a failure):
//  - each runtime dependency of package.json is in the runtime SBOM,
//  - each runtime dependency has a section "## <name> <version>" in THIRD-PARTY-NOTICES.md.
//
// The runtime SBOM comes from the full CycloneDX SBOM: each dev package has the property
// cdx:npm:package:development=true, and all packages without it are runtime packages.
// oplog-core is a local link (file:../oplog-core): the SBOM lists it with the version of its
// package.json. The exact commit is in .oplog-core-ref and in the metadata of the SBOM.
// `npm sbom` refuses a link to a different folder (OPLOG_CORE_DIR, scripts/oplog-core-ref.mjs).
// Thus this script stops if node_modules/oplog-core is not a link to ../oplog-core. With
// --skip-other-oplog-core ("make check"), it writes a warning and exits with 0 in this case.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const skipOther = args.includes('--skip-other-oplog-core');
const positional = args.filter((a) => a !== '--skip-other-oplog-core');
const format = positional[0] ?? 'cyclonedx';
if (!['cyclonedx', 'spdx'].includes(format) || positional.length > 1) {
  console.error('usage: sbom.mjs [cyclonedx|spdx] [--skip-other-oplog-core]');
  process.exit(2);
}
const fail = (m) => {
  console.error(`SBOM check failed: ${m}`);
  process.exit(1);
};
let linked = null;
try {
  linked = realpathSync('node_modules/oplog-core');
} catch {}
if (linked === null) fail('node_modules/oplog-core is missing: run npm ci');
if (!existsSync('../oplog-core') || linked !== realpathSync('../oplog-core')) {
  if (skipOther) {
    console.log(`WARNING: no SBOM checks: node_modules/oplog-core links to ${linked}, not to ../oplog-core (OPLOG_CORE_DIR). npm sbom accepts only the folder of package.json. The CI runs the SBOM checks.`);
    process.exit(0);
  }
  fail(`node_modules/oplog-core links to ${linked}, not to ../oplog-core (package.json). npm sbom accepts only the folder of package.json. Run unset OPLOG_CORE_DIR, then make oplog-core-link`);
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// Not --package-lock-only: the linked oplog-core declares dev dependencies that are not in this
// lock file, and npm then refuses the lock file alone (ESBOMPROBLEMS).
const sbom = (fmt) => JSON.parse(execFileSync(npm, ['sbom', '--sbom-format', fmt], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const isDev = (c) => (c.properties ?? []).some((p) => p.name === 'cdx:npm:package:development' && p.value === 'true');

const cdx = sbom('cyclonedx');
const runtimeComps = cdx.components.filter((c) => !isDev(c));
const runtimeRefs = new Set(runtimeComps.map((c) => c['bom-ref']));
const runtimeIds = new Set(runtimeComps.map((c) => `${c.name}@${c.version}`));

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const notices = readFileSync('THIRD-PARTY-NOTICES.md', 'utf8');
for (const d of Object.keys(pkg.dependencies ?? {})) {
  const id = [...runtimeIds].find((x) => x.startsWith(`${d}@`));
  if (!id) fail(`runtime dependency ${d} is missing in the runtime SBOM`);
  const version = id.slice(d.length + 1);
  if (!notices.includes(`## ${d} ${version}\n`)) fail(`THIRD-PARTY-NOTICES.md lacks the section "## ${d} ${version}"`);
}

// The commit of oplog-core that this version uses (CI checks out exactly this commit).
const oplogRef = existsSync('.oplog-core-ref') ? readFileSync('.oplog-core-ref', 'utf8').trim() : null;

let full;
let runtime;
let ext;
if (format === 'cyclonedx') {
  ext = 'cdx';
  const props = oplogRef ? [{ name: 'mytasker:oplog-core:commit', value: oplogRef }] : [];
  full = { ...cdx, metadata: { ...cdx.metadata, properties: [...(cdx.metadata.properties ?? []), ...props] } };
  const root = cdx.metadata.component['bom-ref'];
  runtime = {
    ...full,
    // Each document has its own identifier (CycloneDX serialNumber).
    serialNumber: `urn:uuid:${randomUUID()}`,
    components: cdx.components.filter((c) => runtimeRefs.has(c['bom-ref'])),
    dependencies: (cdx.dependencies ?? [])
      .filter((d) => d.ref === root || runtimeRefs.has(d.ref))
      .map((d) => ({ ...d, dependsOn: (d.dependsOn ?? []).filter((r) => runtimeRefs.has(r)) })),
  };
} else {
  ext = 'spdx';
  full = sbom('spdx');
  if (oplogRef) full.comment = `oplog-core commit ${oplogRef}`;
  const rootIds = rootIdsOf(full);
  const keep = new Set(full.packages.filter((p) => rootIds.has(p.SPDXID) || runtimeIds.has(`${p.name}@${p.versionInfo}`)).map((p) => p.SPDXID));
  keep.add(full.SPDXID);
  runtime = {
    ...full,
    name: `${full.name} (runtime)`,
    // Each document has its own identifier (SPDX documentNamespace).
    documentNamespace: `${full.documentNamespace}-runtime`,
    packages: full.packages.filter((p) => keep.has(p.SPDXID)),
    relationships: (full.relationships ?? []).filter((r) => keep.has(r.spdxElementId) && keep.has(r.relatedSpdxElement)),
  };
}

mkdirSync('release/sbom', { recursive: true });
for (const [name, doc] of [['runtime', runtime], ['build', full]]) {
  const path = `release/sbom/${name}.${ext}.json`;
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n');
  const list = format === 'cyclonedx' ? doc.components.map((c) => `${c.name}@${c.version}`) : doc.packages.filter((p) => !rootIdsOf(doc).has(p.SPDXID)).map((p) => `${p.name}@${p.versionInfo}`);
  console.log(`${path}: ${list.length} packages${name === 'runtime' ? ` (${list.join(', ')})` : ''}`);
}

function rootIdsOf(doc) {
  return new Set((doc.relationships ?? []).filter((r) => r.relationshipType === 'DESCRIBES').map((r) => r.relatedSpdxElement));
}
