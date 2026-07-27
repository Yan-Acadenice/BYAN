// F9 usage accumulation + UsagePanel rendering.
//
// The load-bearing fact under test is the ASYMMETRY between the two engines:
// claude reports a dollar cost and no tokens, codex reports tokens and no
// dollars. Every assertion below is written so that blending the two — or
// substituting a 0 for a metric an engine never reported — makes it fail.
// Expected values are literals on purpose: re-deriving them from the same
// expression the fold uses would let a deleted behaviour still pass.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, render, act, waitFor } from '@testing-library/react';
import { LocalChatProvider, useLocalChat } from '../LocalChatContext';
import UsagePanel from '../../components/chat/panels/UsagePanel';
import type { LocalChatMessage, LocalChatUsage } from '../../../shared/ipc-contract';
import type { LocalChatUsageTotals } from '../LocalChatContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LocalChatProvider>{children}</LocalChatProvider>
);

const mockStart = vi.fn<() => Promise<{ sessionId: string }>>();
const mockSend = vi.fn<() => Promise<void>>();
const mockStop = vi.fn<() => Promise<void>>();
const mockList = vi.fn();
const mockHistory = vi.fn();

let listeners: Array<(payload: unknown) => void> = [];
let authListeners: Array<(payload: unknown) => void> = [];
function emit(msg: LocalChatMessage) {
  for (const l of listeners) l(msg);
}
function emitAuth(payload: { reason?: string }) {
  for (const l of authListeners) l(payload);
}

beforeEach(() => {
  listeners = [];
  authListeners = [];
  Object.defineProperty(window, 'byanApi', {
    value: { localChat: { start: mockStart, send: mockSend, stop: mockStop, list: mockList, history: mockHistory } },
    writable: true,
    configurable: true,
  });
  Object.defineProperty(window, 'byanEvents', {
    value: {
      on: (channel: string, cb: (payload: unknown) => void) => {
        if (channel === 'byan:chat-local:message') listeners.push(cb);
        else if (channel === 'byan:auth:changed') authListeners.push(cb);
        return () => {
          listeners = listeners.filter((l) => l !== cb);
          authListeners = authListeners.filter((l) => l !== cb);
        };
      },
    },
    writable: true,
    configurable: true,
  });
  mockStart.mockResolvedValue({ sessionId: 'sess-1' });
  mockSend.mockResolvedValue(undefined);
  mockStop.mockResolvedValue(undefined);
  mockList.mockResolvedValue([]);
  mockHistory.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

// Live-verified shapes: claude reports cost + duration only, codex reports the
// five counters and an explicit null cost.
const CLAUDE_TURN: LocalChatUsage = { engine: 'claude', model: 'sonnet', costUsd: 0.08, durationMs: 4210 };
const CODEX_TURN_A: LocalChatUsage = {
  engine: 'codex',
  model: 'gpt-5.4-codex',
  inputTokens: 1000,
  cachedInputTokens: 200,
  cacheWriteInputTokens: 50,
  outputTokens: 300,
  reasoningOutputTokens: 120,
  costUsd: null,
};
const CODEX_TURN_B: LocalChatUsage = {
  engine: 'codex',
  model: 'gpt-5.4-codex',
  inputTokens: 400,
  cachedInputTokens: 100,
  cacheWriteInputTokens: 10,
  outputTokens: 60,
  reasoningOutputTokens: 40,
  costUsd: null,
};

async function startedSession() {
  const rendered = renderHook(() => useLocalChat(), { wrapper });
  await act(async () => { await rendered.result.current.send('hi'); });
  return rendered;
}

describe('LocalChatContext — usage accumulation', () => {
  it('folds a claude turn into cost + duration and leaves every token total UNDEFINED', async () => {
    const { result } = await startedSession();
    act(() => { emit({ type: 'complete', sessionId: 'sess-1', usage: CLAUDE_TURN }); });
    await waitFor(() => expect(result.current.usageTurns).toHaveLength(1));

    const claude = result.current.usageTotals.claude;
    expect(claude?.costUsd).toBe(0.08);
    expect(claude?.durationMs).toBe(4210);
    expect(claude?.turns).toBe(1);
    // The point of the whole feature: an unreported metric must stay undefined.
    // A 0 here would render as a measured zero token count, which claude never
    // measured — it publishes no breakdown at all.
    expect(claude?.inputTokens).toBeUndefined();
    expect(claude?.cachedInputTokens).toBeUndefined();
    expect(claude?.cacheWriteInputTokens).toBeUndefined();
    expect(claude?.outputTokens).toBeUndefined();
    expect(claude?.reasoningOutputTokens).toBeUndefined();
    // codex never ran: it gets no row at all rather than a row of zeroes.
    expect(result.current.usageTotals.codex).toBeUndefined();
  });

  it('folds a codex turn into the five counters and leaves the cost UNDEFINED', async () => {
    const { result } = await startedSession();
    act(() => { emit({ type: 'complete', sessionId: 'sess-1', usage: CODEX_TURN_A }); });
    await waitFor(() => expect(result.current.usageTurns).toHaveLength(1));

    const codex = result.current.usageTotals.codex;
    expect(codex?.inputTokens).toBe(1000);
    expect(codex?.cachedInputTokens).toBe(200);
    expect(codex?.cacheWriteInputTokens).toBe(50);
    expect(codex?.outputTokens).toBe(300);
    expect(codex?.reasoningOutputTokens).toBe(120);
    // costUsd arrived as an explicit null (codex bills a subscription). A 0
    // would claim the turn was free, which is a different statement.
    expect(codex?.costUsd).toBeUndefined();
    expect(codex?.durationMs).toBeUndefined();
  });

  it('accumulates two codex turns of the same engine', async () => {
    const { result } = await startedSession();
    act(() => {
      emit({ type: 'complete', sessionId: 'sess-1', usage: CODEX_TURN_A });
      emit({ type: 'complete', sessionId: 'sess-1', usage: CODEX_TURN_B });
    });
    await waitFor(() => expect(result.current.usageTurns).toHaveLength(2));

    const codex = result.current.usageTotals.codex;
    // Literal sums of the two fixtures above (1000+400, 200+100, 50+10, 300+60,
    // 120+40) — written out rather than computed from the fixtures.
    expect(codex?.inputTokens).toBe(1400);
    expect(codex?.cachedInputTokens).toBe(300);
    expect(codex?.cacheWriteInputTokens).toBe(60);
    expect(codex?.outputTokens).toBe(360);
    expect(codex?.reasoningOutputTokens).toBe(160);
    expect(codex?.turns).toBe(2);
  });

  it('keeps the two engines in separate buckets in one session', async () => {
    const { result } = await startedSession();
    act(() => {
      emit({ type: 'complete', sessionId: 'sess-1', usage: CLAUDE_TURN });
      emit({ type: 'complete', sessionId: 'sess-1', usage: CODEX_TURN_A });
    });
    await waitFor(() => expect(result.current.usageTurns).toHaveLength(2));

    // A shared bucket would leak codex's 1000 input tokens onto claude, and
    // claude's $0.08 onto codex. Both must stay where they were measured.
    expect(result.current.usageTotals.claude?.inputTokens).toBeUndefined();
    expect(result.current.usageTotals.claude?.costUsd).toBe(0.08);
    expect(result.current.usageTotals.codex?.costUsd).toBeUndefined();
    expect(result.current.usageTotals.codex?.inputTokens).toBe(1000);
  });

  it('ignores a complete frame that carries no usage payload', async () => {
    const { result } = await startedSession();
    act(() => { emit({ type: 'complete', sessionId: 'sess-1', result: 'ok' }); });
    await waitFor(() => expect(result.current.streaming).toBe(false));
    expect(result.current.usageTurns).toEqual([]);
    expect(result.current.usageTotals).toEqual({});
  });

  it('caps the retained turns at 50 while the totals keep accumulating', async () => {
    const { result } = await startedSession();
    // 55 codex turns, the nth reporting exactly n input tokens.
    act(() => {
      for (let n = 1; n <= 55; n += 1) {
        emit({ type: 'complete', sessionId: 'sess-1', usage: { engine: 'codex', inputTokens: n, costUsd: null } });
      }
    });
    await waitFor(() => expect(result.current.usageTurns).toHaveLength(50));

    // The list keeps the 50 most RECENT turns: 6..55, oldest first.
    expect(result.current.usageTurns[0].inputTokens).toBe(6);
    expect(result.current.usageTurns[49].inputTokens).toBe(55);
    // The totals are untouched by the cap: 1+2+...+55 = 1540, and all 55 turns
    // counted. A cap applied to the fold would report 1275 (6..55) and 50 turns.
    expect(result.current.usageTotals.codex?.inputTokens).toBe(1540);
    expect(result.current.usageTotals.codex?.turns).toBe(55);
  });
});

describe('LocalChatContext — usage reset', () => {
  it('newSession zeroes both usageTurns and usageTotals', async () => {
    const { result } = await startedSession();
    act(() => { emit({ type: 'complete', sessionId: 'sess-1', usage: CLAUDE_TURN }); });
    await waitFor(() => expect(result.current.usageTurns).toHaveLength(1));

    mockStart.mockResolvedValueOnce({ sessionId: 'sess-2' });
    await act(async () => { await result.current.newSession(); });
    expect(result.current.usageTurns).toEqual([]);
    expect(result.current.usageTotals).toEqual({});
  });

  it('resume zeroes both (the reattached session starts from nothing)', async () => {
    const { result } = await startedSession();
    act(() => { emit({ type: 'complete', sessionId: 'sess-1', usage: CODEX_TURN_A }); });
    await waitFor(() => expect(result.current.usageTurns).toHaveLength(1));

    mockStart.mockResolvedValueOnce({ sessionId: 'sess-R' });
    await act(async () => { await result.current.resume('chat-a', '/p'); });
    expect(result.current.usageTurns).toEqual([]);
    expect(result.current.usageTotals).toEqual({});
  });

  it('logout zeroes both (no cross-user cost leak)', async () => {
    const { result } = await startedSession();
    act(() => { emit({ type: 'complete', sessionId: 'sess-1', usage: CLAUDE_TURN }); });
    await waitFor(() => expect(result.current.usageTurns).toHaveLength(1));

    act(() => { emitAuth({ reason: 'logout' }); });
    await waitFor(() => expect(result.current.sessionId).toBeNull());
    expect(result.current.usageTurns).toEqual([]);
    expect(result.current.usageTotals).toEqual({});
  });
});

describe('UsagePanel', () => {
  // Hand-written totals, NOT produced by the context fold: the panel is under
  // test here, not the accumulation.
  const BOTH_ENGINES: LocalChatUsageTotals = {
    claude: { engine: 'claude', turns: 1, model: 'sonnet', costUsd: 0.08, durationMs: 4210 },
    codex: {
      engine: 'codex',
      turns: 1,
      model: 'gpt-5.4-codex',
      inputTokens: 1000,
      cachedInputTokens: 200,
      cacheWriteInputTokens: 50,
      outputTokens: 300,
      reasoningOutputTokens: 120,
    },
  };

  it('renders a dash for every metric the engine did not report', () => {
    const { getByTestId } = render(
      <UsagePanel turns={[CLAUDE_TURN, CODEX_TURN_A]} totals={BOTH_ENGINES} onClose={vi.fn()} />
    );
    // claude: cost and duration are real, the five token cells are dashes.
    expect(getByTestId('usage-claude-costUsd').textContent).toBe('$0.0800');
    expect(getByTestId('usage-claude-durationMs').textContent).toBe('4.2 s');
    for (const key of ['inputTokens', 'cachedInputTokens', 'cacheWriteInputTokens', 'outputTokens', 'reasoningOutputTokens']) {
      expect(getByTestId(`usage-claude-${key}`).textContent).toBe('—');
    }
    // codex: the five counters are real, the cost cell is a dash.
    expect(getByTestId('usage-codex-inputTokens').textContent).toBe('1000');
    expect(getByTestId('usage-codex-reasoningOutputTokens').textContent).toBe('120');
    expect(getByTestId('usage-codex-costUsd').textContent).toBe('—');
    // Each dashed group is explained, so a row of dashes reads as a fact.
    expect(getByTestId('usage-note-claude').textContent).toMatch(/tokens/i);
    expect(getByTestId('usage-note-codex').textContent).toMatch(/abonnement/i);
  });

  it('never blends the two engines into one figure', () => {
    const { getByTestId, container } = render(
      <UsagePanel turns={[CLAUDE_TURN, CODEX_TURN_A]} totals={BOTH_ENGINES} onClose={vi.fn()} />
    );
    // The dishonest renderings this panel exists to avoid, each one asserted
    // absent: codex's tokens presented as claude's, claude's dollars presented
    // as codex's, and the arithmetic sum of a cost with a token count.
    expect(getByTestId('usage-claude-inputTokens').textContent).toBe('—');
    expect(getByTestId('usage-codex-costUsd').textContent).toBe('—');
    expect(getByTestId('usage-row-codex').textContent).not.toContain('$');
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/1670[.,]08/); // 1000+200+50+300+120 + 0.08
    expect(text).not.toMatch(/1000[.,]08/); // inputTokens + costUsd
    // A token count formatted as money would be the same units confusion in the
    // other direction.
    expect(text).not.toMatch(/\$1000/);
  });

  it('states plainly that the scope is the current session and is not persisted', () => {
    const { getByTestId } = render(<UsagePanel turns={[]} totals={{}} onClose={vi.fn()} />);
    const scope = getByTestId('usage-scope').textContent ?? '';
    expect(scope).toMatch(/session en cours/i);
    expect(scope).toMatch(/redémarrage/i);
  });

  it('calls onClose from the close button', () => {
    const onClose = vi.fn();
    const { getByTestId } = render(<UsagePanel turns={[]} totals={{}} onClose={onClose} />);
    act(() => { getByTestId('usage-close').click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state when no turn has been measured', () => {
    const { queryByTestId, getByText } = render(<UsagePanel turns={[]} totals={{}} onClose={vi.fn()} />);
    expect(queryByTestId('usage-row-claude')).toBeNull();
    expect(queryByTestId('usage-row-codex')).toBeNull();
    expect(getByText(/aucun tour mesuré/i)).toBeTruthy();
  });
});

describe('LocalChatContext — per-metric aggregation (a running total is not a delta)', () => {
  // MEASURED against the real claude CLI, three turns in one session (2026-07-27):
  //   total_cost_usd 0.2319165 -> 0.261986 -> 0.28187  (monotonic: session total)
  //   duration_ms    4150      -> 2739     -> 2985     (per turn)
  // Summing the cost reported 0.7757725 for a session that had cost 0.28187.
  const MEASURED = [
    { costUsd: 0.2319165, durationMs: 4150 },
    { costUsd: 0.261986, durationMs: 2739 },
    { costUsd: 0.28187, durationMs: 2985 },
  ];

  it('keeps the LATEST claude cost instead of adding running totals', async () => {
    const { result } = await startedSession();
    for (const m of MEASURED) {
      act(() => {
        emit({ type: 'complete', sessionId: 'sess-1', usage: { engine: 'claude', ...m } });
      });
    }
    await waitFor(() => expect(result.current.usageTotals.claude?.turns).toBe(3));

    // The session total, as the CLI itself last reported it.
    expect(result.current.usageTotals.claude?.costUsd).toBeCloseTo(0.28187, 6);
    // The sum would be this — the number the old fold produced.
    expect(result.current.usageTotals.claude?.costUsd).not.toBeCloseTo(0.7757725, 6);
  });

  it('still SUMS duration, which is a genuine per-turn delta', async () => {
    const { result } = await startedSession();
    for (const m of MEASURED) {
      act(() => {
        emit({ type: 'complete', sessionId: 'sess-1', usage: { engine: 'claude', ...m } });
      });
    }
    await waitFor(() => expect(result.current.usageTotals.claude?.turns).toBe(3));
    // 4150 + 2739 + 2985, as a literal: replacing instead of summing must fail.
    expect(result.current.usageTotals.claude?.durationMs).toBe(9874);
  });

  it('still SUMS codex token counters, which are per-turn (one process per turn)', async () => {
    const { result } = await startedSession();
    act(() => {
      emit({ type: 'complete', sessionId: 'sess-1', usage: { engine: 'codex', inputTokens: 1000, outputTokens: 10, costUsd: null } });
      emit({ type: 'complete', sessionId: 'sess-1', usage: { engine: 'codex', inputTokens: 1200, outputTokens: 20, costUsd: null } });
    });
    await waitFor(() => expect(result.current.usageTotals.codex?.turns).toBe(2));
    expect(result.current.usageTotals.codex?.inputTokens).toBe(2200);
    expect(result.current.usageTotals.codex?.outputTokens).toBe(30);
  });
});

describe('UsagePanel — the blend is structurally impossible, not just absent', () => {
  // The previous guard listed three numeric literals it did not want to see.
  // That passes for any OTHER blended figure, so it did not actually forbid the
  // dishonesty it was written for. This checks the STRUCTURE instead: a cost may
  // only ever appear inside the row of an engine that reported one.
  const totals = {
    claude: { engine: 'claude' as const, turns: 2, costUsd: 0.28, durationMs: 9874 },
    codex: { engine: 'codex' as const, turns: 3, inputTokens: 1670, outputTokens: 42 },
  };

  it('renders one row per engine and no row outside them', () => {
    const { getByTestId, container } = render(<UsagePanel turns={[]} totals={totals} onClose={vi.fn()} />);
    expect(getByTestId('usage-row-claude')).toBeTruthy();
    expect(getByTestId('usage-row-codex')).toBeTruthy();
    // Exactly two engine rows: a third would be a combined line.
    expect(container.querySelectorAll('[data-testid^="usage-row-"]').length).toBe(2);
  });

  it('shows a currency figure ONLY inside the row of an engine that reported one', () => {
    const { container, getByTestId } = render(<UsagePanel turns={[]} totals={totals} onClose={vi.fn()} />);
    const claudeRow = getByTestId('usage-row-claude');
    const codexRow = getByTestId('usage-row-codex');

    // Every '$' in the whole panel must live inside the claude row. A blended
    // "session total" line, wherever it were placed, would break this.
    const dollarNodes = Array.from(container.querySelectorAll('*'))
      .filter((el) => el.children.length === 0 && /\$/.test(el.textContent || ''));
    expect(dollarNodes.length).toBeGreaterThan(0);
    for (const node of dollarNodes) {
      expect(claudeRow.contains(node)).toBe(true);
    }
    // codex reported no price, so its row carries no currency at all.
    expect(/\$/.test(codexRow.textContent || '')).toBe(false);
  });
});
