// F2 — the Codex TRANSPORT, behind a clean adapter seam.
//
// Design (agreed with the user): the durable core (F1 router, F4 loop) must not
// care HOW we talk to Codex. So the transport is a swappable adapter:
//   - codex-exec  : SHIPPED. Runs `codex exec` non-interactively, read-only, and
//                   asks Codex for a unified DIFF on stdout. Codex never writes a
//                   file (works under Landlock) ; Claude applies the diff. This
//                   also keeps the verification red line: Claude, not Codex, is
//                   the one that lands and later checks the change.
//   - codex-mcp   : V2 SLOT. `codex mcp-server` exposes Codex as a callable tool
//                   for the tightest live coupling. Not wired yet — the adapter
//                   exists and honestly reports { available: false } so the loop
//                   can detect it and stay on codex-exec. It is a declared seam,
//                   not a stub pretending to work.
//
// Purity: everything that BUILDS a command or a prompt is pure and unit-tested.
// Everything that SPAWNS a process is isolated behind an injected `runner`, so
// tests exercise the bridge without ever invoking the real Codex CLI.
//
// Failure is a value, not an exception: runCodexExec returns { ok:false, reason }
// on any wire/availability/error path, so F4 can fall back to Claude (the "repli
// quand Codex sature" the user asked for) instead of crashing the loop.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CODEX_MODEL, EFFORTS, assertNoFable } from './dispatch-router.js';

export const ADAPTERS = Object.freeze({ EXEC: 'codex-exec', MCP: 'codex-mcp' });

// Codex config keys we drive via `codex exec -c key=value` (TOML values). Kept
// as named constants: if a Codex release renames one, this is the only edit.
// sandbox_permissions=["disk-full-read-access"] = read-only (from `codex --help`).
export const CODEX_CONFIG_KEYS = Object.freeze({
  MODEL: 'model',
  EFFORT: 'model_reasoning_effort',
  SANDBOX: 'sandbox_permissions',
});
const READONLY_SANDBOX_TOML = '["disk-full-read-access"]';

// wrapDiffPrompt(task) — wrap a task so Codex returns a unified diff ONLY and does
// not attempt to modify files. The read-only sandbox already blocks writes; the
// prompt makes the intent explicit so Codex emits an appliable patch, not prose.
export function wrapDiffPrompt(task) {
  const body = String(task == null ? '' : task).trim();
  return [
    'You are a delegated implementer. Do NOT modify files directly.',
    'Produce ONLY a unified diff (git apply compatible) implementing the task,',
    'between the exact markers <<<DIFF and DIFF>>>. No prose outside the markers.',
    '',
    'Task:',
    body,
  ].join('\n');
}

// extractDiff(stdout) — pull the unified diff back out of Codex stdout. Prefers
// the explicit markers from wrapDiffPrompt; falls back to the first `diff --git`
// / `---`+`+++` block so a marker-less answer is still usable. Returns '' when no
// diff is present (caller treats that as "nothing to apply").
export function extractDiff(stdout) {
  const text = String(stdout == null ? '' : stdout);
  const marked = text.match(/<<<DIFF\s*([\s\S]*?)\s*DIFF>>>/);
  if (marked) return marked[1].trim();
  const gitDiff = text.match(/(diff --git [\s\S]*)$/);
  if (gitDiff) return gitDiff[1].trim();
  return '';
}

// buildCodexExecArgs({ model, effort, prompt }) -> argv for the `codex` binary.
// Pure. Fable is refused here too (defence in depth). Effort is validated to the
// known set; the prompt is the trailing positional argument.
export function buildCodexExecArgs({ model = CODEX_MODEL, effort = EFFORTS.MEDIUM, prompt = '' } = {}) {
  assertNoFable(model);
  const effortValue = Object.values(EFFORTS).includes(effort) ? effort : EFFORTS.MEDIUM;
  return [
    'exec',
    '-c', `${CODEX_CONFIG_KEYS.MODEL}="${model}"`,
    '-c', `${CODEX_CONFIG_KEYS.EFFORT}="${effortValue}"`,
    '-c', `${CODEX_CONFIG_KEYS.SANDBOX}=${READONLY_SANDBOX_TOML}`,
    wrapDiffPrompt(prompt),
  ];
}

// buildGitApplyArgs(diffPath) -> argv for `git`. --check first is the caller's
// choice; this returns the apply form. Pure.
export function buildGitApplyArgs(diffPath) {
  return ['apply', '--whitespace=nowarn', String(diffPath)];
}

// The default process runner. Isolated so every other function stays testable
// with a fake. Returns a normalized { code, stdout, stderr } shape.
export function defaultRunner({ cmd, args = [], input = '', cwd = process.cwd(), timeoutMs = 120000 }) {
  const res = spawnSync(cmd, args, { input, cwd, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return {
    code: typeof res.status === 'number' ? res.status : (res.error ? -1 : null),
    stdout: res.stdout || '',
    stderr: res.stderr || (res.error ? String(res.error.message) : ''),
  };
}

// runCodexExec({ model, effort, prompt, cwd, runner, timeoutMs }) ->
//   { ok:true, diff, raw } | { ok:false, reason, detail }
// reason: 'unavailable' (binary missing / spawn failed) | 'error' (non-zero exit)
//         | 'empty' (ran but produced no diff). Never throws for a wire issue —
// F4 reads ok:false and falls back to Claude.
export function runCodexExec({ model = CODEX_MODEL, effort = EFFORTS.MEDIUM, prompt = '', cwd = process.cwd(), runner = defaultRunner, timeoutMs = 120000 } = {}) {
  const args = buildCodexExecArgs({ model, effort, prompt });
  let res;
  try {
    res = runner({ cmd: 'codex', args, cwd, timeoutMs });
  } catch (e) {
    return { ok: false, reason: 'unavailable', detail: String(e && e.message || e) };
  }
  if (!res || res.code == null || res.code < 0) {
    return { ok: false, reason: 'unavailable', detail: (res && res.stderr) || 'codex not runnable' };
  }
  if (res.code !== 0) {
    return { ok: false, reason: 'error', detail: res.stderr || `exit ${res.code}` };
  }
  const diff = extractDiff(res.stdout);
  if (!diff) return { ok: false, reason: 'empty', detail: 'codex produced no diff' };
  return { ok: true, diff, raw: res.stdout };
}

// applyDiff({ diff, cwd, runner }) -> { ok, detail }. Claude-side apply of the
// Codex diff via `git apply`. Writes the diff to a temp file (isolated I/O),
// runs git apply, cleans up. Guards against an empty diff.
export function applyDiff({ diff, cwd = process.cwd(), runner = defaultRunner } = {}) {
  const body = String(diff == null ? '' : diff).trim();
  if (!body) return { ok: false, detail: 'empty diff' };
  const tmp = path.join(os.tmpdir(), `byan-codex-diff-${process.pid}-${body.length}.patch`);
  try {
    fs.writeFileSync(tmp, body.endsWith('\n') ? body : body + '\n');
    const res = runner({ cmd: 'git', args: buildGitApplyArgs(tmp), cwd, timeoutMs: 30000 });
    if (res && res.code === 0) return { ok: true, detail: 'applied' };
    return { ok: false, detail: (res && res.stderr) || 'git apply failed' };
  } catch (e) {
    return { ok: false, detail: String(e && e.message || e) };
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch { /* best-effort cleanup */ }
  }
}

// probeCodex(runner) -> { available, version|reason }. A cheap liveness check the
// loop can call once before routing anything to Codex.
export function probeCodex(runner = defaultRunner) {
  let res;
  try {
    res = runner({ cmd: 'codex', args: ['--version'], timeoutMs: 8000 });
  } catch (e) {
    return { available: false, reason: String(e && e.message || e) };
  }
  if (res && res.code === 0) return { available: true, version: String(res.stdout || '').trim() };
  return { available: false, reason: (res && res.stderr) || 'codex --version failed' };
}

// getAdapter(name, { execImpl }) -> an adapter object. The exec adapter is fully
// wired; the mcp adapter is the declared V2 seam and reports available:false so
// the loop stays on exec until it is built (honest, not a fake).
export function getAdapter(name = ADAPTERS.EXEC, { execImpl = runCodexExec } = {}) {
  if (name === ADAPTERS.EXEC) {
    return { name: ADAPTERS.EXEC, available: true, run: execImpl };
  }
  if (name === ADAPTERS.MCP) {
    return {
      name: ADAPTERS.MCP,
      available: false, // V2 slot: `codex mcp-server` handshake not wired yet
      run() {
        return { ok: false, reason: 'unavailable', detail: 'codex-mcp adapter not wired (V2 slot)' };
      },
    };
  }
  throw new Error(`codex-bridge: unknown adapter "${name}"`);
}
