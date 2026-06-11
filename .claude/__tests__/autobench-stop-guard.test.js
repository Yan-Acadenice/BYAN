/**
 * Unit + e2e tests for the BYAN Auto-Benchmark Stop hook (C5b).
 *
 * Unit : the pure decideBench truth table — marker satisfies, never-list
 * satisfies, escape-hatch satisfies, skip-marker satisfies, block-once, and the
 * approach-C contract : DISARMED by default (a fork is observed but never blocks
 * until armed) and ARTIFACT-primary detection (an AskUserQuestion tool_use is the
 * primary fork signal; the choice-language regex is only the fallback).
 *
 * E2e : spawn the real hook as a child process and assert exit code + JSON
 * shape + ledger side-effect, using a temp project root so the real
 * .byan-autobench/ and _byan-output/benchmark-ledger.jsonl are never polluted.
 * The shipped config is disarmed, so block-expecting cases arm() the temp root.
 *
 * Placement : this suite lives under .claude/__tests__/ (collected by jest's
 * recursive **​/__tests__/** glob) to stay inside the locked build scope while
 * remaining a first-class jest target run from repo root.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const HOOK = path.join(ROOT, '.claude', 'hooks', 'autobench-stop-guard.js');
const CONFIG_PATH = path.join(ROOT, '.claude', 'hooks', 'lib', 'autobench-config.json');

const { decideBench } = require(path.join(ROOT, '.claude', 'hooks', 'autobench-stop-guard.js'));
const {
  extractLastAssistantText,
  extractLastAssistantContent,
  hasChoiceArtifact,
  isArmed,
} = require(path.join(ROOT, '.claude', 'hooks', 'lib', 'autobench-runtime.js'));

// The real generated runtime config drives both the unit table and the e2e
// runs, so the tests verify the SHIPPED regexes, not a test-only stand-in.
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// ---------------------------------------------------------------------------
// Fixtures : representative assistant messages.
// ---------------------------------------------------------------------------

const MSG_CHOICE_OPTIONS =
  'You have two ways forward.\n' +
  'Option A : keep the monolith, lower latency, harder to scale.\n' +
  'Option B : split into services, easier scale, more ops overhead.\n' +
  'Which option do you want?';

const MSG_CHOICE_LIST_PROSCONS =
  'There are a couple of approaches here.\n' +
  '- Redis cache : fast reads, extra moving part\n' +
  '- Postgres materialized view : one fewer dependency, staler data\n' +
  'Pros and cons differ on the freshness criterion.';

const MSG_WITH_DONE_MARKER =
  '<!-- BYAN-BENCH:done g1=2 g2=1 scope=internal -->\n' +
  '| Option | Latency | Ops | Niv |\n' +
  '| Monolith | low | low | L4 |\n' +
  '| Services | mid | high | L4 |\n' +
  'Recommend: keep the monolith (best on latency + ops).';

const MSG_WITH_SKIP_MARKER =
  '<!-- BYAN-BENCH:skip reason=obvious-default -->\n' +
  'There is one coherent choice given the locked stack, so I went with it.';

const MSG_YN_CONFIRM =
  'I will overwrite the config now. Proceed? (y/n)';

const MSG_DESTRUCTIVE =
  'This will delete the branch and force push. Do you want me to continue?';

const MSG_PLAIN = 'Done. I implemented the parser and the tests pass.';

// ---------------------------------------------------------------------------
// Unit : decideBench truth table
// ---------------------------------------------------------------------------

describe('decideBench (pure decision)', () => {
  // ARMED base : the bulk of the truth table exercises the enforcement path
  // (a fork blocks). The disarmed-default cases are asserted explicitly below.
  const base = { config: CONFIG, escapeHatch: false, blocked: false, armed: true };

  test('marker present (done) -> not blocked, satisfied-marker, parses g1/g2/scope', () => {
    const d = decideBench({ ...base, lastAssistantText: MSG_WITH_DONE_MARKER });
    expect(d.block).toBe(false);
    expect(d.ledger.event).toBe('satisfied-marker');
    expect(d.ledger.marker).toBe(true);
    expect(d.ledger.g1).toBe(2);
    expect(d.ledger.g2).toBe(1);
    expect(d.ledger.scope).toBe('internal');
  });

  test('skip marker -> not blocked, satisfied-skip', () => {
    const d = decideBench({ ...base, lastAssistantText: MSG_WITH_SKIP_MARKER });
    expect(d.block).toBe(false);
    expect(d.ledger.event).toBe('satisfied-skip');
    expect(d.ledger.marker).toBe(true);
  });

  test('enumerated Option A / Option B choice-language, no marker -> BLOCK with reason', () => {
    const d = decideBench({ ...base, lastAssistantText: MSG_CHOICE_OPTIONS });
    expect(d.block).toBe(true);
    expect(d.ledger.event).toBe('fired-block');
    expect(d.ledger.choiceLang).toBe(true);
    expect(d.ledger.marker).toBe(false);
    expect(typeof d.reason).toBe('string');
    expect(d.reason.length).toBeGreaterThan(0);
  });

  test('markdown list + pros/cons + candidates, no marker -> BLOCK', () => {
    const d = decideBench({ ...base, lastAssistantText: MSG_CHOICE_LIST_PROSCONS });
    expect(d.block).toBe(true);
    expect(d.ledger.event).toBe('fired-block');
  });

  test('y/n confirm prompt -> never-list satisfies (no block) even though choice-ish', () => {
    const d = decideBench({ ...base, lastAssistantText: MSG_YN_CONFIRM });
    expect(d.block).toBe(false);
    expect(d.ledger.event).toBe('satisfied-never');
    expect(d.ledger.neverHit).toBe(true);
  });

  test('destructive prompt (delete + force push) -> never-list satisfies (no block)', () => {
    const d = decideBench({ ...base, lastAssistantText: MSG_DESTRUCTIVE });
    expect(d.block).toBe(false);
    expect(d.ledger.event).toBe('satisfied-never');
    expect(d.ledger.neverHit).toBe(true);
  });

  test('escape-hatch active -> not blocked even on un-benchmarked choice-language', () => {
    const d = decideBench({
      config: CONFIG,
      escapeHatch: true,
      blocked: false,
      armed: true,
      lastAssistantText: MSG_CHOICE_OPTIONS,
    });
    expect(d.block).toBe(false);
    expect(d.ledger.event).toBe('satisfied-escape');
  });

  test('block-once: blocked=true (token present) -> not blocked again on the regen pass', () => {
    const d = decideBench({
      config: CONFIG,
      escapeHatch: false,
      blocked: true,
      armed: true,
      lastAssistantText: MSG_CHOICE_OPTIONS,
    });
    expect(d.block).toBe(false);
    expect(d.ledger.event).toBe('satisfied-already-blocked');
  });

  test('no choice-language at all -> not blocked, no-choice', () => {
    const d = decideBench({ ...base, lastAssistantText: MSG_PLAIN });
    expect(d.block).toBe(false);
    expect(d.ledger.event).toBe('no-choice');
    expect(d.ledger.choiceLang).toBe(false);
  });

  test('empty/undefined text -> not blocked (no-choice)', () => {
    expect(decideBench({ ...base, lastAssistantText: '' }).ledger.event).toBe('no-choice');
    expect(decideBench({ ...base, lastAssistantText: undefined }).block).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit : approach-C behaviors — DISARMED by default + ARTIFACT-primary detection.
// ---------------------------------------------------------------------------

describe('decideBench — disarmed by default (approach C)', () => {
  const disarmed = { config: CONFIG, escapeHatch: false, blocked: false, armed: false };

  test('disarmed + un-benchmarked choice-language -> does NOT block, observed-disarmed-fork', () => {
    const d = decideBench({ ...disarmed, lastAssistantText: MSG_CHOICE_OPTIONS });
    expect(d.block).toBe(false);
    expect(d.ledger.event).toBe('observed-disarmed-fork');
    // The ledger still records that a fork WAS present, so arming later is informed.
    expect(d.ledger.choiceLang).toBe(true);
    expect(d.ledger.armed).toBe(false);
  });

  test('disarmed + plain text -> observed-disarmed (no fork)', () => {
    const d = decideBench({ ...disarmed, lastAssistantText: MSG_PLAIN });
    expect(d.block).toBe(false);
    expect(d.ledger.event).toBe('observed-disarmed');
  });

  test('armed omitted (undefined) defaults to disarmed -> never blocks', () => {
    const d = decideBench({
      config: CONFIG,
      escapeHatch: false,
      blocked: false,
      lastAssistantText: MSG_CHOICE_OPTIONS,
    });
    expect(d.block).toBe(false);
    expect(d.ledger.event).toBe('observed-disarmed-fork');
  });

  test('disarmed + marker still classifies as satisfied-marker (positive signal preserved)', () => {
    const d = decideBench({ ...disarmed, lastAssistantText: MSG_WITH_DONE_MARKER });
    expect(d.block).toBe(false);
    expect(d.ledger.event).toBe('satisfied-marker');
  });
});

describe('isArmed — config-only arming (C6: no loose flag file)', () => {
  test('enforcement.armed:true -> armed', () => {
    expect(isArmed({ enforcement: { armed: true } })).toBe(true);
  });

  test('enforcement.armed:false / missing -> disarmed', () => {
    expect(isArmed({ enforcement: { armed: false } })).toBe(false);
    expect(isArmed({})).toBe(false);
    expect(isArmed(null)).toBe(false);
  });

  test('a present .byan-autobench/armed flag file does NOT arm (regression: was the silent-arm path)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-arm-'));
    fs.mkdirSync(path.join(tmp, '.byan-autobench'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.byan-autobench', 'armed'), '');
    const prev = process.env.CLAUDE_PROJECT_DIR;
    process.env.CLAUDE_PROJECT_DIR = tmp;
    try {
      // Before C6, isArmed() returned true on the file's mere presence. Now
      // arming is config-only, so a stray flag on disk is inert.
      expect(isArmed({ enforcement: { armed: false } })).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_PROJECT_DIR;
      else process.env.CLAUDE_PROJECT_DIR = prev;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('decideBench — artifact-primary detection (approach C)', () => {
  const armed = { config: CONFIG, escapeHatch: false, blocked: false, armed: true };

  test('armed + AskUserQuestion artifact, NO choice-words -> BLOCK, detection=artifact', () => {
    // MSG_PLAIN carries no choice-language at all; the block proves the artifact
    // is the PRIMARY signal, not the lexical regex.
    const d = decideBench({ ...armed, artifact: true, lastAssistantText: MSG_PLAIN });
    expect(d.block).toBe(true);
    expect(d.ledger.event).toBe('fired-block');
    expect(d.ledger.detection).toBe('artifact');
    expect(d.ledger.artifact).toBe(true);
  });

  test('armed + choice-language, NO artifact -> BLOCK, detection=regex-fallback (regex is the fallback)', () => {
    const d = decideBench({ ...armed, artifact: false, lastAssistantText: MSG_CHOICE_OPTIONS });
    expect(d.block).toBe(true);
    expect(d.ledger.event).toBe('fired-block');
    expect(d.ledger.detection).toBe('regex-fallback');
  });

  test('armed + artifact + marker -> marker still wins (satisfied-marker)', () => {
    const d = decideBench({ ...armed, artifact: true, lastAssistantText: MSG_WITH_DONE_MARKER });
    expect(d.block).toBe(false);
    expect(d.ledger.event).toBe('satisfied-marker');
  });

  test('disarmed + artifact -> observed-disarmed-fork (arming gates the artifact too)', () => {
    const d = decideBench({
      config: CONFIG,
      escapeHatch: false,
      blocked: false,
      armed: false,
      artifact: true,
      lastAssistantText: MSG_PLAIN,
    });
    expect(d.block).toBe(false);
    expect(d.ledger.event).toBe('observed-disarmed-fork');
  });
});

// ---------------------------------------------------------------------------
// Payload extraction : the REAL Stop-hook payload carries no inline transcript.
// It hands a transcript_path (JSONL file) and a last_assistant_message string.
// These guard the production access path — a regression here makes the hook read
// an empty turn and silently never fire (the bug this suite was extended to catch).
// ---------------------------------------------------------------------------

describe('payload extraction (production shape: transcript_path + last_assistant_message)', () => {
  let tmpRoot;
  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'autobench-payload-'));
  });
  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  // Write a JSONL transcript in the real Claude Code shape and return its path.
  function writeTranscript(lines) {
    const p = path.join(tmpRoot, 'transcript.jsonl');
    fs.writeFileSync(p, lines.map((o) => JSON.stringify(o)).join('\n') + '\n');
    return p;
  }

  test('last_assistant_message string is used directly for the text signal', () => {
    const payload = { last_assistant_message: MSG_CHOICE_OPTIONS, transcript_path: '/nonexistent' };
    expect(extractLastAssistantText(payload)).toBe(MSG_CHOICE_OPTIONS);
  });

  test('transcript_path JSONL: last assistant content is read (real {type,message:{role,content}} shape)', () => {
    const tp = writeTranscript([
      { type: 'user', message: { role: 'user', content: 'help' } },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Here are the options.' },
            { type: 'tool_use', id: 'x', name: 'AskUserQuestion', input: {} },
          ],
        },
      },
    ]);
    const content = extractLastAssistantContent({ transcript_path: tp });
    expect(Array.isArray(content)).toBe(true);
    expect(hasChoiceArtifact(content)).toBe(true);
    expect(extractLastAssistantText({ transcript_path: tp })).toContain('Here are the options.');
  });

  test('transcript_path JSONL: text-only final turn flattens to its prose', () => {
    const tp = writeTranscript([
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: MSG_CHOICE_OPTIONS }] } },
    ]);
    expect(extractLastAssistantText({ transcript_path: tp })).toContain('Which option');
  });

  test('empty / unreadable payload yields empty text (hook degrades to no-fork, never throws)', () => {
    expect(extractLastAssistantText({})).toBe('');
    expect(extractLastAssistantText({ transcript_path: '/no/such/file.jsonl' })).toBe('');
    expect(extractLastAssistantContent({ transcript_path: '/no/such/file.jsonl' })).toBeNull();
  });

  test('inline transcript/messages still resolve (test-fixture / legacy fallback)', () => {
    expect(extractLastAssistantText({ messages: [{ role: 'assistant', content: MSG_PLAIN }] })).toBe(MSG_PLAIN);
    const c = extractLastAssistantContent({
      transcript: [{ role: 'assistant', content: [{ type: 'tool_use', name: 'AskUserQuestion' }] }],
    });
    expect(hasChoiceArtifact(c)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E2e : spawn the real hook against an isolated temp project root.
// ---------------------------------------------------------------------------

describe('autobench-stop-guard e2e (spawned process)', () => {
  let tmpRoot;

  function makePayload(text) {
    return JSON.stringify({
      messages: [
        { role: 'user', content: 'help' },
        { role: 'assistant', content: text },
      ],
    });
  }

  // A finished turn whose last assistant message carries a structural
  // AskUserQuestion tool_use block (the multiple-choice UI) alongside prose that
  // contains NO choice-words — so a block proves artifact-primary detection.
  function makeArtifactPayload(text) {
    return JSON.stringify({
      messages: [
        { role: 'user', content: 'help' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: text || 'Here is what I found.' },
            { type: 'tool_use', name: 'AskUserQuestion', input: { questions: [] } },
          ],
        },
      ],
    });
  }

  // Opt-IN arming : the hook ships disarmed, so e2e cases that expect a BLOCK
  // must arm the isolated temp root first. Arming is config-only (C6: no loose
  // flag file), so we drop a full armed config into the temp root's config path
  // (configPath resolves against CLAUDE_PROJECT_DIR = tmpRoot).
  function arm() {
    const dir = path.join(tmpRoot, '.claude', 'hooks', 'lib');
    fs.mkdirSync(dir, { recursive: true });
    const armedConfig = { ...CONFIG, enforcement: { ...CONFIG.enforcement, armed: true } };
    fs.writeFileSync(path.join(dir, 'autobench-config.json'), JSON.stringify(armedConfig));
  }

  function runHook(text, { stdin } = {}) {
    const result = spawnSync('node', [HOOK], {
      input: stdin !== undefined ? stdin : makePayload(text),
      env: { ...process.env, CLAUDE_PROJECT_DIR: tmpRoot },
      encoding: 'utf8',
      timeout: 10000,
    });
    let parsed = null;
    try {
      parsed = JSON.parse((result.stdout || '').trim());
    } catch {
      parsed = null;
    }
    return { code: result.status, stdout: result.stdout || '', parsed };
  }

  function ledgerLines() {
    const p = path.join(tmpRoot, '_byan-output', 'benchmark-ledger.jsonl');
    if (!fs.existsSync(p)) return [];
    return fs
      .readFileSync(p, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  }

  beforeEach(() => {
    // Isolated project root with ONLY the generated config copied in, so the
    // hook reads real config but writes its state (.byan-autobench, ledger)
    // into the temp tree — the real repo state stays untouched.
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'autobench-e2e-'));
    fs.mkdirSync(path.join(tmpRoot, '.claude', 'hooks', 'lib'), { recursive: true });
    fs.copyFileSync(CONFIG_PATH, path.join(tmpRoot, '.claude', 'hooks', 'lib', 'autobench-config.json'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('DISARMED by default -> genuine miss does NOT block (exit 0, observed-disarmed-fork)', () => {
    // No arm() call : the shipped config has enforcement.armed=false, so day one
    // is zero noise. The fork is observed and ledgered but never blocked.
    const r = runHook(MSG_CHOICE_OPTIONS);
    expect(r.code).toBe(0);
    expect(r.parsed).toEqual({ continue: true });
    expect(ledgerLines().some((l) => l.event === 'observed-disarmed-fork')).toBe(true);
  });

  test('ARMED + genuine miss -> exit 2 + {decision:block, systemMessage}', () => {
    arm();
    const r = runHook(MSG_CHOICE_OPTIONS);
    expect(r.code).toBe(2);
    expect(r.parsed).not.toBeNull();
    expect(r.parsed.decision).toBe('block');
    expect(typeof r.parsed.systemMessage).toBe('string');
    expect(r.parsed.systemMessage.length).toBeGreaterThan(0);
  });

  test('ARMED + AskUserQuestion artifact (no choice-words) -> exit 2 block (artifact-primary)', () => {
    arm();
    const r = runHook(null, { stdin: makeArtifactPayload('Here are the options I found.') });
    expect(r.code).toBe(2);
    expect(r.parsed.decision).toBe('block');
    expect(ledgerLines().some((l) => l.event === 'fired-block' && l.detection === 'artifact')).toBe(true);
  });

  // The REAL runtime shape: no inline messages, a transcript_path JSONL + a
  // last_assistant_message string. These prove the hook fires in production, not
  // just against the inline test fixtures.
  function writeTranscriptIn(tmp, lines) {
    const p = path.join(tmp, 'transcript.jsonl');
    fs.writeFileSync(p, lines.map((o) => JSON.stringify(o)).join('\n') + '\n');
    return p;
  }

  test('PRODUCTION shape (last_assistant_message choice) + armed -> exit 2 block', () => {
    arm();
    const tp = writeTranscriptIn(tmpRoot, [
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: MSG_CHOICE_OPTIONS }] } },
    ]);
    const payload = JSON.stringify({
      transcript_path: tp,
      last_assistant_message: MSG_CHOICE_OPTIONS,
      stop_hook_active: false,
    });
    const r = runHook(null, { stdin: payload });
    expect(r.code).toBe(2);
    expect(r.parsed.decision).toBe('block');
    expect(ledgerLines().some((l) => l.event === 'fired-block')).toBe(true);
  });

  test('PRODUCTION shape (transcript_path AskUserQuestion tool_use) + armed -> exit 2 block (artifact)', () => {
    arm();
    const tp = writeTranscriptIn(tmpRoot, [
      { type: 'user', message: { role: 'user', content: 'help' } },
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Picking a store.' },
            { type: 'tool_use', id: 'a', name: 'AskUserQuestion', input: {} },
          ],
        },
      },
    ]);
    const payload = JSON.stringify({ transcript_path: tp, last_assistant_message: 'Picking a store.', stop_hook_active: false });
    const r = runHook(null, { stdin: payload });
    expect(r.code).toBe(2);
    expect(ledgerLines().some((l) => l.event === 'fired-block' && l.detection === 'artifact')).toBe(true);
  });

  test('PRODUCTION shape + stop_hook_active=true -> does NOT block again (loop guard)', () => {
    arm();
    const tp = writeTranscriptIn(tmpRoot, [
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: MSG_CHOICE_OPTIONS }] } },
    ]);
    const payload = JSON.stringify({ transcript_path: tp, last_assistant_message: MSG_CHOICE_OPTIONS, stop_hook_active: true });
    const r = runHook(null, { stdin: payload });
    expect(r.code).toBe(0);
    expect(r.parsed).toEqual({ continue: true });
  });

  test('DISARMED default + production choice payload -> no block (observed-disarmed-fork, reads real text)', () => {
    // No arm(): proves the fix reads the real payload (non-empty) yet stays inert.
    const tp = writeTranscriptIn(tmpRoot, [
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: MSG_CHOICE_OPTIONS }] } },
    ]);
    const payload = JSON.stringify({ transcript_path: tp, last_assistant_message: MSG_CHOICE_OPTIONS, stop_hook_active: false });
    const r = runHook(null, { stdin: payload });
    expect(r.code).toBe(0);
    expect(ledgerLines().some((l) => l.event === 'observed-disarmed-fork')).toBe(true);
  });

  test('satisfied (marker) -> exit 0 + {continue:true}', () => {
    const r = runHook(MSG_WITH_DONE_MARKER);
    expect(r.code).toBe(0);
    expect(r.parsed).toEqual({ continue: true });
  });

  test('ledger gets a fired-block line then a satisfied-marker line with g1/g2/scope', () => {
    arm();
    runHook(MSG_CHOICE_OPTIONS); // miss
    runHook(MSG_WITH_DONE_MARKER); // hit

    const lines = ledgerLines();
    expect(lines.length).toBe(2);

    const fired = lines.find((l) => l.event === 'fired-block');
    const satisfied = lines.find((l) => l.event === 'satisfied-marker');
    expect(fired).toBeDefined();
    expect(fired.choiceLang).toBe(true);
    expect(fired.marker).toBe(false);
    expect(satisfied).toBeDefined();
    expect(satisfied.g1).toBe(2);
    expect(satisfied.g2).toBe(1);
    expect(satisfied.scope).toBe('internal');
  });

  test('block-once across processes: same text twice -> exit 2 then exit 0 (token present)', () => {
    arm();
    const first = runHook(MSG_CHOICE_OPTIONS);
    expect(first.code).toBe(2);

    // The block token for this turnHash now exists in tmpRoot/.byan-autobench/.
    const second = runHook(MSG_CHOICE_OPTIONS);
    expect(second.code).toBe(0);
    expect(second.parsed).toEqual({ continue: true });

    const lines = ledgerLines();
    expect(lines.map((l) => l.event)).toEqual(['fired-block', 'satisfied-already-blocked']);
  });

  test('escape-hatch session flag (.byan-autobench/off) -> exit 0 on a would-be miss', () => {
    fs.mkdirSync(path.join(tmpRoot, '.byan-autobench'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, '.byan-autobench', 'off'), '');

    const r = runHook(MSG_CHOICE_OPTIONS);
    expect(r.code).toBe(0);
    expect(r.parsed).toEqual({ continue: true });
    expect(ledgerLines().some((l) => l.event === 'satisfied-escape')).toBe(true);
  });

  test('never-listed prompt -> exit 0 (no block)', () => {
    const r = runHook(MSG_DESTRUCTIVE);
    expect(r.code).toBe(0);
    expect(r.parsed).toEqual({ continue: true });
    expect(ledgerLines().some((l) => l.event === 'satisfied-never')).toBe(true);
  });

  test('malformed stdin -> non-blocking {continue:true}, exit 0', () => {
    const r = runHook(null, { stdin: 'not json at all {' });
    expect(r.code).toBe(0);
    expect(r.parsed).toEqual({ continue: true });
  });
});
