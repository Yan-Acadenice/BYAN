// Contract SHAPE guards for the local-chat usage payload.
//
// These assertions are mostly compile-time: they exist so a future edit that
// makes a usage metric REQUIRED fails the build. That matters because the two
// engines report disjoint halves (claude: cost + duration, no tokens; codex:
// tokens, no cost), so a required numeric field would force a caller to invent
// a 0 — and a fabricated 0 is indistinguishable from a measured 0.

import { describe, expect, it } from 'vitest';
import type { LocalChatMessage, LocalChatTurnOpts, LocalChatUsage } from '../ipc-contract';

describe('LocalChatUsage shape', () => {
  it('is constructible from the engine alone — every metric is optional', () => {
    // If any numeric field becomes required, this line stops compiling.
    const minimal: LocalChatUsage = { engine: 'claude' };
    expect(minimal.engine).toBe('claude');
    expect(minimal.inputTokens).toBeUndefined();
    expect(minimal.costUsd).toBeUndefined();
  });

  it('carries the claude half: cost + duration, tokens absent', () => {
    const claudeUsage: LocalChatUsage = { engine: 'claude', costUsd: 0.08, durationMs: 4210 };
    expect(claudeUsage.costUsd).toBe(0.08);
    expect(claudeUsage.outputTokens).toBeUndefined();
  });

  it('carries the codex half: the 5 token counters, cost explicitly null', () => {
    // Mirrors the live-verified payload, cache_write_input_tokens included.
    const codexUsage: LocalChatUsage = {
      engine: 'codex',
      inputTokens: 37581,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
      outputTokens: 11,
      reasoningOutputTokens: 0,
      costUsd: null,
    };
    expect(codexUsage.inputTokens).toBe(37581);
    // null (not undefined, not 0) = "asked, and this engine reports no price".
    expect(codexUsage.costUsd).toBeNull();
  });
});

describe('LocalChatMessage frames', () => {
  it('a started frame can echo the applied model and effort', () => {
    const started: LocalChatMessage = {
      type: 'started', sessionId: 's1', cli: 'codex', model: 'gpt-5.6-sol', effort: 'high',
    };
    expect(started.type).toBe('started');
  });

  it('a started frame is still valid without model/effort (claude, nothing selected)', () => {
    const started: LocalChatMessage = { type: 'started', sessionId: 's1', cli: 'claude' };
    expect(started.type).toBe('started');
  });

  it('a complete frame is valid with and without usage', () => {
    const bare: LocalChatMessage = { type: 'complete', sessionId: 's1', result: 'ok' };
    const withUsage: LocalChatMessage = {
      type: 'complete', sessionId: 's1', result: 'ok', usage: { engine: 'codex', outputTokens: 11 },
    };
    expect(bare.type).toBe('complete');
    expect(withUsage.type).toBe('complete');
  });
});

describe('LocalChatTurnOpts', () => {
  it('is an all-optional bag, so send(id, msg) stays a valid 2-arg call', () => {
    const empty: LocalChatTurnOpts = {};
    const withEffort: LocalChatTurnOpts = { reasoningEffort: 'low' };
    expect(empty.reasoningEffort).toBeUndefined();
    expect(withEffort.reasoningEffort).toBe('low');
  });
});
