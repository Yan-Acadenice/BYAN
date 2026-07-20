'use strict';

// Armed Codex-delegation guard v3 : router-obedient + pressure-gated.
// Pure decision core + async runGuard (probes injected).

const fs = require('fs');
const os = require('os');
const path = require('path');

const gate = require('../hooks/lib/codex-delegate-gate');
const { runGuard } = require('../hooks/codex-delegate-guard');

function tmpRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-cdg-')); }
function armRoot(root, { enabled = true, budget = 100000 } = {}) {
  const dir = path.join(root, '_byan', '_config');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'autodelegate.json'), JSON.stringify({ enabled, threshold: 75, budget }));
}
const userTurn = (t) => ({ role: 'user', content: t });
const asgTurn = (blocks) => ({ role: 'assistant', content: blocks });

describe('codex-delegate-gate v3 (pure core)', () => {
  test('targetIsCode : code vs doc', () => {
    expect(gate.targetIsCode('x.sh')).toBe(true);
    expect(gate.targetIsCode('README.md')).toBe(false);
  });
  test('humanOptOutFromText', () => {
    expect(gate.humanOptOutFromText('code-moi ca, reste sur claude')).toBe(true);
    expect(gate.humanOptOutFromText('code-moi un script')).toBe(false);
  });

  describe('decideDelegateGate', () => {
    const base = { armed: true, routerSaysCodex: true, targetIsCode: true, underPressure: true, delegationSeen: false, escaped: false, humanOptOut: false, codexAvailable: true };
    test('lane off -> allow', () => { expect(gate.decideDelegateGate({ ...base, armed: false }).code).toBe('lane-not-armed'); });
    test('escape switch -> allow', () => { expect(gate.decideDelegateGate({ ...base, escaped: true }).code).toBe('escape-hatch'); });
    test('human opt-out -> allow', () => { expect(gate.decideDelegateGate({ ...base, humanOptOut: true }).code).toBe('human-opt-out'); });
    test('F2 : router routes to Claude -> allow (router-claude)', () => { expect(gate.decideDelegateGate({ ...base, routerSaysCodex: false }).code).toBe('router-claude'); });
    test('doc target -> allow (not-code)', () => { expect(gate.decideDelegateGate({ ...base, targetIsCode: false }).code).toBe('not-code'); });
    test('F1 : not under pressure -> allow (no-pressure)', () => { expect(gate.decideDelegateGate({ ...base, underPressure: false }).code).toBe('no-pressure'); });
    test('Codex unavailable -> allow', () => { expect(gate.decideDelegateGate({ ...base, codexAvailable: false }).code).toBe('codex-unavailable'); });
    test('delegation already done -> allow', () => { expect(gate.decideDelegateGate({ ...base, delegationSeen: true }).code).toBe('delegation-seen'); });
    test('all conditions hold -> DENY (idempotent)', () => {
      expect(gate.decideDelegateGate(base).decision).toBe('deny');
      expect(gate.decideDelegateGate(base).decision).toBe('deny');
    });
    test('deny reason names router + pressure + human escape, forbids the excuse', () => {
      const r = gate.decideDelegateGate(base).reason;
      expect(r).toMatch(/routeur/i);
      expect(r).toMatch(/pression/i);
      expect(r).toMatch(/reste sur claude|byan-codex-autodelegate\/off/i);
      expect(r).toMatch(/n'est PAS valide/i);
    });
  });
});

describe('runGuard v3 (async, injected probes)', () => {
  const savedKey = process.env.CODEX_API_KEY;
  beforeEach(() => { process.env.CODEX_API_KEY = 'test-key'; }); // codexLinked() true
  afterEach(() => { if (savedKey === undefined) delete process.env.CODEX_API_KEY; else process.env.CODEX_API_KEY = savedKey; });

  const codexUp = () => true;
  const routerCodex = async () => true;
  const routerClaude = async () => false;
  const pressureHigh = () => true;
  const pressureLow = () => false;

  test('non Write/Edit -> allow', async () => {
    const root = tmpRoot(); armRoot(root);
    const out = await runGuard({ tool_name: 'Bash', tool_input: { command: 'ls' } }, { root });
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('armed + router=Codex + code + under pressure + Codex up + no delegation -> DENY', async () => {
    const root = tmpRoot(); armRoot(root);
    const payload = { transcript: [userTurn('code-moi un script bash'), asgTurn([])], tool_name: 'Write', tool_input: { file_path: path.join(root, 'x.sh'), content: 'echo' } };
    const out = await runGuard(payload, { root, codexProbe: codexUp, routeProbe: routerCodex, pressureProbe: pressureHigh });
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
  });

  test('F2 : router routes to Claude (refactor) -> allow', async () => {
    const root = tmpRoot(); armRoot(root);
    const payload = { transcript: [userTurn('refactor le module de securite')], tool_name: 'Write', tool_input: { file_path: path.join(root, 'x.js'), content: 'y' } };
    const out = await runGuard(payload, { root, codexProbe: codexUp, routeProbe: routerClaude, pressureProbe: pressureHigh });
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('F1 : router=Codex but NOT under pressure -> allow', async () => {
    const root = tmpRoot(); armRoot(root);
    const payload = { transcript: [userTurn('code-moi un script bash')], tool_name: 'Write', tool_input: { file_path: path.join(root, 'x.sh'), content: 'echo' } };
    const out = await runGuard(payload, { root, codexProbe: codexUp, routeProbe: routerCodex, pressureProbe: pressureLow });
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('human opt-out -> allow (probes never consulted)', async () => {
    const root = tmpRoot(); armRoot(root);
    const payload = { transcript: [userTurn('code-moi un script mais reste sur claude')], tool_name: 'Write', tool_input: { file_path: path.join(root, 'x.sh'), content: 'echo' } };
    const out = await runGuard(payload, { root, codexProbe: codexUp, routeProbe: routerCodex, pressureProbe: pressureHigh });
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('Codex unavailable -> allow (fallback)', async () => {
    const root = tmpRoot(); armRoot(root);
    const payload = { transcript: [userTurn('code-moi un script bash')], tool_name: 'Write', tool_input: { file_path: path.join(root, 'x.sh'), content: 'echo' } };
    const out = await runGuard(payload, { root, codexProbe: () => false, routeProbe: routerCodex, pressureProbe: pressureHigh });
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('lane not armed (config disabled) -> allow', async () => {
    const root = tmpRoot(); armRoot(root, { enabled: false });
    const payload = { transcript: [userTurn('code-moi un script bash')], tool_name: 'Write', tool_input: { file_path: path.join(root, 'x.sh'), content: 'echo' } };
    const out = await runGuard(payload, { root, codexProbe: codexUp, routeProbe: routerCodex, pressureProbe: pressureHigh });
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  test('doc write -> allow (not code)', async () => {
    const root = tmpRoot(); armRoot(root);
    const payload = { transcript: [userTurn('ecris la doc')], tool_name: 'Write', tool_input: { file_path: path.join(root, 'README.md'), content: '# h' } };
    const out = await runGuard(payload, { root, codexProbe: codexUp, routeProbe: routerCodex, pressureProbe: pressureHigh });
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });
});
