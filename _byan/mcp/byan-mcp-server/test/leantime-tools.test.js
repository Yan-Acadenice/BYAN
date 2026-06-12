import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Source-text coverage of the byan_leantime_* tool surface in server.js, same
// convention as api-tools.test.js. The business logic is unit-tested in
// leantime-sync.test.js; this file pins that every tool is BOTH declared in the
// tools array AND wired in the CallTool chain, so a half-wired tool (schema with
// no handler, or vice versa) cannot ship green. server.js opens a stdio
// transport on import, so we read it as text rather than importing it.

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverSrc = readFileSync(join(__dirname, '..', 'server.js'), 'utf8');

const LEANTIME_TOOLS = [
  'byan_leantime_ping',
  'byan_leantime_project_ensure',
  'byan_leantime_task_create',
  'byan_leantime_task_move',
  'byan_leantime_task_assign',
  'byan_leantime_task_get',
  'byan_leantime_board_get',
];

test('all 7 byan_leantime_* tools declare a schema entry', () => {
  for (const name of LEANTIME_TOOLS) {
    assert.ok(serverSrc.includes(`name: '${name}'`), `missing schema entry for ${name}`);
  }
});

test('all 7 byan_leantime_* tools have a handler branch', () => {
  for (const name of LEANTIME_TOOLS) {
    assert.ok(serverSrc.includes(`if (name === '${name}')`), `missing handler branch for ${name}`);
  }
});

test('exactly 7 byan_leantime_* schema entries registered', () => {
  const matches = serverSrc.match(/name: 'byan_leantime_[a-z_]+'/g) || [];
  assert.equal(matches.length, 7);
});

test('exactly 7 byan_leantime_* handler branches registered', () => {
  const matches = serverSrc.match(/if \(name === 'byan_leantime_[a-z_]+'\)/g) || [];
  assert.equal(matches.length, 7);
});

test('server imports the leantime-sync lib (else a fresh install crashes on boot)', () => {
  assert.ok(serverSrc.includes("from './lib/leantime-sync.js'"), 'missing import of ./lib/leantime-sync.js');
});

test('requireLeantime guard is defined and applied to the 6 mutating tools (not ping)', () => {
  assert.ok(serverSrc.includes('function requireLeantime('), 'requireLeantime() guard not defined');
  // ping is a config-status healthcheck that must report without throwing, so it
  // is the one tool that does NOT call the guard -> 6 guarded calls in handlers.
  const calls = serverSrc.match(/requireLeantime\(\);/g) || [];
  assert.equal(calls.length, 6, 'expected exactly 6 guarded leantime handlers (all but ping)');
});

test('ping handler reports config status (api_url + token_configured + enabled)', () => {
  const idx = serverSrc.indexOf("if (name === 'byan_leantime_ping')");
  assert.ok(idx !== -1, 'ping handler missing');
  const branch = serverSrc.slice(idx, idx + 700);
  assert.ok(branch.includes('token_configured'), 'ping should report token_configured');
  assert.ok(branch.includes('enabled'), 'ping should report enabled');
  assert.ok(branch.includes('LEANTIME_API_URL'), 'ping should report the configured api_url');
});
