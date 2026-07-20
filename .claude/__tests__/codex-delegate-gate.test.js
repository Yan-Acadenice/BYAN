'use strict';

// WI-1 (option B, tightened) — the DENT for the armed Codex-delegation lane.
// Pure decision core + the hook runGuard. Option B removed the self-grant holes
// (content marker + resubmit/grace) ; the passes are now genuine and mostly
// human-controlled.

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
const userTurn = (text) => ({ role: 'user', content: text });
const asgTurn = (blocks) => ({ role: 'assistant', content: blocks });

describe('codex-delegate-gate (WI-1 pure core, option B)', () => {
  describe('targetIsCode', () => {
    test('code files -> true, docs/config -> false', () => {
      expect(gate.targetIsCode('archive.sh')).toBe(true);
      expect(gate.targetIsCode('.github/workflows/ci.yml')).toBe(true);
      expect(gate.targetIsCode('README.md')).toBe(false);
      expect(gate.targetIsCode('package.json')).toBe(false);
    });
  });

  describe('humanOptOutFromText (the ONLY per-turn human bypass)', () => {
    test('recognises the human staying on Claude', () => {
      expect(gate.humanOptOutFromText('code-moi ca mais reste sur Claude')).toBe(true);
      expect(gate.humanOptOutFromText('fais-le sans codex')).toBe(true);
      expect(gate.humanOptOutFromText('no codex please')).toBe(true);
    });
    test('a normal coding request is NOT an opt-out', () => {
      expect(gate.humanOptOutFromText('code-moi un script bash')).toBe(false);
      expect(gate.humanOptOutFromText('')).toBe(false);
    });
  });

  describe('delegationSeenThisTurn', () => {
    test('a codex exec / codex agent this turn counts', () => {
      expect(gate.delegationSeenThisTurn([asgTurn([{ type: 'tool_use', name: 'Bash', input: { command: 'codex exec "x"' } }])])).toBe(true);
      expect(gate.delegationSeenThisTurn([asgTurn([{ type: 'tool_use', name: 'Task', input: { subagent_type: 'codex:codex-rescue' } }])])).toBe(true);
      expect(gate.delegationSeenThisTurn([asgTurn([{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }])])).toBe(false);
    });
  });

  describe('decideDelegateGate', () => {
    const base = { armed: true, delegable: true, delegationSeen: false, escaped: false, humanOptOut: false, codexAvailable: true };
    test('lane off -> allow', () => { expect(gate.decideDelegateGate({ ...base, armed: false }).code).toBe('lane-not-armed'); });
    test('human escape switch -> allow', () => { expect(gate.decideDelegateGate({ ...base, escaped: true }).code).toBe('escape-hatch'); });
    test('human opt-out -> allow', () => { expect(gate.decideDelegateGate({ ...base, humanOptOut: true }).code).toBe('human-opt-out'); });
    test('not delegable -> allow', () => { expect(gate.decideDelegateGate({ ...base, delegable: false }).code).toBe('not-delegable'); });
    test('Codex unavailable -> allow (legit fallback)', () => { expect(gate.decideDelegateGate({ ...base, codexAvailable: false }).code).toBe('codex-unavailable'); });
    test('delegation already attempted -> allow', () => { expect(gate.decideDelegateGate({ ...base, delegationSeen: true }).code).toBe('delegation-seen'); });
    test('armed + delegable + codex available + no human signal + no delegation -> DENY', () => {
      const d = gate.decideDelegateGate(base);
      expect(d.decision).toBe('deny');
      expect(d.code).toBe('delegate-first');
    });
    test('the deny reason forbids the excuse and points to the human escape', () => {
      const r = gate.decideDelegateGate(base).reason;
      expect(r).toMatch(/codex/i);
      expect(r).toMatch(/n'est PAS une raison/i);         // the small/latency excuse is invalid
      expect(r).toMatch(/reste sur Claude|byan-codex-autodelegate\/off/i); // human escape named
    });
    test('NO self-grant hole : the same denied input stays denied (no resubmit/marker pass)', () => {
      expect(gate.decideDelegateGate(base).decision).toBe('deny');
      expect(gate.decideDelegateGate(base).decision).toBe('deny'); // idempotent deny, no memory to flip
    });
  });
});

describe('codex-delegate-guard runGuard (option B, tmp root)', () => {
  const savedKey = process.env.CODEX_API_KEY;
  beforeEach(() => { process.env.CODEX_API_KEY = 'test-key'; }); // forces codexLinked()
  afterEach(() => {
    if (savedKey === undefined) delete process.env.CODEX_API_KEY;
    else process.env.CODEX_API_KEY = savedKey;
  });
  const codexUp = () => true;   // injected probe: Codex available
  const codexDown = () => false; // injected probe: Codex unavailable

  test('non Write/Edit -> allow', () => {
    const root = tmpRoot(); armRoot(root);
    expect(runGuard({ tool_name: 'Bash', tool_input: { command: 'ls' } }, { root, codexProbe: codexUp }).hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('armed + delegable code + Codex available + no delegation -> DENY, and resubmit STAYS deny', () => {
    const root = tmpRoot(); armRoot(root);
    const payload = { transcript: [userTurn('code-moi un script'), asgTurn([])], tool_name: 'Write', tool_input: { file_path: path.join(root, 'x.sh'), content: 'echo hi' } };
    expect(runGuard(payload, { root, codexProbe: codexUp }).hookSpecificOutput.permissionDecision).toBe('deny');
    expect(runGuard(payload, { root, codexProbe: codexUp }).hookSpecificOutput.permissionDecision).toBe('deny'); // no self-dodge via resubmit
  });

  test('human opt-out in the request -> allow', () => {
    const root = tmpRoot(); armRoot(root);
    const payload = { transcript: [userTurn('code-moi un script mais reste sur Claude')], tool_name: 'Write', tool_input: { file_path: path.join(root, 'x.sh'), content: 'echo' } };
    expect(runGuard(payload, { root, codexProbe: codexUp }).hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('Codex unavailable -> allow (legit fallback to Claude)', () => {
    const root = tmpRoot(); armRoot(root);
    const payload = { transcript: [userTurn('code-moi un script')], tool_name: 'Write', tool_input: { file_path: path.join(root, 'x.sh'), content: 'echo' } };
    expect(runGuard(payload, { root, codexProbe: codexDown }).hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('escape-hatch file silences the tooth', () => {
    const root = tmpRoot(); armRoot(root);
    fs.mkdirSync(path.join(root, '.byan-codex-autodelegate'), { recursive: true });
    fs.writeFileSync(path.join(root, '.byan-codex-autodelegate', 'off'), '');
    const payload = { transcript: [userTurn('code-moi un script')], tool_name: 'Write', tool_input: { file_path: path.join(root, 'x.sh'), content: 'echo' } };
    expect(runGuard(payload, { root, codexProbe: codexUp }).hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('a real codex exec this turn -> allow (Claude applies the result)', () => {
    const root = tmpRoot(); armRoot(root);
    const payload = { transcript: [userTurn('code-moi un script'), asgTurn([{ type: 'tool_use', name: 'Bash', input: { command: 'codex exec "write it"' } }])], tool_name: 'Write', tool_input: { file_path: path.join(root, 'x.sh'), content: 'echo' } };
    expect(runGuard(payload, { root, codexProbe: codexUp }).hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('doc write (.md) is never delegable -> allow', () => {
    const root = tmpRoot(); armRoot(root);
    const payload = { transcript: [userTurn('ecris la doc')], tool_name: 'Write', tool_input: { file_path: path.join(root, 'README.md'), content: '# hi' } };
    expect(runGuard(payload, { root, codexProbe: codexUp }).hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('lane not armed (config disabled) -> allow', () => {
    const root = tmpRoot(); armRoot(root, { enabled: false });
    const payload = { transcript: [userTurn('code-moi un script')], tool_name: 'Write', tool_input: { file_path: path.join(root, 'x.sh'), content: 'echo' } };
    expect(runGuard(payload, { root, codexProbe: codexUp }).hookSpecificOutput.permissionDecision).toBe('allow');
  });
});
