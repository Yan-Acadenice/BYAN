'use strict';

// Anti-regression net for the "declared in install/package.json but NOT in the
// published root package.json" drift. Field bug (2026-07-21): the webui server
// requires `ws`, which was listed only in install/package.json (internal, not
// published). `npm i -g create-byan-agent` installs deps from the ROOT
// package.json only -> `ws` was absent -> the web wizard crashed on launch with
// MODULE_NOT_FOUND.
//
// This test walks the SHIPPED install code (the dirs listed in the root
// package.json `files[]`: install/bin, install/lib, install/src) and asserts
// every external module it require()s is declared in the root dependencies (or
// is a Node builtin). If a new external dep is added to shipped code, this fails
// until it is declared where npm will actually install it.

const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

const repoRoot = path.resolve(__dirname, '..', '..');
const rootPkg = require(path.join(repoRoot, 'package.json'));
const declared = new Set(Object.keys(rootPkg.dependencies || {}));
const builtins = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

// Only the shipped install dirs (must match root package.json files[]).
const SHIPPED_DIRS = ['install/bin', 'install/lib', 'install/src'];

function walkJsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      out.push(...walkJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

// Bare/scoped require targets, package name only (strip any subpath).
function externalRequires(source) {
  const found = new Set();
  const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const spec = m[1];
    if (spec.startsWith('.') || spec.startsWith('/')) continue; // relative/local
    const pkg = spec.startsWith('@')
      ? spec.split('/').slice(0, 2).join('/')
      : spec.split('/')[0];
    found.add(pkg);
  }
  return found;
}

describe('shipped install code — every external require is a declared root dependency', () => {
  const files = SHIPPED_DIRS.flatMap((d) => walkJsFiles(path.join(repoRoot, d)));

  test('there is shipped code to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test('no external require is missing from root package.json dependencies', () => {
    const missing = {};
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      for (const pkg of externalRequires(src)) {
        if (builtins.has(pkg) || declared.has(pkg)) continue;
        const rel = path.relative(repoRoot, file);
        (missing[pkg] = missing[pkg] || []).push(rel);
      }
    }
    expect(missing).toEqual({});
  });

  test('ws specifically is declared (the bug that motivated this test)', () => {
    expect(declared.has('ws')).toBe(true);
  });
});
