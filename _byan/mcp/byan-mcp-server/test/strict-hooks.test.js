import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The hooks are CommonJS and live under .claude/hooks. Load them via require.
const require = createRequire(import.meta.url);
const ROOT = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const hooksDir = path.join(ROOT, '.claude', 'hooks');

const stopGuard = require(path.join(hooksDir, 'strict-stop-guard.js'));
const scopeGuard = require(path.join(hooksDir, 'strict-scope-guard.js'));
const contextInject = require(path.join(hooksDir, 'strict-context-inject.js'));

const CONFIG = {
  min_passes: 3,
  completion_claim_markers: ['done', 'finished', 'fini'],
  auto_keywords: ['prod', 'production', 'client'],
  scope_guard: { enforce_paths: true, exempt_globs: ['.byan-strict/', '_byan-output/'] },
  banners: {
    context: '[STRICT MODE ACTIVE]',
    stop_block: 'Strict mode: the turn cannot end.',
    scope_deny: 'Strict mode: outside locked scope.',
  },
};

function engagedState({ passes = [], completed = false, allowed = [] } = {}) {
  return {
    active: true,
    completed,
    scope_lock: { scope_hash: 'abc123', allowed_paths: allowed },
    self_verify_passes: passes,
  };
}

// --- Stop guard ---------------------------------------------------------

test('stop: no block when not engaged', () => {
  const d = stopGuard.decideStop({ state: null, config: CONFIG, lastAssistantText: 'done' });
  assert.equal(d.block, false);
});

test('stop: no block when engaged but no completion claim', () => {
  const d = stopGuard.decideStop({
    state: engagedState(),
    config: CONFIG,
    lastAssistantText: 'Working on it, one question for you.',
  });
  assert.equal(d.block, false);
});

test('stop: block when engaged and assistant claims done', () => {
  const d = stopGuard.decideStop({
    state: engagedState({ passes: [{ verdict: 'ok' }] }),
    config: CONFIG,
    lastAssistantText: "Voila, c'est done.",
  });
  assert.equal(d.block, true);
  assert.match(d.reason, /byan_strict_complete/);
});

test('stop: completion markers are word-bounded', () => {
  // "readiness" should not trigger the "ready" marker (not in this config but check 'done')
  assert.equal(stopGuard.claimsCompletion('abandoned the plan', ['done']), false);
  assert.equal(stopGuard.claimsCompletion('it is done now', ['done']), true);
});

// --- Scope guard --------------------------------------------------------

test('scope: allow non Write/Edit tools', () => {
  const d = scopeGuard.decideScope({
    state: engagedState({ allowed: ['src/'] }),
    config: CONFIG,
    toolName: 'Bash',
    filePath: 'whatever',
  });
  assert.equal(d.deny, false);
});

test('scope: allow when no allowed_paths declared', () => {
  const d = scopeGuard.decideScope({
    state: engagedState({ allowed: [] }),
    config: CONFIG,
    toolName: 'Write',
    filePath: 'anything.js',
  });
  assert.equal(d.deny, false);
});

test('scope: deny write outside allowed paths', () => {
  const d = scopeGuard.decideScope({
    state: engagedState({ allowed: ['src/feature/'] }),
    config: CONFIG,
    toolName: 'Write',
    filePath: 'src/other/thing.js',
  });
  assert.equal(d.deny, true);
  assert.match(d.reason, /outside the locked scope|src\/feature/);
});

test('scope: allow write inside allowed paths', () => {
  const d = scopeGuard.decideScope({
    state: engagedState({ allowed: ['src/feature/'] }),
    config: CONFIG,
    toolName: 'Edit',
    filePath: 'src/feature/thing.js',
  });
  assert.equal(d.deny, false);
});

test('scope: exempt globs are always allowed', () => {
  const d = scopeGuard.decideScope({
    state: engagedState({ allowed: ['src/feature/'] }),
    config: CONFIG,
    toolName: 'Write',
    filePath: '.byan-strict/state.json',
  });
  assert.equal(d.deny, false);
});

test('scope: matchesPrefix handles dir and exact', () => {
  assert.equal(scopeGuard.matchesPrefix('src/a/b.js', 'src/a'), true);
  assert.equal(scopeGuard.matchesPrefix('src/ab.js', 'src/a'), false);
  assert.equal(scopeGuard.matchesPrefix('src/a', 'src/a'), true);
});

test('scope: matchesPrefix is glob-tolerant (the /** bug)', () => {
  // the bug: a globbed allowed path used to match nothing -> wrongly denied
  assert.equal(scopeGuard.matchesPrefix('_byan/x/y.md', '_byan/**'), true);
  assert.equal(scopeGuard.matchesPrefix('_byan/agent/byan/byan.md', '_byan/**'), true);
  assert.equal(scopeGuard.matchesPrefix('src/a/b.test.js', 'src/**/*.test.js'), true);
  // a wildcard mid-path reduces to the literal prefix
  assert.equal(scopeGuard.matchesPrefix('_byan/bmm/agents/dev.md', '_byan/*/agents'), true);
  // outside the literal prefix is still denied
  assert.equal(scopeGuard.matchesPrefix('other/x.js', '_byan/**'), false);
  // bare wildcard matches everything; trailing slash preserved
  assert.equal(scopeGuard.matchesPrefix('anything/here.js', '**'), true);
  assert.equal(scopeGuard.matchesPrefix('_byan-output/x', '_byan-output/'), true);
});

// --- Context inject -----------------------------------------------------

test('context: injects banner + status when engaged', () => {
  const ctx = contextInject.buildContext({
    state: engagedState({ passes: [{ verdict: 'gap' }] }),
    config: CONFIG,
    prompt: 'continue',
  });
  assert.match(ctx, /STRICT MODE ACTIVE/);
  assert.match(ctx, /1\/3/);
  assert.match(ctx, /abc123/);
});

test('context: suggests strict mode on keyword when not engaged', () => {
  const ctx = contextInject.buildContext({
    state: null,
    config: CONFIG,
    prompt: 'build me a production app for a client',
  });
  assert.match(ctx, /STRICT MODE SUGGESTED/);
  assert.match(ctx, /production/);
});

test('context: empty when not engaged and no keyword', () => {
  const ctx = contextInject.buildContext({
    state: null,
    config: CONFIG,
    prompt: 'just a small question',
  });
  assert.equal(ctx, '');
});

test('context: keyword match is word-bounded', () => {
  assert.equal(contextInject.findKeyword('reproduction steps', ['prod']), null);
  assert.equal(contextInject.findKeyword('ship to prod now', ['prod']), 'prod');
});
