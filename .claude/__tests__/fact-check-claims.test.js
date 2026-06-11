/**
 * Tests for the fact-check-claims Stop hook (C4).
 *
 * The PreToolUse doc gate only catches absolutes WRITTEN into docs; this hook
 * catches absolutes SPOKEN in the assistant's final turn. It must nudge
 * (non-blocking) on an unsourced absolute and stay silent otherwise — and a
 * bare require must have no side effect (the silent-failure class).
 */

'use strict';

const path = require('path');
const { execFileSync } = require('child_process');
const { decideClaim, nudgeMessage } = require('../hooks/fact-check-claims');

const HOOK = path.join(__dirname, '..', 'hooks', 'fact-check-claims.js');

function runHook(payload) {
  const out = execFileSync('node', [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  return JSON.parse(out || '{}');
}

describe('decideClaim (pure)', () => {
  test('unsourced absolute in prose -> nudge', () => {
    const d = decideClaim({ lastAssistantText: 'Redis is always faster than Postgres for this.' });
    expect(d.nudge).toBe(true);
    expect(d.absolute.toLowerCase()).toBe('always');
  });

  test('absolute WITH a source marker in the window -> no nudge', () => {
    const d = decideClaim({
      lastAssistantText: 'Redis is always faster here [CLAIM L2] per the redis.io benchmark.',
    });
    expect(d.nudge).toBe(false);
  });

  test('absolute only inside a fenced code block -> no nudge', () => {
    const d = decideClaim({ lastAssistantText: 'See:\n```\nconst always = true;\n```\nall good.' });
    expect(d.nudge).toBe(false);
  });

  test('absolute on a "- toujours" pattern-list line -> no nudge', () => {
    const d = decideClaim({ lastAssistantText: '- toujours\n- jamais\n' });
    expect(d.nudge).toBe(false);
  });

  test('empty text -> no nudge', () => {
    expect(decideClaim({ lastAssistantText: '' }).nudge).toBe(false);
    expect(decideClaim({}).nudge).toBe(false);
  });

  test('nudgeMessage is advisory (mentions not blocking)', () => {
    const m = nudgeMessage({ absolute: 'always', context: 'x always y' });
    expect(m).toMatch(/not blocking/i);
    expect(m).toContain('always');
  });
});

describe('fact-check-claims Stop hook (spawned, production payload shape)', () => {
  test('last_assistant_message with an unsourced absolute -> systemMessage nudge, continue', () => {
    const out = runHook({
      stop_hook_active: false,
      last_assistant_message: 'This approach is obviously the right one for everyone.',
    });
    expect(out.continue).toBe(true);
    expect(out.systemMessage).toMatch(/fact-check/i);
    expect(out.systemMessage).toMatch(/obviously/i);
  });

  test('clean assistant text -> continue with no systemMessage', () => {
    const out = runHook({
      stop_hook_active: false,
      last_assistant_message: 'I updated the config and ran the tests; they pass.',
    });
    expect(out.continue).toBe(true);
    expect(out.systemMessage).toBeUndefined();
  });

  test('a bare require of the hook has no side effect (guarded main)', () => {
    const out = execFileSync('node', ['-e', `require(${JSON.stringify(HOOK)})`], {
      input: '{"last_assistant_message":"this is always wrong"}',
      encoding: 'utf8',
    });
    expect(out).toBe(''); // guarded IIFE did not run -> no stdout
  });
});
