import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TARGET_ADDITIONS } from '../lib/template-sync.js';

// WI review fix — the shipping parity guard. The byan-sovereignty teeth were
// initially INERT on a fresh npm install : the new hooks were not in
// TARGET_ADDITIONS and the template settings.json did not wire them. This test
// makes that class of drift CI-visible : every sovereignty hook registered in
// settings.json must be shippable (in TARGET_ADDITIONS or already a mirrored
// file), and its pure-core lib must ship too.

const testDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(testDir, '..', '..', '..', '..'); // test -> server -> mcp -> _byan -> root

// The new hooks introduced by byan-sovereignty and their pure cores — each MUST
// be in TARGET_ADDITIONS (they did not exist in the template before this FD).
const MUST_SHIP = [
  '.claude/hooks/codex-delegate-guard.js',
  '.claude/hooks/lib/codex-delegate-gate.js',
  '.claude/hooks/voice-conformance-check.js',
  '.claude/hooks/lib/voice-conformance.js',
  '_byan/mcp/byan-mcp-server/lib/armament-report.js',
  '_byan/mcp/byan-mcp-server/bin/byan-armament-report.js',
];

test('every new sovereignty file is in TARGET_ADDITIONS (shippable)', () => {
  for (const f of MUST_SHIP) {
    assert.ok(TARGET_ADDITIONS.includes(f), `${f} missing from TARGET_ADDITIONS -> would not ship`);
  }
});

test('the root settings.json wires the new hooks (parity with the shipped hooks)', () => {
  const settings = fs.readFileSync(path.join(ROOT, '.claude', 'settings.json'), 'utf8');
  // codex-delegate-guard (WI-1, PreToolUse) and voice-conformance-check (WI-2, Stop)
  assert.ok(settings.includes('codex-delegate-guard.js'), 'codex-delegate-guard not wired in settings.json');
  assert.ok(settings.includes('voice-conformance-check.js'), 'voice-conformance-check not wired in settings.json');
});

test('a wired sovereignty hook references only shippable dependencies', () => {
  // codex-delegate-guard requires codex-autodelegate + autodelegate-decision +
  // transcript-read + codex-delegate-gate ; all must be shippable so the require
  // chain resolves in a fresh install.
  const deps = [
    '.claude/hooks/codex-autodelegate.js',
    '.claude/hooks/lib/autodelegate-decision.js',
    '.claude/hooks/lib/codex-delegate-gate.js',
  ];
  for (const d of deps) {
    const mirrored = fs.existsSync(path.join(ROOT, 'install', 'templates', d));
    assert.ok(TARGET_ADDITIONS.includes(d) || mirrored, `${d} neither in TARGET_ADDITIONS nor mirrored -> broken require on fresh install`);
  }
});
