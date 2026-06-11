import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  loadAutobenchConfig,
  renderAutobenchConfig,
  renderAutobenchPointerBlock,
  syncAutobench,
  upsertBlock,
  MARKERS,
  AUTOBENCH_MARKERS,
} from '../lib/sync-rules.js';

// Minimal valid autobench config: the three doctrine bricks (trigger/scaler/
// format), a non-empty mantras array, and a minimal hooks section — the shape
// loadAutobenchConfig validates. Kept small so the assertions stay legible.
const AUTOBENCH_YAML = `
version: 1
name: BYAN Auto-Benchmark
slug: byan-autobench
description: Proactive doctrine that benchmarks a real decision fork.
trigger:
  gates:
    - id: G1
      rule: At least 2 non-substitutable options.
    - id: G2
      rule: Divergence on at least 1 weighted criterion.
scaler:
  routing_before_depth: Decide internal-vs-external first.
format:
  default: One compact table.
mantras:
  - id: BENCH-1
    name: Gate Before Table
    rule: Render a benchmark only when both gates hold.
  - id: BENCH-12
    name: Emit The Marker
    rule: Emit the BYAN-BENCH marker before the table.
hooks:
  marker_patterns:
    any:
      source: "<!--\\\\s*BYAN-BENCH:(done|skip)\\\\b"
      flags: "i"
    done:
      source: "<!--\\\\s*BYAN-BENCH:done\\\\b"
      flags: "i"
    skip:
      source: "<!--\\\\s*BYAN-BENCH:skip\\\\b"
      flags: "i"
  marker_fields:
    g1:
      source: "g1=(\\\\d+)"
      flags: "i"
    g2:
      source: "g2=(\\\\d+)"
      flags: "i"
    scope:
      source: "scope=(internal|external)"
      flags: "i"
  never_list:
    - source: "\\\\b(yes/no|y/n)\\\\b"
      flags: "i"
  choice_language:
    - source: "\\\\b(should I)\\\\b"
      flags: "i"
  candidate_token:
    source: "\\\\b(option)s?\\\\b"
    flags: "ig"
  escape_hatch:
    session_flag: ".byan-autobench/off"
    block_token_dir: ".byan-autobench"
    disabled: false
  ledger_path: "_byan-output/benchmark-ledger.jsonl"
  stop_block: "Auto-benchmark blocked."
`;

function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-autobench-'));
  const cfgDir = path.join(root, '_byan', '_config');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(path.join(cfgDir, 'autobench.yaml'), AUTOBENCH_YAML);
  return root;
}

function writeMalformed(yamlBody) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-autobench-bad-'));
  const cfgDir = path.join(root, '_byan', '_config');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(path.join(cfgDir, 'autobench.yaml'), yamlBody);
  return root;
}

test('loadAutobenchConfig parses and validates a well-formed file', () => {
  const cfg = loadAutobenchConfig({ projectRoot: tmpRoot() });
  assert.equal(cfg.slug, 'byan-autobench');
  assert.equal(cfg.mantras.length, 2);
  assert.ok(cfg.trigger && cfg.scaler && cfg.format);
});

test('loadAutobenchConfig throws on a missing file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-autobench-empty-'));
  assert.throws(() => loadAutobenchConfig({ projectRoot: root }), /not found/);
});

test('loadAutobenchConfig throws on empty mantras', () => {
  const root = writeMalformed(AUTOBENCH_YAML.replace(/mantras:[\s\S]*$/, 'mantras: []\n'));
  assert.throws(() => loadAutobenchConfig({ projectRoot: root }), /mantras/);
});

test('loadAutobenchConfig throws on a missing brick (no scaler)', () => {
  const root = writeMalformed(AUTOBENCH_YAML.replace(/scaler:[\s\S]*?\nformat:/, 'format:'));
  assert.throws(() => loadAutobenchConfig({ projectRoot: root }), /scaler/);
});

test('loadAutobenchConfig throws on a non-object parse', () => {
  const root = writeMalformed('just a string, not a mapping\n');
  assert.throws(() => loadAutobenchConfig({ projectRoot: root }), /object|mantras/);
});

test('renderAutobenchPointerBlock is lean and points to the full doctrine', () => {
  const cfg = loadAutobenchConfig({ projectRoot: tmpRoot() });
  const block = renderAutobenchPointerBlock(cfg);
  assert.ok(block.startsWith('## BYAN Auto-Benchmark'));
  assert.ok(block.includes('@.claude/rules/benchmark.md'));
  assert.ok(block.includes('BYAN-BENCH:done'));
  assert.ok(block.includes('BYAN-BENCH:skip'));
  // Lean: the body (excluding the wrapping markers added by upsertBlock) stays
  // within the pointer convention. <= 8 non-empty lines.
  const nonEmpty = block.split('\n').filter((l) => l.trim() !== '');
  assert.ok(nonEmpty.length <= 8, `pointer block has ${nonEmpty.length} non-empty lines`);
  // No fabricated external URL in the pointer (link rule sanity).
  assert.ok(!/https?:\/\//.test(block), 'pointer block must carry no external URL');
});

test('upsertBlock with custom AUTOBENCH markers is scoped; a prior STRICT block survives', () => {
  const root = tmpRoot();
  const file = path.join(root, 'AGENTS.md');

  // Seed a STRICT block first (default markers).
  upsertBlock({ filePath: file, block: 'STRICT BODY' });
  // Then an AUTOBENCH block with the distinct marker pair.
  const action = upsertBlock({
    filePath: file,
    block: 'AUTOBENCH BODY',
    markers: { begin: AUTOBENCH_MARKERS.BEGIN, end: AUTOBENCH_MARKERS.END },
  });
  assert.equal(action, 'appended');

  let content = fs.readFileSync(file, 'utf8');
  assert.ok(content.includes(MARKERS.BEGIN), 'STRICT begin marker present');
  assert.ok(content.includes('STRICT BODY'), 'STRICT body preserved');
  assert.ok(content.includes(AUTOBENCH_MARKERS.BEGIN), 'AUTOBENCH begin marker present');
  assert.ok(content.includes('AUTOBENCH BODY'), 'AUTOBENCH body present');

  // Re-upsert only the AUTOBENCH block: STRICT must stay untouched, AUTOBENCH
  // replaced, and exactly one pair of each marker remains.
  upsertBlock({
    filePath: file,
    block: 'AUTOBENCH BODY v2',
    markers: { begin: AUTOBENCH_MARKERS.BEGIN, end: AUTOBENCH_MARKERS.END },
  });
  content = fs.readFileSync(file, 'utf8');
  assert.ok(content.includes('STRICT BODY'), 'STRICT body still preserved');
  assert.ok(content.includes('AUTOBENCH BODY v2'));
  assert.ok(!content.includes('AUTOBENCH BODY\n'), 'old AUTOBENCH body replaced');
  assert.equal((content.match(new RegExp(MARKERS.BEGIN, 'g')) || []).length, 1);
  assert.equal((content.match(new RegExp(AUTOBENCH_MARKERS.BEGIN, 'g')) || []).length, 1);
});

test('upsertBlock with AUTOBENCH markers is idempotent (unchanged on identical block)', () => {
  const root = tmpRoot();
  const file = path.join(root, 'AGENTS.md');
  const markers = { begin: AUTOBENCH_MARKERS.BEGIN, end: AUTOBENCH_MARKERS.END };
  upsertBlock({ filePath: file, block: 'SAME', markers });
  const action = upsertBlock({ filePath: file, block: 'SAME', markers });
  assert.equal(action, 'unchanged');
});

test('syncAutobench upserts the pointer block into all three platform files', () => {
  const root = tmpRoot();
  const report = syncAutobench({ projectRoot: root });

  assert.equal(report['.claude/CLAUDE.md'], 'created');
  assert.equal(report['AGENTS.md'], 'created');
  assert.equal(report['.github/copilot-instructions.md'], undefined);

  for (const rel of ['.claude/CLAUDE.md', 'AGENTS.md']) {
    const content = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.ok(content.includes(AUTOBENCH_MARKERS.BEGIN), `${rel} has AUTOBENCH begin`);
    assert.ok(content.includes(AUTOBENCH_MARKERS.END), `${rel} has AUTOBENCH end`);
    assert.ok(content.includes('@.claude/rules/benchmark.md'), `${rel} points to the doctrine`);
    // The marker note cites the autobench source, not strict-mode.
    assert.ok(content.includes('autobench.yaml'), `${rel} note cites autobench.yaml`);
    // Exactly one block per file.
    assert.equal(
      (content.match(new RegExp(AUTOBENCH_MARKERS.BEGIN, 'g')) || []).length,
      1,
      `${rel} has exactly one AUTOBENCH block`
    );
  }
});

test('syncAutobench is idempotent on a second run (all unchanged)', () => {
  const root = tmpRoot();
  syncAutobench({ projectRoot: root });
  const report = syncAutobench({ projectRoot: root });
  for (const action of Object.values(report)) {
    assert.equal(action, 'unchanged');
  }
});

test('syncAutobench coexists with syncRules markers in the same AGENTS.md', () => {
  const root = tmpRoot();
  // Seed a STRICT block as syncRules would (default markers).
  const agents = path.join(root, 'AGENTS.md');
  upsertBlock({ filePath: agents, block: 'STRICT BODY' });
  // Then run the autobench orchestrator.
  syncAutobench({ projectRoot: root });
  const content = fs.readFileSync(agents, 'utf8');
  assert.ok(content.includes(MARKERS.BEGIN), 'STRICT block survived syncAutobench');
  assert.ok(content.includes('STRICT BODY'));
  assert.ok(content.includes(AUTOBENCH_MARKERS.BEGIN), 'AUTOBENCH block added');
});

// ---------------------------------------------------------------------------
// Tests for renderAutobenchConfig (the gap-closing function).
// Uses the standard tmpRoot() which now carries a hooks: section.
// ---------------------------------------------------------------------------

// Helper: write a modified AUTOBENCH_YAML in a fresh tmp root.
function tmpRootWithYaml(yaml) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-autobench-custom-'));
  const cfgDir = path.join(root, '_byan', '_config');
  fs.mkdirSync(cfgDir, { recursive: true });
  fs.writeFileSync(path.join(cfgDir, 'autobench.yaml'), yaml);
  return root;
}

// (a) renderAutobenchConfig produces all keys and correct {source,flags} shapes
// required by the runtime contract in autobench-stop-guard.js.
test('renderAutobenchConfig produces all runtime-required top-level keys', () => {
  const cfg = loadAutobenchConfig({ projectRoot: tmpRoot() });
  const out = renderAutobenchConfig(cfg);

  // Top-level keys the Stop hook or autobench-runtime.js reads.
  assert.ok(typeof out.version === 'number', 'version present');
  assert.ok(typeof out._generated_by === 'string', '_generated_by present');
  assert.ok(typeof out._note === 'string', '_note present');

  // marker_patterns: each sub-key must be a {source, flags} pair.
  for (const key of ['any', 'done', 'skip']) {
    assert.ok(typeof out.marker_patterns[key].source === 'string', `marker_patterns.${key}.source`);
    assert.ok(typeof out.marker_patterns[key].flags === 'string', `marker_patterns.${key}.flags`);
  }

  // marker_fields: each sub-key must be a {source, flags} pair.
  for (const key of ['g1', 'g2', 'scope']) {
    assert.ok(typeof out.marker_fields[key].source === 'string', `marker_fields.${key}.source`);
    assert.ok(typeof out.marker_fields[key].flags === 'string', `marker_fields.${key}.flags`);
  }

  // never_list: array of {source, flags} pairs.
  assert.ok(Array.isArray(out.never_list) && out.never_list.length >= 1, 'never_list non-empty');
  for (const entry of out.never_list) {
    assert.ok(typeof entry.source === 'string', 'never_list entry.source');
    assert.ok(typeof entry.flags === 'string', 'never_list entry.flags');
  }

  // choice_language: array of {source, flags} pairs, with optional threshold fields.
  assert.ok(Array.isArray(out.choice_language) && out.choice_language.length >= 1, 'choice_language non-empty');
  for (const entry of out.choice_language) {
    assert.ok(typeof entry.source === 'string', 'choice_language entry.source');
    assert.ok(typeof entry.flags === 'string', 'choice_language entry.flags');
    // Optional threshold fields: when present they must be numbers.
    if ('min_matches' in entry) assert.ok(typeof entry.min_matches === 'number', 'min_matches is number');
    if ('requires_candidates' in entry) assert.ok(typeof entry.requires_candidates === 'number', 'requires_candidates is number');
  }

  // candidate_token: {source, flags}.
  assert.ok(typeof out.candidate_token.source === 'string', 'candidate_token.source');
  assert.ok(typeof out.candidate_token.flags === 'string', 'candidate_token.flags');

  // escape_hatch: session_flag and disabled.
  assert.ok(typeof out.escape_hatch.session_flag === 'string', 'escape_hatch.session_flag');
  assert.ok(typeof out.escape_hatch.disabled === 'boolean', 'escape_hatch.disabled is boolean');

  // enforcement: armed (boolean), config-only. Defaulted when the YAML omits the
  // block (the minimal fixture above does) -> disarmed by default. No arm_flag:
  // arming is config-only, there is no loose flag file in the generated config.
  assert.ok(typeof out.enforcement.armed === 'boolean', 'enforcement.armed is boolean');
  assert.strictEqual(out.enforcement.armed, false, 'enforcement.armed defaults to false (disarmed)');
  assert.strictEqual(out.enforcement.arm_flag, undefined, 'no arm_flag: arming is config-only');

  // ledger: path.
  assert.ok(typeof out.ledger.path === 'string', 'ledger.path');

  // banners: stop_block.
  assert.ok(typeof out.banners.stop_block === 'string', 'banners.stop_block');
});

// (b) REGRESSION TEST FOR THE GAP: flip hooks.escape_hatch.disabled to true in
// the YAML, run renderAutobenchConfig, and assert the output carries disabled:true.
// This proves the cross-session toggle now flows from the YAML to the runtime.
test('renderAutobenchConfig propagates escape_hatch.disabled:true from the YAML', () => {
  const disabledYaml = AUTOBENCH_YAML.replace(
    'disabled: false',
    'disabled: true'
  );
  const cfg = loadAutobenchConfig({ projectRoot: tmpRootWithYaml(disabledYaml) });
  const out = renderAutobenchConfig(cfg);
  assert.strictEqual(out.escape_hatch.disabled, true,
    'escape_hatch.disabled must be true when the YAML sets disabled:true');
});

// (b2) ENFORCEMENT propagation: set hooks.enforcement.armed:true in the YAML and
// assert the rendered config carries it. Proves the arm flag flows from the
// single source of truth to the runtime, like the escape_hatch.disabled toggle.
test('renderAutobenchConfig propagates enforcement.armed:true from the YAML', () => {
  const armedYaml = AUTOBENCH_YAML.replace(
    'ledger_path: "_byan-output/benchmark-ledger.jsonl"',
    'enforcement:\n    armed: true\n  ledger_path: "_byan-output/benchmark-ledger.jsonl"'
  );
  const cfg = loadAutobenchConfig({ projectRoot: tmpRootWithYaml(armedYaml) });
  const out = renderAutobenchConfig(cfg);
  assert.strictEqual(out.enforcement.armed, true,
    'enforcement.armed must be true when the YAML sets armed:true');
  assert.strictEqual(out.enforcement.arm_flag, undefined,
    'arm_flag is not emitted: arming is config-only');
});

// (c) syncAutobench idempotency on autobench-config.json: two successive runs
// must yield unchanged on the config file.
test('syncAutobench writes autobench-config.json and is idempotent', () => {
  const root = tmpRoot();
  const report1 = syncAutobench({ projectRoot: root });
  // First run: the config file must be created (it does not exist yet).
  assert.equal(report1['.claude/hooks/lib/autobench-config.json'], 'created',
    'first run creates autobench-config.json');

  const cfgPath = path.join(root, '.claude', 'hooks', 'lib', 'autobench-config.json');
  const first = fs.readFileSync(cfgPath, 'utf8');

  const report2 = syncAutobench({ projectRoot: root });
  // Second run: the file is unchanged.
  assert.equal(report2['.claude/hooks/lib/autobench-config.json'], 'unchanged',
    'second run reports autobench-config.json unchanged');

  const second = fs.readFileSync(cfgPath, 'utf8');
  assert.strictEqual(first, second, 'autobench-config.json content is byte-identical on second run');

  // The generated config must be valid JSON and carry the expected structure.
  const parsed = JSON.parse(first);
  assert.equal(parsed._generated_by, 'byan-sync-rules');
  assert.ok(parsed.escape_hatch && typeof parsed.escape_hatch.disabled === 'boolean');
  assert.ok(parsed.ledger && typeof parsed.ledger.path === 'string');
  assert.ok(parsed.banners && typeof parsed.banners.stop_block === 'string');
});
