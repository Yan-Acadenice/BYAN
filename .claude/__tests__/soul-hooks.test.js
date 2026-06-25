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
const injectTao = require('../hooks/inject-tao');
const voiceAnchor = require('../hooks/inject-voice-anchor');
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

// ---- Review hardening (REVIEW phase caught these) --------------------------
describe('Review hardening', () => {
  test('inject-soul and triggers resolve the SAME marker path (parity invariant)', () => {
    const dir = tmpProject();
    expect(triggers.markerPathFor(dir)).toBe(injectSoul.nudgeMarkerPath(dir));
  });

  test('requiring soul-memory-triggers has NO side effect (guarded IIFE)', () => {
    // A bare require must not run the hook (read stdin / write the marker).
    // Spawn `node -e require(hook)` so require.main !== the hook module.
    const dir = tmpProject();
    const marker = triggers.markerPathFor(dir);
    const hook = path.join(HOOKS, 'soul-memory-triggers.js');
    execFileSync('node', ['-e', `require(${JSON.stringify(hook)})`], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      input: '{"prompt":"non mais tu te trompes"}', // a real tension trigger
      encoding: 'utf8',
    });
    expect(fs.existsSync(marker)).toBe(false);
  });

  test('inject-soul does NOT bundle tao (owned per-turn by inject-tao)', () => {
    const dir = tmpProject();
    fs.writeFileSync(path.join(dir, '_byan', 'agent', 'byan', 'soul.md'), '# soul body');
    fs.writeFileSync(path.join(dir, '_byan', 'agent', 'byan', 'tao.md'), 'TAO_SENTINEL_VOICE');
    const ctx = injectSoul.buildAdditionalContext(dir);
    expect(ctx).toContain('soul body');
    expect(ctx).not.toContain('TAO_SENTINEL_VOICE');
  });

  test('findLastRevision is not fooled by a stray earlier date before the real one', () => {
    expect(memCheck.findLastRevision('**last-revision:** 2026-02-21')).toBe('2026-02-21');
    // bounded gap forbids digits between label and date -> no match on a far date
    expect(memCheck.findLastRevision('last-revision (archived 2019) 2026-02-21')).toBeNull();
  });
});

// ---- A6 — SessionStart hooks emit additionalContext, not systemMessage -----
describe('F-A inject-tao injects the FULL tao at SessionStart (cacheable prefix)', () => {
  test('buildTaoContext returns the full tao body (Gen3 path)', () => {
    const dir = tmpProject();
    fs.writeFileSync(path.join(dir, '_byan', 'agent', 'byan', 'tao.md'), 'TAO_SENTINEL_FULL_VOICE');
    expect(injectTao.buildTaoContext(dir)).toContain('TAO_SENTINEL_FULL_VOICE');
  });
  test('the hook emits hookEventName SessionStart, not UserPromptSubmit', () => {
    const dir = tmpProject();
    fs.writeFileSync(path.join(dir, '_byan', 'agent', 'byan', 'tao.md'), 'TAO_SENTINEL_FULL_VOICE');
    const out = runHook('inject-tao.js', dir);
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(out.hookSpecificOutput.additionalContext).toContain('TAO_SENTINEL_FULL_VOICE');
    expect(out.systemMessage).toBeUndefined();
  });
  test('missing tao.md is a no-op empty object (never blocks)', () => {
    const out = runHook('inject-tao.js', tmpProject());
    expect(out).toEqual({});
  });
});

describe('F-A inject-voice-anchor is the compact per-turn voice reminder', () => {
  test('emits UserPromptSubmit + an anchor carrying the voice markers', () => {
    const out = runHook('inject-voice-anchor.js', tmpProject());
    expect(out.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    const a = out.hookSpecificOutput.additionalContext;
    expect(a).toContain('Tutoiement');
    expect(a).toContain('On construit'); // a verbal signature
    expect(a.toLowerCase()).toContain('emoji'); // the zero-emoji rule survives
  });
  test('the anchor is compact and is NOT the full tao (the whole point)', () => {
    const a = voiceAnchor.buildVoiceAnchor();
    expect(a.length).toBeLessThan(800);
    expect(a).not.toContain('TAO_SENTINEL_FULL_VOICE');
  });
  test('the anchor is byte-stable across calls (no per-turn variable -> cache-safe)', () => {
    expect(voiceAnchor.buildVoiceAnchor()).toBe(voiceAnchor.buildVoiceAnchor());
  });
});

// ---- F1 — heart-survival: inject-tao must re-fire on SessionStart for ALL ------
// sources (incl. compact), so the full tao is re-injected after every compaction.
describe('F1 heart-survival wiring (post-compaction tao re-injection)', () => {
  const SETTINGS = [
    path.join(__dirname, '..', 'settings.json'),
    path.join(__dirname, '..', '..', 'install', 'templates', '.claude', 'settings.json'),
  ];
  test.each(SETTINGS)('%s wires inject-tao under SessionStart with an all-sources matcher', (file) => {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    const ss = cfg.hooks.SessionStart;
    expect(Array.isArray(ss)).toBe(true);
    const group = ss.find((g) => (g.hooks || []).some((h) => /inject-tao\.js/.test(h.command)));
    expect(group).toBeTruthy();
    // Empty/absent matcher = fires on startup|resume|clear|compact. A restrictive
    // matcher (e.g. "startup") would silently stop post-compaction re-injection and
    // the heart would fade on long sessions. Pin the invariant.
    expect(group.matcher == null || group.matcher === '' || group.matcher === '*').toBe(true);
  });
  test('inject-tao emits the full tao (re-injectable on every SessionStart incl. compact)', () => {
    const dir = tmpProject();
    fs.writeFileSync(path.join(dir, '_byan', 'agent', 'byan', 'tao.md'), 'TAO_SENTINEL_HEART');
    const out = runHook('inject-tao.js', dir);
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(out.hookSpecificOutput.additionalContext).toContain('TAO_SENTINEL_HEART');
  });
});

// ---- F2 — periodic full-tao refresh (the heart does not fade between compactions) -
describe('F2 periodic full-tao refresh', () => {
  const anchor = require('../hooks/inject-voice-anchor');
  const tao = require('../hooks/inject-tao');

  test('decideAnchor: anchor on non-Nth turns, full tao on the Nth', () => {
    const FULL = 'FULL_TAO_BODY';
    expect(anchor.decideAnchor({ turn: 1, every: 12, fullTao: FULL }).mode).toBe('anchor');
    expect(anchor.decideAnchor({ turn: 11, every: 12, fullTao: FULL }).mode).toBe('anchor');
    expect(anchor.decideAnchor({ turn: 12, every: 12, fullTao: FULL }).mode).toBe('full');
    expect(anchor.decideAnchor({ turn: 24, every: 12, fullTao: FULL }).additionalContext).toBe(FULL);
  });
  test('decideAnchor: every <= 0 disables the refresh (anchor always)', () => {
    expect(anchor.decideAnchor({ turn: 12, every: 0, fullTao: 'X' }).mode).toBe('anchor');
  });
  test('refreshEvery: env override; invalid/absent -> default 12', () => {
    expect(anchor.refreshEvery({ BYAN_TAO_REFRESH_EVERY: '5' })).toBe(5);
    expect(anchor.refreshEvery({ BYAN_TAO_REFRESH_EVERY: 'x' })).toBe(12);
    expect(anchor.refreshEvery({})).toBe(12);
  });
  test('inject-tao and the anchor agree on the SAME counter path (parity)', () => {
    const dir = tmpProject();
    expect(tao.turnCounterPath(dir)).toBe(path.join(dir, '_byan-output', '.tao-refresh-turn'));
  });
  test('SessionStart (inject-tao) resets the turn counter to 0', () => {
    const dir = tmpProject();
    fs.mkdirSync(path.join(dir, '_byan-output'), { recursive: true });
    fs.writeFileSync(tao.turnCounterPath(dir), '7');
    fs.writeFileSync(path.join(dir, '_byan', 'agent', 'byan', 'tao.md'), '# tao');
    runHook('inject-tao.js', dir);
    expect(fs.readFileSync(tao.turnCounterPath(dir), 'utf8').trim()).toBe('0');
  });
  test('end-to-end cadence: the Nth UserPromptSubmit surfaces the full tao, the others the anchor', () => {
    const dir = tmpProject();
    fs.writeFileSync(path.join(dir, '_byan', 'agent', 'byan', 'tao.md'), 'TAO_SENTINEL_REFRESH');
    const fullTurns = [];
    for (let i = 1; i <= 12; i++) {
      const out = JSON.parse(
        execFileSync('node', [path.join(HOOKS, 'inject-voice-anchor.js')], {
          env: { ...process.env, CLAUDE_PROJECT_DIR: dir, BYAN_TAO_REFRESH_EVERY: '12' },
          input: '',
          encoding: 'utf8',
        }) || '{}'
      );
      if (out.hookSpecificOutput.additionalContext.includes('TAO_SENTINEL_REFRESH')) fullTurns.push(i);
    }
    expect(fullTurns).toEqual([12]); // full tao surfaced once, exactly on the Nth turn
  });
  test('graceful degrade under a non-writable _byan-output: anchor + exit 0 (F1/compaction is the floor)', () => {
    // POSIX modes only; root bypasses perms so the chmod would be a no-op.
    if (process.platform === 'win32' || (process.getuid && process.getuid() === 0)) return;
    const dir = tmpProject();
    fs.writeFileSync(path.join(dir, '_byan', 'agent', 'byan', 'tao.md'), 'TAO_SENTINEL_FS');
    const outDir = path.join(dir, '_byan-output');
    fs.mkdirSync(outDir, { recursive: true });
    fs.chmodSync(outDir, 0o500); // r-x: the cross-turn counter cannot persist
    try {
      // Over many turns the stuck counter must NOT crash and must fall back to the
      // compact anchor -- the deliberate, documented degradation. The heart still
      // returns in full via inject-tao at SessionStart / compaction (the F1 floor).
      for (let i = 0; i < 14; i++) {
        const out = JSON.parse(
          execFileSync('node', [path.join(HOOKS, 'inject-voice-anchor.js')], {
            env: { ...process.env, CLAUDE_PROJECT_DIR: dir, BYAN_TAO_REFRESH_EVERY: '12' },
            input: '',
            encoding: 'utf8',
          }) || '{}'
        );
        expect(out.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
        expect(out.hookSpecificOutput.additionalContext).toContain('Tutoiement');
        expect(out.hookSpecificOutput.additionalContext).not.toContain('TAO_SENTINEL_FS');
      }
    } finally {
      fs.chmodSync(outDir, 0o700); // restore so tmpdir cleanup can remove it
    }
  });
});

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
