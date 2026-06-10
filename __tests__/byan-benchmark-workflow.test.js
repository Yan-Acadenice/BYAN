// C5c - byan-benchmark native workflow + orchestrating skill wiring.
//
// The contract validator (validateContract) lives in the ESM-only MCP package
// (_byan/mcp/byan-mcp-server, type: module, run via `node --test`). The ROOT
// jest suite is CommonJS with no ESM transform, so importing that module here
// would fail. Instead this test re-asserts the same contract rules inline
// (meta-literal first, no clock/RNG token, haiku only on labelled exploration
// leaves) so the coverage is self-contained and honest in this runner. The ESM
// linter (byan-lint-workflows.js) is the authoritative gate and runs in the
// pre-commit hook; this test is the fast root-suite guard against regressions.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW = path.join(ROOT, '.claude', 'workflows', 'byan-benchmark.js');
const SKILL = path.join(ROOT, '.claude', 'skills', 'byan-benchmark', 'SKILL.md');
const FALLBACK = path.join(ROOT, '_byan', 'workflow', 'simple', 'bmb', 'byan-benchmark', 'workflow.md');

// Strip /* block */ and // line comments, preserving "://" inside strings.
// Mirrors workflows-lint.js stripComments so the inline checks match the gate.
function stripComments(src) {
  let s = String(src).replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  return s;
}

describe('byan-benchmark native workflow - file + contract', () => {
  let src;
  beforeAll(() => {
    src = fs.readFileSync(WORKFLOW, 'utf8');
  });

  test('the script exists and parses (node --check)', () => {
    expect(fs.existsSync(WORKFLOW)).toBe(true);
    // node --check is the syntax gate the linter also runs; throws on parse error.
    expect(() => execFileSync('node', ['--check', WORKFLOW], { stdio: 'pipe' })).not.toThrow();
  });

  test('first real line is the pure meta literal `export const meta = {`', () => {
    const firstReal = src
      .replace(/^﻿/, '')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0 && !l.startsWith('#!'));
    expect(firstReal).toMatch(/^export const meta\s*=\s*\{/);
  });

  test('meta declares name=byan-benchmark, a description, and 4 phases', () => {
    expect(src).toMatch(/name:\s*'byan-benchmark'/);
    expect(src).toMatch(/description:\s*'DATA-only benchmark engine/);
    for (const ph of ['RECON', 'SOURCE', 'JUDGE', 'RECOMMEND']) {
      expect(src).toContain(`title: '${ph}'`);
    }
  });

  test('raw source contains no clock/RNG token (resume-safety, scanned in raw text)', () => {
    // The launch validator scans RAW text - even comments and strings. So this
    // checks the raw source, not the comment-stripped one (matches the gate).
    expect(/Date\.now|Math\.random|new Date/.test(src)).toBe(false);
  });

  test('does not couple to FD/strict state internals (no fd-state / strict-mode import)', () => {
    const code = stripComments(src);
    expect(/from\s*['"][^'"]*fd-state[^'"]*['"]/.test(code)).toBe(false);
    expect(/require\s*\(\s*['"][^'"]*fd-state[^'"]*['"]\s*\)/.test(code)).toBe(false);
    expect(/['"][^'"]*lib\/strict-mode[^'"]*['"]/.test(code)).toBe(false);
  });

  test("every model downgrade sits on a label classified EXPLORATION (no protected-leaf downgrade)", () => {
    const code = stripComments(src);
    // Protected keyword sets beat exploration (mirrors native-tiers.classifyLeaf).
    const VERIFICATION = ['verify', 'validate', 'check', 'assert', 'gate', 'lint', 'audit', 'review'];
    const ANALYSIS = ['analy', 'design', 'architect', 'assess', 'evaluate', 'strategy', 'risk', 'nfr', 'recommend', 'judge', 'score', 'coverage'];
    const IMPLEMENTATION = ['implement', 'build', 'write', 'generate', 'create', 'dev', 'rgr', 'refactor', 'fix', 'scaffold', 'save', 'optimize', 'aggregate', 'report', 'present', 'plan', 'map', 'select', 'subprocess', 'sub-'];
    const EXPLORATION = ['load', 'read', 'scan', 'list', 'parse', 'detect', 'discover', 'fetch', 'lookup', 'source-tree', 'mode-detection'];
    const isExploration = (label) => {
      const l = String(label).toLowerCase();
      if (VERIFICATION.some((k) => l.includes(k))) return false;
      if (ANALYSIS.some((k) => l.includes(k))) return false;
      if (IMPLEMENTATION.some((k) => l.includes(k))) return false;
      return EXPLORATION.some((k) => l.includes(k));
    };

    const MODEL_RE = /\bmodel:\s*(['"`])([^'"`]*)\1/g;
    const LABEL_RE = /\blabel:\s*(['"`])([^'"`]*)\1/g;
    const nearestLabel = (idx) => {
      const before = code.slice(0, idx);
      let last = null;
      let mm;
      LABEL_RE.lastIndex = 0;
      while ((mm = LABEL_RE.exec(before))) last = { value: mm[2], end: mm.index + mm[0].length };
      if (!last) return null;
      // Same opts object only: an object-close between label and model disqualifies it.
      if (before.slice(last.end).includes('}')) return null;
      return last.value;
    };

    let m;
    let downgradeLeaves = 0;
    MODEL_RE.lastIndex = 0;
    while ((m = MODEL_RE.exec(code))) {
      const model = m[2];
      // Only 'haiku'/'sonnet' are downgrade tiers; we never pin up to 'opus'.
      expect(['haiku', 'sonnet']).toContain(model);
      const label = nearestLabel(m.index);
      expect(label).toBeTruthy();
      expect(isExploration(label)).toBe(true);
      downgradeLeaves += 1;
    }
    // The engine downgrades RECON + the per-option SOURCE leaves; expect >=1.
    expect(downgradeLeaves).toBeGreaterThanOrEqual(1);
  });

  test('JUDGE / RECOMMEND leaves carry NO opts.model (analysis stays deep)', () => {
    const code = stripComments(src);
    // Locate the judge-score and recommend-rank labels; the same opts object
    // must not also carry a model: key (would be a downgrade on an analysis leaf).
    for (const protectedLabel of ['judge-score', 'recommend-rank']) {
      const idx = code.indexOf(protectedLabel);
      expect(idx).toBeGreaterThan(-1);
      // Scan from this label to the end of its opts object (first `}` after it).
      const tail = code.slice(idx);
      const objEnd = tail.indexOf('}');
      const optsSlice = objEnd === -1 ? tail : tail.slice(0, objEnd);
      expect(/\bmodel:\s*['"`]/.test(optsSlice)).toBe(false);
    }
  });

  test('documents the DATA return shape (matrix / recommendation / dissent / needsHumanGate)', () => {
    expect(src).toMatch(/workflow:\s*'byan-benchmark'/);
    expect(src).toContain('matrix:');
    expect(src).toContain('recommendation:');
    expect(src).toContain('dissent:');
    expect(src).toContain('needsHumanGate: true');
    // confidence verb contract is encoded as an enum in the recommend schema.
    expect(src).toMatch(/enum:\s*\['assertive',\s*'lean'\]/);
    // degenerate / obvious-default collapse path is present (skip marker source).
    expect(src).toContain('degenerate: true');
  });
});

describe('byan-benchmark skill + dual-path wiring', () => {
  test('SKILL.md exists with name=byan-benchmark frontmatter and launches the native workflow', () => {
    expect(fs.existsSync(SKILL)).toBe(true);
    const skill = fs.readFileSync(SKILL, 'utf8');
    expect(skill).toMatch(/^---[\s\S]*?\nname:\s*byan-benchmark\b/);
    expect(skill).toMatch(/description:\s*.+/);
    // Conductor must reference the native engine and the Workflow tool launch.
    expect(skill).toContain('.claude/workflows/byan-benchmark.js');
    expect(skill).toMatch(/Workflow\(\{\s*name:\s*'byan-benchmark'/);
    // Emits the Stop-hook marker (done) and the degenerate skip marker.
    expect(skill).toContain('BYAN-BENCH:done');
    expect(skill).toContain('BYAN-BENCH:skip');
    // Opt-in BYAN-only fc enrichment wire point (C5d).
    expect(skill).toContain('byan_fc_check');
  });

  test('markdown fallback exists for dual-path resolution', () => {
    expect(fs.existsSync(FALLBACK)).toBe(true);
    const md = fs.readFileSync(FALLBACK, 'utf8');
    expect(md).toMatch(/name:\s*byan-benchmark/);
    expect(md).toContain('DATA only');
  });

  test('the native script sits at the path resolveWorkflow prefers (dual-path native preference)', () => {
    // resolveWorkflow prefers .claude/workflows/<name>.js when present. Asserting
    // the file is at that exact path proves native resolution without importing
    // the ESM resolver into this CommonJS runner.
    expect(fs.existsSync(path.join(ROOT, '.claude', 'workflows', 'byan-benchmark.js'))).toBe(true);
  });
});
