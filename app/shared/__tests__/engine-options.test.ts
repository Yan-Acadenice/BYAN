// engine-options — the shared CLI truths. Pure functions, no I/O.
//
// These tests pin the two things that must not rot: the reasoning-effort enum
// (live-sourced from the API's own invalid_enum_value error) and the safety
// guard that keeps a crafted model token out of argv / a TOML value.

import { describe, expect, it } from 'vitest';
import {
  REASONING_EFFORTS,
  isValidEffort,
  engineSupportsEffort,
  effortsFor,
  isValidEffortFor,
  effortAppliesAt,
  isEngineId,
  isSafeModelToken,
  isValidClaudeModel,
  isPlausibleCodexModel,
  isValidModelFor,
  MODEL_PRESETS,
} from '../engine-options';

describe('reasoning effort enum', () => {
  it('holds the 7 values the API reports as supported', () => {
    // Live-sourced 2026-07-27: "Supported values are: 'none', 'minimal',
    // 'low', 'medium', 'high', 'xhigh', and 'max'." A 5-value draft was wrong.
    expect([...REASONING_EFFORTS]).toEqual(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('accepts every supported value', () => {
    for (const e of REASONING_EFFORTS) expect(isValidEffort(e)).toBe(true);
  });

  it('rejects a near-miss, an empty string, wrong case, and non-strings', () => {
    expect(isValidEffort('xxhigh')).toBe(false);
    expect(isValidEffort('')).toBe(false);
    expect(isValidEffort('HIGH')).toBe(false);
    expect(isValidEffort('maximum')).toBe(false);
    expect(isValidEffort(undefined)).toBe(false);
    expect(isValidEffort(null)).toBe(false);
    expect(isValidEffort(3)).toBe(false);
  });
});

describe('effort per engine', () => {
  // This used to assert engineSupportsEffort('claude') === false, "claude has no
  // reasoning-effort flag in --print mode". Wrong: claude 2.1.220 has
  // `--effort <level>`. The probe that concluded otherwise missed it.
  it('both engines take one', () => {
    expect(engineSupportsEffort('codex')).toBe(true);
    expect(engineSupportsEffort('claude')).toBe(true);
  });

  it('claude rejects none and minimal — the domains DIFFER', () => {
    // Measured by feeding claude a bogus value: it answers
    // "Valid values: low, medium, high, xhigh, max". Offering 'none' there would
    // be a setting the user picked and the CLI silently ignored, because an
    // unknown value is warned about and then dropped.
    expect(effortsFor('claude')).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(isValidEffortFor('claude', 'none')).toBe(false);
    expect(isValidEffortFor('claude', 'minimal')).toBe(false);
    expect(isValidEffortFor('claude', 'max')).toBe(true);
  });

  it('codex takes the two extra rungs', () => {
    expect(isValidEffortFor('codex', 'none')).toBe(true);
    expect(isValidEffortFor('codex', 'minimal')).toBe(true);
    expect(effortsFor('codex')).toHaveLength(7);
  });

  it('rejects a value belonging to neither', () => {
    expect(isValidEffortFor('claude', 'pouet')).toBe(false);
    expect(isValidEffortFor('codex', 'pouet')).toBe(false);
    expect(isValidEffortFor('codex', undefined)).toBe(false);
  });

  it('says WHEN a change takes hold, and it differs', () => {
    // claude's flag is set at spawn, so a change waits for the next session;
    // codex takes it per turn. The interface has to state which, or it promises a
    // moment it cannot keep.
    expect(effortAppliesAt('claude')).toBe('next-session');
    expect(effortAppliesAt('codex')).toBe('next-turn');
  });
});

describe('isEngineId', () => {
  it('accepts the two adapters and rejects anything else', () => {
    expect(isEngineId('claude')).toBe(true);
    expect(isEngineId('codex')).toBe(true);
    expect(isEngineId('bash')).toBe(false);
    expect(isEngineId(undefined)).toBe(false);
  });
});

describe('isSafeModelToken — the absolute safety guard', () => {
  it('accepts realistic model ids', () => {
    expect(isSafeModelToken('opus')).toBe(true);
    expect(isSafeModelToken('claude-fable-5')).toBe(true);
    expect(isSafeModelToken('gpt-5.6-sol')).toBe(true);
    expect(isSafeModelToken('o3')).toBe(true);
    expect(isSafeModelToken('model:v2')).toBe(true);
  });

  it('rejects a value carrying a space or an = (TOML / argv meaning)', () => {
    // These are the two characters that could break out of `-c key=value`.
    expect(isSafeModelToken('gpt 4')).toBe(false);
    expect(isSafeModelToken('a=b')).toBe(false);
    expect(isSafeModelToken('model_reasoning_effort=max')).toBe(false);
  });

  it('rejects shell metacharacters, quotes and newlines', () => {
    for (const bad of ['a;b', 'a|b', 'a&b', 'a$b', 'a`b', 'a"b', "a'b", 'a\nb', 'a b', '../x', 'a/b']) {
      expect(isSafeModelToken(bad), bad).toBe(false);
    }
  });

  it('rejects empty, over-long and non-string values', () => {
    expect(isSafeModelToken('')).toBe(false);
    expect(isSafeModelToken('x'.repeat(65))).toBe(false);
    expect(isSafeModelToken('-leading-dash')).toBe(false); // could read as a flag
    expect(isSafeModelToken(42)).toBe(false);
    expect(isSafeModelToken(null)).toBe(false);
  });
});

describe('isValidClaudeModel', () => {
  it('accepts documented aliases and claude-* full names', () => {
    expect(isValidClaudeModel('opus')).toBe(true);
    expect(isValidClaudeModel('sonnet')).toBe(true);
    expect(isValidClaudeModel('fable')).toBe(true);
    expect(isValidClaudeModel('claude-3-7-sonnet')).toBe(true);
    expect(isValidClaudeModel('claude-fable-5')).toBe(true);
  });

  it('rejects another vendor id', () => {
    expect(isValidClaudeModel('gpt-4')).toBe(false);
    expect(isValidClaudeModel('gemini-2.5-pro')).toBe(false);
  });

  it('accepts an unknown-but-safe token — a stale list must not reject a future alias', () => {
    expect(isValidClaudeModel('some-future-alias')).toBe(true);
  });

  it('still refuses an unsafe token', () => {
    expect(isValidClaudeModel('opus; rm -rf /')).toBe(false);
  });
});

describe('isPlausibleCodexModel', () => {
  it('accepts codex-shaped ids', () => {
    expect(isPlausibleCodexModel('gpt-5.6-sol')).toBe(true);
    expect(isPlausibleCodexModel('o3')).toBe(true);
    expect(isPlausibleCodexModel('some-future-codex-id')).toBe(true);
  });

  it('rejects a claude model handed to codex', () => {
    expect(isPlausibleCodexModel('claude-fable-5')).toBe(false);
    expect(isPlausibleCodexModel('opus')).toBe(false);
    expect(isPlausibleCodexModel('OPUS')).toBe(false);
  });

  it('still refuses an unsafe token', () => {
    expect(isPlausibleCodexModel('gpt-5=evil')).toBe(false);
  });
});

describe('isValidModelFor', () => {
  it('routes to the per-engine guard', () => {
    expect(isValidModelFor('claude', 'opus')).toBe(true);
    expect(isValidModelFor('claude', 'gpt-4')).toBe(false);
    expect(isValidModelFor('codex', 'gpt-5.6-sol')).toBe(true);
    expect(isValidModelFor('codex', 'opus')).toBe(false);
  });
});

describe('MODEL_PRESETS', () => {
  it('offers presets per engine, and every preset passes its own engine guard', () => {
    // A preset the picker offers but main would reject is the exact drift this
    // shared module exists to prevent.
    for (const engine of ['claude', 'codex'] as const) {
      expect(MODEL_PRESETS[engine].length).toBeGreaterThan(0);
      for (const p of MODEL_PRESETS[engine]) {
        expect(isValidModelFor(engine, p.value), `${engine}:${p.value}`).toBe(true);
        expect(p.label.length).toBeGreaterThan(0);
      }
    }
  });
});
