import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADAPTERS,
  CODEX_CONFIG_KEYS,
  wrapDiffPrompt,
  extractDiff,
  buildCodexExecArgs,
  buildGitApplyArgs,
  runCodexExec,
  applyDiff,
  probeCodex,
  getAdapter,
} from '../lib/codex-bridge.js';

// A fake runner factory: returns a canned result and records the call.
function fakeRunner(result) {
  const calls = [];
  const fn = (opts) => { calls.push(opts); return typeof result === 'function' ? result(opts) : result; };
  fn.calls = calls;
  return fn;
}

// --- prompt + diff extraction ---------------------------------------------

test('wrapDiffPrompt asks for a marker-delimited unified diff, no direct writes', () => {
  const p = wrapDiffPrompt('add a null check');
  assert.match(p, /Do NOT modify files/);
  assert.match(p, /<<<DIFF/);
  assert.match(p, /add a null check/);
});

test('extractDiff prefers markers, falls back to git-diff block, else empty', () => {
  assert.equal(extractDiff('noise <<<DIFF\nreal patch\nDIFF>>> tail'), 'real patch');
  assert.match(extractDiff('preamble\ndiff --git a/x b/x\n@@ -1 +1 @@'), /^diff --git/);
  assert.equal(extractDiff('no diff here'), '');
  assert.equal(extractDiff(''), '');
});

// --- command building (pure) ----------------------------------------------

test('buildCodexExecArgs carries model, effort and read-only sandbox, prompt last', () => {
  const args = buildCodexExecArgs({ model: 'gpt-5.4', effort: 'high', prompt: 'do X' });
  assert.equal(args[0], 'exec');
  assert.ok(args.includes(`${CODEX_CONFIG_KEYS.MODEL}="gpt-5.4"`));
  assert.ok(args.includes(`${CODEX_CONFIG_KEYS.EFFORT}="high"`));
  assert.ok(args.some((a) => a.startsWith(`${CODEX_CONFIG_KEYS.SANDBOX}=`)));
  assert.match(args[args.length - 1], /do X/); // prompt is the trailing positional
});

test('buildCodexExecArgs refuses Fable and normalizes an unknown effort to medium', () => {
  assert.throws(() => buildCodexExecArgs({ model: 'claude-fable-5', prompt: 'x' }), /forbidden model/);
  const args = buildCodexExecArgs({ effort: 'ultra', prompt: 'x' });
  assert.ok(args.includes(`${CODEX_CONFIG_KEYS.EFFORT}="medium"`));
});

test('buildGitApplyArgs targets the diff path', () => {
  assert.deepEqual(buildGitApplyArgs('/tmp/p.patch'), ['apply', '--whitespace=nowarn', '/tmp/p.patch']);
});

// --- runCodexExec: failure is a value -------------------------------------

test('runCodexExec returns ok + diff when the runner yields a diff', () => {
  const runner = fakeRunner({ code: 0, stdout: '<<<DIFF\npatch-body\nDIFF>>>', stderr: '' });
  const r = runCodexExec({ prompt: 'x', runner });
  assert.equal(r.ok, true);
  assert.equal(r.diff, 'patch-body');
  assert.equal(runner.calls[0].cmd, 'codex');
});

test('runCodexExec: unavailable when the runner throws or returns no code', () => {
  const thrower = () => { throw new Error('ENOENT codex'); };
  assert.deepEqual(runCodexExec({ prompt: 'x', runner: thrower }).reason, 'unavailable');
  const noCode = fakeRunner({ code: null, stdout: '', stderr: 'boom' });
  assert.equal(runCodexExec({ prompt: 'x', runner: noCode }).reason, 'unavailable');
});

test('runCodexExec: error on non-zero exit, empty when no diff produced', () => {
  const nonZero = fakeRunner({ code: 2, stdout: '', stderr: 'bad' });
  assert.equal(runCodexExec({ prompt: 'x', runner: nonZero }).reason, 'error');
  const noDiff = fakeRunner({ code: 0, stdout: 'I refuse', stderr: '' });
  assert.equal(runCodexExec({ prompt: 'x', runner: noDiff }).reason, 'empty');
});

// --- applyDiff -------------------------------------------------------------

test('applyDiff runs git apply on a non-empty diff, reports empty otherwise', () => {
  const ok = fakeRunner({ code: 0, stdout: '', stderr: '' });
  assert.equal(applyDiff({ diff: 'diff --git a/x b/x\n@@', runner: ok }).ok, true);
  assert.equal(ok.calls[0].cmd, 'git');
  assert.equal(applyDiff({ diff: '   ', runner: ok }).ok, false);
  const fail = fakeRunner({ code: 1, stdout: '', stderr: 'does not apply' });
  const r = applyDiff({ diff: 'diff --git a/x b/x', runner: fail });
  assert.equal(r.ok, false);
  assert.match(r.detail, /does not apply/);
});

// --- probe + adapters ------------------------------------------------------

test('probeCodex reports availability from the runner', () => {
  assert.deepEqual(probeCodex(fakeRunner({ code: 0, stdout: 'codex-cli 0.142.5', stderr: '' })), { available: true, version: 'codex-cli 0.142.5' });
  assert.equal(probeCodex(fakeRunner({ code: 127, stdout: '', stderr: 'not found' })).available, false);
  assert.equal(probeCodex(() => { throw new Error('nope'); }).available, false);
});

test('getAdapter: exec is wired, mcp is a declared-but-unavailable V2 slot, unknown throws', () => {
  const exec = getAdapter(ADAPTERS.EXEC);
  assert.equal(exec.available, true);
  const mcp = getAdapter(ADAPTERS.MCP);
  assert.equal(mcp.available, false);
  assert.equal(mcp.run().reason, 'unavailable');
  assert.throws(() => getAdapter('nope'), /unknown adapter/);
});

test('getAdapter exec delegates to an injected impl (so the loop can stub it)', () => {
  const exec = getAdapter(ADAPTERS.EXEC, { execImpl: () => ({ ok: true, diff: 'injected' }) });
  assert.equal(exec.run().diff, 'injected');
});
