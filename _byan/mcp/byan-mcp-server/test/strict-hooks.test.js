import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
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

test('stop: a marker MENTIONED in code / an identifier / an HTML comment is not a claim (FP fix)', () => {
  const markers = ['done', 'complete'];
  // the BYAN-BENCH marker lives in an HTML comment -> mention, not a claim
  assert.equal(
    stopGuard.claimsCompletion('voici le marqueur <!-- BYAN-BENCH:done g1=2 --> puis la table', markers),
    false
  );
  // the strict tool name is a snake_case identifier -> mention, not a claim
  assert.equal(
    stopGuard.claimsCompletion('il faut appeler byan_strict_complete apres 3 passes', markers),
    false
  );
  // an inline-code span -> mention, not a claim
  assert.equal(stopGuard.claimsCompletion('le hook expose `byan_strict_complete` comme outil', markers), false);
});

test('stop: an accented marker embedded in a DIFFERENT word is not a claim (FP fix)', () => {
  assert.equal(stopGuard.claimsCompletion('un cas indéfini reste a trancher', ['fini']), false);
  assert.equal(stopGuard.claimsCompletion("j'ai déterminé la cause racine", ['terminé']), false);
  assert.equal(stopGuard.claimsCompletion('les fichiers ont ete délivrés au client', ['livré']), false);
});

test('stop: a genuine completion claim still fires, including inflected forms', () => {
  assert.equal(stopGuard.claimsCompletion("voilà, c'est terminé", ['terminé']), true);
  assert.equal(stopGuard.claimsCompletion('la feature est livrée', ['livré']), true);
  assert.equal(stopGuard.claimsCompletion('the build is complete', ['complete']), true);
});

test('stop: denoiseForClaim strips code spans, html comments and identifiers', () => {
  const out = stopGuard.denoiseForClaim('a `inline` b ```fenced``` c <!-- x --> d snake_case_id');
  assert.equal(/inline|fenced|snake_case_id/.test(out), false);
});

// --- Stop guard : payload extraction (production shape) ------------------
// The real Stop-hook payload has NO inline transcript: a last_assistant_message
// string + a transcript_path JSONL. Reading payload.transcript||messages alone
// extracted nothing in production, so the completion-claim guard never fired
// live. These tests guard the access path.

function writeTranscript(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strict-stop-'));
  const p = path.join(dir, 'transcript.jsonl');
  fs.writeFileSync(p, lines.map((o) => JSON.stringify(o)).join('\n') + '\n');
  return p;
}

test('stop/extract: last_assistant_message is used directly', () => {
  const t = stopGuard.extractLastAssistantText({ last_assistant_message: "C'est done." });
  assert.equal(t, "C'est done.");
});

test('stop/extract: transcript_path JSONL (real {type,message:{role,content}} shape) is read', () => {
  const tp = writeTranscript([
    { type: 'user', message: { role: 'user', content: 'go' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'All finished and delivered.' }] } },
  ]);
  assert.match(stopGuard.extractLastAssistantText({ transcript_path: tp }), /finished and delivered/);
});

test('stop/extract: inline transcript/messages still resolve (fixture fallback)', () => {
  assert.equal(
    stopGuard.extractLastAssistantText({ messages: [{ role: 'assistant', content: 'it is done' }] }),
    'it is done'
  );
});

test('stop/extract: empty / unreadable payload yields empty string (never throws)', () => {
  assert.equal(stopGuard.extractLastAssistantText({}), '');
  assert.equal(stopGuard.extractLastAssistantText({ transcript_path: '/no/such/file.jsonl' }), '');
  assert.equal(stopGuard.extractLastAssistantText(null), '');
});

test('stop: PRODUCTION shape (transcript_path + completion claim) -> guard fires (was inert before fix)', () => {
  const tp = writeTranscript([
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: "Voila, c'est done." }] } },
  ]);
  const text = stopGuard.extractLastAssistantText({ transcript_path: tp, stop_hook_active: false });
  const d = stopGuard.decideStop({
    state: engagedState({ passes: [{ verdict: 'ok' }] }),
    config: CONFIG,
    lastAssistantText: text,
  });
  assert.equal(d.block, true);
  assert.match(d.reason, /byan_strict_complete/);
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

test('scope: matchesPrefix handles a MID-SEGMENT glob (the byan-*/** bug)', () => {
  // The bug: ".claude/skills/byan-*/**" reduced to ".claude/skills/byan-" then
  // forced a "/" boundary, so ".claude/skills/byan-native-dev-story/SKILL.md"
  // (no "/" right after "byan-") was wrongly denied.
  assert.equal(
    scopeGuard.matchesPrefix('.claude/skills/byan-native-dev-story/SKILL.md', '.claude/skills/byan-*/**'),
    true
  );
  assert.equal(scopeGuard.matchesPrefix('.claude/skills/byan-strict/SKILL.md', '.claude/skills/byan-*/**'), true);
  // a name that does not carry the literal lead is still denied
  assert.equal(scopeGuard.matchesPrefix('.claude/skills/other-agent/SKILL.md', '.claude/skills/byan-*/**'), false);
  // boundary behavior preserved : a directory-boundary glob does NOT match a
  // sibling with the same literal lead but no separator
  assert.equal(scopeGuard.matchesPrefix('_byanX/file.js', '_byan/**'), false);
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
