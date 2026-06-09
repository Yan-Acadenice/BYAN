/**
 * End-to-end tests for the drain-advisory Stop hook.
 *
 * Spawns the real hook as a child process and verifies:
 *   - exit code is always 0 (non-blocking by contract)
 *   - stdout is always JSON {continue:true}
 *   - advisory ledger side-effects (elo-profile.json, suitability-ledger.json, .advisory-cursor.json)
 *
 * Snapshot/restore pattern protects the real ledgers from test pollution.
 * afterAll restores even if tests fail — the finally-style guarantee comes from
 * Jest's afterAll executing even after test failures.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HOOK = path.join(ROOT, '.claude', 'hooks', 'drain-advisory.js');

// Real ledger paths (subject to snapshot/restore)
const ELO_PROFILE = path.join(ROOT, '_byan', 'memoire', 'elo-profile.json');
const SUITABILITY_LEDGER = path.join(ROOT, '_byan-output', 'suitability-ledger.json');

// Ephemeral files written/cleared between tests
const PENDING_OUTCOMES = path.join(ROOT, '_byan-output', 'pending-outcomes.jsonl');
const ADVISORY_CURSOR = path.join(ROOT, '_byan-output', '.advisory-cursor.json');

// Backup paths (written in beforeAll, deleted in afterAll)
const ELO_BAK = ELO_PROFILE + '.e2e.bak';
const SUIT_BAK = SUITABILITY_LEDGER + '.e2e.bak';

// Unique fixture keys that will never clash with real production data
const E2E_ELO_DOMAIN = '__e2e_autofeed__';
const E2E_SUIT_MODEL = 'haiku';
const E2E_SUIT_LEAF = '__e2e_autofeed__';
const E2E_SUIT_KEY = `${E2E_SUIT_MODEL}::${E2E_SUIT_LEAF}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runHook(bufferLines) {
  // Write the buffer file before spawning (or leave it absent for empty tests)
  if (bufferLines !== null && bufferLines !== undefined) {
    fs.mkdirSync(path.dirname(PENDING_OUTCOMES), { recursive: true });
    fs.writeFileSync(PENDING_OUTCOMES, bufferLines);
  }

  const result = spawnSync('node', [HOOK], {
    input: '{}',
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
    encoding: 'utf8',
    timeout: 8000,
  });

  return {
    code: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    parsed: safeJson(result.stdout),
  };
}

function safeJson(s) {
  try {
    return JSON.parse(s.trim());
  } catch {
    return null;
  }
}

function readJsonFile(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function removeIfExists(p) {
  try {
    fs.unlinkSync(p);
  } catch {
    // file absent — fine
  }
}

function copyIfExists(src, dst) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Snapshot / Restore lifecycle
// ---------------------------------------------------------------------------

let eloExisted = false;
let suitExisted = false;

beforeAll(() => {
  // Snapshot: copy real ledgers to .bak so afterAll can restore them exactly.
  // We always create the backup regardless of file existence: if the file does
  // not exist we write a sentinel so afterAll knows to delete rather than restore.
  eloExisted = copyIfExists(ELO_PROFILE, ELO_BAK);
  suitExisted = copyIfExists(SUITABILITY_LEDGER, SUIT_BAK);
});

afterAll(() => {
  // CRITICAL: restore real ledgers regardless of test outcome.
  // Remove fixture artifacts first.
  removeIfExists(PENDING_OUTCOMES);
  removeIfExists(ADVISORY_CURSOR);

  // Restore or remove each ledger based on whether it existed before the suite.
  if (eloExisted) {
    try {
      fs.copyFileSync(ELO_BAK, ELO_PROFILE);
    } catch {
      // best-effort
    }
  } else {
    // Was absent before — remove whatever the hook may have created.
    removeIfExists(ELO_PROFILE);
  }
  removeIfExists(ELO_BAK);

  if (suitExisted) {
    try {
      fs.copyFileSync(SUIT_BAK, SUITABILITY_LEDGER);
    } catch {
      // best-effort
    }
  } else {
    removeIfExists(SUITABILITY_LEDGER);
  }
  removeIfExists(SUIT_BAK);
});

beforeEach(() => {
  // Clean ephemeral state so each test starts from a known blank slate.
  removeIfExists(PENDING_OUTCOMES);
  removeIfExists(ADVISORY_CURSOR);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('drain-advisory e2e — non-blocking contract', () => {
  test('1. empty/absent buffer -> exit 0, {continue:true}, no throw', () => {
    // Buffer file intentionally absent (beforeEach already removed it).
    const r = runHook(null);

    expect(r.code).toBe(0);
    expect(r.parsed).not.toBeNull();
    expect(r.parsed).toEqual({ continue: true });
  });

  test('2. mixed buffer (elo VALIDATED + suitability failure + garbage) -> ledgers updated, cursor drained:3', () => {
    const lines = [
      JSON.stringify({ kind: 'elo', domain: E2E_ELO_DOMAIN, result: 'VALIDATED' }),
      JSON.stringify({ kind: 'suitability', model: E2E_SUIT_MODEL, leafId: E2E_SUIT_LEAF, success: false }),
      JSON.stringify({ x: 1 }),
    ].join('\n') + '\n';

    const r = runHook(lines);

    // Hook must always exit 0 with {continue:true}
    expect(r.code).toBe(0);
    expect(r.parsed).toEqual({ continue: true });

    // ELO profile must have the test domain
    const eloProfile = readJsonFile(ELO_PROFILE);
    expect(eloProfile).not.toBeNull();
    expect(eloProfile.domains).toBeDefined();
    expect(eloProfile.domains[E2E_ELO_DOMAIN]).toBeDefined();

    // Suitability ledger must have the test key with at least 1 failure
    const suitLedger = readJsonFile(SUITABILITY_LEDGER);
    expect(suitLedger).not.toBeNull();
    expect(suitLedger[E2E_SUIT_KEY]).toBeDefined();
    expect(suitLedger[E2E_SUIT_KEY].failures).toBeGreaterThanOrEqual(1);

    // Cursor must reflect drained:3 (3 lines parsed, including the garbage line)
    const cursor = readJsonFile(ADVISORY_CURSOR);
    expect(cursor).not.toBeNull();
    expect(cursor.drained).toBe(3);
  });

  test('3. idempotency: second run with no new buffer lines -> cursor stays drained:3, exit 0', () => {
    // Pre-condition: run the same buffer as test 2 to establish cursor at 3.
    const lines = [
      JSON.stringify({ kind: 'elo', domain: E2E_ELO_DOMAIN, result: 'VALIDATED' }),
      JSON.stringify({ kind: 'suitability', model: E2E_SUIT_MODEL, leafId: E2E_SUIT_LEAF, success: false }),
      JSON.stringify({ x: 1 }),
    ].join('\n') + '\n';

    // First run (establish cursor)
    const first = runHook(lines);
    expect(first.code).toBe(0);
    expect(readJsonFile(ADVISORY_CURSOR).drained).toBe(3);

    // Second run: same buffer file still present, no new lines added.
    // The hook should detect cursor === buffer length and drain nothing new.
    const second = runHook(lines);

    expect(second.code).toBe(0);
    expect(second.parsed).toEqual({ continue: true });

    // Cursor must still be 3 (no new lines were appended)
    const cursor = readJsonFile(ADVISORY_CURSOR);
    expect(cursor).not.toBeNull();
    expect(cursor.drained).toBe(3);
  });
});
