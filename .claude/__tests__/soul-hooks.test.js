/**
 * Tests for the BYAN soul-loop hooks (Cluster A repair).
 *
 * These hooks had NO tests, which is exactly why the soul-review loop rotted
 * silently: the staleness regex could not parse the bold marker, the
 * mid-session nudge one-shot was never reset, the reminders pointed at dead
 * paths, and the SessionStart payload shipped under the wrong output key.
 * Each block below pins one of the six confirmed Cluster-A losses.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');

const HOOKS = path.join(__dirname, '..', 'hooks');
const injectSoul = require('../hooks/inject-soul');
const memCheck = require('../hooks/soul-memory-check');
const triggers = require('../hooks/soul-memory-triggers');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-soul-'));
  fs.mkdirSync(path.join(dir, '_byan', 'agent', 'byan'), { recursive: true });
  fs.mkdirSync(path.join(dir, '_byan', 'memoire'), { recursive: true });
  return dir;
}
function runHook(name, project, input) {
  const out = execFileSync('node', [path.join(HOOKS, name)], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: project },
    input: input == null ? '' : input,
    encoding: 'utf8',
  });
  return JSON.parse(out || '{}');
}

// ---- A3 — staleness regex must parse the bold-markdown marker --------------
describe('A3 findLastRevision tolerates markdown', () => {
  test('parses **last-revision:** bold marker (the production shape)', () => {
    expect(memCheck.findLastRevision('**last-revision:** 2026-02-21')).toBe('2026-02-21');
  });
  test('still parses the plain colon form', () => {
    expect(memCheck.findLastRevision('last-revision: 2026-02-21')).toBe('2026-02-21');
  });
  test('parses the underscore/equals form', () => {
    expect(memCheck.findLastRevision('last_revision = 2025-01-09')).toBe('2025-01-09');
  });
  test('returns null when no marker present', () => {
    expect(memCheck.findLastRevision('no marker here')).toBeNull();
  });
});

// ---- A4 — reminder points at the REAL workflow path + real file ------------
describe('A4 buildReminder uses real paths', () => {
  const NOW = new Date('2026-06-11T00:00:00Z');
  test('stale entry cites the existing soul-revision workflow path', () => {
    const msg = memCheck.buildReminder('**last-revision:** 2026-02-21', '_byan/agent/byan/soul-memory.md', NOW);
    expect(msg).toContain('_byan/workflow/simple/byan/soul-revision.md');
    expect(msg).not.toContain('_byan/workflows/byan/'); // the old dead path
    expect(msg).toContain('_byan/agent/byan/soul-memory.md'); // interpolated, not hardcoded
    expect(msg).toContain('110 days');
  });
  test('fresh entry yields no reminder', () => {
    const msg = memCheck.buildReminder('**last-revision:** 2026-06-10', '_byan/agent/byan/soul-memory.md', NOW);
    expect(msg).toBe('');
  });
  test('missing marker reminder cites the real workflow path and file', () => {
    const msg = memCheck.buildReminder('no marker', '_byan/agent/byan/soul-memory.md', NOW);
    expect(msg).toContain(memCheck.SOUL_REVISION_WORKFLOW);
    expect(msg).toContain('_byan/agent/byan/soul-memory.md');
  });
});

// ---- A1 — the one-shot nudge marker is reset at SessionStart ---------------
describe('A1 resetNudgeMarker', () => {
  test('nudgeMarkerPath resolves Gen3 memoire when present', () => {
    const dir = tmpProject();
    expect(injectSoul.nudgeMarkerPath(dir)).toBe(
      path.join(dir, '_byan', 'memoire', '.soul-memory-nudge-sent')
    );
  });
  test('deletes a spent marker', () => {
    const dir = tmpProject();
    const marker = injectSoul.nudgeMarkerPath(dir);
    fs.writeFileSync(marker, 'spent');
    expect(fs.existsSync(marker)).toBe(true);
    injectSoul.resetNudgeMarker(dir);
    expect(fs.existsSync(marker)).toBe(false);
  });
  test('is a no-op (no throw) when no marker exists', () => {
    const dir = tmpProject();
    expect(() => injectSoul.resetNudgeMarker(dir)).not.toThrow();
  });
  test('running the SessionStart hook clears a spent marker end-to-end', () => {
    const dir = tmpProject();
    const marker = injectSoul.nudgeMarkerPath(dir);
    fs.writeFileSync(marker, 'spent');
    fs.writeFileSync(path.join(dir, '_byan', 'agent', 'byan', 'soul.md'), '# soul');
    runHook('inject-soul.js', dir);
    expect(fs.existsSync(marker)).toBe(false);
  });
});

// ---- A5 — the nudge names the append tool so the loop closes ---------------
describe('A5 buildNudge closes the reflect->append loop', () => {
  test('nudge text names the byan_soul_memory_append MCP tool', () => {
    const msg = triggers.buildNudge({ category: 'resonance', pattern: 'exactement' });
    expect(msg).toContain('byan_soul_memory_append');
    expect(msg).toContain('resonance');
  });
  test('findTrigger matches a resonance signal', () => {
    expect(triggers.findTrigger("c'est exactement ca")).toMatchObject({ category: 'resonance' });
  });
  test('findTrigger returns null on a neutral prompt', () => {
    expect(triggers.findTrigger('quelle heure est-il')).toBeNull();
  });
});

// ---- A6 — SessionStart hooks emit additionalContext, not systemMessage -----
describe('A6 SessionStart output contract', () => {
  test('inject-soul emits hookSpecificOutput.additionalContext', () => {
    const dir = tmpProject();
    fs.writeFileSync(path.join(dir, '_byan', 'agent', 'byan', 'soul.md'), '# soul content');
    const out = runHook('inject-soul.js', dir);
    expect(out).toHaveProperty('hookSpecificOutput.additionalContext');
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(out.systemMessage).toBeUndefined();
    expect(out.hookSpecificOutput.additionalContext).toContain('soul content');
  });
  test('soul-memory-check emits additionalContext on a stale marker', () => {
    const dir = tmpProject();
    fs.writeFileSync(
      path.join(dir, '_byan', 'agent', 'byan', 'soul-memory.md'),
      '**last-revision:** 2020-01-01\n\nbody'
    );
    const out = runHook('soul-memory-check.js', dir);
    expect(out).toHaveProperty('hookSpecificOutput.additionalContext');
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(out.systemMessage).toBeUndefined();
  });
});
