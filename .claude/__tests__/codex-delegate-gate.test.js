'use strict';

// WI-1 — the DENT for the armed Codex-delegation lane.
// Two layers : the pure decision core (deterministic) and the hook runGuard
// (tmp-root fixtures, no real repo state touched).

const fs = require('fs');
const os = require('os');
const path = require('path');

const gate = require('../hooks/lib/codex-delegate-gate');
const { runGuard } = require('../hooks/codex-delegate-guard');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-cdg-'));
}

function armRoot(root, { enabled = true } = {}) {
  const dir = path.join(root, '_byan', '_config');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'autodelegate.json'), JSON.stringify({ enabled, threshold: 80 }));
}

describe('codex-delegate-gate (WI-1 pure core)', () => {
  describe('targetIsCode', () => {
    test('code files -> true', () => {
      expect(gate.targetIsCode('archive-logs.sh')).toBe(true);
      expect(gate.targetIsCode('/x/y/foo.js')).toBe(true);
      expect(gate.targetIsCode('lib/parser.py')).toBe(true);
      expect(gate.targetIsCode('Dockerfile')).toBe(true);
      expect(gate.targetIsCode('.github/workflows/ci.yml')).toBe(true);
    });
    test('docs / config -> false (low false-positive)', () => {
      expect(gate.targetIsCode('README.md')).toBe(false);
      expect(gate.targetIsCode('package.json')).toBe(false);
      expect(gate.targetIsCode('notes.txt')).toBe(false);
      expect(gate.targetIsCode('config.yaml')).toBe(false); // non-CI yaml is config
      expect(gate.targetIsCode('')).toBe(false);
    });
  });

  describe('hasReviewedMarker', () => {
    test('marker present (any comment syntax) -> true', () => {
      expect(gate.hasReviewedMarker('#!/bin/sh\n// BYAN-DELEGATE: reviewed\n')).toBe(true);
      expect(gate.hasReviewedMarker('BYAN-DELEGATE:reviewed')).toBe(true);
    });
    test('absent -> false', () => {
      expect(gate.hasReviewedMarker('just some code')).toBe(false);
      expect(gate.hasReviewedMarker('')).toBe(false);
    });
  });

  describe('delegationSeenThisTurn', () => {
    const asg = (blocks) => [{ role: 'assistant', content: blocks }];
    test('Bash codex exec -> true', () => {
      expect(gate.delegationSeenThisTurn(asg([{ type: 'tool_use', name: 'Bash', input: { command: 'codex exec "write hello"' } }]))).toBe(true);
    });
    test('Task codex:codex-rescue -> true', () => {
      expect(gate.delegationSeenThisTurn(asg([{ type: 'tool_use', name: 'Task', input: { subagent_type: 'codex:codex-rescue' } }]))).toBe(true);
    });
    test('a plain Bash / no codex -> false', () => {
      expect(gate.delegationSeenThisTurn(asg([{ type: 'tool_use', name: 'Bash', input: { command: 'ls -la' } }]))).toBe(false);
      expect(gate.delegationSeenThisTurn([])).toBe(false);
      expect(gate.delegationSeenThisTurn(null)).toBe(false);
    });
  });

  describe('hashTurn', () => {
    test('stable for same input, differs on content', () => {
      expect(gate.hashTurn('a.sh', 'X')).toBe(gate.hashTurn('a.sh', 'X'));
      expect(gate.hashTurn('a.sh', 'X')).not.toBe(gate.hashTurn('a.sh', 'Y'));
    });
  });

  describe('decideDelegateGate', () => {
    const base = { armed: true, delegable: true, delegationSeen: false, escaped: false, reviewedMarker: false, priorDeny: null, turnHash: 'h1', now: 1000, graceMs: 120000 };
    test('not armed -> allow', () => {
      expect(gate.decideDelegateGate({ ...base, armed: false }).decision).toBe('allow');
    });
    test('escape-hatch -> allow', () => {
      expect(gate.decideDelegateGate({ ...base, escaped: true }).code).toBe('escape-hatch');
    });
    test('reviewed marker -> allow', () => {
      expect(gate.decideDelegateGate({ ...base, reviewedMarker: true }).code).toBe('reviewed-marker');
    });
    test('not delegable -> allow', () => {
      expect(gate.decideDelegateGate({ ...base, delegable: false }).code).toBe('not-delegable');
    });
    test('delegation already seen this turn -> allow (Claude applies the diff)', () => {
      expect(gate.decideDelegateGate({ ...base, delegationSeen: true }).code).toBe('delegation-seen');
    });
    test('armed + delegable + nothing done -> DENY once', () => {
      const d = gate.decideDelegateGate(base);
      expect(d.decision).toBe('deny');
      expect(d.code).toBe('delegate-first');
      expect(d.reason).toMatch(/codex/i);
    });
    test('identical resubmission after deny -> allow', () => {
      const d = gate.decideDelegateGate({ ...base, priorDeny: { hash: 'h1', ts: 1 } , turnHash: 'h1', now: 10_000_000 });
      expect(d.code).toBe('unchanged-after-deny');
    });
    test('a recent deny (grace window) lets a multi-file build proceed', () => {
      const d = gate.decideDelegateGate({ ...base, priorDeny: { hash: 'other', ts: 1000 }, turnHash: 'h2', now: 1000 + 5000 });
      expect(d.code).toBe('within-grace');
    });
    test('after the grace window, a new delegable write denies again', () => {
      const d = gate.decideDelegateGate({ ...base, priorDeny: { hash: 'other', ts: 1000 }, turnHash: 'h2', now: 1000 + 200000 });
      expect(d.decision).toBe('deny');
    });
  });
});

describe('codex-delegate-guard runGuard (hook shell, tmp root)', () => {
  const savedKey = process.env.CODEX_API_KEY;
  beforeEach(() => { process.env.CODEX_API_KEY = 'test-key'; }); // forces codexLinked() true
  afterEach(() => {
    if (savedKey === undefined) delete process.env.CODEX_API_KEY;
    else process.env.CODEX_API_KEY = savedKey;
  });

  test('non Write/Edit tool -> allow', () => {
    const root = tmpRoot();
    armRoot(root);
    const out = runGuard({ tool_name: 'Bash', tool_input: { command: 'ls' } }, { root });
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('armed + delegable code write, no delegation -> DENY, then resubmit -> allow', () => {
    const root = tmpRoot();
    armRoot(root);
    const payload = { tool_name: 'Write', tool_input: { file_path: path.join(root, 'archive.sh'), content: 'echo hi' } };
    const first = runGuard(payload, { root, now: 1000 });
    expect(first.hookSpecificOutput.permissionDecision).toBe('deny');
    // identical resubmission passes (deny-once, never a trap)
    const second = runGuard(payload, { root, now: 1000 + 500000 });
    expect(second.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('lane not armed (config disabled) -> allow', () => {
    const root = tmpRoot();
    armRoot(root, { enabled: false });
    const out = runGuard({ tool_name: 'Write', tool_input: { file_path: path.join(root, 'x.sh'), content: 'echo' } }, { root });
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('escape-hatch file silences the tooth', () => {
    const root = tmpRoot();
    armRoot(root);
    fs.mkdirSync(path.join(root, '.byan-codex-autodelegate'), { recursive: true });
    fs.writeFileSync(path.join(root, '.byan-codex-autodelegate', 'off'), '');
    const out = runGuard({ tool_name: 'Write', tool_input: { file_path: path.join(root, 'x.sh'), content: 'echo' } }, { root });
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('reviewed marker in content -> allow', () => {
    const root = tmpRoot();
    armRoot(root);
    const out = runGuard({ tool_name: 'Write', tool_input: { file_path: path.join(root, 'x.sh'), content: '// BYAN-DELEGATE: reviewed\necho' } }, { root });
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('doc write (.md) is never delegable -> allow', () => {
    const root = tmpRoot();
    armRoot(root);
    const out = runGuard({ tool_name: 'Write', tool_input: { file_path: path.join(root, 'README.md'), content: '# hi' } }, { root });
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });
});
